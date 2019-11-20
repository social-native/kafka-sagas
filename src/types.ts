import effectBuilder from './effect_builder';
import ApolloClient from 'apollo-client';

export type PutEffect<Payload> = (pattern: Pattern, payload?: Payload) => IPutCause<Payload>;

export type TakeEffect = (patterns: Pattern | Pattern[]) => ITakeCause;

export type CallEffect<Fn extends (...args: any[]) => any> = (
    callable: (args: Parameters<Fn>) => ReturnType<Fn>,
    args: Parameters<Fn>
) => ICallCause<Parameters<Fn>, ReturnType<Fn>>;

export type Pattern = string;

export interface IPutCause<Payload extends {}> extends ICause {
    pattern: Pattern;
    payload?: Payload;
    kind: 'PUT';
}

export interface ITakeCause extends ICause {
    patterns: Pattern[];
    kind: 'TAKE';
}

export interface ICallCause<Arguments extends any[], CallResponse> extends ICause {
    effect: (...args: Arguments) => CallResponse;
    args: Arguments;
}

export interface ICause {
    transactionId: string;
    kind: 'PUT' | 'CALL' | 'TAKE';
}

export interface IBaseSagaContext {
    effects: ReturnType<typeof effectBuilder>;
    gqlClient: ApolloClient<any>;
}

export type UnPromisify<T> = T extends Promise<infer U> ? U : T;

export interface IAction<Payload extends {} = {}> {
    topic: string;
    transactionId: string;
    payload?: Payload;
}
