import { IAction } from 'types';
import { BaseBuffer } from './index';

export default class ActionBuffer<Action extends IAction> extends BaseBuffer<Action> {
    public notifyObservers() {
        this.observers.forEach(observerResolve => {
            const [firstAction] = this.actions;
            if (!firstAction) {
                this.actions.shift();
                observerResolve(firstAction)
                // TODO
                // remove observer(resolve) from observers
            }
        })
    }
}

