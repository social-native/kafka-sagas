import {GqlClient} from '@social-native/snpkg-client-graphql-client';
import {Kafka} from 'kafkajs';
import createEffectBuilder from './effect_builder';
import {ConsumerMessageBus} from 'consumer_message_bus';

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

export default async function({topic, saga}: {topic: string, saga: GeneratorFunction}) {
    const gqlClient = new GqlClient({
        accessToken: GQL_ACCESS_TOKEN,
        uri: GQL_URI
    });

    await gqlClient.createClient();

    if (!gqlClient.client) {
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

    await rootConsumer.run({
        autoCommit: true,
        autoCommitThreshold: 1,
        async eachMessage({topic, message}) {
            const context = {
                effects: createEffectBuilder(childConsumerMessageBus),
                gqlClient: gqlClient.client
            };
        }
    });

    for (const cause of saga()) {
        // we may have started this work before so rehydrate
        const deserializedCause = sagaStore.findOrStore(cause);

        if (deserializedCause) {
            return await createEffect(deserializedCause);
        } else {
            if (cause.kind === 'TAKE_EVERY') {
                await createEffect(deserializedCause);
                break;
            }

            return await createEffect(cause);
        }

    }
}
