import {IAction} from './types';

export function isTransactionAction(messageValue: IAction | any): messageValue is IAction {
    return messageValue && messageValue.transactionId;
}
