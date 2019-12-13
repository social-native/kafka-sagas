import {enums} from '@social-native/snpkg-snapi-authorization';
import {IHeaders, Message} from 'kafkajs';
import {IAction} from 'types';

type Role = keyof typeof enums.ROLES;

export function createActionMessage<Action extends IAction>({
    userId,
    roles,
    action,
    headers = {}
}: {
    userId: string | number;
    roles: [Role] & Role[];
    action: Action;
    headers?: IHeaders;
}): Message {
    return {
        value: JSON.stringify({
            transaction_id: action.transaction_id,
            payload: action.payload
        }),
        headers: {
            ...headers,
            [enums.WORKER_USER_IDENTITY_HEADER.WORKER_USER_ID]: Buffer.from(`${userId}`),
            [enums.WORKER_USER_IDENTITY_HEADER.WORKER_USER_ROLES]: Buffer.from(roles.join(','))
        }
    };
}
