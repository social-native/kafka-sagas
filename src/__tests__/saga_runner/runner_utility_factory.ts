import {ActionConsumer} from '../../action_consumer';
import {kafka} from '../test_clients';
import {ThrottledProducer} from '../../throttled_producer';
import {EffectBuilder} from '../../effect_builder';
import {SagaRunner} from '../../saga_runner';

export async function runnerUtilityFactory() {
    const transactionId = 'static-transaction-id';
    const actionConsumer = new ActionConsumer(kafka, 'test');

    const throttledProducer = new ThrottledProducer(kafka);

    actionConsumer.startTransaction(transactionId);
    await throttledProducer.connect();

    const runner = new SagaRunner(actionConsumer, throttledProducer);
    const effectBuilder = new EffectBuilder(transactionId);

    return {
        transactionId,
        effectBuilder,
        spy: {
            consumer: (methodName: keyof typeof actionConsumer) =>
                jest.spyOn(actionConsumer, methodName),
            producer: (methodName: keyof Omit<typeof throttledProducer, 'recordsSent'>) =>
                jest.spyOn(throttledProducer, methodName)
        },
        runner,
        context: {
            effects: effectBuilder,
            headers: {},
            originalMessage: {
                key: Buffer.from('key'),
                value: Buffer.from('value'),
                offset: '1',
                partition: 1,
                timestamp: (new Date().valueOf() / 1000).toString()
            }
        },
        async closePools() {
            actionConsumer.stopTransaction(transactionId);
            await actionConsumer.disconnect();
            await throttledProducer.disconnect();
        }
    };
}
