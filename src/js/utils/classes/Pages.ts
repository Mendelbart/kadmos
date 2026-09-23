import {DOMFactory, GrabbedNodes, hide, show, tag, toggleShown, transition} from "../dom";
import FunctionSet from "./FunctionSet";

const PagesGrabNodes = {
    container: ["div"],
    headings: ["div", ".pages-headings"],
    buttons: ["div", ".pages-buttons"],
    buttonBack: ["button", ".pages-back-button"],
    buttonNext: ["button", ".pages-next-button"],
    buttonFinish: ["button", ".pages-finish-button"],
    contents: ["div", ".pages-contents"]
} as const;

const pagesFactory = DOMFactory(
    `<div class="pages-container">
    <div class="pages-header">
        <div class="pages-headings"></div>
    
        <div class="pages-buttons button-group">
            <button class="pages-button pages-back-button button-grey">Back</button>
            <button class="pages-button pages-next-button button-accent">Next</button>
            <button class="pages-button pages-finish-button button-accent">Finish</button>
        </div>
    </div>
    
    <div class="pages-contents"></div>
</div>`,
    PagesGrabNodes
)

export default class Pages {
    node: HTMLElement;
    readonly elements: Readonly<GrabbedNodes<typeof PagesGrabNodes>>;
    private readonly headings: HTMLElement[];
    private readonly contents: HTMLElement[];
    protected openIndex?: number;
    readonly onFinish: FunctionSet<() => void>;

    constructor() {
        this.elements = pagesFactory();
        this.node = this.elements.container;
        this.contents = [];
        this.headings = [];

        this.onFinish = new FunctionSet();
        this.setupListeners();
    }

    setupListeners() {
        this.elements.buttonBack.addEventListener("click", () => transition(() => this.movePage(-1)));
        this.elements.buttonNext.addEventListener("click", () => transition(() => this.movePage(1)));
        this.elements.buttonFinish.addEventListener("click", () => this.onFinish.call());
    }

    movePage(d: number) {
        if (this.openIndex == null) throw new Error("No open page.");
        if (!(this.openIndex + d in this.contents)) throw new Error("Invalid index.");

        this.open(this.openIndex + d);
    }

    open(index: number) {
        if (this.openIndex != null) hide([this.contents[this.openIndex], this.headings[this.openIndex]]);
        show([this.contents[index], this.headings[index]]);
        this.openIndex = index;
        this.checkIndexLimits();
    }

    checkIndexLimits() {
        toggleShown(this.openIndex !== 0, this.elements.buttonBack);
        if (this.openIndex === this.contents.length - 1) {
            const focused = document.activeElement === this.elements.buttonNext;
            hide(this.elements.buttonNext);
            show(this.elements.buttonFinish);
            if (focused) this.elements.buttonFinish.focus();
        } else {
            toggleShown(false, this.elements.buttonFinish, this.elements.buttonNext);
        }
    }

    addPage(content: HTMLElement, heading: HTMLElement | string) {
        content.classList.add("pages-content");
        if (typeof heading === "string") {
            heading = tag("h2", ".pages-heading", heading);
        } else {
            heading.classList.add("pages-heading");
        }
        this.contents.push(content);
        this.headings.push(heading);
        hide([content, heading]);
        this.elements.contents.append(content);
        this.elements.headings.append(heading);

        if (!this.openIndex) {
            this.open(0);
        } else {
            this.checkIndexLimits();
        }
    }
}