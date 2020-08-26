import Bluebird from 'bluebird';
import {ThrottledProducer} from '../throttled_producer';
import {IAction} from '../types';
import {kafka} from './test_clients';
import {withTopicCleanup, deleteTopic} from './kafka_utils';
import uuid from 'uuid';
import {KafkaMessage} from 'kafkajs';
import {DEFAULT_TEST_TIMEOUT} from './constants';
import pino from 'pino';

type TestAction = IAction<{thing: true}>;

describe(ThrottledProducer.name, function() {
    it(
        'puts messages into the topic',
        async function() {
            await withTopicCleanup(['producer_throttledProducer_test'])(async ([topic]) => {
                const expectedMessage: Omit<TestAction, 'topic'> = {
                    payload: {thing: true},
                    transaction_id: '4'
                };

                const throttledProducer = new ThrottledProducer(kafka);
                await throttledProducer.connect();
                await throttledProducer.putAction({
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
                await throttledProducer.disconnect();
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

            const throttledProducer = new ThrottledProducer(kafka);

            await throttledProducer.connect();
            await throttledProducer.putAction({
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

            await throttledProducer.putAction({
                transaction_id: expectedMessage.transaction_id,
                payload: expectedMessage.payload,
                topic
            });

            await throttledProducer.disconnect();
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

            const throttledProducer = new ThrottledProducer(
                kafka,
                undefined,
                undefined,
                pino({level: 'debug'})
            );

            await throttledProducer.connect();

            await throttledProducer.putAction({
                topic: newTopic,
                transaction_id: transactionId,
                payload: {}
            });

            await throttledProducer.disconnect();

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

    it(
        'handles asynchronous, high (10ms) throughput',
        async function() {
            await withTopicCleanup(['high_throughput'])(async ([topic]) => {
                const throttledProducer = new ThrottledProducer(
                    kafka,
                    undefined,
                    undefined,
                    pino({level: 'debug'})
                );
                await throttledProducer.connect();
                const messages: Array<{payload: {index: number}; transaction_id: string}> = [];

                // consume messages and ensure the number sent are what come back

                const consumer = kafka.consumer({
                    groupId: uuid.v4()
                });

                const receivedMessages: Array<{
                    payload: {index: number};
                    transaction_id: string;
                }> = [];

                await consumer.subscribe({topic});
                await consumer.connect();
                await consumer.run({
                    eachMessage: async ({message}) => {
                        receivedMessages.push(JSON.parse(message.value.toString()));
                    }
                });

                for (let num = 0; num < 1000; num++) {
                    messages.push({
                        payload: {index: num},
                        transaction_id: '4'
                    });
                }

                for (const message of messages) {
                    throttledProducer.putAction({
                        transaction_id: message.transaction_id,
                        payload: message.payload,
                        topic
                    });

                    await Bluebird.delay(10);
                }

                try {
                    await Bluebird.resolve(
                        new Promise(resolve => {
                            const intervalId = setInterval(() => {
                                if (receivedMessages.length === messages.length) {
                                    setImmediate(consumer.stop);
                                    clearInterval(intervalId);
                                    resolve();
                                }
                            }, 1000);
                        })
                    ).timeout(60 * 1000, 'Did not consume expected messages within 60 seconds');
                } catch (error) {
                    await throttledProducer.disconnect();
                    await consumer.disconnect();
                    throw error;
                }

                await throttledProducer.disconnect();
                await consumer.disconnect();

                /** Ensure expected output is consumable */
                expect(receivedMessages.length).toEqual(messages.length);

                /** Ensure all messages present */
                expect(
                    messages.filter(message =>
                        receivedMessages.find(m => m.payload.index === message.payload.index)
                    ).length
                ).toEqual(messages.length);
            });
        },
        DEFAULT_TEST_TIMEOUT * 5
    );
});
