import {IHeaders} from 'kafkajs';

export function parseHeaders(headers?: IHeaders): Record<keyof typeof headers, string> {
    if (!headers) {
        return {};
    }

    const keys: Array<keyof typeof headers> = Object.keys(headers);

    return keys.reduce((parsed, header) => {
        return {
            ...parsed,
            [header.toString()]: headers[header] ? headers[header].toString() : undefined
        };
    }, {} as Record<keyof typeof headers, string | undefined>);
}
