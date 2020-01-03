import {enums} from '@social-native/snpkg-snapi-authorization';
import {IHeaders, Message} from 'kafkajs';
import {IAction} from './types';

export function createActionMessage<Action extends IAction>({
    userId,
    roles,
    action,
    headers = {}
}: {
    action: Action;
    userId?: string | number;
    roles?: string[];
    headers?: IHeaders;
}): Message {
    const message = {
        value: JSON.stringify({
            transaction_id: action.transaction_id,
            payload: action.payload
        }),
        headers
    };

    if (userId && roles) {
        if (!message.headers) {
            message.headers = {};
        }

        message.headers[enums.WORKER_USER_IDENTITY_HEADER.WORKER_USER_ID] = Buffer.from(
            `${userId}`
        );
        message.headers[enums.WORKER_USER_IDENTITY_HEADER.WORKER_USER_ROLES] = Buffer.from(
            roles.join(',')
        );
    }

    return message;
}
