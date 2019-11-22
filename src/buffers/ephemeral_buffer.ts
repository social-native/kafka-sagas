import {BaseBuffer} from './index';
import {IAction} from '../types';

export default class EphemeralBuffer<Action extends IAction> extends BaseBuffer<Action> {
    public notifyObservers() {
        for (const observerResolve of this.observers) {
            const [firstAction] = this.actions;

            if (!firstAction) {
                throw new Error('Tried to notify on an empty action butter buffer');
            }

            this.actions.shift();
            observerResolve(firstAction);
        }

        delete this.observers;
        this.observers = [];
    }
}
