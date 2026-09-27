import {Setting} from "./ValueElement";
import {Observable} from "../utils";

export default class ConstantSetting<T> extends Observable<[T]> implements Setting<T> {
    readonly value: T;

    constructor(value: T) {
        super();
        this.value = value;
    }
}
