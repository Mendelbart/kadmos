export default class FunctionSet<F extends (...args: any) => any> {
    readonly set: Set<F>;
    constructor() {
        this.set = new Set();
    }

    push(...funcs: F[]) {
        for (const func of funcs) {
            this.set.add(func);
        }
    }

    remove(...funcs: F[]) {
        for (const func of funcs) {
            this.set.delete(func);
        }
    }

    call(...args: Parameters<F>) {
        for (const func of this.set) {
            func(...args);
        }
    }

    clear() {
        this.set.clear();
    }
}
