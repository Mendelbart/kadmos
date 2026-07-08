import {DOMUtils, ObjectUtils, Observable} from '../utils';

DOMUtils.registerTemplate("buttonGroupContainer", DOMUtils.createElement("fieldset.button-group.setting"));

/** @implements Setting */
export default class ButtonGroup extends Observable {
    static nameCount = 0

    /** @type {HTMLFieldSetElement} */
    node
    /** @type {Record<string, HTMLInputElement>} */
    inputs

    /**
     * @param {HTMLFieldSetElement} node
     * @param {boolean} exclusive
     */
    constructor(node, exclusive) {
        super();
        this.node = node;

        this.inputs = {};
        for (const input of this.node.querySelectorAll("INPUT")) {
            this.inputs[input.value] = input;
        }

        this.exclusive = exclusive;

        this.node.addEventListener("change", this.callObservers);
    }

    /**
     * @param {Record<string,string> | string[]} data
     * @param {boolean} [exclusive=false]
     * @param {string} [name]
     * @param {string|string[]|Record<string,boolean>} [checked]
     * @param {string|string[]|Record<string,boolean>} [disabled]
     * @param {boolean} [decheckable=false]
     * @param {string} [label]
     * @returns {ButtonGroup}
     */
    static from(data, {
        exclusive = false,
        name,
        checked,
        disabled,
        decheckable = false,
        label
    } = {}) {
        if (Array.isArray(data)) {
            data = Object.fromEntries(data.map(x => [x, x]));
        }

        const values = Object.keys(data);
        const type = exclusive ? "radio" : "checkbox";
        name ??= this.generateName();

        const container = DOMUtils.getTemplate("buttonGroupContainer");

        if (exclusive) {
            container.role = "radiogroup";

            if (typeof checked === "string") checked = [checked];

            if (!decheckable && !checked) checked = [values[0]];
        }

        checked = ObjectUtils.subsetToBoolRecord(checked ?? "none", values);
        disabled = ObjectUtils.subsetToBoolRecord(disabled ?? "none", values);

        for (const [value, displayName] of Object.entries(data)) {
            const [input, label] = DOMUtils.button(type, value, displayName);

            input.name = exclusive ? name : `${name}_${value}`;
            input.disabled = disabled[value];
            input.checked = checked[value];

            container.append(input, label);
        }

        if (exclusive && decheckable) {
            container.addEventListener("click", (e) => {
                if (e.target.tagName === "INPUT" && e.target.checked) {
                    e.target.checked = false;
                }
            });
        }

        const group = new this(container, exclusive, decheckable);
        if (label) group.label(label);

        return group;
    }

    static generateName() {
        this.nameCount++;
        return "buttongroup_" + this.nameCount.toString().padStart(4, "0");
    }

    observerArgs() {
        return [this.value];
    }

    buttonCount() {
        return Object.keys(this.inputs).length;
    }

    /**
     * @param {boolean | null} checked
     */
    disableIfSingleButton(checked = null) {
        if (this.buttonCount() === 1) {
            this.setDisabled(true);
            if (checked !== null) {
                this.value = checked ? Object.keys(this.inputs) : [];
            }
        } else {
            this.setDisabled(false);
        }
    }

    /**
     * @returns {string[]|null|string}
     */
    get value() {
        if (this.exclusive) {
            for (const input of Object.values(this.inputs)) {
                if (input.checked) {
                    return input.value;
                }
            }
            return null;
        }

        return ObjectUtils.filterKeys(this.inputs, input => input.checked);
    }

    /**
     * @param {string|string[]|Record<string,boolean>} checked
     */
    set value(checked) {
        if (this.exclusive && typeof checked === "string") {
            if (!this.inputs[checked]) {
                console.log(this);
                throw new Error(`Unknown input key ${checked}.`);
            }

            this.inputs[checked].checked = true;
        } else {
            checked = ObjectUtils.subsetToBoolRecord(checked, Object.keys(this.inputs));
            for (const [key, input] of Object.entries(this.inputs)) {
                input.checked = checked[key] ?? false;
            }
        }
    }

    /**
     * @param {boolean} disabled
     */
    setDisabled(disabled) {
        for (const input of Object.values(this.inputs)) {
            input.disabled = disabled;
        }
    }

    /**
     * @param labelString
     */
    label(labelString) {
        const legendElement = document.createElement("LEGEND");
        legendElement.textContent = labelString;
        this.node.prepend(legendElement);
    }

    remove() {
        this.node.remove();
    }
}
