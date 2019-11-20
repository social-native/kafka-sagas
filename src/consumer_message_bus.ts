import Bluebird from 'bluebird';
import uuid from 'uuid';
import {Consumer, Kafka} from 'kafkajs';

import {IAction} from './types';
import {buildActionFromPayload} from 'build_action_from_payload';

export class ConsumerMessageBus {
    private consumers: Map<string, Consumer> = new Map();
    private transactionIds: Set<string> = new Set();
    private subscribers: Map<
        {topic: string; transactionId: string},
        (action: IAction) => any
    > = new Map();

    constructor(private kafka: Kafka, private rootTopic: string) {}

    public async addSubscription(topic: string) {
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

        await consumer.run({
            autoCommit: true,
            autoCommitThreshold: 1,
            eachMessage: async ({message}) => {
                const action = buildActionFromPayload(topic, message);

                // if this is a transactionId we actually care about, broadcast
                if (this.transactionIds.has(action.transactionId)) {
                    this.broadcast(action);
                }
            }
        });
    }

    public startTransaction(transactionId: string) {
        this.transactionIds.add(transactionId);
    }

    public awaitEventBroadcast(topic: string, transactionId: string) {
        return new Bluebird((resolve: (action: IAction) => any) => {
            this.subscribers.set({topic, transactionId}, resolve);
        });
    }

    private broadcast(action: IAction) {
        const key = {topic: action.topic, transactionId: action.transactionId};

        const resolver = this.subscribers.get(key);

        if (!resolver) {
            return;
        }

        resolver(action);

        this.subscribers.delete(key);
    }
}
