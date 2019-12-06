import Bluebird from 'bluebird';
import {
    IAction,
    IBaseSagaContext,
    IEffectDescription,
    ArrayCombinator,
    RecordCombinator,
    Saga
} from './types';
import {ConsumerMessageBus} from './consumer_message_bus';
import {ProducerMessageBus} from './producer_message_bus';
import {
    isActionChannelEffectDescription,
    isTakeEffectDescription,
    isPutEffectDescription,
    isCallEffectDescription,
    isTakeActionChannelEffectDescription,
    isEffectCombinatorDescription
} from './type_guard';

export class SagaRunner {
    constructor(
        private consumerMessageBus: ConsumerMessageBus,
        private producerMessageBus: ProducerMessageBus
    ) {}

    public runSaga = async <
        InitialActionPayload,
        Context extends IBaseSagaContext
    >(
        initialAction: IAction<InitialActionPayload>,
        context: Context,
        saga: Saga<InitialActionPayload, Context>
    ) => {
        this.consumerMessageBus.startTransaction(initialAction.transaction_id);
        const result = await this.runGeneratorFsm(saga(initialAction, context));
        this.consumerMessageBus.stopTransaction(initialAction.transaction_id);
        return result;
    };

    // tslint:disable-next-line: cyclomatic-complexity
    public runEffect = async <EffectDescription extends IEffectDescription>(
        effectDescription: EffectDescription
    ) => {
        if (isEffectCombinatorDescription(effectDescription)) {
            const {effects, combinator} = effectDescription;

            if (Array.isArray(effects)) {
                const withRunningEffects: Array<Promise<any>> = effects.map(this.runEffect);

                return await (combinator as ArrayCombinator<IAction>)(withRunningEffects);
            } else if (typeof effects === 'object') {
                const withRunningEffects: Record<string, Promise<any>> = Object.keys(
                    effects
                ).reduce((obj, key) => {
                    return {
                        ...obj,
                        [key]: this.runEffect(effects[key])
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
            await this.producerMessageBus.putAction({
                topic: effectDescription.pattern,
                transaction_id: effectDescription.transactionId,
                payload: effectDescription.payload
            });

            return;
        }

        if (isCallEffectDescription(effectDescription)) {
            return await effectDescription.effect(...effectDescription.args);
        }
    };

    protected async runGeneratorFsm(machine: Generator, lastValue: any = null): Promise<any> {
        const {done, value: effectDescription}: IteratorResult<unknown> = machine.next(lastValue);

        if (done) {
            return lastValue;
        }

        const result = await this.runEffect(effectDescription);
        return this.runGeneratorFsm(machine, result);
    }
}
