import {DOMUtils, ObjectUtils, Observable} from '../utils';
import {Setting} from "./ValueElement";

let nameCount = 0;

export abstract class AbstractButtonGroup<T> extends Observable<[T]> implements Setting<T> {
    node: HTMLFieldSetElement;
    inputs: Record<string, HTMLInputElement>;

    constructor(node: HTMLFieldSetElement) {
        super();
        this.node = node;

        this.inputs = {};
        for (const input of this.node.querySelectorAll("input")) {
            if (!this.isValidInput(input)) {
                console.warn("Invalid input in fieldset for this button group.");
                continue;
            }
            this.inputs[input.value] = input;
            input.addEventListener("change", this.callObservers);
        }
    }

    isValidInput(input: HTMLInputElement): boolean {
        return true;
    }

    get value(): T {
        throw new Error("Not implemented.");
    }

    set value(value: T) {
        throw new Error("Not implemented.");
    }

    observerArgs(): [T] {
        return [this.value];
    }

    buttonCount() {
        return Object.keys(this.inputs).length;
    }

    setInputDisabled(key: T, disabled: boolean): void {
        this.inputs[key as string].disabled = disabled;
    }

    setDisabled(disabled: boolean): void {
        for (const input of Object.values(this.inputs)) {
            input.disabled = disabled;
        }
    }

    label(labelString: string) {
        const legendElement = document.createElement("legend");
        legendElement.textContent = labelString;
        this.node.prepend(legendElement);
    }

    remove(): void {
        this.node.remove();
    }
}

export class RadioButtonGroup<T extends string = string> extends AbstractButtonGroup<T> {
    isValidInput(input: HTMLInputElement): boolean {
        return input.type === "radio";
    }

    get value(): T {
        for (const input of Object.values(this.inputs)) {
            if (input.checked) {
                return input.value as T;
            }
        }

        throw new Error("No input set.");
    }

    set value(checked: T) {
        if (!this.inputs[checked]) throw new Error(`Unknown input key ${checked}.`);

        this.inputs[checked].checked = true;
    }
}

export class ButtonGroup<T extends string = string> extends AbstractButtonGroup<T[]> {
    get value(): T[] {
        return ObjectUtils.filterKeys(this.inputs, input => input.checked) as T[];
    }

    set value(checked: T[]) {
        const checkedSubset = ObjectUtils.subsetToBoolRecord(checked, Object.keys(this.inputs));
        for (const [key, input] of Object.entries(this.inputs)) {
            input.checked = checkedSubset[key] ?? false;
        }
    }
}


interface ButtonGroupConfig {
    name?: string,
    type?: "radio" | "checkbox",
    checked?: string | string[],
    disabled?: string[],
    label?: string,
    /** For `type = "checkbox"`, set this value to true to still constrain to a single set value, but keep the value type as `string[]`, as opposed to `type = "radio"`. */
    exclusiveCheckboxes?: boolean
}

export function createButtonGroup<T extends string = string>(data: Record<T, string> | T[], config: ButtonGroupConfig & {type: "radio"}): RadioButtonGroup<T>
export function createButtonGroup<T extends string = string>(data: Record<T, string> | T[], config?: ButtonGroupConfig & {type?: "checkbox"}): ButtonGroup<T>
export function createButtonGroup<T extends string = string>(data: Record<T, string> | T[], config?: ButtonGroupConfig & {type: "radio" | "checkbox"}): RadioButtonGroup<T> | ButtonGroup<T>
export function createButtonGroup<T extends string = string>(data: Record<T, string> | T[], config: ButtonGroupConfig = {}): RadioButtonGroup<T> | ButtonGroup<T> {
    if (Array.isArray(data)) {
        data = Object.fromEntries(data.map(x => [x, x])) as Record<T, T>;
    }

    const values = Object.keys(data);
    const name = config.name ?? generateName();
    const type = config.type ?? "checkbox";
    const useRadioButtons = type === "radio" || config.exclusiveCheckboxes;
    let checked = config.checked;

    const container = DOMUtils.tag("fieldset", ".button-group.setting");

    if (useRadioButtons) {
        container.role = "radiogroup";

        if (!checked) checked = [values[0]];
    }

    if (typeof checked === "string") checked = [checked];

    const checkedSubset = ObjectUtils.subsetToBoolRecord(checked ?? [], values);
    const disabledSubset = ObjectUtils.subsetToBoolRecord(config.disabled ?? [], values);

    for (const [value, displayName] of Object.entries(data)) {
        const [input, label] = DOMUtils.button(useRadioButtons ? "radio" : "checkbox", value, displayName as string);

        input.name = useRadioButtons ? name : `${name}_${value}`;
        input.disabled = disabledSubset[value];
        input.checked = checkedSubset[value];

        container.append(input, label);
    }

    const bg = type === "checkbox" ? new ButtonGroup<T>(container) : new RadioButtonGroup<T>(container);
    if (config.label) bg.label(config.label);

    return bg;
}

function generateName() {
    nameCount++;
    return "buttongroup_" + nameCount.toString().padStart(4, "0");
}
