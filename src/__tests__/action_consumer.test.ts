import Bluebird from 'bluebird';
import {ActionConsumer} from '../action_consumer';
import {kafka} from './test_clients';
import {seedTopic, withTopicCleanup, deleteTopic} from './kafka_utils';
import {IAction} from '../types';
import uuid from 'uuid';
import {DEFAULT_TEST_TIMEOUT} from './constants';

describe(ActionConsumer.name, function() {
    it('notifies observers of new messages only', async function() {
        await withTopicCleanup(['bart-report-card-arrived'])(async ([topic]) => {
            const transactionId = 'super-cool-transaction';

            const preseededMessage: Partial<IAction> = {
                transaction_id: transactionId,
                payload: {country: 'france'}
            };

            await seedTopic(topic, [preseededMessage]);

            const pool = new ActionConsumer(kafka, 'consumer_pool_test');
            const receivedMessages: IAction[] = [];
            pool.startTransaction(transactionId);

            pool.registerTopicObserver({
                transactionId,
                topic,
                observer: action => receivedMessages.push(action)
            });

            await pool.streamActionsFromTopic(topic);

            await seedTopic(topic, [
                {
                    transaction_id: transactionId,
                    payload: {new_message: true}
                }
            ]);

            // give it some time to deliver
            await Bluebird.delay(1000);

            await pool.disconnect();

            expect(receivedMessages.map(({payload}) => payload)).toContainEqual({
                new_message: true
            });
        });
    }, 8000);

    it('creates topics that do not already exist', async function() {
        const newTopic = uuid.v4();

        try {
            const transactionId = 'super-cool-transaction';

            const pool = new ActionConsumer(kafka, newTopic);
            pool.startTransaction(transactionId);

            pool.registerTopicObserver({
                transactionId,
                topic: newTopic,
                // tslint:disable-next-line: no-empty
                observer: () => {}
            });

            await pool.streamActionsFromTopic(newTopic);

            await seedTopic(newTopic, [
                {
                    transaction_id: transactionId,
                    payload: {new_message: true}
                }
            ]);

            pool.stopTransaction(transactionId);

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

    it(
        'can follow new topics even after beginning once',
        async function() {
            const firstTopic = uuid.v4();
            const secondTopic = uuid.v4();

            try {
                const transactionId = 'super-cool-transaction';

                const pool = new ActionConsumer(kafka, firstTopic);
                pool.startTransaction(transactionId);

                const events: any[] = [];

                pool.registerTopicObserver({
                    transactionId,
                    topic: firstTopic,
                    // tslint:disable-next-line: no-empty
                    observer: event => events.push(event)
                });

                pool.registerTopicObserver({
                    transactionId,
                    topic: secondTopic,
                    // tslint:disable-next-line: no-empty
                    observer: event => events.push(event)
                });

                await pool.streamActionsFromTopic(firstTopic);

                await seedTopic(firstTopic, [
                    {
                        transaction_id: transactionId,
                        payload: {message_number: 1}
                    }
                ]);

                await pool.streamActionsFromTopic(secondTopic);

                await seedTopic(secondTopic, [
                    {
                        transaction_id: transactionId,
                        payload: {message_number: 2}
                    }
                ]);

                await new Promise(resolve => {
                    const interval = setInterval(() => {
                        if (events.length === 2) {
                            clearInterval(interval);
                            resolve();
                        }
                    }, 100);
                });

                pool.stopTransaction(transactionId);

                await pool.disconnect();

                await deleteTopic(firstTopic);
                await deleteTopic(secondTopic);

                expect(events.map(({payload}) => payload)).toMatchInlineSnapshot(`
                    Array [
                      Object {
                        "message_number": 1,
                      },
                      Object {
                        "message_number": 2,
                      },
                    ]
                `);
            } catch (error) {
                await deleteTopic(firstTopic);
                await deleteTopic(secondTopic);
                throw error;
            }
        },
        DEFAULT_TEST_TIMEOUT
    );
});
