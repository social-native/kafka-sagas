import effectBuilder from './effect_builder';
import ApolloClient from 'apollo-client';
import {ActionBuffer} from 'buffers';

/**
 * Aliases
 */

export type ActionChannel = IActionChannelEffectDescription;

/**
 * RunSaga
 */

export type RunSaga<Result = any, SpecificError extends Error = Error> = (
    options: IRunSagaOptions,
    saga: Saga,
    ...args: any[]
) => ITask<Result, SpecificError>;

// TODO fill me in - requires a lot more implementation
export interface IRunSagaOptions {}

/**
 * Effects
 */
export type PutEffect<Payload> = (
    pattern: string,
    payload?: Payload
) => IPutEffectDescription<Payload>;

export type TakeEffect<Action extends IAction> = (
    pattern: TakePattern
) => ITakeEffectDescription<Action>;

export interface ITask<Result = any, SpecificError extends Error = Error> {
    isRunning(): boolean;
    isCancelled(): boolean;
    result(): Result | undefined;
    error(): SpecificError | undefined;
    toPromise(): Promise<Result | SpecificError>;
    cancel(): void;
}

type InferForkActionParam<T> = T extends Record<keyof T, infer P> ? Record<keyof T, P> : undefined;

export type Fork<
    Action = {},
    SpecificError extends Error = Error,
    InferedAction = InferForkActionParam<Action>
> = (saga: Saga, action?: InferedAction) => ITask<Action, SpecificError>;

export type CallEffect<Fn extends (...args: any[]) => any> = (
    callable: (args: Parameters<Fn>) => ReturnType<Fn>,
    args: Parameters<Fn>
) => ICallEffectDescription<Parameters<Fn>, ReturnType<Fn>>;

export type ActionChannelEffect<Action extends IAction> = (
    pattern: ActionPattern<Action>,
    actionBuffer?: IActionBuffer<Action>
) => IActionChannelEffectDescription<Action, IActionBuffer<Action>>;

export type RaceCombinatorEffect<Action extends IAction> = (
    effects: ICombinatatorEffectDescription<Action>['effects']
) => ICombinatatorEffectDescription<Action>;

export type AllCombinatorEffect<Action extends IAction> = (
    effects: ICombinatatorEffectDescription<Action>['effects']
) => ICombinatatorEffectDescription<Action>;

// Effect Components

export type Predicate<Action extends IAction> = (action: Action) => boolean;

export type ActionPattern<Action extends IAction> = string | string[] | Predicate<Action>;

export type TakePattern<
    Action extends IAction = IAction,
    Buffer extends IActionBuffer<Action> = IActionBuffer<Action>
> = ActionPattern<Action> | IActionChannelEffectDescription<Action, Buffer>;

/**
 * Buffers
 */

export interface IActionBuffer<Action extends IAction> {
    isEmpty(): boolean;
    put(action: Action): void;
    take(): Action | Promise<Action>;
}

/**
 * Effect Descriptions
 */
export interface IPutEffectDescription<Payload extends {}> extends IEffectDescription {
    pattern: string;
    payload?: Payload;
    kind: 'PUT';
    topic: string;
}

export interface ITakeEffectDescription<Action extends IAction = IAction>
    extends IEffectDescription {
    patterns: TakePattern;
    kind: 'TAKE';
    topics: string[];
    buffer: ActionBuffer<Action>;
    observer: ActionObserver<Action>;
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
    pattern: ActionPattern<Action>;
    kind: 'ACTION_CHANNEL';
    buffer: Buffer;
    topics: string[];
    observer: ActionObserver<Action>;
}

export type ArrayCombinator<Action extends IAction> = (
    combined: Array<Promise<Action>>
) => Promise<Action[]>;

export type RecordCombinator<Action extends IAction> = (
    combined: Record<string, Promise<Action>>
) => Promise<Record<string, Action>>;

export interface ICombinatatorEffectDescription<Action extends IAction> extends IEffectDescription {
    effects: IEffectDescription[] | Record<string, IEffectDescription>;
    combinator: ArrayCombinator<Action> | RecordCombinator<Action>;
    kind: 'COMBINATOR';
}

export interface IEffectDescription {
    transactionId: string;
    kind: 'PUT' | 'CALL' | 'TAKE' | 'ACTION_CHANNEL' | 'TAKE_ACTION_CHANNEL' | 'COMBINATOR';
}

/**
 * Saga
 */
export type Saga = GeneratorFunction;

export interface IBaseSagaContext {
    transactionId: string;
    effects: ReturnType<typeof effectBuilder>;
    gqlClient: ApolloClient<any>;
}

/**
 * Utilities
 */

export type UnPromisify<T> = T extends Promise<infer U> ? U : T;

export type PromiseResolver<ResolvedValue> = (
    value?: ResolvedValue | PromiseLike<ResolvedValue> | undefined
) => void;

export type ActionObserver<Action extends IAction> = (action: Action) => void;

/**
 * Actions
 */
type InferActionPayload<T> = T extends Record<keyof T, infer P> ? Record<keyof T, P> : undefined;

export interface IAction<Payload = {}, InferedPayload = InferActionPayload<Payload>> {
    topic: string;
    transactionId: string;
    payload: InferedPayload;
}
