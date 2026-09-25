import {DOMUtils, Observable} from "../utils";
import {SelectOptionsConfig} from "../utils/dom";
import {ObservableSetting} from "./SettingCollection";


export interface Setting<V> {
    value: V,
    node: HTMLElement,
    label(label: string): void,
    remove(): void
}

let IdCount = 0;

type HTMLValueElementType = HTMLSelectElement | HTMLTextAreaElement | HTMLInputElement;

export abstract class ValueElementBase<T extends HTMLValueElementType, V> extends Observable<[V]> implements Setting<V> {
    node: HTMLDivElement
    valueNode: T

    protected constructor(node: HTMLElement) {
        super();

        let valueNode;
        if (this.isValueNode(node)) {
            valueNode = node;
        } else {
            valueNode = node.querySelector("input, textarea, select");
            if (!this.isValueNode(valueNode)) {
                throw new Error("No valid value node.");
            }
        }

        this.node = DOMUtils.tag("div", ".setting.labeled-value-element");
        this.node.append(node);
        this.valueNode = valueNode;

        this.valueNode.addEventListener(this.updateEvent, this.callObservers);
    }

    get updateEvent() {
        return "change";
    }

    get value(): V {
        throw new Error("Not implemented");
    }

    set value(_: V) {
        throw new Error("Not Implemented");
    }

    isValueNode(node: unknown): node is T {
        return node instanceof HTMLSelectElement || node instanceof HTMLTextAreaElement || node instanceof HTMLInputElement;
    }

    observerArgs(): [V] {
        return [this.value];
    }

    setId(data: string | { prefix: string } = {prefix: ""}): string {
        const id = typeof data === "string" ? data : this.generateId(data.prefix);
        this.valueNode.id = id;
        const labelElement = this.node.querySelector("label");
        if (labelElement) {
            labelElement.htmlFor = id;
        }
        return id;
    }

    generateId(prefix = ""): string {
        IdCount += 1;
        return "ve_" + prefix + IdCount.toString().padStart(4, "0");
    }

    label(labelString: string): void {
        if (!labelString) return;

        let labelElement = this.node.querySelector("label");
        if (!labelElement) {
            labelElement = document.createElement("label");

            if (!this.valueNode.id) this.setId();
            labelElement.htmlFor = this.valueNode.id;

            this.node.prepend(labelElement);
        }

        labelElement.textContent = labelString;
    }

    remove(): void {
        this.valueNode.removeEventListener(this.updateEvent, this.callObservers);
        this.node.remove();
    }
}

export default class ValueElement extends ValueElementBase<HTMLValueElementType, string> implements Setting<string> {
    constructor(node: HTMLElement) {
        super(node);
    }

    get value(): string {
        return this.valueNode.value;
    }

    set value(value: string) {
        this.valueNode.value = value;
    }
}

export class TransformedSetting<V, T = string> extends Observable<[V]> implements Setting<V> {
    setting: ObservableSetting<T>;
    transform: (value: T) => V;
    invTransform: (transformedValue: V) => T;
    node: HTMLElement;

    constructor(setting: ObservableSetting<T>, transform: (value: T) => V, invTransform: (transformedValue: V) => T) {
        super();
        this.setting = setting;
        this.node = this.setting.node;
        this.transform = transform;
        this.invTransform = invTransform;

        this.setting.observers.push(() => this.callObservers());
    }

    observerArgs(): [V] {
        return [this.value];
    }

    get value(): V {
        return this.transform(this.setting.value);
    }

    set value(value: V) {
        this.setting.value = this.invTransform(value);
    }

    label(label: string) {
        this.setting.label(label);
    }

    remove() {
        this.setting.remove();
    }
}

export function createInput(type: string, label?: string, attrs?: Record<string, string | boolean>): ValueElement {
    const input = document.createElement("input");
    input.type = type;
    if (attrs) DOMUtils.setAttrs(input, attrs);

    const ve = new ValueElement(input);

    if (label) ve.label(label);
    return ve;
}

export type SelectConfig = SelectOptionsConfig & {id?: string, label?: string};
export function createSelect(data: Record<string, string>, options: SelectConfig = {}): ValueElement {
    const select = document.createElement("select");
    DOMUtils.setOptions(select, data, options);

    const container = DOMUtils.tag("div", ".styled-select");
    container.append(select);

    const ve = new ValueElement(container);
    if (options.id) ve.setId(options.id);
    if (options.label) ve.label(options.label);

    return ve;
}

export function stringToNumberSetting(setting: ObservableSetting<string>): TransformedSetting<number> {
    return new TransformedSetting(setting, str => parseInt(str), num => num.toString());
}
