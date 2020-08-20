import {Producer, Kafka, CompressionTypes, ProducerConfig} from 'kafkajs';
import {IAction} from './types';
import {createActionMessage} from './create_action_message';
import {TopicAdministrator} from './topic_administrator';

export class ProducerPool {
    private producer: Producer;
    private topicAdministrator: TopicAdministrator;
    private isConnected: boolean = false;

    constructor(
        kafka: Kafka,
        producerConfig: Omit<
            ProducerConfig,
            'allowAutoTopicCreation' | 'maxInflightRequests' | 'idempotent'
        > = {},
        topicAdministrator?: TopicAdministrator
    ) {
        this.producer = kafka.producer({
            maxInFlightRequests: 1,
            idempotent: true,
            ...producerConfig
        });

        this.connect = this.connect.bind(this);
        this.putAction = this.putAction.bind(this);
        this.disconnect = this.disconnect.bind(this);
        this.topicAdministrator =
            topicAdministrator ||
            new TopicAdministrator(kafka, {
                replicationFactor: 1
            });
    }

    public async putAction<Action extends IAction>(action: Action) {
        if (!this.isConnected) {
            throw new Error('You must .connect before producing actions');
        }

        await this.topicAdministrator.createTopic(action.topic);

        await this.producer.send({
            acks: -1,
            compression: CompressionTypes.GZIP,
            topic: action.topic,
            messages: [createActionMessage({action})]
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
}
