import {ConsumerPool} from '../../consumer_pool';
import {kafka} from '../test_clients';
import {ProducerPool} from '../../producer_pool';
import {EffectBuilder} from '../../effect_builder';
import {SagaRunner} from '../../saga_runner';

export async function runnerUtilityFactory() {
    const transactionId = 'static-transaction-id';
    const consumerPool = new ConsumerPool(kafka, 'test', {
        sessionTimeout: 50000,
        heartbeatInterval: 15000
    });

    const producerPool = new ProducerPool(kafka);

    consumerPool.startTransaction(transactionId);
    await producerPool.connect();

    const runner = new SagaRunner(consumerPool, producerPool);
    const effectBuilder = new EffectBuilder(transactionId);

    return {
        transactionId,
        effectBuilder,
        spy: {
            consumer: (methodName: keyof typeof consumerPool) =>
                jest.spyOn(consumerPool, methodName),
            producer: (methodName: keyof typeof producerPool) =>
                jest.spyOn(producerPool, methodName)
        },
        runner,
        context: {
            effects: effectBuilder,
            headers: {}
        },
        async closePools() {
            consumerPool.stopTransaction(transactionId);
            await consumerPool.disconnectConsumers();
            await producerPool.disconnect();
        }
    };
}
