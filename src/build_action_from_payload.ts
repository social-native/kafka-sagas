import {KafkaMessage} from 'kafkajs';
import {isTransactionAction} from './type_guard';
import uuid from 'uuid';
import {IAction} from './types';

export function buildActionFromPayload<Payload>(topic: string, message: KafkaMessage): IAction<Payload> {
    const extracted = JSON.parse(message.value.toString());

    if (!isTransactionAction<Payload>(extracted)) {
        const transactionId = uuid.v4();

        return {topic, ...extracted, transaction_id: transactionId};
    }

    return {topic, ...extracted};
}
