import {button, DOMFactory, GrabbedNodes, hide, show} from "../dom";

const RibbonGrabNodes = {
    container: ["div"],
    buttons: ["div", ".ribbon-buttons"],
    contents: ["div", ".ribbon-contents"]
} as const;

const ribbonFactory = DOMFactory(
    `<div class="ribbon">
    <div class="ribbon-buttons button-group"></div>
    <div class="ribbon-contents"></div>
</div>`,
    RibbonGrabNodes
);


export interface RibbonConfig {
    closable?: boolean
}

export default class Ribbon {
    node: HTMLDivElement;
    elements: GrabbedNodes<typeof RibbonGrabNodes>;
    buttons: HTMLInputElement[];
    contents: HTMLElement[];
    openIndex?: number;
    closable: boolean;

    constructor(config: RibbonConfig = {}) {
        this.elements = ribbonFactory();
        this.node = this.elements.container;
        this.buttons = [];
        this.contents = [];
        this.closable = config.closable ?? false;

        this.elements.container.classList.add("contents-hidden");
        this.inputListener = this.inputListener.bind(this);
    }

    addContent(label: string, content: HTMLElement) {
        content.classList.add("ribbon-content");
        hide(content);

        const [input, labelEl] = button("checkbox", label, this.buttons.length.toString());
        input.addEventListener("change", this.inputListener);

        this.buttons.push(input);
        this.contents.push(content);
        this.elements.buttons.append(input, labelEl);
        this.elements.contents.append(content);

        if (!this.closable && this.openIndex == null) this.open(0);
    }

    inputListener(event: Event) {
        if (!(event.target instanceof HTMLInputElement)) return;

        const index = parseInt(event.target.value);
        if (event.target.checked) {
            this.open(index);
        } else if (this.closable) {
            this.close();
        } else {
            event.target.checked = true;
        }
    }

    open(index: number) {
        this.buttons.forEach((input, i) => input.checked = index === i);
        if (this.openIndex != null) hide(this.contents[this.openIndex]);
        show(this.contents[index]);

        this.elements.container.classList.remove("contents-hidden");
        this.openIndex = index;
    }

    close() {
        if (!this.closable) {
            console.error("Trying to close non-closable ribbon.");
            return;
        }

        if (this.openIndex != null) hide(this.contents[this.openIndex]);
        this.buttons.forEach(input => {input.checked = false});
        delete this.openIndex;
        this.elements.container.classList.add("contents-hidden");
    }
}