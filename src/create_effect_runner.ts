import {
    IAction,
    IBaseSagaContext,
    IEffectDescription,
    IPutEffectDescription,
    ITakeEffectDescription,
    ICallEffectDescription,
    IActionChannelEffectDescription
} from 'types';
import {ConsumerMessageBus} from './consumer_message_bus';
import {ProducerMessageBus} from './producer_message_bus';
import {generateTopicForSpecificTransaction} from './kafka_topics';
import {EphemeralBuffer} from 'buffers';

function isFunction(functionToCheck: any): functionToCheck is (...args: any[]) => any {
    return functionToCheck && {}.toString.call(functionToCheck) === '[object Function]';
}

function getTopicsFromEffectDescription<
    EffectDescription extends IActionChannelEffectDescription<any> | ITakeEffectDescription
>(effectDescription: EffectDescription): string[] {
    const {pattern, transactionId} = effectDescription;
    if (Array.isArray(pattern)) {
        return pattern;
    }

    if (isFunction(pattern)) {
        const anyTopicInTransaction = generateTopicForSpecificTransaction(transactionId, '*');
        return [anyTopicInTransaction];
    }

    if (typeof pattern === 'string') {
        return [pattern];
    }

    throw new Error('Cannot handle patterns of type ' + typeof pattern);
}

export async function initalizeRunEffect(
    consumerMessageBus: ConsumerMessageBus,
    producerMessageBus: ProducerMessageBus
) {
    return async function(effectDescription) {
        if (isActionChannelDescription(effectDescription)) {
            for (const topic of getTopicsFromEffectDescription(effectDescription)) {
                const streamDescription = {
                    topic,
                    transactionId: effectDescription.transactionId,
                    buffer: effectDescription.buffer,
                    observer: (action: Action) => {
                        if (isFunction(effectDescription.pattern)) {
                            if (effectDescription.pattern(action)) {
                                effectDescription.buffer.put(action);
                            }
                        } else {
                            effectDescription.buffer.put(action);
                        }
                    }
                };
                await consumerMessageBus.addTransactionStream(streamDescription);
                consumerMessageBus.subscribeToTopicEvents(streamDescription);
                return streamDescription;
            }
        }

        if (isTakeEffectDescription(effectDescription)) {
            // If this effect already has a stream buffer for events matching the pattern,
            // then just take from the buffer
            if (effectDescription.buffer) {
                const result = await buffer.take();
                return runGeneratorFsm(machine, result);
            }

            const buffer = new EphemeralBuffer();
            for (const topic of getTopicsFromEffectDescription(effectDescription)) {
                const streamDescription = {
                    topic,
                    transactionId: effectDescription.transactionId,
                    buffer,
                    observer: (action: Action) => {
                        if (isFunction(effectDescription.pattern)) {
                            if (effectDescription.pattern(action)) {
                                buffer.put(action);
                            }
                        } else {
                            buffer.put(action);
                        }
                    }
                };
                await consumerMessageBus.addTransactionStream(streamDescription);
                consumerMessageBus.subscribeToTopicEvents(streamDescription);
                return await buffer.take();
            }
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
    const runEffect = initalizeRunEffect(consumerMessageBus, producerMessageBus);
    // tslint:disable-next-line: cyclomatic-complexity
    async function runGeneratorFsm(machine: Generator, lastValue: any = null): Promise<any> {
        const {done, value: effectDescription}: IteratorResult<unknown> = machine.next(lastValue);

        if (done) {
            return lastValue;
        }

        if (isEffectCombinator(effectDescription)) {
            const effects = getEffectsFromEffectDescription(effectDescription);
            const combinator = getCombinatorFromEffectDescription(effectDescription);
            // Combinator is similar Promise.all or Promise.race
            const result = await combinator(effects.map(runEffect));
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

function isTakeEffectDescription(
    effectDescription: IEffectDescription
): effectDescription is ITakeEffectDescription {
    return effectDescription.kind === 'TAKE';
}

function isPutEffectDescription(
    effectDescription: IEffectDescription
): effectDescription is IPutEffectDescription<any> {
    return effectDescription.kind === 'PUT';
}

function isCallEffectDescription(
    effectDescription: IEffectDescription
): effectDescription is ICallEffectDescription<any[], any> {
    return effectDescription.kind === 'CALL';
}

function isActionChannelDescription(
    effectDescription: IEffectDescription
): effectDescription is IActionChannelEffectDescription<any, any> {
    return effectDescription.kind === 'ACTION_CHANNEL';
}
