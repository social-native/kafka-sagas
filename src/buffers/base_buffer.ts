import {IActionBuffer, IAction, PromiseResolver} from '../types';

export default class BaseBuffer<Action extends IAction> implements IActionBuffer<Action> {
    protected actions: Action[] = [];
    protected observers: Array<PromiseResolver<Action>> = [];

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

    public take(): Promise<Action> {
        const promise = new Promise<Action>(resolve => this.observers.push(resolve));
        this.notifyObservers();
        return promise;
    }
}
