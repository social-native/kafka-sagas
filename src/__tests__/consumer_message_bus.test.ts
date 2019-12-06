import Bluebird from 'bluebird';
import {ConsumerMessageBus} from '../../src/consumer_message_bus';
import {kafka} from './test_clients';
import {seedTopic, withTopicCleanup} from './kafka_utils';
import {IAction} from 'types';

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

            expect(receivedMessages.map(({payload}) => payload)).toContainEqual({new_message: true});
        });
    }, 8000);
});
