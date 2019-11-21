import {GqlClient} from '@social-native/snpkg-client-graphql-client';
import {Kafka} from 'kafkajs';
import effectBuilder from './effect_builder';
import {ConsumerMessageBus} from 'consumer_message_bus';
import {buildActionFromPayload} from 'build_action_from_payload';
import {ProducerMessageBus} from 'producer_message_bus';
import {createEffectRunner} from 'create_effect_runner';

const {
    GQL_ACCESS_TOKEN,
    GQL_URI,

    KAFKA_BROKERS = ''
} = process.env;

if (!GQL_ACCESS_TOKEN || !GQL_URI) {
    throw new Error('Got empty or undefined env.GQL_ACCESS_TOKEN or env.GQL_URI');
}

if (!KAFKA_BROKERS) {
    throw new Error('Missing or empty env.KAFKA_BROKERS');
}

export default async function({topic, saga}: {topic: string; saga: GeneratorFunction}) {
    const _gqlClient = new GqlClient({
        accessToken: GQL_ACCESS_TOKEN,
        uri: GQL_URI
    });

    const gqlClient = await _gqlClient.createClient();

    if (!gqlClient) {
        throw new Error('Failed to initialize apollo client');
    }

    const brokers = KAFKA_BROKERS.split(',');

    const kafka = new Kafka({
        clientId: `${topic}-${new Date().valueOf()}`,
        brokers
    });

    const rootConsumer = kafka.consumer({
        groupId: `${topic}-root-saga`,
        allowAutoTopicCreation: false
    });

    await rootConsumer.subscribe({
        topic,
        fromBeginning: true
    });

    const childConsumerMessageBus = new ConsumerMessageBus(kafka, topic);
    const producerMessageBus = new ProducerMessageBus(kafka);
    await producerMessageBus.connect();

    const effectRunner = createEffectRunner(childConsumerMessageBus, producerMessageBus);

    await rootConsumer.run({
        autoCommit: true,
        autoCommitThreshold: 1,
        async eachMessage({message}) {
            const initialAction = buildActionFromPayload(topic, message);

            return effectRunner.runEffects(
                initialAction,
                {
                    effects: effectBuilder(initialAction.transactionId),
                    gqlClient
                },
                saga
            );
        }
    });
}
