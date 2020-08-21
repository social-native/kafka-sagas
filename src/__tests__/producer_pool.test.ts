import Bluebird from 'bluebird';
import {ProducerPool} from '../producer_pool';
import {IAction} from '../../src/types';
import {kafka} from './test_clients';
import {withTopicCleanup, deleteTopic} from './kafka_utils';
import uuid from 'uuid';
import {KafkaMessage} from 'kafkajs';
import {DEFAULT_TEST_TIMEOUT} from './constants';

type TestAction = IAction<{thing: true}>;

describe(ProducerPool.name, function() {
    it(
        'puts messages into the topic',
        async function() {
            await withTopicCleanup(['producer_pool_test'])(async ([topic]) => {
                const expectedMessage: Omit<TestAction, 'topic'> = {
                    payload: {thing: true},
                    transaction_id: '4'
                };

                const pool = new ProducerPool(kafka);
                await pool.connect();
                await pool.putAction({
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
                    }
                });

                await Bluebird.delay(250);

                expect(receivedMessage).toEqual(expectedMessage);
                await consumer.disconnect();
                await pool.disconnect();
            });
        },
        DEFAULT_TEST_TIMEOUT
    );

    it(
        'puts messages into the topic even if producer metadata expired',
        async function() {
            const topic = 'stale_producer_test';

            const admin = kafka.admin();
            await admin.connect();
            await admin.createTopics({
                topics: [
                    {
                        topic,
                        configEntries: [
                            {name: 'cleanup.policy', value: 'delete'},
                            {name: 'retention.ms', value: '100'}
                        ]
                    }
                ]
            });

            const expectedMessage: Omit<TestAction, 'topic'> = {
                payload: {thing: true},
                transaction_id: '4'
            };

            const pool = new ProducerPool(kafka);

            await pool.connect();
            await pool.putAction({
                transaction_id: expectedMessage.transaction_id,
                payload: expectedMessage.payload,
                topic
            });

            await admin.deleteTopics({
                topics: [topic]
            });

            await admin.createTopics({
                topics: [
                    {
                        topic,
                        configEntries: [
                            {name: 'cleanup.policy', value: 'delete'},
                            {name: 'retention.ms', value: '100'}
                        ]
                    }
                ]
            });

            await pool.putAction({
                transaction_id: expectedMessage.transaction_id,
                payload: expectedMessage.payload,
                topic
            });

            await pool.disconnect();
            await admin.deleteTopics({
                topics: [topic]
            });
            await admin.disconnect();
        },
        DEFAULT_TEST_TIMEOUT
    );

    it('creates topics that do not already exist', async function() {
        const newTopic = uuid.v4();

        try {
            const transactionId = 'super-cool-transaction';

            const pool = new ProducerPool(kafka);

            await pool.connect();

            await pool.putAction({
                topic: newTopic,
                transaction_id: transactionId,
                payload: {}
            });

            await pool.disconnect();

            const admin = kafka.admin();

            await admin.connect();

            const topicMetadata = await admin.fetchTopicMetadata({
                topics: [newTopic]
            });

            await admin.disconnect();

            expect(topicMetadata.topics.map(({name}) => name)).toContainEqual(newTopic);
        } catch (error) {
            await deleteTopic(newTopic);
            throw error;
        }

        await deleteTopic(newTopic);
    });
});
