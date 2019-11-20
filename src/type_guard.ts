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
    IPredicateRecord
} from './types';

export function isTransactionAction<Payload>(messageValue: IAction | any): messageValue is IAction<Payload> {
    return messageValue && messageValue.transaction_id;
}

export function isTakeEffectDescription(
    effectDescription: IEffectDescription
): effectDescription is ITakeEffectDescription {
    return effectDescription.kind === 'TAKE';
}

export function isPutEffectDescription(
    effectDescription: IEffectDescription
): effectDescription is IPutEffectDescription<any> {
    return effectDescription.kind === 'PUT';
}

export function isCallEffectDescription(
    effectDescription: IEffectDescription
): effectDescription is ICallEffectDescription<any[], any> {
    return effectDescription.kind === 'CALL';
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
    return effectDescription.kind === 'ACTION_CHANNEL';
}

export function isTakeActionChannelEffectDescription(
    effectDescription: IEffectDescription
): effectDescription is IActionChannelEffectDescription<any> {
    return effectDescription.kind === 'TAKE_ACTION_CHANNEL';
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
    return (effectDescription as IActionChannelEffectDescription).kind === 'ACTION_CHANNEL';
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
        (input as IActionChannelEffectDescription<Action>).kind === 'ACTION_CHANNEL'
    );
}
