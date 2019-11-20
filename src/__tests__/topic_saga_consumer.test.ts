import {TopicSagaConsumer} from 'topic_saga_consumer';
import {kafka} from './test_clients';
import {withTopicCleanup} from './kafka_utils';
import {CompressionTypes} from 'kafkajs';
import {DEFAULT_TEST_TIMEOUT} from './constants';
import Bluebird from 'bluebird';

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
                    getContext: () => ({
                        spy
                    }),
                    topic,
                    *saga(initialAction, {effects: {callFn}, spy: spyFn}) {
                        yield callFn(spyFn, [initialAction]);
                    }
                });

                await topicConsumer.run();

                await Bluebird.delay(2000);

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

                await Bluebird.delay(2000);

                expect(spy.mock.calls).toMatchSnapshot();

                await topicConsumer.disconnect();
                await producer.disconnect();
            });
        },
        DEFAULT_TEST_TIMEOUT
    );
});
