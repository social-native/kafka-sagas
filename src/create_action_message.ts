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
            payload: {
                hello: 'friend'
            }
        }),
        headers: {
            ...headers,
            user_id: Buffer.from(`${userId}`),
            roles: Buffer.from(JSON.stringify(roles))
        }
    };
}
