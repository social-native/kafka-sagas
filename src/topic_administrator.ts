import {Kafka, ITopicConfig} from 'kafkajs';

export class TopicAdministrator {
    constructor(protected kafka: Kafka, protected config: Omit<ITopicConfig, 'topic'>) {
        this.createTopic = this.createTopic.bind(this);
        this.deleteTopic = this.deleteTopic.bind(this);
    }

    public async createTopic(topic: string) {
        const adminClient = this.kafka.admin();
        await adminClient.connect();
        await adminClient.createTopics({
            topics: [
                {
                    topic,
                    ...this.config
                }
            ],
            waitForLeaders: true
        });
        await adminClient.disconnect();
    }

    public async deleteTopic(topic: string) {
        const adminClient = this.kafka.admin();
        await adminClient.connect();
        await adminClient.deleteTopics({
            topics: [topic]
        });
        await adminClient.disconnect();
    }
}
