import Bluebird from 'bluebird';
import {IAction, IBaseSagaContext, IEffectDescription} from 'types';
import {ConsumerMessageBus} from './consumer_message_bus';
import {ProducerMessageBus} from './producer_message_bus';
import {
    isActionChannelEffectDescription,
    isTakeEffectDescription,
    isPutEffectDescription,
    isCallEffectDescription,
    isTakeActionChannelEffectDescription,
    isEffectCombinatorDescription
} from 'type_guard';

export async function makeEffectRunner(
    consumerMessageBus: ConsumerMessageBus,
    producerMessageBus: ProducerMessageBus
) {
    // tslint:disable-next-line: cyclomatic-complexity
    return async function<EffectDescription extends IEffectDescription>(
        effectDescription: EffectDescription
    ) {
        if (isActionChannelEffectDescription(effectDescription)) {
            for (const topic of effectDescription.topics) {
                await consumerMessageBus.streamEffectTopic(topic);
                const subscriptionInfo = {
                    transactionId: effectDescription.transactionId,
                    topic,
                    observer: effectDescription.observer
                };
                consumerMessageBus.subscribeToTopicEvents(subscriptionInfo);
            }
            return effectDescription;
        }

        // If this effect already has a stream buffer for events matching the pattern,
        // then just take from the buffer
        if (isTakeActionChannelEffectDescription(effectDescription)) {
            return await effectDescription.buffer.take();
        }

        if (isTakeEffectDescription(effectDescription)) {
            const events = [];
            for (const topic of effectDescription.topics) {
                await consumerMessageBus.streamEffectTopic(topic);
                const subscriptionInfo = {
                    transactionId: effectDescription.transactionId,
                    topic,
                    observer: effectDescription.observer
                };
                consumerMessageBus.subscribeToTopicEvents(subscriptionInfo);
                events.push(effectDescription.buffer.take());
            }
            /** @TODO on return cancel all other takes */
            return await Promise.race(events);
        }

        if (isPutEffectDescription(effectDescription)) {
            await producerMessageBus.putPayloadToTopic(
                effectDescription.pattern,
                effectDescription.payload
            );

            return;
        }

        if (isCallEffectDescription(effectDescription)) {
            return await effectDescription.effect(...effectDescription.args);
        }
    };
}
export function createEffectRunner(
    consumerMessageBus: ConsumerMessageBus,
    producerMessageBus: ProducerMessageBus
) {
    const runEffect = makeEffectRunner(consumerMessageBus, producerMessageBus);
    // tslint:disable-next-line: cyclomatic-complexity
    async function runGeneratorFsm(machine: Generator, lastValue: any = null): Promise<any> {
        const {done, value: effectDescription}: IteratorResult<unknown> = machine.next(lastValue);

        if (done) {
            return lastValue;
        }

        if (isEffectCombinatorDescription(effectDescription)) {
            const {effects, combinator} = effectDescription;

            if (Array.isArray(effects)) {
                return runGeneratorFsm(machine, await combinator(effects.map(runEffect)));
            } else if (typeof effects === 'object') {
                return runGeneratorFsm(machine, await combinator();
            }

            // Combinator is similar Promise.all or Promise.race
            const result = await combinator(effects);
            return runGeneratorFsm(machine, result);
        } else {
            const result = await runEffect(effectDescription);
            return runGeneratorFsm(machine, result);
        }
    }

    return {
        // tslint:disable-next-line: cyclomatic-complexity
        async runEffects<Context extends IBaseSagaContext>(
            initialAction: IAction,
            context: Context,
            saga: GeneratorFunction
        ) {
            consumerMessageBus.startTransaction(initialAction.transactionId);
            const result = await runGeneratorFsm(saga(initialAction, context));
            consumerMessageBus.stopTransaction(initialAction.transactionId);
            return result;
        }
    };
}
