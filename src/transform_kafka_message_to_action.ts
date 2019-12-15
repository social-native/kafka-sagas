import {KafkaMessage, IHeaders} from 'kafkajs';
import {enums} from '@social-native/snpkg-snapi-authorization';

import {isTransactionMessage, isSnapiHeaders, isRolesList} from './type_guard';
import {IAction} from './types';
import {parseHeaders} from './parse_headers';

export function transformKafkaMessageToAction<Payload>(
    topic: string,
    message: KafkaMessage,
    headerParser: (h: IHeaders | undefined) => any = parseHeaders,
    valueParser: (val: string) => any = JSON.parse
): IAction<Payload> {
    const {headers, value} = message;

    const parsedHeaders: Record<string, string | undefined> = headerParser(headers);
    const parsedValue = valueParser(value.toString());

    if (!isTransactionMessage<Payload>(parsedValue)) {
        throw new Error('Received a misshapen payload');
    }

    const action: IAction<Payload> = {
        topic,
        transaction_id: parsedValue.transaction_id,
        payload: parsedValue.payload
    };

    if (isSnapiHeaders(parsedHeaders)) {
        action.userId = parsedHeaders[enums.WORKER_USER_IDENTITY_HEADER.WORKER_USER_ID];
        const rolesList = parsedHeaders[enums.WORKER_USER_IDENTITY_HEADER.WORKER_USER_ROLES].split(
            ','
        );

        if (!isRolesList(rolesList)) {
            throw new Error('Role in message headers not recognized');
        }

        action.userRoles = rolesList;
    }

    return action;
}
