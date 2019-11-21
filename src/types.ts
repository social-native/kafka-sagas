import effectBuilder from './effect_builder';
import ApolloClient from 'apollo-client';

export type PutEffect<Payload> = (
    pattern: string,
    payload?: Payload
) => IPutEffectDescription<Payload>;

export type TakeEffect = (pattern: TakePattern) => ITakeEffectDescription;

export type CallEffect<Fn extends (...args: any[]) => any> = (
    callable: (args: Parameters<Fn>) => ReturnType<Fn>,
    args: Parameters<Fn>
) => ICallEffectDescription<Parameters<Fn>, ReturnType<Fn>>;

export interface IActionBuffer<Action extends IAction> {
    isEmpty(): boolean;
    put(action: Action): void;
    take(): Action;
}
export type ActionChannel<Action extends IAction> = (
    pattern: string | Predicate<Action>,
    actionBuffer?: IActionBuffer<Action>
) => IActionChannelEffectDescription<Action, IActionBuffer<Action>>;

export type Predicate<Action extends IAction> = (action: Action) => boolean;

export type TakePattern<
    Action extends IAction = IAction,
    Buffer extends IActionBuffer<Action> = IActionBuffer<Action>
> = string | string[] | Predicate<Action> | IActionChannelEffectDescription<Action, Buffer>;

export type ActionChannelPattern<Action extends IAction> = string | string[] | Predicate<Action>;

export interface IPutEffectDescription<Payload extends {}> extends IEffectDescription {
    pattern: string;
    payload?: Payload;
    kind: 'PUT';
}

export interface ITakeEffectDescription extends IEffectDescription {
    patterns: TakePattern;
    kind: 'TAKE';
}

export interface ICallEffectDescription<Arguments extends any[], CallResponse>
    extends IEffectDescription {
    effect: (...args: Arguments) => CallResponse;
    args: Arguments;
}

export interface IActionChannelEffectDescription<
    Action extends IAction = IAction,
    Buffer extends IActionBuffer<Action> = IActionBuffer<Action>
> extends IEffectDescription {
    pattern: ActionChannelPattern<Action>;
    kind: 'ACTION_CHANNEL';
    buffer: Buffer;
}

export interface IEffectDescription {
    transactionId: string;
    kind: 'PUT' | 'CALL' | 'TAKE' | 'ACTION_CHANNEL';
}

export interface IBaseSagaContext {
    transactionId: string;
    effects: ReturnType<typeof effectBuilder>;
    gqlClient: ApolloClient<any>;
}

export type UnPromisify<T> = T extends Promise<infer U> ? U : T;

type InferActionPayload<T> = T extends Record<keyof T, infer P> ? Record<keyof T, P> : undefined;

export interface IAction<Payload = {}, InferedPayload = InferActionPayload<Payload>> {
    topic: string;
    transactionId: string;
    payload: InferedPayload;
}
