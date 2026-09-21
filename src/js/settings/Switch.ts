import {Setting, ValueElementBase} from "./ValueElement";
import {DOMUtils} from "../utils";

interface BoolValues<T> {
    true: T,
    false: T
}

export default class Switch<T> extends ValueElementBase<HTMLInputElement, T> implements Setting<T> {
    boolValues: BoolValues<T>;

    constructor(node: HTMLElement, boolValues: BoolValues<T>) {
        super(node);

        this.node.classList.add("switch-container");
        this.valueNode.classList.add("switch");
        this.boolValues = boolValues;
    }

    isValueNode(node: unknown): node is HTMLInputElement {
        return node instanceof HTMLInputElement && node.type === "checkbox";
    }

    static create(label: string, attrs?: Record<string, any> & {boolValues?: undefined}): Switch<boolean>
    static create<T>(label: string, attrs?: Record<string, any> & {boolValues: BoolValues<T>}): Switch<T>
    static create<T>(label: string, attrs: Record<string, any> & {boolValues?: BoolValues<T>} = {}): Switch<T> | Switch<boolean> {
        const input = document.createElement("input");
        input.type = "checkbox";
        if (attrs) DOMUtils.setAttrs(input, attrs);

        const bv = attrs.boolValues;

        const sw = bv ? new this<T>(input, bv) : new this(input, {true: true, false: false});

        if (label) sw.label(label);
        return sw;
    }

    get value(): T {
        const key = this.valueNode.checked ? "true" : "false";
        return this.boolValues[key];
    }

    set value(value: T) {
        this.valueNode.checked = value === this.boolValues.true;
    }
}
