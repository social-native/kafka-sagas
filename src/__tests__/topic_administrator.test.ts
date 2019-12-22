import {TopicAdministrator} from '../topic_administrator';
import {withTopicCleanup} from './kafka_utils';
import {kafka} from './test_clients';

describe(TopicAdministrator.name, function() {
    it('creates a topic with the provided configuration', async function() {
        await withTopicCleanup(['topic-administrator-create-test'])(async ([topic]) => {
            const admin = new TopicAdministrator(kafka, {
                replicationFactor: 1
            });

            await admin.createTopic(topic);
            const adminClient = kafka.admin();
            await adminClient.connect();
            const topicMetadatas = await adminClient.fetchTopicMetadata({
                topics: [topic]
            });
            await adminClient.disconnect();
            const topicMetadata = topicMetadatas.topics.find(({name}) => name === topic);

            if (!topicMetadata) {
                throw new Error('Failed to create topic');
            }

            expect(topicMetadata.partitions[0].replicas).toHaveLength(1);
        });
    });

    it.skip('deletes topics', async function() {
        await withTopicCleanup(['topic-administrator-delete-test'])(async ([topic]) => {
            const admin = new TopicAdministrator(
                kafka,
                {
                    replicationFactor: 1
                },
                {
                    retry: {
                        maxRetryTime: 600
                    }
                }
            );

            await admin.createTopic(topic);
            const adminClient = kafka.admin();
            await adminClient.connect();
            await admin.deleteTopic(topic);

            const allTopicMetadatas = await adminClient.fetchTopicMetadata({
                topics: []
            });
            await adminClient.disconnect();
            expect(allTopicMetadatas.topics.find(({name}) => name === topic)).toBeUndefined();
        });
    });
});
