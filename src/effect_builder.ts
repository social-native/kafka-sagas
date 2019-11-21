import {
    PutEffect,
    TakeEffect,
    CallEffect,
    ActionChannel,
    IAction,
    IActionBuffer,
    TakePattern
} from 'types';

export default function effectBuilder(transactionId: string) {
    const put = <Payload>(
        ...args: Parameters<PutEffect<Payload>>
    ): ReturnType<PutEffect<Payload>> => ({
        pattern: args[0],
        payload: args[1],
        transactionId,
        kind: 'PUT'
    });

    const take: TakeEffect = <Patterns = TakePattern>(patterns: Patterns) => ({
        transactionId,
        patterns,
        kind: 'TAKE'
    });

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
        const defaultActionBuffer: IActionBuffer<Action> = {
            isEmpty: () => true,
            put: action => action,
            take: () => ({transactionId, topic: 'stddfn'} as Action)
        };

        const buffer = actionBuffer || defaultActionBuffer;

        return {
            transactionId,
            pattern,
            buffer,
            kind: 'ACTION_CHANNEL'
        };
    };

    return {
        put,
        take,
        call,
        actionChannel
    };
}
