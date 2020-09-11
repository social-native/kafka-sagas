import {Message} from 'kafkajs';
import {IAction} from './types';

export function createActionMessage<Action extends IAction>({action}: {action: Action}): Message {
    return {
        key: action.transaction_id,
        value: JSON.stringify({
            transaction_id: action.transaction_id,
            payload: action.payload
        }),
        headers: action.headers
    };
}
