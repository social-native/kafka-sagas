import uuid from 'uuid';
import {PutEffect, TakeEffect, CallEffect} from 'types';
// import {createConsumer} from './initialize_worker';
// import {ConsumerMessageBus} from 'consumer_message_bus';

export default async function effectBuilder() {
    const transactionId = uuid.v4();

    const put = <Payload>(
        ...args: Parameters<PutEffect<Payload>>
    ): ReturnType<PutEffect<Payload>> => ({
        pattern: args[0],
        payload: args[1],
        transactionId,
        kind: 'PUT'
    });

    const take: TakeEffect = patterns => ({
        transactionId,
        patterns: Array.isArray(patterns) ? patterns : [patterns],
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

    // const actionChannel = async (pattern: Pattern) => {
    //     consumerMessageBus.addSubscription(pattern);
    //     await subscribe(pattern);

    //     return {
    //         topic: pattern,
    //         kind: 'ACTION_CHANNEL'
    //     };
    // };

    return {
        put,
        take,
        call
    };
}
