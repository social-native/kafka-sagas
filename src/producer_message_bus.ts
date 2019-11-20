import {Producer, Kafka, CompressionTypes, ProducerConfig} from 'kafkajs';
import {IAction} from './types';

export class ProducerMessageBus {
    private producer: Producer;
    private isConnected: boolean = false;

    constructor(
        kafka: Kafka,
        producerConfig: Omit<
            ProducerConfig,
            'allowAutoTopicCreation' | 'maxInflightRequests' | 'idempotent'
        > = {}
    ) {
        this.producer = kafka.producer({
            allowAutoTopicCreation: true,
            maxInFlightRequests: 1,
            idempotent: true,
            ...producerConfig
        });
    }

    public async putAction<Action extends IAction>(action: Action) {
        if (!this.isConnected) {
            throw new Error('You must .connect before producing actions');
        }

        await this.producer.send({
            acks: -1,
            compression: CompressionTypes.GZIP,
            topic: action.topic,
            messages: [
                {
                    value: JSON.stringify({
                        transaction_id: action.transaction_id,
                        payload: action.payload
                    })
                }
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
}
