import uuid from 'uuid';
import {Kafka} from 'kafkajs';

const {KAFKA_BROKERS} = process.env;

if (!KAFKA_BROKERS) {
    throw new Error('Missing KAFKA_BROKERS in .env.test');
}

export const kafka = new Kafka({
    clientId: `bg-worker-test-${uuid.v4()}`,
    brokers: KAFKA_BROKERS.split(',')
});
