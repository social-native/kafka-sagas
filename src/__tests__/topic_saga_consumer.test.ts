import {TopicSagaConsumer} from '../topic_saga_consumer';
import {kafka} from './test_clients';
import {withTopicCleanup} from './kafka_utils';
import {CompressionTypes} from 'kafkajs';
import {DEFAULT_TEST_TIMEOUT} from './constants';
import Bluebird from 'bluebird';
import uuid from 'uuid';
import {TopicAdministrator} from '../topic_administrator';

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
});
