import {
    IAction,
    IEffectDescription,
    ITakeEffectDescription,
    IPutEffectDescription,
    ICallEffectDescription,
    IActionChannelEffectDescription,
    TakePattern,
    ActionPattern,
    ICombinatatorEffectDescription
} from './types';
import {isFunction} from 'utils';

export function isTransactionAction(messageValue: IAction | any): messageValue is IAction {
    return messageValue && messageValue.transactionId;
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
): effectDescription is IActionChannelEffectDescription<any, any> {
    return effectDescription.kind === 'ACTION_CHANNEL';
}

export function isTakeActionChannelEffectDescription(
    effectDescription: IEffectDescription
): effectDescription is IActionChannelEffectDescription<any, any> {
    return effectDescription.kind === 'TAKE_ACTION_CHANNEL';
}

export function isTakePatternActuallyActionChannelEffectDescription(
    effectDescription: TakePattern | IActionChannelEffectDescription
): effectDescription is IActionChannelEffectDescription<any, any> {
    return (effectDescription as IActionChannelEffectDescription).kind === 'ACTION_CHANNEL';
}

export function takeInputIsActionPattern<Action extends IAction>(
    takeInput: TakePattern<Action> | ActionPattern<Action>
): takeInput is ActionPattern<Action> {
    return typeof takeInput === 'string' || Array.isArray(takeInput) || isFunction(takeInput);
}
