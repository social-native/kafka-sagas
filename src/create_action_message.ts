import {IHeaders, Message} from 'kafkajs';
import {IAction} from './types';

export function createActionMessage<Action extends IAction>({
    action
}: {
    action: Action;
    headers?: IHeaders;
}): Message {
    const message = {
        value: JSON.stringify({
            transaction_id: action.transaction_id,
            payload: action.payload
        }),
        headers: action.headers
    };

    return message;
}
