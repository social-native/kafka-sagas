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

function isFunction(functionToCheck: any): functionToCheck is (...args: any[]) => any {
    return functionToCheck && {}.toString.call(functionToCheck) === '[object Function]';
}

function getTopicsFromEffectDescription(
    actionChannelEffectDescription: IActionChannelEffectDescription<any>
): string[] {
    if (Array.isArray(actionChannelEffectDescription.pattern)) {
        return actionChannelEffectDescription.pattern;
    }

    if (isFunction(actionChannelEffectDescription.pattern)) {
        return [`${actionChannelEffectDescription.transactionId}-*`];
    }

    if (typeof actionChannelEffectDescription.pattern === 'string') {
        return [actionChannelEffectDescription.pattern];
    }

    throw new Error(
        'Cannot handle patterns of type ' + typeof actionChannelEffectDescription.pattern
    );
}

export function createEffectRunner(
    consumerMessageBus: ConsumerMessageBus,
    producerMessageBus: ProducerMessageBus
) {
    // tslint:disable-next-line: cyclomatic-complexity
    async function runGeneratorFsm(machine: Generator, lastValue: any = null): Promise<any> {
        const {done, value: effectDescription}: IteratorResult<unknown> = machine.next(lastValue);

        if (done) {
            return lastValue;
        }

        // if (isEffectCombinator(effectDescription)) {
        //     if (isAllCombinator(effectDescription)) {
        //         return Promise.all(effectDescription.map(eff => consumerMessageBus.match(matcher))
        //     }

        // } else {
        //     const matcher = getMatcher(effectDescription)
        //     const response = await consumerMessageBus.match(matcher)
        // }

        if (isActionChannelDescription(effectDescription)) {
            for (const topic of getTopicsFromEffectDescription(effectDescription)) {
                const streamDescription = {
                    topic,
                    transactionId: effectDescription.transactionId,
                    doesMatch: () => true
                };
                await consumerMessageBus.addStream(streamDescription);
                consumerMessageBus.onStreamEvent(
                    streamDescription,
                    addEventToBuffer(effectDescription.buffer)
                );
            }
        }

        if (isTakeEffectDescription(effectDescription)) {
            const simpleBuffer;
            if (effectDescription.patterns && effectDescription.isActionBuffer) {
                await effectDescription.buffer.onEvent;
            } else {
                const buffers = effectDescription.patterns.map(p => new simpleBuffer(p));
                consumerMessageBus.onStreamEvent(streamDescription, addEventToBuffer(buffers));
                await Promise.first([buffers.listen]);
            }
        }

        if (isPutEffectDescription(effectDescription)) {
            await producerMessageBus.putPayloadToTopic(
                effectDescription.pattern,
                effectDescription.payload
            );

            return runGeneratorFsm(machine);
        }

        if (isCallEffectDescription(effectDescription)) {
            const response = await effectDescription.effect(...effectDescription.args);

            return runGeneratorFsm(machine, response);
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

function isActionChannel() {}
