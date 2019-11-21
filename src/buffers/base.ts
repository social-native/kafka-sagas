import {IActionBuffer, IAction} from '../types';

export default class BaseBuffer<Action extends IAction> implements IActionBuffer<Action> {
    protected actions: Action[] = [];
    protected observers: Array<typeof Promise['resolve']> = [];

    public isEmpty() {
        return this.actions.length === 0;
    }

    public put(action: Action) {
        this.actions = [...this.actions, action];
        this.notifyObservers();
    }

    public notifyObservers() {
        throw new Error('notifyObservers is not implemented in the base class');
    }

    public async take(): Promise<Action> {
        let resolve;
        const promise = new Promise(r => (resolve = r));
        if (resolve) {
            this.observers.push(resolve);
        }
        return promise as Promise<Action>;
    }
}
