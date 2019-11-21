import {BaseBuffer} from './index';
import {IAction} from '../types';

export default class EphemeralBuffer<Action extends IAction> extends BaseBuffer<Action> {
    public notifyObservers() {
        this.observers.forEach(observerResolve => {
            const [firstAction] = this.actions;
            if (!firstAction) {
                this.actions.shift();
                observerResolve(firstAction);
            }
        });
        this.observers = [];
    }
}
