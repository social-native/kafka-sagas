import {
    IAction,
    IBaseSagaContext,
    IEffectDescription,
    IPutEffectDescription,
    ITakeEffectDescription,
    ICallEffectDescription
} from 'types';
import {ConsumerMessageBus} from './consumer_message_bus';
import {ProducerMessageBus} from './producer_message_bus';

export function createEffectRunner(
    consumerMessageBus: ConsumerMessageBus,
    producerMessageBus: ProducerMessageBus
) {
    // tslint:disable-next-line: cyclomatic-complexity
    async function runGeneratorFsm(machine: Generator, lastValue: any = null): Promise<any> {
        const {done, value: effectDescription}: IteratorResult<unknown> = machine.next(lastValue);

        if (done && !effectDescription) {
            return lastValue;
        }

        if (isTakeEffectDescription(effectDescription)) {
            for (const topic of effectDescription.patterns) {
                // Add the transactionId to the transactions we are watching out for.
                consumerMessageBus.startTransaction(effectDescription.transactionId);
                await consumerMessageBus.addSubscriptionIfNecessary(topic);
                const response = await consumerMessageBus.awaitEventBroadcast(
                    topic,
                    effectDescription.transactionId
                );

                // The broadcasted result will be sent back to the saga.
                return runGeneratorFsm(machine, response);
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
            return await runGeneratorFsm(saga(initialAction, context));
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
