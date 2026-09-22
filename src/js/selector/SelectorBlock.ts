import {DOMUtils, ElementFitter, Observable} from "../utils";
import {rangeBetween, range, sumCallback} from "../utils/array";
import {SchemaSelectorBlockStyle} from "../../json/dataset.schema";
import {eventListenerWithDetail, span} from "../utils/dom";
import {SelectorItemCallback} from "./Selector";

const STYLE_PROPERTIES: Record<Exclude<keyof SchemaSelectorBlockStyle, "buttonWidth">, string> = {
    buttonMinWidth: "--button-min-width",
    buttonMaxWidth: "--button-max-width",
    symbolSize: "--symbol-size",
    labelGap: "--label-gap",
    symbolMinWidth: "--symbol-min-width",
};

export type SelectorContentsUpdateCallback<T> = (content: HTMLElement, item: T, index: number) => void;

export interface SelectorButtonCallbacks<T> {
    content: SelectorItemCallback<T, HTMLElement | string>,
    label?: SelectorItemCallback<T, string>
}

export default class SelectorBlock<T> extends Observable<[boolean[]]> {
    readonly items: T[];
    readonly checked: boolean[];
    readonly buttons: SelectorButton[];
    node: HTMLDivElement;
    contentFitter: ElementFitter;
    labelFitter?: ElementFitter;

    range?: {
        indices: number[],
        start: number | null,
        stop: number | null
    }

    onRangePointerDownDetail: (event: PointerEvent) => void;

    constructor(items: T[], callbacks: SelectorButtonCallbacks<T>) {
        super();
        this.items = items;

        this.checked = new Array(this.items.length).fill(true);
        this.buttons = this.items.map((item, index) => new SelectorButton(
            index, callbacks.content(item, index), callbacks.label ? callbacks.label(item, index) : undefined
        ));
        this.contentFitter = this.getContentFitter();
        if (callbacks.label) this.setupLabelFitter();

        this.bindListeners();
        this.onRangePointerDownDetail = eventListenerWithDetail(this.onRangePointerDown, {identifier: event => this.rangeTargetIndex(event.target)}).bind(this);
        this.node = this.getNode();
        this.setupListeners();
    }

    bindListeners() {
        this.handleButtonClick = this.handleButtonClick.bind(this);
        this.onRangePointerDown = this.onRangePointerDown.bind(this);
        this.onRangePointerMove = this.onRangePointerMove.bind(this);
        this.onRangePointerUpCancel = this.onRangePointerUpCancel.bind(this);
    }

    buttonNodes(): HTMLDivElement[] {
        return this.buttons.map(button => button.node);
    }

    getNode(): HTMLDivElement {
        const node = DOMUtils.tag("div", ".selector-block.selector-block-flex");
        node.append(...this.buttonNodes());
        return node;
    }

    getContentFitter(): ElementFitter {
        const fitter = new ElementFitter({uniformFactor: 1.5});
        fitter.fit(...this.buttons.map(button => button.contentContainer));
        return fitter;
    }

    getLabelFitter(): ElementFitter {
        const fitter = new ElementFitter();
        fitter.fit(...this.buttons.map(button => button.label).filter(x => x != null));
        return fitter;
    }

    setupLabelFitter() {
        return this.labelFitter = this.getLabelFitter();
    }

    observerArgs(): [boolean[]] {
        return [this.checked];
    }

    updateButtonContents(callback: SelectorContentsUpdateCallback<T>): void {
        this.buttons.forEach((button, index) =>
            button.updateContent(content => callback(content, this.items[index], index))
        );

        this.contentFitter.updateChildren();
    }

    applyStyle(style: SchemaSelectorBlockStyle) {
        if (style.buttonWidth != null) {
            style.buttonMinWidth = style.buttonWidth;
            style.buttonMaxWidth = style.buttonWidth;
            delete style.buttonWidth;
        }

        for (const [prop, value] of Object.entries(style) as [Exclude<keyof SchemaSelectorBlockStyle, "buttonWidth">, string | number][]) {
            this.node.style.setProperty(STYLE_PROPERTIES[prop], value.toString());
        }
    }

    setChecked(callback: (item: T, index: number) => boolean) {
        this.items.forEach((item, index) => this.setButtonChecked(index, callback(item, index)));
    }

    setDisabled(callback: (item: T, index: number) => boolean) {
        this.buttons.forEach((button, index) => button.setDisabled(callback(this.items[index], index)));
    }

    getChecked(includeDisabled = false): boolean[] {
        return this.checked.map((checked, index) => checked && (includeDisabled || !this.isDisabled(index)));
    }

    checkedCount(includeDisabled = false): number {
        return sumCallback(this.buttons, (_, index) => this.isChecked(index, includeDisabled) ? 1 : 0);}

    getCheckedItems(): T[] {
        return this.items.filter((_, index) => this.buttons[index].isChecked());
    }

    getDisabled(): boolean[] {
        return this.buttons.map(button => button.isDisabled());
    }

    setButtonChecked(index: number, checked: boolean) {
        this.buttons[index].setChecked(checked);
        this.checked[index] = checked;
    }

    isChecked(index: number, includeDisabled = false): boolean {
        return this.buttons[index].isChecked() && (includeDisabled || !this.isDisabled(index));
    }

    isDisabled(index: number): boolean {
        return this.buttons[index].isDisabled();
    }

    allChecked(indices: number[], includeDisabled: boolean = false): boolean {
        return indices.every(index => this.isChecked(index, includeDisabled));
    }

    toggleItems(indices: number[], {callObservers = true, updateIfDisabled = false}: {updateIfDisabled?: boolean, callObservers?: boolean} = {}): void {
        const checked = !this.allChecked(indices);
        for (const index of indices) {
            if (updateIfDisabled || !this.isDisabled(index)) this.setButtonChecked(index, checked);
        }

        if (callObservers) this.callObservers();
    }

    listenForClick() {
        this.node.addEventListener("click", this.handleButtonClick);
    }
    
    dontListenForClick() {
        this.node.removeEventListener("click", this.handleButtonClick);
    }

    setupListeners(): void {
        if (!this.node) throw new Error("Setup node first.");
        this.node.addEventListener("keydown", this.handleButtonClick);

        this.resetRangeSelection();
        this.node.addEventListener("pointerdown", this.onRangePointerDownDetail);
    }

    removeListeners(): void {
        if (!this.node) throw new Error("Setup node first.");
        this.node.removeEventListener("keydown", this.handleButtonClick);

        this.node.removeEventListener("pointerdown", this.onRangePointerDownDetail);
        this.node.removeEventListener("pointermove", this.onRangePointerMove);

        this.removeRangeListeners();
    }

    rangeTargetIndex(target: EventTarget | null) {
        return SelectorButton.getEventTargetIndex(target);
    }

    handleButtonClick(event: PointerEvent | KeyboardEvent): void {
        if (!event.target || event.type === "keydown" && (event as KeyboardEvent).key !== "Enter") return;

        const index = SelectorButton.getEventTargetIndex(event.target);
        if (index == null || this.isDisabled(index)) return;

        if (event.ctrlKey) {
            this.toggleAllItems();
            return;
        }

        this.toggleButton(index);
        this.callObservers();
    }

    toggleButton(index: number) {
        this.setButtonChecked(index, !this.isChecked(index));
    }

    toggleAllItems(): void {
        this.toggleItems(range(this.buttons.length), {updateIfDisabled: true});
    }

    resetRangeSelection() {
        this.removeRangeListeners();

        if (this.range) this.buttonsRemoveClass(this.range.indices, "active");

        delete this.range;
    }

    onRangePointerMove(event: PointerEvent): void {
        if (!this.range) return;
        const target = document.elementFromPoint(event.clientX, event.clientY);

        const index = this.rangeTargetIndex(target);
        if (index == null || this.range.stop === index) return;

        this.range.start ??= index;
        this.range.stop = index;
        this.updateRangeSelection();
    }

    onRangePointerDown(event: PointerEvent, detail: number): void {
        if (detail % 2 !== 0) {
            this.listenForClick();
            return;
        }
        this.dontListenForClick();

        const index = this.rangeTargetIndex(event.target) ?? null;
        this.range = {
            start: index,
            stop: index,
            indices: []
        };

        if (index != null) this.updateRangeSelection();

        this.addRangeListeners();
    }

    onRangePointerUpCancel(event: PointerEvent): void {
        if (!this.range) return;

        if (this.range.start != null) {
            this.toggleButton(this.range.start);

            if (event.type === "pointerup" && event.target instanceof HTMLElement && event.target.closest(".selector-block")) {
                const index = this.rangeTargetIndex(event.target);
                if (index != null && this.range.start === index) {
                    this.toggleAllItems();
                } else if (this.range.start !== this.range.stop) {
                    this.toggleItems(this.range.indices);
                }
            }
        }

        this.resetRangeSelection();
    }

    updateRangeSelection(): void {
        if (!this.range) {
            console.error("Cannot update range while range isn't set.");
            return;
        }

        this.buttonsRemoveClass(this.range.indices, "active");
        if (this.range.start != null && this.range.stop != null) {
            this.range.indices = this.getRangeIndices(this.range.start, this.range.stop);
            this.buttonsAddClass(this.range.indices, "active");
        }
    }

    getRangeIndices(start: number, stop: number): number[] {
        return rangeBetween(start, stop);
    }

    addRangeListeners() {
        document.addEventListener("pointerup", this.onRangePointerUpCancel);
        document.addEventListener("pointercancel", this.onRangePointerUpCancel);

        this.node.addEventListener("pointermove", this.onRangePointerMove);
    }

    removeRangeListeners() {
        document.removeEventListener("pointerup", this.onRangePointerUpCancel);
        document.removeEventListener("pointercancel", this.onRangePointerUpCancel);

        this.node.removeEventListener("pointermove", this.onRangePointerMove);
    }

    buttonsRemoveClass(indices: number[], className: string): void {
        DOMUtils.removeClass(this.buttonsFromIndices(indices), className);
    }

    buttonsAddClass(indices: number[], className: string): void {
        DOMUtils.addClass(this.buttonsFromIndices(indices), className);
    }

    buttonsFromIndices(indices: number[]): HTMLDivElement[] {
        return indices.map(index => this.buttons[index].node);
    }

    teardown(): void {
        this.removeListeners();
        this.contentFitter.teardown();
        this.labelFitter?.teardown();
        super.teardown();
    }
}


export class SelectorButton {
    readonly index: number;
    readonly node: HTMLDivElement;
    readonly contentContainer: HTMLDivElement;
    content: HTMLElement
    label?: HTMLSpanElement;

    constructor(index: number, content: HTMLElement | string, label?: string) {
        this.node = DOMUtils.tag("div", ".selector-button");
        const id = DOMUtils.uniqueIdPrefix("selectorButton") + index.toString();
        DOMUtils.setAttrs(this.node, {
            id: id,
            role: "checkbox",
            tabindex: "0",
            "aria-labelledby": id          // setting aria-labelledby to its own content
        });

        this.index = index;
        this.node.dataset.index = index.toString();
        this.contentContainer = DOMUtils.tag("div", ".selector-button-content")
        this.node.append(this.contentContainer);

        if (typeof content === "string") content = span("", content);
        this.content = content;
        this.contentContainer.replaceChildren(content);

        this.content = content;
        if (label) this.setLabel(label);
    }

    setChecked(checked: boolean): void {
        this.node.setAttribute("aria-checked", checked.toString());
    }

    setDisabled(disabled: boolean): void {
        this.node.setAttribute("aria-disabled", disabled.toString());
    }

    isChecked(): boolean {
        return this.node.getAttribute("aria-checked") === "true";
    }

    isDisabled(): boolean {
        return this.node.getAttribute("aria-disabled") === "true";
    }

    updateContent(callback: (current: HTMLElement) => void) {
        callback(this.content);
    }

    setLabel(label: string): void {
        if (!this.label) {
            this.label = DOMUtils.tag("span", ".selector-button-label");
            this.node.append(this.label);
        }

        this.label.textContent = label;
    }

    static getEventTargetIndex(target: EventTarget | null): number | undefined {
        if (!(target instanceof Element)) return;

        const button = target.closest(".selector-button, .selector-button-gap");
        if (!(button instanceof HTMLElement) || !button.classList.contains("selector-button")) return;

        const index = parseInt(button.dataset.index ?? "");
        return isNaN(index) ? undefined : index;
    }
}
