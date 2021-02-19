import uuid from 'uuid';
import {Consumer, Kafka, ConsumerConfig} from 'kafkajs';

import {IAction, ActionObserver} from './types';
import {transformKafkaMessageToAction} from './transform_kafka_message_to_action';
import {TopicAdministrator} from './topic_administrator';
import {isKafkaJSProtocolError} from './type_guard';

export class ConsumerPool {
    private topicAdministrator: TopicAdministrator;
    private consumers: Map<string, Consumer> = new Map();
    private observersByTransaction: Map<
        string,
        Map<string, Array<ActionObserver<IAction>>>
    > = new Map();

    constructor(
        private kafka: Kafka,
        private rootTopic: string,
        private consumerConfig: Omit<ConsumerConfig, 'groupId' | 'allowAutoTopicCreation'> = {},
        topicAdministrator?: TopicAdministrator
    ) {
        this.topicAdministrator = topicAdministrator || new TopicAdministrator(kafka);
    }

    public async streamActionsFromTopic(topic: string) {
        if (this.consumers.has(topic)) {
            return;
        }

        const consumer = this.kafka.consumer({
            groupId: `${this.rootTopic}-${uuid.v4()}`,
            allowAutoTopicCreation: false,
            heartbeatInterval: 500,
            maxWaitTimeInMs: 1,
            ...this.consumerConfig
        });

        await consumer.connect();

        try {
            await consumer.subscribe({topic});
        } catch (error) {
            if (isKafkaJSProtocolError(error) && error.type === 'UNKNOWN_TOPIC_OR_PARTITION') {
                await this.topicAdministrator.createTopic(topic);
            } else {
                throw error;
            }
        }

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
            await consumer.stop();
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

    private broadcastAction(topic: string, action: IAction) {
        const topicObserversForTransaction = this.observersByTransaction.get(action.transaction_id);

        if (!topicObserversForTransaction) {
            return;
        }

        const topicObservers = topicObserversForTransaction.get(topic) || [];

        topicObservers.forEach(notify => notify(action));
    }
}
