import effectBuilder from './effect_builder';
import ApolloClient from 'apollo-client';

export type PutEffect<Payload> = (
    pattern: Pattern,
    payload?: Payload
) => IPutEffectDescription<Payload>;

export type TakeEffect = (patterns: Pattern | Pattern[]) => ITakeEffectDescription;

export type CallEffect<Fn extends (...args: any[]) => any> = (
    callable: (args: Parameters<Fn>) => ReturnType<Fn>,
    args: Parameters<Fn>
) => ICallEffectDescription<Parameters<Fn>, ReturnType<Fn>>;

export type Pattern = string;

export interface IPutEffectDescription<Payload extends {}> extends IEffectDescription {
    pattern: Pattern;
    payload?: Payload;
    kind: 'PUT';
}

export interface ITakeEffectDescription extends IEffectDescription {
    patterns: Pattern[];
    kind: 'TAKE';
}

export interface ICallEffectDescription<Arguments extends any[], CallResponse>
    extends IEffectDescription {
    effect: (...args: Arguments) => CallResponse;
    args: Arguments;
}

export interface IEffectDescription {
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
