import {ConsumerPool} from '../../consumer_pool';
import {kafka} from '../test_clients';
import {ThrottledProducer} from '../../throttled_producer';
import {EffectBuilder} from '../../effect_builder';
import {SagaRunner} from '../../saga_runner';

export async function runnerUtilityFactory() {
    const transactionId = 'static-transaction-id';
    const consumerPool = new ConsumerPool(kafka, 'test');

    const throttledProducer = new ThrottledProducer(kafka);

    consumerPool.startTransaction(transactionId);
    await throttledProducer.connect();

    const runner = new SagaRunner(consumerPool, throttledProducer);
    const effectBuilder = new EffectBuilder(transactionId);

    return {
        transactionId,
        effectBuilder,
        spy: {
            consumer: (methodName: keyof typeof consumerPool) =>
                jest.spyOn(consumerPool, methodName),
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
            consumerPool.stopTransaction(transactionId);
            await consumerPool.disconnectConsumers();
            await throttledProducer.disconnect();
        }
    };
}
