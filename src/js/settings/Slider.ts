import {Setting, ValueElementBase} from "./ValueElement";
import {DOMFactory, GrabbedNodes, grabNodes} from "../utils/dom";


const sliderElements = {
    min: ["span", ".range-min"],
    value: ["span", ".range-value"],
    max: ["span", ".range-max"],
    input: ["input"]
} as const;

const sliderFactory = DOMFactory(
    `<div class="slider-container">
    <span class="range-min"></span><span class="range-value"></span><span class="range-max"></span>
    <input type="range" class="form-range">
</div>`,
    {...sliderElements, container: ["div"]}
);

export default class Slider extends ValueElementBase<HTMLInputElement, number> implements Setting<number> {
    min: number;
    max: number;
    elements: Readonly<GrabbedNodes<typeof sliderElements>>

    constructor(node: HTMLElement) {
        super(node);

        this.min = parseInt(this.valueNode.min);
        this.max = parseInt(this.valueNode.max);

        this.elements = grabNodes(node, sliderElements);

        this.displayValue = this.displayValue.bind(this);
        this.onChange = this.onChange.bind(this);
        this.displayMinMax();

        this.observers.push(this.onChange);
    }

    get updateEvent() {
        return "input";
    }

    isValueNode(node: unknown): node is HTMLInputElement {
        return node instanceof HTMLInputElement && node.type === "range";
    }

    static create(min: number, max: number, value: number = min): Slider {
        const node = sliderFactory();
        const input = node.input;
        input.min = min.toString();
        input.max = max.toString();

        const slider = new this(node.container);
        slider.value = value;

        return slider;
    }

    setStep(step: number): void {
        this.valueNode.step = step.toString();
    }

    onChange(): void {
        this.updateProgress();
        this.displayValue();
    }

    updateProgress() {
        this.valueNode.style.setProperty("--range-progress", this.getProgress().toString());
    }

    getProgress() {
        return (this.value - this.min) / (this.max - this.min);
    }

    setSpanTextContent(key: "min" | "max" | "value", value: number): void {
        if (this.elements[key]) this.elements[key].textContent = this.formatValue(value);
    }

    displayValue() {
        this.setSpanTextContent("value", this.value);
    }

    displayMinMax() {
        this.setSpanTextContent("min", this.min);
        this.setSpanTextContent("max", this.max);
    }

    set value(value: number) {
        if (this.min > value || this.max < value) {
            console.warn("Slider value outside range.");
        }
        this.valueNode.value = value.toString();
        this.onChange();
    }

    get value() {
        return parseFloat(this.valueNode.value);
    }

    formatValue(value: number): string {
        return (Math.round(value * 100) / 100).toString();
    }

    setMin(min: number): void {
        if (this.value < min) this.value = min;

        this.min = min;
        this.valueNode.min = min.toString();
        this.updateProgress();
        this.displayMinMax();
    }

    setMax(max: number): void {
        if (this.value > max) this.value = max;

        this.max = max;
        this.valueNode.max = max.toString();
        this.updateProgress();
        this.displayMinMax();
    }
}
