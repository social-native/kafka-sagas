import {Kafka, Consumer} from 'kafkajs';
import uuid from 'uuid';
import EventEmitter from 'events';

export class TopicEventEmitter {
    public emitter: EventEmitter = new EventEmitter();
    private consumer: Consumer;

    constructor(kafka: Kafka, private topics: string[] = []) {
        this.consumer = kafka.consumer({
            allowAutoTopicCreation: false,
            groupId: uuid.v4()
        });
    }

    public async start() {
        if (!this.topics) {
            return;
        }

        await this.consumer.connect();

        for (const topic of this.topics) {
            await this.consumer.subscribe({topic});
        }

        await this.consumer.run({
            eachMessage: async ({message}) => {
                this.emitter.emit(message.value.toString());
            }
        });
    }

    public pause() {
        return this.consumer.pause(this.topicsPartitions);
    }

    public resume() {
        return this.consumer.resume(this.topicsPartitions);
    }

    public stop() {
        return this.consumer.stop();
    }

    public disconnect() {
        return this.consumer.disconnect();
    }

    private get topicsPartitions() {
        return this.topics.map(topic => ({topic}));
    }
}
