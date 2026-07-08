import {DOMUtils} from '../utils';
import ValueElement from "./ValueElement";

DOMUtils.registerTemplate("slider", `<div class="slider-container">
    <span class="range-min"></span><span class="range-value"></span><span class="range-max"></span>
    <input type="range" class="form-range">
</div>`);

/** @implements Setting */
export default class Slider extends ValueElement {
    static updateEvent = "input";
    /**
     * @param {HTMLElement} node
     */
    constructor(node) {
        super(node);
        if (this.valueNode.tagName !== "INPUT" || this.valueNode.type !== "range") {
            throw new Error("Couldn't find input type='range' element.");
        }

        this.min = parseInt(this.valueNode.min);
        this.max = parseInt(this.valueNode.max);

        this.displayValue = this.displayValue.bind(this);
        this.onChange = this.onChange.bind(this);
        this.displayMinMax();

        this.observers.push(this.onChange);
    }

    /**
     * @param {number} min
     * @param {number} max
     * @param {number} [value] default min
     * @returns {Slider}
     */
    static create(min, max, value) {
        const node = DOMUtils.getTemplate("slider");
        const input = node.querySelector("input");
        input.min = min;
        input.max = max;

        const slider = new this(node);
        if (value != null) slider.value = value;

        return slider;
    }

    /**
     * @param {number} step
     */
    setStep(step) {
        this.valueNode.step = step;
    }

    onChange() {
        this.updateProgress();
        this.displayValue();
    }

    updateProgress() {
        this.valueNode.style.setProperty("--range-progress", this.getProgress().toString());
    }

    getProgress() {
        return (this.value - this.min) / (this.max - this.min);
    }

    displayValue() {
        this.node.querySelector(".range-value").textContent = this.formatValue(this.value);
    }

    displayMinMax() {
        this.node.querySelector(".range-min").textContent = this.formatValue(this.min);
        this.node.querySelector(".range-max").textContent = this.formatValue(this.max);
    }

    /**
     * @param {number} value
     */
    set value(value) {
        if (this.min > value || this.max < value) {
            console.warn("Slider value outside range.");
        }
        super.value = value.toString();
        this.onChange();
    }

    get value() {
        return parseFloat(this.valueNode.value);
    }

    /**
     * @param {number} value
     * @returns {string}
     */
    formatValue(value) {
        return (Math.round(value * 100) / 100).toString();
    }

    /**
     * @param {number} min
     */
    setMin(min) {
        if (this.valueNode.value < min) {
            this.value = min;
        }
        this.min = min;
        this.valueNode.min = min;
        this.updateProgress();
        this.displayMinMax();
    }

    /**
     * @param {number} max
     */
    setMax(max) {
        if (this.valueNode.value > max) {
            this.value = max;
        }
        this.max = max;
        this.valueNode.max = max;
        this.updateProgress();
        this.displayMinMax();
    }
}
