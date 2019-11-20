import {IAction, IBaseSagaContext, ICause, IPutCause, ITakeCause, ICallCause} from 'types';
import {ConsumerMessageBus} from './consumer_message_bus';
import {ProducerMessageBus} from './producer_message_bus';

export function createEffectRunner(
    consumerMessageBus: ConsumerMessageBus,
    producerMessageBus: ProducerMessageBus
) {
    return {
        // tslint:disable-next-line: cyclomatic-complexity
        async runEffects<Context extends IBaseSagaContext>(
            initialAction: IAction,
            context: Context,
            saga: GeneratorFunction
        ) {
            const runningSaga = saga(initialAction, context);
            let previousValue = null;

            while (true) {
                const {done, value: cause}: IteratorResult<unknown> = runningSaga.next(
                    previousValue
                );

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
                        previousValue = response;
                    }

                    continue;
                }

                if (isPutCause(cause)) {
                    await producerMessageBus.putPayloadToTopic(cause.pattern, cause.payload);
                    continue;
                }

                if (isCallCause(cause)) {
                    const response = await cause.effect(...cause.args);

                    previousValue = response;
                    continue;
                }

                if (done) {
                    break;
                }
            }
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
