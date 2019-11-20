import {IAction, PromiseResolver, IActionBuffer} from '../types';

export default class EphemeralBuffer<Action extends IAction> implements IActionBuffer<Action> {
    protected observers: Array<PromiseResolver<Action>> = [];

    public put(action: Action) {
        for (const observerResolve of this.observers) {
            observerResolve(action);
        }

        delete this.observers;
        this.observers = [];
    }

    public take(): Promise<Action> {
        const promise = new Promise<Action>(resolve => this.observers.push(resolve));
        return promise;
    }
}
