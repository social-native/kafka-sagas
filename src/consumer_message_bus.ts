import uuid from 'uuid';
import {Consumer, Kafka} from 'kafkajs';

import {IAction, ActionObserver} from './types';
import {buildActionFromPayload} from 'build_action_from_payload';

export class ConsumerMessageBus {
    private consumers: Map<string, Consumer> = new Map();
    private observersByTransaction: Map<
        string,
        Map<string, Array<ActionObserver<IAction>>>
    > = new Map();

    constructor(private kafka: Kafka, private rootTopic: string) {}

    public async streamEffectTopic(topic: string) {
        if (this.consumers.has(topic)) {
            return;
        }

        const consumer = this.kafka.consumer({
            groupId: `${this.rootTopic}-${uuid.v4()}`,
            allowAutoTopicCreation: false
        });

        await consumer.connect();
        await consumer.subscribe({topic});
        this.consumers.set(topic, consumer);

        return consumer.run({
            autoCommit: true,
            autoCommitThreshold: 1,
            eachMessage: async ({message}) => {
                const action = buildActionFromPayload(topic, message);

                // if this is a transactionId we actually care about, broadcast
                if (this.observersByTransaction.has(action.transactionId)) {
                    this.broadcastAction(topic, action);
                }
            }
        });
    }

    public startTransaction(transactionId: string) {
        this.observersByTransaction.set(transactionId, new Map());
    }

    public stopTransaction(transactionId: string) {
        this.observersByTransaction.delete(transactionId);
    }

    public subscribeToTopicEvents({
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
        const topicObserversForTransaction = this.observersByTransaction.get(action.transactionId);

        if (!topicObserversForTransaction) {
            return;
        }

        const topicObservers = topicObserversForTransaction.get(topic) || [];

        topicObservers.forEach(notify => notify(action));
    }
}
