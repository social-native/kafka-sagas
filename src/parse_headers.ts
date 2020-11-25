import {IHeaders} from 'kafkajs';

export function parseHeaders(headers?: IHeaders): Record<keyof typeof headers, string | undefined> {
    if (!headers) {
        return {};
    }

    const keys: Array<keyof typeof headers> = Object.keys(headers);

    return keys.reduce((parsed, key) => {
        const header = headers[key];

        return {
            ...parsed,
            [key.toString()]: header ? header.toString() : undefined
        };
    }, {} as Record<keyof typeof headers, string | undefined>);
}
