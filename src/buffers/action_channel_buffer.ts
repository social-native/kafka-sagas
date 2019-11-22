import {IAction} from 'types';
import {BaseBuffer} from './index';

export default class ActionChannelBuffer<Action extends IAction> extends BaseBuffer<Action> {
    // tslint:disable-next-line: cyclomatic-complexity
    public notifyObservers() {
        const countObservers = this.observers.length;
        const countActions = this.actions.length;

        if (!countObservers || !countActions) {
            return;
        }

        let numberOfItemsToShift = Math.min(countObservers, countActions);

        while (numberOfItemsToShift) {
            const observer = this.observers.shift();
            const action = this.actions.shift();

            if (!observer || !action) {
                throw new Error(
                    'Possible mutation of observers or actions during notification loop'
                );
            }

            observer(action);
            numberOfItemsToShift -= 1;
        }
    }
}
