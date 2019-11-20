import {KafkaMessage} from 'kafkajs';
import {isTransactionAction} from 'type_guard';
import uuid from 'uuid';

export function buildActionFromPayload(topic: string, message: KafkaMessage) {
    const extracted = JSON.parse(message.value.toString());

    if (!isTransactionAction(extracted)) {
        const transactionId = uuid.v4();

        return {topic, ...extracted, transactionId};
    }

    return {topic, ...extracted};
}
