import uuid from 'uuid';
import {Consumer, Kafka} from 'kafkajs';

import {IAction} from './types';
import {buildActionFromPayload} from 'build_action_from_payload';

interface IStreamTrap {
    transactionId: string;
    topic: string;
    doesMatch<Action extends IAction>(action?: Action): boolean;
}

export class ConsumerMessageBus {
    private consumers: Map<string, Consumer> = new Map();
    private transactionIds: Set<string> = new Set();
    private streamBuffers: Map<{topic: string; transactionId: string}, IAction[]> = new Map();

    constructor(private kafka: Kafka, private rootTopic: string) {}

    public async addSubscriptionIfNecessary(matcher: IStreamTrap) {
        if (this.consumers.has(matcher.topic)) {
            return;
        }

        const consumer = this.kafka.consumer({
            groupId: `${this.rootTopic}-${uuid.v4()}`,
            allowAutoTopicCreation: false
        });

        await consumer.connect();
        await consumer.subscribe({topic: matcher.topic});
        this.consumers.set(matcher.topic, consumer);

        return consumer.run({
            autoCommit: true,
            autoCommitThreshold: 1,
            eachMessage: async ({message}) => {
                const action = buildActionFromPayload(matcher.topic, message);

                // if this is a transactionId we actually care about, broadcast
                if (this.transactionIds.has(action.transactionId)) {
                    this.broadcastTransactionEvent(action);
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

    // tslint:disable-next-line: cyclomatic-complexity
    public *actionStream(matcher: IStreamTrap) {
        const key = {
            topic: matcher.topic,
            transactionId: matcher.transactionId
        };

        if (!this.streamBuffers.has(key)) {
            this.streamBuffers.set(key, []);
        }

        while (this.transactionIds.has(matcher.transactionId)) {
            const actionBuffer = this.streamBuffers.get(key);

            if (!actionBuffer) {
                throw new Error('Action buffer was unexpectedly destroyed');
            }

            const [firstItem] = actionBuffer;

            if (!firstItem || !matcher.doesMatch(firstItem)) {
                continue;
            }

            actionBuffer.shift();
            this.streamBuffers.set(key, actionBuffer);
            yield firstItem;
        }

        this.streamBuffers.delete(key);
    }

    private broadcastTransactionEvent(action: IAction) {
        const key = {topic: action.topic, transactionId: action.transactionId};

        const actionBuffer = this.streamBuffers.get(key);

        // if there *isn't* a buffer for this key, move on
        // tslint:disable-next-line: triple-equals
        if (actionBuffer == null) {
            return;
        }

        actionBuffer.push(action);
    }
}
