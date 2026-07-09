import {DOMUtils, Observable} from "../utils";

let IdCount = 0;
/**
 * @interface Setting
 * @extends Observable
 *//**
 * @name Setting#value
 *//**
 * @type {HTMLElement}
 * @name Setting#node
 *//**
 * @function
 * @name Setting#setDisabled
 * @param {boolean} disabled
 *//**
 * @function
 * @name Setting#label
 * @param {string} labelString
 *//**
 * @function
 * @name Setting#remove
 */

/** @implements Setting */
export default class ValueElement extends Observable {
    static updateEvent = "change"
    /** @type {HTMLDivElement} */
    node
    /** @type {HTMLSelectElement | HTMLTextAreaElement | HTMLInputElement} */
    valueNode

    /**
     * @param {HTMLElement} node
     */
    constructor(node) {
        super();

        let valueNode;
        if (this.constructor.isValueNode(node)) {
            valueNode = node;
        } else {
            valueNode = node.querySelector("input, textarea, select");
            if (!this.constructor.isValueNode(valueNode)) {
                throw new Error("Couldn't find element of type input, textarea or select.");
            }
        }

        this.node = DOMUtils.createElement("div.setting.labeled-value-element");
        this.node.append(node);
        this.valueNode = valueNode;

        this.valueNode.addEventListener(this.constructor.updateEvent, this.callObservers);
    }

    /**
     * @param {string} type
     * @param {string} [label]
     * @param {Record<string,string>} [attrs]
     * @returns {ValueElement}
     */
    static createInput(type, label, attrs) {
        const input = document.createElement("INPUT");
        input.type = type;
        if (attrs) DOMUtils.setAttrs(input, attrs);

        const ve = new this(input);

        if (label) ve.label(label);
        return ve;
    }

    /**
     * @param {Record<string,string>} data
     * @param {{selected?, disabled?, groups?, id?, label?}} options
     */
    static createSelect(data, options = {}) {
        const select = document.createElement("select");
        DOMUtils.setOptions(select, data, options);

        const container = DOMUtils.createElement("div.styled-select");
        container.append(select);

        const ve = new this(container);
        if (options.id) ve.setId(options.id);
        if (options.label) ve.label(options.label);

        return ve;
    }

    /**
     * @param {HTMLElement} node
     */
    static isValueNode(node) {
        const tag = node.tagName;
        return tag === "SELECT" || tag === "TEXTAREA" || (tag === "INPUT" && node.type !== "hidden");
    }

    /**
     * @returns {any}
     */
    get value() {
        return this.valueNode.value;
    }

    /**
     * @param {any} value
     */
    set value(value) {
        this.valueNode.value = value;
    }

    observerArgs() {
        return [this.value];
    }

    setDisabled(disabled) {
        this.valueNode.disabled = disabled;
    }

    /**
     * @param {string | {prefix}} data
     * @returns {string}
     */
    setId(data = {prefix: ""}) {
        const id = typeof data === "string" ? data : this.constructor.generateId(data.prefix);
        this.valueNode.id = id;
        const labelElement = this.node.querySelector("label");
        if (labelElement) {
            labelElement.htmlFor = id;
        }
        return id;
    }

    static generateId(prefix = "") {
        IdCount += 1;
        return "ve_" + prefix + IdCount.toString().padStart(4, "0");
    }

    /**
     * @param {string} labelString
     */
    label(labelString) {
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

    remove() {
        this.valueNode.removeEventListener(this.constructor.updateEvent, this.callObservers);
        this.node.remove();
    }
}
