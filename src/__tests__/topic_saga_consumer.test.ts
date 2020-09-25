import {TopicSagaConsumer} from '../topic_saga_consumer';
import {kafka} from './test_clients';
import {withTopicCleanup, sampleMessages} from './kafka_utils';
import {CompressionTypes} from 'kafkajs';
import {DEFAULT_TEST_TIMEOUT} from './constants';
import Bluebird from 'bluebird';
import uuid from 'uuid';
import {TopicAdministrator} from '../topic_administrator';
import {DefaultPayload, IConsumptionEvent} from '../types';
import {createActionMessage} from '../create_action_message';

// tslint:disable-next-line: no-empty
describe(TopicSagaConsumer.name, function() {
    it(
        'consumes from a topic and calls the saga with provided context',
        async function() {
            await withTopicCleanup(
                ['topic-saga-consumer'],
                false
            )(async ([topic]) => {
                const producer = kafka.producer();
                await producer.connect();

                const spy = jest.fn();

                const topicConsumer = new TopicSagaConsumer({
                    kafka,
                    getContext: async () => ({
                        spy
                    }),
                    topic,
                    *saga(initialAction, {effects: {callFn}, spy: spyFn}) {
                        yield callFn(spyFn, [initialAction]);
                    }
                });

                await topicConsumer.run();

                await Bluebird.delay(1000);

                await producer.send({
                    acks: -1,
                    compression: CompressionTypes.GZIP,
                    topic,
                    messages: [
                        {
                            value: JSON.stringify({
                                transaction_id: 'test-trx-id-bark',
                                payload: {dogs_go: 'awoo'}
                            })
                        }
                    ]
                });

                await Bluebird.delay(1000);

                expect(spy.mock.calls).toMatchInlineSnapshot(`
                    Array [
                      Array [
                        Object {
                          "headers": Object {},
                          "payload": Object {
                            "dogs_go": "awoo",
                          },
                          "topic": "topic-saga-consumer",
                          "transaction_id": "test-trx-id-bark",
                        },
                      ],
                    ]
                `);

                await topicConsumer.disconnect();
                await producer.disconnect();
            });
        },
        DEFAULT_TEST_TIMEOUT
    );

    it(
        'bubbles errors into the saga',
        async function() {
            await withTopicCleanup(
                ['saga-failure'],
                false
            )(async ([topic]) => {
                const producer = kafka.producer({idempotent: true});
                await producer.connect();
                const spy = jest.fn();

                const topicConsumer = new TopicSagaConsumer({
                    kafka,
                    topic,
                    *saga(_, {effects: {callFn}}) {
                        try {
                            yield callFn(async () => {
                                throw new Error('I failed.');
                            }, []);
                        } catch (error) {
                            spy(error);
                        }
                    }
                });

                await topicConsumer.run();

                await Bluebird.delay(1000);

                await producer.send({
                    acks: -1,
                    compression: CompressionTypes.GZIP,
                    topic,
                    messages: [
                        {
                            value: JSON.stringify({
                                transaction_id: 'test-trx-id-bark',
                                payload: {dogs_go: 'awoo'}
                            })
                        }
                    ]
                });

                await Bluebird.delay(1000);
                await topicConsumer.disconnect();
                await producer.disconnect();

                expect(spy.mock.calls).toMatchInlineSnapshot(`
                    Array [
                      Array [
                        [Error: I failed.],
                      ],
                    ]
                `);
            });
        },
        DEFAULT_TEST_TIMEOUT * 3
    );

    it(
        'creates nonexistent topics using the topic administrator',
        async function() {
            const nonexistentTopic = uuid.v4();

            const topicAdmin = new TopicAdministrator(kafka, {
                numPartitions: 10
            });

            const topicConsumer = new TopicSagaConsumer({
                kafka,
                topic: nonexistentTopic,
                topicAdministrator: topicAdmin,
                *saga() {
                    return;
                }
            });

            await topicConsumer.run();

            const admin = kafka.admin({retry: {retries: 0}});
            await admin.connect();

            const topicMetadata = await admin.fetchTopicMetadata({
                topics: [nonexistentTopic]
            });

            await admin.deleteTopics({topics: [nonexistentTopic]});
            await admin.disconnect();
            await topicConsumer.disconnect();

            expect(topicMetadata.topics[0].name).toEqual(nonexistentTopic);
            expect(topicMetadata.topics[0].partitions.length).toEqual(10);
        },
        DEFAULT_TEST_TIMEOUT
    );

    it(
        'can consume concurrently via multiple instances',
        async function() {
            const consumptionEvents: Array<IConsumptionEvent<unknown>> = [];

            const topic = uuid.v4();

            const topicAdministrator = new TopicAdministrator(kafka, {numPartitions: 10});

            await topicAdministrator.createTopic(topic);

            const consumers = [1, 2, 3].map(() => {
                const consumer = new TopicSagaConsumer<DefaultPayload>({
                    kafka,
                    *saga(_, {effects: {delay}}) {
                        // adding a small consumer delay ensures messages are feathered out
                        yield delay(10);
                    },
                    topic,
                    topicAdministrator
                });

                consumer.eventEmitter.on('consumed_message', event => {
                    consumptionEvents.push(event);
                });

                return consumer;
            });

            for (const consumer of consumers) {
                await consumer.run();
            }

            const producer = kafka.producer();
            await producer.connect();

            for (let i = 0; i < 100; i++) {
                await producer.send({
                    topic,
                    messages: [
                        createActionMessage({
                            action: {
                                transaction_id: uuid.v4(),
                                payload: {id: uuid.v4()},
                                topic
                            }
                        })
                    ]
                });
            }

            await producer.disconnect();

            await new Bluebird(resolve => {
                const intervalId = setInterval(() => {
                    if (consumptionEvents.length >= sampleMessages.length) {
                        clearInterval(intervalId);
                        setTimeout(resolve, 1000);
                    }
                }, 1000);
            });

            for (const consumer of consumers) {
                await consumer.disconnect();
            }

            const distinctPartitions = consumptionEvents.reduce((partitions, event) => {
                if (!partitions.includes(event.partition)) {
                    return [...partitions, event.partition];
                }

                return partitions;
            }, [] as number[]);

            await topicAdministrator.deleteTopic(topic);

            // expect messages to feather out among partitions
            expect(distinctPartitions.length).toBeGreaterThan(1);

            // expect the number produced to be the number received
            expect(consumptionEvents.length).toEqual(100);
        },
        DEFAULT_TEST_TIMEOUT * 2
    );

    it(
        'can consume concurrently via a single instance',
        async function() {
            const consumptionEvents: Array<IConsumptionEvent<unknown>> = [];
            const topic = uuid.v4();
            const topicAdministrator = new TopicAdministrator(kafka, {numPartitions: 10});
            await topicAdministrator.createTopic(topic);
            const consumer = new TopicSagaConsumer<DefaultPayload>({
                kafka,
                *saga(_, {effects: {delay}}) {
                    // adding a small consumer delay ensures messages are feathered out
                    yield delay(10);
                },
                topic,
                topicAdministrator: new TopicAdministrator(kafka, {numPartitions: 10}),
                config: {partitionConcurrency: 10}
            });

            consumer.eventEmitter.on('consumed_message', event => {
                consumptionEvents.push(event);
            });

            await consumer.run();

            const producer = kafka.producer();
            await producer.connect();

            for (let i = 0; i < 100; i++) {
                await producer.send({
                    topic,
                    messages: [
                        createActionMessage({
                            action: {
                                transaction_id: uuid.v4(),
                                payload: {id: uuid.v4()},
                                topic
                            }
                        })
                    ]
                });
            }

            await producer.disconnect();

            await new Bluebird(resolve => {
                const intervalId = setInterval(() => {
                    if (consumptionEvents.length >= sampleMessages.length) {
                        clearInterval(intervalId);
                        setTimeout(resolve, 1000);
                    }
                }, 1000);
            });

            await consumer.disconnect();
            await topicAdministrator.deleteTopic(topic);

            const distinctPartitions = consumptionEvents.reduce((partitions, event) => {
                if (!partitions.includes(event.partition)) {
                    return [...partitions, event.partition];
                }

                return partitions;
            }, [] as number[]);

            // expect messages to feather out among partitions
            expect(distinctPartitions.length).toBeGreaterThan(1);

            // expect the number produced to be the number received
            expect(consumptionEvents.length).toEqual(100);
        },
        DEFAULT_TEST_TIMEOUT * 2
    );

    it(
        'correctly handles a long/indefinitely running saga',
        async function() {
            const consumptionEvents: Array<IConsumptionEvent<unknown>> = [];

            await withTopicCleanup(
                [uuid.v4()],
                false
            )(async function([topic]) {
                const consumer = new TopicSagaConsumer<DefaultPayload>({
                    kafka,
                    *saga(_, {effects: {delay}}) {
                        yield delay(40000);
                    },
                    topic,
                    topicAdministrator: new TopicAdministrator(kafka, {numPartitions: 10}),
                    config: {
                        partitionConcurrency: 1,
                        heartbeatInterval: 3000,
                        consumptionTimeoutMs: -1
                    }
                });

                consumer.eventEmitter.on('consumed_message', event => {
                    consumptionEvents.push(event);
                });

                await consumer.run();

                const producer = kafka.producer();
                await producer.connect();

                await producer.send({
                    topic,
                    messages: [
                        createActionMessage({
                            action: {
                                transaction_id: uuid.v4(),
                                payload: {id: uuid.v4()},
                                topic
                            }
                        })
                    ]
                });

                await producer.disconnect();

                await new Bluebird(resolve => {
                    const intervalId = setInterval(() => {
                        if (consumptionEvents.length) {
                            clearInterval(intervalId);
                            resolve();
                        }
                    }, 1000);
                });

                await consumer.disconnect();
            });
        },
        DEFAULT_TEST_TIMEOUT * 3
    );
});
