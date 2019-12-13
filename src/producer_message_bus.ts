import {Producer, Kafka, CompressionTypes, ProducerConfig} from 'kafkajs';
import {IAction} from './types';
import {createActionMessage} from 'create_action_message';

export class ProducerMessageBus {
    private producer: Producer;
    private isConnected: boolean = false;

    constructor(
        private kafka: Kafka,
        producerConfig: Omit<
            ProducerConfig,
            'allowAutoTopicCreation' | 'maxInflightRequests' | 'idempotent'
        > = {}
    ) {
        this.producer = kafka.producer({
            maxInFlightRequests: 1,
            idempotent: true,
            ...producerConfig
        });

        this.connect = this.connect.bind(this);
        this.putAction = this.putAction.bind(this);
        this.disconnect = this.disconnect.bind(this);
    }

    public async putAction<Action extends IAction>(action: Action) {
        if (!this.isConnected) {
            throw new Error('You must .connect before producing actions');
        }

        await this.createTopicIfNecessary(action.topic);

        await this.producer.send({
            acks: -1,
            compression: CompressionTypes.GZIP,
            topic: action.topic,
            messages: [
                createActionMessage({
                    action,
                    userId: action.userId,
                    roles: action.userRoles
                })
            ]
        });
    }

    public async connect() {
        if (this.isConnected) {
            return;
        }

        await this.producer.connect();
        this.isConnected = true;
    }

    public async disconnect() {
        if (!this.isConnected) {
            return;
        }

        await this.producer.disconnect();
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
            topics: [{topic}]
        });
        await admin.disconnect();
    }
}
