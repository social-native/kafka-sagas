import {Producer, Kafka, CompressionTypes, ProducerConfig} from 'kafkajs';
import {IAction} from './types';
import {createActionMessage} from './create_action_message';
import {TopicAdministrator} from './topic_administrator';
import {isKafkaJSProtocolError} from './type_guard';

export class ProducerPool {
    private producer: Producer;
    private topicAdministrator: TopicAdministrator;
    private isConnected: boolean = false;

    constructor(
        protected kafka: Kafka,
        protected producerConfig: Omit<
            ProducerConfig,
            'allowAutoTopicCreation' | 'maxInflightRequests' | 'idempotent'
        > = {},
        topicAdministrator?: TopicAdministrator
    ) {
        this.createProducer();

        this.connect = this.connect.bind(this);
        this.putAction = this.putAction.bind(this);
        this.disconnect = this.disconnect.bind(this);
        this.topicAdministrator = topicAdministrator || new TopicAdministrator(kafka);
    }

    // tslint:disable-next-line: cyclomatic-complexity
    public async putAction<Action extends IAction>(action: Action, retryCounter = 0) {
        if (!this.isConnected) {
            throw new Error('You must .connect before producing actions');
        }

        await this.topicAdministrator.createTopic(action.topic);

        const message = createActionMessage({action});

        try {
            await this.producer.send({
                acks: -1,
                compression: CompressionTypes.GZIP,
                topic: action.topic,
                messages: [message]
            });
        } catch (error) {
            /**
             * If for some reason this producer is no longer recognized by the broker,
             *
             */
            if (
                isKafkaJSProtocolError(error) &&
                error.type === 'UNKNOWN_PRODUCER_ID' &&
                retryCounter < 6
            ) {
                await this.disconnect();
                this.createProducer();
                await this.connect();
                await this.putAction(action, retryCounter + 1);
                return;
            }

            throw error;
        }
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
        this.isConnected = false;
    }

    private createProducer = () => {
        this.producer = this.kafka.producer({
            maxInFlightRequests: 1,
            idempotent: true,
            ...this.producerConfig
        });
    };
}
