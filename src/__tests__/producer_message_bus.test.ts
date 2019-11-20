import Bluebird from 'bluebird';
import {ProducerMessageBus} from '../../src/producer_message_bus';
import {IAction} from '../../src/types';
import {kafka} from './test_clients';
import {createTopic, deleteTopic} from './kafka_utils';
import uuid from 'uuid';
import {KafkaMessage} from 'kafkajs';

type TestAction = IAction<{thing: true}>;

describe(ProducerMessageBus.name, function() {
    it(
        'puts messages into the topic',
        async function() {
            const topic = 'producer_message_bus_test';
            const expectedMessage: Omit<TestAction, 'topic'> = {
                payload: {thing: true},
                transaction_id: '4'
            };

            await createTopic(topic);
            const bus = new ProducerMessageBus(kafka);
            await bus.connect();
            await bus.putAction({
                transaction_id: expectedMessage.transaction_id,
                payload: expectedMessage.payload,
                topic
            });

            const consumer = kafka.consumer({groupId: uuid.v4()});
            await consumer.connect();
            await consumer.subscribe({topic, fromBeginning: true});

            let receivedMessage: Omit<TestAction, 'topic'> | null = null;

            await consumer.run({
                eachMessage: async ({message}: {message: KafkaMessage}) => {
                    receivedMessage = JSON.parse(message.value.toString());
                    await consumer.disconnect();
                }
            });

            await Bluebird.delay(3000);

            expect(receivedMessage).toEqual(expectedMessage);

            await bus.disconnect();
            await deleteTopic(topic);
        },
        10 * 1000
    );
});
