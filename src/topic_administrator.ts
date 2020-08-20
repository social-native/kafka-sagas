import {Kafka, ITopicConfig, AdminConfig} from 'kafkajs';

export class TopicAdministrator {
    public static adminClientConfiguration: AdminConfig = {
        retry: {
            retries: 1,
            initialRetryTime: 300,
            maxRetryTime: 500
        }
    };

    constructor(
        protected kafka: Kafka,
        protected topicConfig: Omit<ITopicConfig, 'topic'> = {},
        protected adminConfig: AdminConfig = TopicAdministrator.adminClientConfiguration
    ) {
        this.createTopic = this.createTopic.bind(this);
        this.deleteTopic = this.deleteTopic.bind(this);
    }

    public async createTopic(topic: string) {
        const adminClient = this.kafka.admin(this.adminConfig);
        await adminClient.connect();
        await adminClient.createTopics({
            topics: [
                {
                    topic,
                    ...this.topicConfig
                }
            ],
            waitForLeaders: true
        });
        await adminClient.disconnect();
    }

    public async deleteTopic(topic: string) {
        const adminClient = this.kafka.admin(this.adminConfig);
        await adminClient.connect();
        await adminClient.deleteTopics({
            topics: [topic]
        });
        await adminClient.disconnect();
    }
}
