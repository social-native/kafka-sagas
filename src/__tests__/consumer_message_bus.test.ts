import Bluebird from 'bluebird';
import {ConsumerMessageBus} from '../../src/consumer_message_bus';
import {kafka} from './test_clients';
import {seedTopic, withTopicCleanup, deleteTopic} from './kafka_utils';
import {IAction} from 'types';
import uuid from 'uuid';

describe(ConsumerMessageBus.name, function() {
    it('notifies observers of new messages only', async function() {
        await withTopicCleanup(['bart-report-card-arrived'])(async ([topic]) => {
            const transactionId = 'super-cool-transaction';

            const preseededMessage: Partial<IAction> = {
                transaction_id: transactionId,
                payload: {country: 'france'}
            };

            await seedTopic(topic, [preseededMessage]);

            const bus = new ConsumerMessageBus(kafka, 'consumer_message_bus_test');
            const receivedMessages: IAction[] = [];
            bus.startTransaction(transactionId);

            bus.registerTopicObserver({
                transactionId,
                topic,
                observer: action => receivedMessages.push(action)
            });

            await bus.streamActionsFromTopic(topic);

            await seedTopic(topic, [
                {
                    transaction_id: transactionId,
                    payload: {new_message: true}
                }
            ]);

            // give it some time to deliver
            await Bluebird.delay(1000);

            await bus.disconnectConsumers();

            expect(receivedMessages.map(({payload}) => payload)).toContainEqual({
                new_message: true
            });
        });
    }, 8000);

    it('creates topics that do not already exist', async function() {
        const newTopic = uuid.v4();

        try {
            const transactionId = 'super-cool-transaction';

            const bus = new ConsumerMessageBus(kafka, newTopic);
            bus.startTransaction(transactionId);

            bus.registerTopicObserver({
                transactionId,
                topic: newTopic,
                // tslint:disable-next-line: no-empty
                observer: () => {}
            });

            await bus.streamActionsFromTopic(newTopic);

            await seedTopic(newTopic, [
                {
                    transaction_id: transactionId,
                    payload: {new_message: true}
                }
            ]);

            bus.stopTransaction(transactionId);

            await bus.disconnectConsumers();

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
