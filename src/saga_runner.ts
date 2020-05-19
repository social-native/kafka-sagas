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
    isDelayEffectDescription
} from './type_guard';

const {
    WORKER_USER_IDENTITY_HEADER: {WORKER_USER_ID, WORKER_USER_ROLES}
} = enums;

export class SagaRunner<InitialActionPayload, Context extends IBaseSagaContext> {
    constructor(
        private consumerMessageBus: ConsumerMessageBus,
        private producerMessageBus: ProducerMessageBus,
        private middlewares: Array<Middleware<IEffectDescription, Context>> = []
    ) {}

    public runSaga = async (
        initialAction: IAction<InitialActionPayload>,
        context: Context,
        saga: Saga<InitialActionPayload, Context>
    ): Promise<void> => {
        this.consumerMessageBus.startTransaction(initialAction.transaction_id);
        await this.runGeneratorFsm(saga(initialAction, context), context);
        this.consumerMessageBus.stopTransaction(initialAction.transaction_id);
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
            return await effectDescription.effect(...effectDescription.args);
        }
    };

    protected async runGeneratorFsm(
        machine: Generator,
        context: Context,
        lastValue: any = null
    ): Promise<void> {
        const {done, value: effectDescription} = machine.next(lastValue) as IteratorResult<
            IEffectDescription
        >;

        if (done) {
            return lastValue;
        }

        if (!this.middlewares.length) {
            try {
                const result = await this.runEffect(effectDescription, context);
                return this.runGeneratorFsm(machine, context, result);
            } catch (error) {
                const continuation = machine.throw(error) as IteratorResult<IEffectDescription>;

                if (continuation.done) {
                    return;
                }

                const result = await this.runEffect(continuation.value, context);

                return this.runGeneratorFsm(machine, context, result);
            }
        } else {
            const initialNext: Next<IEffectDescription, Context> = async (effect, ctx) => {
                try {
                    return await this.runEffect(effect, ctx);
                } catch (error) {
                    const continuation = machine.throw(error) as IteratorResult<IEffectDescription>;

                    if (continuation.done) {
                        return;
                    }

                    return await this.runEffect(continuation.value, ctx);
                }
            };

            const compiledNexts = this.middlewares.reduceRight(
                (previousNext, middleware: Middleware<IEffectDescription, Context>) => {
                    return middleware(previousNext);
                },
                initialNext
            );

            const result = await compiledNexts(effectDescription, context);

            return this.runGeneratorFsm(machine, context, result);
        }
    }
}
