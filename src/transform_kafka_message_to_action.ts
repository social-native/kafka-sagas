import {KafkaMessage, IHeaders} from 'kafkajs';
import {isTransactionMessage} from './type_guard';
import {IAction} from './types';
import {parseHeaders} from './parse_headers';

export function transformKafkaMessageToAction<Payload>(
    topic: string,
    message: KafkaMessage,
    headerParser: (h: IHeaders | undefined) => Record<string, string> = parseHeaders,
    valueParser: (val: string) => any = JSON.parse
): IAction<Payload> {
    const {headers, value} = message;

    const parsedValue = value ? valueParser(value.toString()) : value;

    if (!isTransactionMessage<Payload>(parsedValue)) {
        throw new Error('Received a misshapen payload');
    }

    const action: IAction<Payload> = {
        topic,
        transaction_id: parsedValue.transaction_id,
        payload: parsedValue.payload,
        headers: headerParser(headers)
    };

    return action;
}
