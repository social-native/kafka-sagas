import uuid from 'uuid';
import {Consumer, Kafka} from 'kafkajs';

import {IAction} from './types';
import {buildActionFromPayload} from 'build_action_from_payload';

interface IStream<Action extends IAction> {
    transactionId: string;
    topic: string;
    observer: (action: Action) => null;
}

export class ConsumerMessageBus {
    private consumers: Map<string, Consumer> = new Map();
    private transactionIds: Set<string> = new Set();
    private observersOfTopic: Map<
        {topic: string; transactionId: string},
        Array<(action: Action) => null>
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
                if (this.transactionIds.has(action.transactionId)) {
                    this.broadcastTopicEvent(topic, action);
                }
            }
        });
    }

    public startTransaction(transactionId: string) {
        this.transactionIds.add(transactionId);
    }

    public stopTransaction(transactionId: string) {
        this.transactionIds.delete(transactionId);
    }

    public subscribeToTopicEvents({transactionId, topic, observer: newObserver}: TODO) {
        const key = {transactionId, topic};
        const observers = this.observersOfTopic.get(key) || [];
        this.observersOfTopic.set(key, [...observers, newObserver]);
    }

    public unsubscribeFromTopicEvents() {
        // TODO
    }

    private broadcastTopicEvent(topic: string, action: IAction) {
        const key = {transactionId: action.transactionId, topic};
        const observers = this.observersOfTopic.get(key) || [];
        observers.forEach(notify => notify(action));
    }
}
