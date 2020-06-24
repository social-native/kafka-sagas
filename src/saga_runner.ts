import Bluebird from 'bluebird';
import {enums} from '@social-native/snpkg-snapi-authorization';

import {
    IAction,
    IBaseSagaContext,
    IEffectDescription,
    ArrayCombinator,
    RecordCombinator,
    Saga,
    Middleware,
    Next
} from './types';
import {ConsumerMessageBus} from './consumer_message_bus';
import {ProducerMessageBus} from './producer_message_bus';
import {
    isActionChannelEffectDescription,
    isTakeEffectDescription,
    isPutEffectDescription,
    isCallEffectDescription,
    isTakeActionChannelEffectDescription,
    isEffectCombinatorDescription,
    isDelayEffectDescription,
    isGenerator
} from './type_guard';

const {
    WORKER_USER_IDENTITY_HEADER: {WORKER_USER_ID, WORKER_USER_ROLES}
} = enums;

export class SagaRunner<InitialActionPayload, Context extends IBaseSagaContext> {
    protected runEffectWithMiddleware: <EffectDescription extends IEffectDescription>(
        effect: EffectDescription,
        context: Context
    ) => Promise<any>;

    constructor(
        private consumerMessageBus: ConsumerMessageBus,
        private producerMessageBus: ProducerMessageBus,
        middlewares: Array<Middleware<IEffectDescription, Context>> = []
    ) {
        const initialNext: Next<IEffectDescription, Context> = async (effect, ctx) => {
            return this.runEffect(effect, ctx);
        };

        this.runEffectWithMiddleware = middlewares
            .reduceRight((previousNext, middleware: Middleware<IEffectDescription, Context>) => {
                return middleware(previousNext);
            }, initialNext)
            .bind(this);
    }

    public runSaga = async (
        initialAction: IAction<InitialActionPayload>,
        context: Context,
        saga: Saga<InitialActionPayload, Context>
    ): Promise<any> => {
        this.consumerMessageBus.startTransaction(initialAction.transaction_id);
        const result = await this.runGeneratorFsm(saga(initialAction, context), context);
        this.consumerMessageBus.stopTransaction(initialAction.transaction_id);
        return result;
    };

    // tslint:disable-next-line: cyclomatic-complexity
    public runEffect = async <EffectDescription extends IEffectDescription>(
        effectDescription: EffectDescription,
        context: Context
    ) => {
        if (isEffectCombinatorDescription(effectDescription)) {
            const {effects, combinator} = effectDescription;

            if (Array.isArray(effects)) {
                const withRunningEffects: Array<Promise<any>> = effects.map(effect =>
                    this.runEffect(effect, context)
                );

                return await (combinator as ArrayCombinator<IAction>)(withRunningEffects);
            } else if (typeof effects === 'object') {
                const withRunningEffects: Record<string, Promise<any>> = Object.keys(
                    effects
                ).reduce((obj, key) => {
                    return {
                        ...obj,
                        [key]: this.runEffect(effects[key], context)
                    };
                }, {} as Record<string, Promise<any>>);

                return await (combinator as RecordCombinator<IAction>)(withRunningEffects);
            }

            throw new Error(
                'Incompatible effects passed into combinator. Must be an array or object of effects'
            );
        }

        if (isActionChannelEffectDescription(effectDescription)) {
            for (const topic of effectDescription.topics) {
                this.consumerMessageBus.registerTopicObserver({
                    transactionId: effectDescription.transactionId,
                    topic,
                    observer: effectDescription.observer
                });

                await this.consumerMessageBus.streamActionsFromTopic(topic);
            }

            return effectDescription;
        }

        // If this effect already has a stream buffer for events matching the pattern,
        // then just take from the buffer
        if (isTakeActionChannelEffectDescription(effectDescription)) {
            return await effectDescription.buffer.take();
        }

        if (isDelayEffectDescription(effectDescription)) {
            const {delayInMilliseconds, payload} = effectDescription;
            await Bluebird.delay(delayInMilliseconds);
            return payload;
        }

        if (isTakeEffectDescription(effectDescription)) {
            await Bluebird.map(effectDescription.topics, async topic => {
                this.consumerMessageBus.registerTopicObserver({
                    transactionId: effectDescription.transactionId,
                    topic,
                    observer: effectDescription.observer
                });

                await this.consumerMessageBus.streamActionsFromTopic(topic);
            });

            return await effectDescription.buffer.take();
        }

        if (isPutEffectDescription(effectDescription)) {
            const action: IAction<typeof effectDescription.payload> = {
                topic: effectDescription.pattern,
                transaction_id: effectDescription.transactionId,
                payload: effectDescription.payload
            };

            if (
                context.headers &&
                context.headers[WORKER_USER_ID] &&
                context.headers[WORKER_USER_ROLES]
            ) {
                action.userId = context.headers[WORKER_USER_ID];
                action.userRoles = context.headers[WORKER_USER_ROLES].split(',');
            }

            await this.producerMessageBus.putAction(action);

            return;
        }

        if (isCallEffectDescription(effectDescription)) {
            const result = await effectDescription.effect(...(effectDescription.args || []));

            if (isGenerator(result)) {
                return this.runGeneratorFsm(result, context);
            }

            return result;
        }
    };

    protected async runGeneratorFsm<Returned = any | undefined>(
        machine: Generator,
        context: Context,
        {
            previousGeneratorResponse = null,
            didThrow = false
        }: {
            previousGeneratorResponse: any;
            didThrow: boolean;
        } = {previousGeneratorResponse: null, didThrow: false}
    ): Promise<Returned> {
        /**
         * Dereferencing the receiver removes its context, so we need to bind it back to the machine.
         */
        const receiver = didThrow ? machine.throw.bind(machine) : machine.next.bind(machine);

        const {done, value} = receiver(previousGeneratorResponse) as IteratorResult<
            IEffectDescription,
            Returned
        >;

        if (done) {
            return value as Returned;
        }

        try {
            const result = await this.runEffectWithMiddleware(value as IEffectDescription, context);

            return this.runGeneratorFsm(machine, context, {
                previousGeneratorResponse: result,
                didThrow: false
            });
        } catch (error) {
            return this.runGeneratorFsm(machine, context, {
                previousGeneratorResponse: error,
                didThrow: true
            });
        }
    }
}
