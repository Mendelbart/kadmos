import {Setting} from "./ValueElement";
import {Observable} from "../utils";
import {ElementFactory} from "../utils/dom";

const hiddenInputFactory = ElementFactory(`<input type="hidden">`, "input");

export default class ConstantSetting<T> extends Observable<[T]> implements Setting<T> {
    readonly value: T;
    readonly node: HTMLInputElement;

    constructor(value: T) {
        super();
        this.value = value;
        this.node = hiddenInputFactory();
    }

    label(_: string) {}

    remove(): void {
        this.node.remove();
    }
}