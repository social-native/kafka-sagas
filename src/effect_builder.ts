import Bluebird from 'bluebird';
import {racePromiseRecord as racePromise} from './promise_race_object';

import {
    PutEffect,
    TakeEffect,
    CallEffect,
    IAction,
    IActionBuffer,
    AllCombinatorEffect,
    RaceCombinatorEffect,
    ActionChannelEffect,
    ActionPattern
} from './types';
import {isFunction} from './utils';
import {ActionBuffer, EphemeralBuffer} from './buffers';
import {generateTopicForSpecificTransaction} from './kafka_topics';
import {
    isTakePatternActuallyActionChannelEffectDescription,
    takeInputIsActionPattern
} from './type_guard';

function generateTopics<Action extends IAction>(
    pattern: ActionPattern<Action>,
    transactionId: string
): string[] {
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

function generateTopicStreamObserver<Action extends IAction, Buffest extends IActionBuffer<Action>>(
    pattern: ActionPattern<Action>,
    buffer: Buffest
) {
    return (action: Action) => {
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
            topic: generateTopicForSpecificTransaction(transactionId, pattern),
            payload: args[1],
            transactionId,
            kind: 'PUT'
        };
    };

    const take = <Action extends IAction>(patterns: Parameters<TakeEffect<Action>>[0]) => {
        if (isTakePatternActuallyActionChannelEffectDescription(patterns)) {
            return {...patterns, kind: 'TAKE_ACTION_CHANNEL'};
        }

        const buffer = new EphemeralBuffer();

        if (!takeInputIsActionPattern(patterns)) {
            throw new Error('Extremely unexpected error: patterns includes action channel');
        }

        return {
            transactionId,
            patterns,
            kind: 'TAKE',
            buffer,
            topics: generateTopics(patterns, transactionId),
            observer: generateTopicStreamObserver(patterns, buffer)
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
        pattern: Parameters<ActionChannelEffect<Action>>[0],
        actionBuffer?: Parameters<ActionChannelEffect<Action>>[1]
    ): ReturnType<ActionChannelEffect<Action>> => {
        const defaultActionBuffer: IActionBuffer<Action> = new ActionBuffer();
        const buffer = actionBuffer || defaultActionBuffer;

        return {
            transactionId,
            pattern,
            buffer,
            kind: 'ACTION_CHANNEL',
            topics: generateTopics(pattern, transactionId),
            observer: generateTopicStreamObserver(pattern, buffer)
        };
    };

    const all = <Action extends IAction>(
        effects: Parameters<AllCombinatorEffect<Action>>[0]
    ): ReturnType<AllCombinatorEffect<Action>> => {
        return {
            transactionId,
            kind: 'COMBINATOR',
            combinator: Bluebird.all,
            effects
        };
    };

    const race = <Action extends IAction>(
        effects: Parameters<RaceCombinatorEffect<Action>>[0]
    ): ReturnType<RaceCombinatorEffect<Action>> => {
        return {
            transactionId,
            kind: 'COMBINATOR',
            combinator: racePromise,
            effects
        };
    };

    return {
        put,
        take,
        call,
        actionChannel,
        all,
        race
    };
}
