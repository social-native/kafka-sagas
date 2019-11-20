import {Producer, Kafka} from 'kafkajs';

export class ProducerMessageBus {
    private producer: Producer;
    private isConnected: boolean = false;

    constructor(kafka: Kafka) {
        this.producer = kafka.producer({
            allowAutoTopicCreation: false,
            maxInFlightRequests: 1,
            idempotent: true
        });
    }

    public async putPayloadToTopic<Payload extends {}>(topic: string, payload: Payload) {
        if (!this.isConnected) {
            throw new Error('You must .connect before producing actions');
        }

        const transaction = await this.producer.transaction();

        try {
            await transaction.send({
                topic,
                messages: [{value: JSON.stringify(payload)}],
                acks: -1
            });

            await transaction.commit();
        } catch (error) {
            // log error
            await transaction.abort();
        }
    }

    public async connect() {
        if (this.isConnected) {
            return;
        }

        await this.producer.connect();
        this.isConnected = true;

        process.on('beforeExit', async () => {
            await this.producer.disconnect();
        });
    }
}
