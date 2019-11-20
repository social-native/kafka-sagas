import {IAction, IBaseSagaContext, ICause, IPutCause, ITakeCause, ICallCause} from 'types';
import {ConsumerMessageBus} from './consumer_message_bus';
import {ProducerMessageBus} from './producer_message_bus';

export function createEffectRunner(
    consumerMessageBus: ConsumerMessageBus,
    producerMessageBus: ProducerMessageBus
) {

    // tslint:disable-next-line: cyclomatic-complexity
    async function runGeneratorFsm(machine: Generator, lastValue: any = null): Promise<any> {
        const {done, value: cause}: IteratorResult<unknown> = machine.next(lastValue);

        if (done) {
            return lastValue;
        }

        if (isTakeCause(cause)) {
            for (const topic of cause.patterns) {
                // Add the transactionId to the transactions we are watching out for.
                consumerMessageBus.startTransaction(cause.transactionId);
                await consumerMessageBus.addSubscription(topic);
                const response = await consumerMessageBus.awaitEventBroadcast(
                    topic,
                    cause.transactionId
                );

                // The broadcasted result will be sent back to the saga.
                return runGeneratorFsm(machine, response);
            }
        }

        if (isPutCause(cause)) {
            await producerMessageBus.putPayloadToTopic(
                cause.pattern,
                cause.payload
            );

            return runGeneratorFsm(machine);
        }

        if (isCallCause(cause)) {
            const response = await cause.effect(...cause.args);

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

function isTakeCause(cause: ICause): cause is ITakeCause {
    return cause.kind === 'TAKE';
}

function isPutCause(cause: ICause): cause is IPutCause<any> {
    return cause.kind === 'PUT';
}

function isCallCause(cause: ICause): cause is ICallCause<any[], any> {
    return cause.kind === 'CALL';
}
