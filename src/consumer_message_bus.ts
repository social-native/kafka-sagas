import uuid from 'uuid';
import {Consumer, Kafka, ConsumerConfig} from 'kafkajs';

import {IAction, ActionObserver} from './types';
import {transformKafkaMessageToAction} from './transform_kafka_message_to_action';

export class ConsumerMessageBus {
    private consumers: Map<string, Consumer> = new Map();
    private observersByTransaction: Map<
        string,
        Map<string, Array<ActionObserver<IAction>>>
    > = new Map();

    constructor(
        private kafka: Kafka,
        private rootTopic: string,
        private consumerConfig: Omit<ConsumerConfig, 'groupId' | 'allowAutoTopicCreation'> = {}
    ) {}

    public async streamActionsFromTopic(topic: string) {
        if (this.consumers.has(topic)) {
            return;
        }

        await this.createTopicIfNecessary(topic);

        const consumer = this.kafka.consumer({
            groupId: `${this.rootTopic}-${uuid.v4()}`,
            ...this.consumerConfig
        });

        await consumer.connect();
        await consumer.subscribe({topic});
        this.consumers.set(topic, consumer);

        await consumer.run({
            autoCommit: true,
            autoCommitThreshold: 1,
            eachMessage: async ({message}) => {
                const action = transformKafkaMessageToAction<any>(topic, message);

                // if this is a transactionId we actually care about, broadcast
                if (this.observersByTransaction.has(action.transaction_id)) {
                    this.broadcastAction(topic, action);
                }
            }
        });
    }

    public async disconnectConsumers() {
        for (const consumer of this.consumers.values()) {
            await consumer.disconnect();
        }

        this.observersByTransaction.clear();
        this.consumers.clear();
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

    private async createTopicIfNecessary(topic: string) {
        const admin = this.kafka.admin();
        await admin.connect();

        /**
         * This comes back as `true` or `false`
         * depending on if a topic was created.
         *
         * Either way, by having done this,
         * we ensure our topic exists.
         *
         * If, in the future, this managed to throw,
         * it would be up to the saga to catch and rollback.
         *
         * So, we'll let this bubble up.
         */
        await admin.createTopics({
            topics: [{topic}],
            waitForLeaders: true
        });

        await admin.disconnect();
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
