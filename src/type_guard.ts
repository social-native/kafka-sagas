import {
    IAction,
    IEffectDescription,
    ITakeEffectDescription,
    IPutEffectDescription,
    ICallEffectDescription,
    IActionChannelEffectDescription,
    TakePattern,
    ActionChannelInput,
    ICombinatatorEffectDescription,
    IPredicateRecord,
    IDelayEffectDescription,
    ICompensationEffectDescription,
    IKafkaJSProtocolError,
    ICompensationPlan,
    ImmediateCompensationPlan,
    KafkaSagaCompensationPlan
} from './types';
import {EffectDescriptionKind} from './enums';
import {CompensationPlanKind} from '.';

export function isTransactionMessage<Payload>(
    messageValue: IAction | any
): messageValue is Omit<IAction<Payload>, 'topic'> {
    return messageValue && messageValue.transaction_id;
}

export function isTakeEffectDescription(
    effectDescription: IEffectDescription
): effectDescription is ITakeEffectDescription {
    return effectDescription.kind === EffectDescriptionKind.TAKE;
}

export function isPutEffectDescription<Payload = any>(
    effectDescription: IEffectDescription
): effectDescription is IPutEffectDescription<Payload> {
    return effectDescription.kind === EffectDescriptionKind.PUT;
}

export function isCompensationEffectDescription<Payload = any>(
    effectDescription: IEffectDescription
): effectDescription is ICompensationEffectDescription<Payload> {
    return effectDescription.kind === EffectDescriptionKind.ADD_COMPENSATION;
}

export function isCallEffectDescription(
    effectDescription: IEffectDescription
): effectDescription is ICallEffectDescription<any[], any> {
    return effectDescription.kind === EffectDescriptionKind.CALL;
}

export function isEffectCombinatorDescription<Action extends IAction>(
    effectDescription: IEffectDescription
): effectDescription is ICombinatatorEffectDescription<Action> {
    return !!(
        (effectDescription as ICombinatatorEffectDescription<Action>).combinator &&
        (effectDescription as ICombinatatorEffectDescription<Action>).effects
    );
}

export function isActionChannelEffectDescription(
    effectDescription: IEffectDescription
): effectDescription is IActionChannelEffectDescription<any> {
    return effectDescription.kind === EffectDescriptionKind.ACTION_CHANNEL;
}

export function isTakeActionChannelEffectDescription(
    effectDescription: IEffectDescription
): effectDescription is IActionChannelEffectDescription<any> {
    return effectDescription.kind === EffectDescriptionKind.TAKE_ACTION_CHANNEL;
}

export function isDelayEffectDescription<Payload>(
    effectDescription: IEffectDescription
): effectDescription is IDelayEffectDescription<Payload> {
    return effectDescription.kind === EffectDescriptionKind.DELAY;
}

export function actionPatternIsPredicateRecord<Action extends IAction>(
    pattern: TakePattern<Action> | ActionChannelInput<Action>
): pattern is IPredicateRecord<Action> {
    return !!(
        typeof pattern !== 'string' &&
        !Array.isArray(pattern) &&
        (pattern as IPredicateRecord<Action>).pattern &&
        (pattern as IPredicateRecord<Action>).predicate
    );
}

export function isTakePatternActuallyActionChannelEffectDescription(
    effectDescription: TakePattern | IActionChannelEffectDescription
): effectDescription is IActionChannelEffectDescription<any> {
    return (
        (effectDescription as IActionChannelEffectDescription).kind ===
        EffectDescriptionKind.ACTION_CHANNEL
    );
}

export function takeInputIsActionPattern<Action extends IAction>(
    takeInput: TakePattern<Action> | ActionChannelInput<Action>
): takeInput is ActionChannelInput<Action> {
    return (
        typeof takeInput === 'string' ||
        Array.isArray(takeInput) ||
        actionPatternIsPredicateRecord(takeInput.pattern)
    );
}

export function takeInputIsActionChannelEffectDescription<Action extends IAction>(
    input: TakePattern<Action> | IActionChannelEffectDescription<Action>
): input is IActionChannelEffectDescription<Action> {
    return (
        typeof input !== 'string' &&
        !Array.isArray(input) &&
        (input as IActionChannelEffectDescription<Action>).kind ===
            EffectDescriptionKind.ACTION_CHANNEL
    );
}

export function isGenerator(possibleGenerator: any): possibleGenerator is Generator {
    return (
        !!possibleGenerator &&
        !!(possibleGenerator as Generator).next &&
        !!(possibleGenerator as Generator).throw &&
        !!(possibleGenerator as Generator).return
    );
}

export function isKafkaJSProtocolError(error: unknown): error is IKafkaJSProtocolError {
    return error && typeof error === 'object' && (error as any).name === 'KafkaJSProtocolError';
}

export function isImmediateCompensationPlan<Payload = unknown>(
    plan: ICompensationPlan<Payload>
): plan is ImmediateCompensationPlan<Payload> {
    return plan.kind === CompensationPlanKind.IMMEDIATE;
}

export function isKafkaSagaCompensationPlan<Payload = unknown>(
    plan: ICompensationPlan<Payload>
): plan is KafkaSagaCompensationPlan<Payload> {
    return plan.kind === CompensationPlanKind.KAFKA_SAGA;
}
