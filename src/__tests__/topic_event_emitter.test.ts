import {TopicEventEmitter} from 'topic_event_emitter';
import {kafka} from './test_clients';
import {withTopicCleanup} from './kafka_utils';
import {DEFAULT_TEST_TIMEOUT} from './constants';
import Bluebird from 'bluebird';

describe(TopicEventEmitter, function() {
    it(
        'emits events of the values coming out of the topics',
        async function() {
            await withTopicCleanup(['event-emitter-topic-1', 'event-emitter-topic-2'])(
                async topics => {
                    const topicEventEmitter = new TopicEventEmitter(kafka, topics);
                    await topicEventEmitter.start();

                    const EVENTS = {
                        SUB: 'SUB',
                        UNSUB: 'UNSUB'
                    };

                    const onSub = jest.fn();
                    const onUnsub = jest.fn();
                    topicEventEmitter.emitter.on(EVENTS.SUB, onSub);
                    topicEventEmitter.emitter.on(EVENTS.UNSUB, onUnsub);

                    const producer = kafka.producer();
                    await producer.connect();
                    await producer.send({
                        topic: topics[0],
                        messages: [
                            {
                                value: EVENTS.SUB
                            }
                        ]
                    });
                    await producer.send({
                        topic: topics[1],
                        messages: [
                            {
                                value: EVENTS.UNSUB
                            }
                        ]
                    });

                    await producer.disconnect();
                    await topicEventEmitter.disconnect();

                    await Bluebird.delay(3000);

                    expect(onSub.mock.calls).toMatchInlineSnapshot(`
                        Array [
                          Array [],
                        ]
                    `);
                    expect(onUnsub.mock.calls).toMatchInlineSnapshot(`
                        Array [
                          Array [],
                        ]
                    `);
                }
            );
        },
        DEFAULT_TEST_TIMEOUT
    );
});
