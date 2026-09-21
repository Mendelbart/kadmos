import {DOMUtils, ObjectUtils, Observable} from '../utils';
import {Setting} from "./ValueElement";

let nameCount = 0;

export abstract class ButtonGroup<T> extends Observable<[T]> implements Setting<T> {
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

export class RadioButtonGroup extends ButtonGroup<string> {
    isValidInput(input: HTMLInputElement): boolean {
        return input.type === "radio";
    }

    get value(): string {
        for (const input of Object.values(this.inputs)) {
            if (input.checked) {
                return input.value;
            }
        }

        throw new Error("No input set.");
    }

    set value(checked: string) {
        if (!this.inputs[checked]) throw new Error(`Unknown input key ${checked}.`);

        this.inputs[checked].checked = true;
    }
}

export class CheckboxButtonGroup extends ButtonGroup<string[]> implements Setting<string[]> {
    get value(): string[] {
        return ObjectUtils.filterKeys(this.inputs, input => input.checked);
    }

    set value(checked: string[]) {
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

export function createButtonGroup(data: Record<string, string> | string[], config: ButtonGroupConfig & {type: "radio"}): RadioButtonGroup
export function createButtonGroup(data: Record<string, string> | string[], config?: ButtonGroupConfig & {type?: "checkbox"}): CheckboxButtonGroup
export function createButtonGroup(data: Record<string, string> | string[], config?: ButtonGroupConfig & {type: "radio" | "checkbox"}): RadioButtonGroup | CheckboxButtonGroup
export function createButtonGroup(data: Record<string, string> | string[], config: ButtonGroupConfig = {}): RadioButtonGroup | CheckboxButtonGroup {
    if (Array.isArray(data)) {
        data = Object.fromEntries(data.map(x => [x, x]));
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
        const [input, label] = DOMUtils.button(useRadioButtons ? "radio" : "checkbox", value, displayName);

        input.name = useRadioButtons ? name : `${name}_${value}`;
        input.disabled = disabledSubset[value];
        input.checked = checkedSubset[value];

        container.append(input, label);
    }

    const bg = type === "checkbox" ? new CheckboxButtonGroup(container) : new RadioButtonGroup(container);
    if (config.label) bg.label(config.label);

    return bg;
}

function generateName() {
    nameCount++;
    return "buttongroup_" + nameCount.toString().padStart(4, "0");
}
