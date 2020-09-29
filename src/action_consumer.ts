import uuid from 'uuid';
import {Consumer, Kafka, ConsumerConfig} from 'kafkajs';

import {IAction, ActionObserver} from './types';
import {transformKafkaMessageToAction} from './transform_kafka_message_to_action';

export class ActionConsumer {
    private consumer: Consumer;
    private observersByTransaction: Map<
        string,
        Map<string, Array<ActionObserver<IAction>>>
    > = new Map();
    private subscriptions = new Set<string>();

    constructor(
        private kafka: Kafka,
        private rootTopic: string,
        private consumerConfig: Omit<ConsumerConfig, 'groupId' | 'allowAutoTopicCreation'> = {}
    ) {
        this.consumer = this.kafka.consumer({
            groupId: `${this.rootTopic}-${uuid.v4()}`,
            allowAutoTopicCreation: true,
            ...this.consumerConfig
        });
    }

    public async streamActionsFromTopic(newTopic: string) {
        if (this.subscriptions.has(newTopic)) {
            return;
        }

        await this.consumer.connect();
        await this.consumer.stop();
        await this.consumer.subscribe({topic: newTopic});
        await this.consumer.run({
            autoCommit: true,
            autoCommitThreshold: 1,
            eachMessage: async ({topic, message}) => {
                const action = transformKafkaMessageToAction<any>(topic, message);

                // if this is a transactionId we actually care about, broadcast
                if (this.observersByTransaction.has(action.transaction_id)) {
                    this.broadcastAction(topic, action);
                }
            }
        });

        this.subscriptions.add(newTopic);
    }

    public async disconnect() {
        await this.consumer.stop();
        await this.consumer.disconnect();
        this.observersByTransaction.clear();
    }

    public startTransaction(transactionId: string) {
        if (this.observersByTransaction.has(transactionId)) {
            throw new Error('Trying to start a transaction that has already started');
        }

        this.observersByTransaction.set(transactionId, new Map());
    }

    public stopTransaction(transactionId: string) {
        this.observersByTransaction.delete(transactionId);
    }

    public registerTopicObserver({
        transactionId,
        topic,
        observer
    }: {
        transactionId: string;
        topic: string;
        observer: ActionObserver<IAction>;
    }) {
        const topicObserversForTransaction =
            this.observersByTransaction.get(transactionId) || new Map();

        const topicObservers = topicObserversForTransaction.get(topic) || [];

        topicObserversForTransaction.set(topic, [...topicObservers, observer]);
    }

    private broadcastAction(topic: string, action: IAction) {
        const topicObserversForTransaction = this.observersByTransaction.get(action.transaction_id);

        if (!topicObserversForTransaction) {
            return;
        }

        const topicObservers = topicObserversForTransaction.get(topic) || [];

        topicObservers.forEach(notify => notify(action));
    }
}
