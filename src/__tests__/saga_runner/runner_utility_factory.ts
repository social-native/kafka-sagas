import {ConsumerMessageBus} from 'consumer_message_bus';
import {kafka} from '../test_clients';
import {ProducerMessageBus} from 'producer_message_bus';
import {EffectBuilder} from 'effect_builder';
import {SagaRunner} from 'saga_runner';

export async function runnerUtilityFactory() {
    const transactionId = 'static-transaction-id';
    const consumerBus = new ConsumerMessageBus(kafka, 'test', {
        sessionTimeout: 50000,
        heartbeatInterval: 15000
    });

    const producerBus = new ProducerMessageBus(kafka);

    consumerBus.startTransaction(transactionId);
    await producerBus.connect();

    const runner = new SagaRunner(consumerBus, producerBus);

    return {
        transactionId,
        effectBuilder: new EffectBuilder(transactionId),
        spy: {
            consumer: (methodName: keyof typeof consumerBus) => jest.spyOn(consumerBus, methodName),
            producer: (methodName: keyof typeof producerBus) => jest.spyOn(producerBus, methodName)
        },
        runner,
        async closeBuses() {
            consumerBus.stopTransaction(transactionId);
            await consumerBus.disconnectConsumers();
            await producerBus.disconnect();
        }
    };
}
