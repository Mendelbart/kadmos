import FunctionSet from "./FunctionSet";

export type ObservableWithNode<P extends any[]> = Observable<P> & {node: Node};

export default abstract class Observable<P extends any[]> {
    observers: FunctionSet<(...args: P) => any>

    protected constructor() {
        this.observers = new FunctionSet<(...args: P) => any>();
        this.callObservers = this.callObservers.bind(this);
    }

    callObservers() {
        this.observers.call(...this.observerArgs());
    }

    observerArgs(): P {
        throw new Error("Not implemented.");
    }

    teardown() {
        this.observers.clear();
    }
}
