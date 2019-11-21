import {
    PutEffect,
    TakeEffect,
    CallEffect,
    ActionChannel,
    IAction,
    IActionBuffer,
    TakePattern
} from './types';
import {isFunction} from './utils';
import {ActionBuffer, EphemeralBuffer} from './buffers';
import { generateTopicForSpecificTransaction } from './kafka_topics';

function generateTopics(pattern: TakePattern, transactionId: string): string[] {
    if (Array.isArray(pattern)) {
        return pattern;
    }

    if (isFunction(pattern)) {
        const anyTopicInTransaction = generateTopicForSpecificTransaction(transactionId, '*');
        return [anyTopicInTransaction];
    }

    if (typeof pattern === 'string') {
        return [pattern];
    }

    throw new Error('Cannot handle patterns of type ' + typeof pattern);
}

function generateTopicStreamObserver(pattern, buffer) {
    observer: (action: Action) => {
        if (isFunction(pattern)) {
            if (pattern(action)) {
                buffer.put(action);
            }
        } else {
            buffer.put(action);
        }
    };
}

export default function effectBuilder(transactionId: string) {
    const put = <Payload>(
        ...args: Parameters<PutEffect<Payload>>
    ): ReturnType<PutEffect<Payload>> => {
        const pattern = args[0];

        return {
            pattern,
            payload: args[1],
            transactionId,
            kind: 'PUT'
        };
    };

    const take: TakeEffect = <Patterns = TakePattern>(patterns: Patterns) => {
        if (isActionChannelDescription(patterns)) {
            return {patterns, kind: 'TAKE_ACTION_CHANNEL'};
        }

        const buffer = new EphemeralBuffer();

        return {
            transactionId,
            patterns,
            kind: 'TAKE',
            buffer,
            topics: generateTopics(pattern),
            observer: () => generateTopicStreamObserver(pattern, buffer)
        };
    };

    const call = <Fn extends (...args: any[]) => any>(
        effect: Fn,
        args: Parameters<Fn>
    ): ReturnType<CallEffect<Fn>> => ({
        transactionId,
        kind: 'CALL',
        effect,
        args
    });

    const actionChannel = <Action extends IAction>(
        pattern: Parameters<ActionChannel<Action>>[0],
        actionBuffer?: Parameters<ActionChannel<Action>>[1]
    ): ReturnType<ActionChannel<Action>> => {
        const defaultActionBuffer: IActionBuffer<Action> = new ActionBuffer();
        const buffer = actionBuffer || defaultActionBuffer;

        return {
            transactionId,
            pattern,
            buffer,
            kind: 'ACTION_CHANNEL',
            topics: generateTopics(pattern),
            observer: () => generateTopicStreamObserver(pattern, buffer)
        };
    };

    return {
        put,
        take,
        call,
        actionChannel
    };
}
