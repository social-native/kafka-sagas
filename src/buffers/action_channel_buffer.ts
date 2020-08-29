import {IAction, IActionBuffer, PromiseResolver} from '../types';

export default class ActionChannelBuffer<Action extends IAction> implements IActionBuffer<Action> {
    protected actions: Action[] = [];
    protected observers: Array<PromiseResolver<Action>> = [];

    public put(action: Action) {
        this.actions = [...this.actions, action];
        this.notifyObservers();
    }

    public take() {
        const promise = new Promise<Action>(resolve => this.observers.push(resolve));
        this.notifyObservers();
        return promise;
    }

    // tslint:disable-next-line: cyclomatic-complexity
    protected notifyObservers() {
        const countObservers = this.observers.length;
        const countActions = this.actions.length;

        // if there are no observers and no actions, do nothing
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
