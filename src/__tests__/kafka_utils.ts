import {kafka} from './test_clients';
import {KafkaMessage, IHeaders} from 'kafkajs';
import {IAction} from '../types';
import {enums} from '@social-native/snpkg-snapi-authorization';

export async function createTopic(topic: string) {
    const admin = kafka.admin();
    await admin.createTopics({
        topics: [{topic}],
        waitForLeaders: true
    });

    await admin.disconnect();
}

export async function seedTopic(topic: string, seedMessages: any[] = sampleMessages) {
    const producer = kafka.producer();
    await producer.connect();
    await producer.send({
        topic,
        messages: seedMessages.map(value => ({value: JSON.stringify(value)}))
    });

    await producer.disconnect();
}

export async function deleteTopic(topic: string) {
    const admin = kafka.admin();
    await admin.deleteTopics({topics: [topic]});
    await admin.disconnect();
}

export function withTopicCleanup(topics: string[], seeding: boolean = true) {
    // tslint:disable-next-line: cyclomatic-complexity
    return async function(testBody: (t: string[]) => Promise<void>) {
        if (seeding) {
            for (const topic of topics) {
                await seedTopic(topic);
            }
        }

        let err: Error | null = null;

        try {
            await testBody(topics);
        } catch (error) {
            err = error;
            // tslint:disable-next-line: no-console
            console.log(error);
        }

        for (const topic of topics) {
            await deleteTopic(topic);
        }

        if (err) {
            throw err;
        }
    };
}

export function createKafkaMessageFromAction<Payload>(action: IAction<Payload>): KafkaMessage {
    const headers: IHeaders = {};

    return {
        headers,
        key: Buffer.from(''),
        value: Buffer.from(JSON.stringify(action)),
        timestamp: new Date().valueOf().toString(),
        size: 12345,
        attributes: 11,
        offset: '0'
    };
}

export const sampleMessages = [
    {
        transaction_id: 'transaction-id-1',
        payload: {
            bart: 'was_suspended'
        }
    },
    {
        transaction_id: 'transaction-id-1',
        payload: {
            bart: 'was_expelled'
        }
    },
    {
        transaction_id: 'transaction-id-1',
        payload: {
            lisa: 'needs_braces'
        }
    },
    {
        transaction_id: 'transaction-id-1',
        payload: {
            homer: 'is_alcoholic'
        }
    },
    {
        transaction_id: 'transaction-id-1',
        payload: {
            marge: 'needs_a_vacation'
        }
    }
];
