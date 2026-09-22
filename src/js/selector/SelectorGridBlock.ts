import SelectorBlock, {SelectorButtonCallbacks} from "./SelectorBlock";
import {DOMUtils, ElementFitter, Matrix} from '../utils';
import {cumSums, rangeBetween, sumCallback} from "../utils/array";
import {matrixIndices} from "../utils/indices";
import {SchemaGridRangeMode} from "../../json/dataset.schema";

export type LabelPosition = "rowstart" | "rowend" | "columnstart" | "columnend";

export interface GridLabelConfig {
    position?: "start" | "end" | "both",
    spans?: number[]
}

export default class SelectorGridBlock<T> extends SelectorBlock<T> {
    grid: Matrix<number | null>;
    elements: Matrix<HTMLElement | null>;
    labelPositions: Set<LabelPosition>;
    gridLabelFitter: ElementFitter;
    rangeMode: SchemaGridRangeMode;
    gridLabelActiveIndices?: number[] | null;

    constructor(items: T[], callbacks: SelectorButtonCallbacks<T>, layout: Matrix<boolean>, fillDirection: "rows" | "columns" = "rows") {
        super(items, callbacks);

        this.grid = this.getGrid(layout, fillDirection);
        this.elements = this.getGridElements();
        this.labelPositions = new Set();
        this.rangeMode = "grid";
        this.gridLabelFitter = new ElementFitter({uniformFactor: 1.1});
        
        this.node.classList.add("selector-block-grid");
        this.updateNodeElements();
    }

    updateNodeElements() {
        this.node.replaceChildren(...this.elements.values().filter(x => x != null));
        this.setGridTemplateColumns();
    }

    private createGap(type: "button" | "label"): HTMLSpanElement {
        return DOMUtils.tag("span", `.selector-${type}-gap`);
    }

    getGrid(layout: Matrix<boolean>, fillDirection: "rows" | "columns" = "rows"): Matrix<number | null> {
        const n = layout.n;
        const m = layout.m;

        const numCovered = sumCallback(layout.values(), x => x ? 1 : 0);
        if (numCovered !== this.items.length) {
            throw Error(`Number of covered cells ${numCovered} doesn't match number of items ${this.items.length}.`);
        }

        const grid = Matrix.full<number | null>(n, m, () => null);

        let index = 0;
        const entries = fillDirection === "rows" ? layout.entries() : layout.entriesColumnsFirst();
        for (const [[i, j], isCovered] of entries) {
            grid.set(i, j, isCovered ? index : null);
            if (isCovered) index++;
        }

        return grid;
    }

    getGridElements(): Matrix<HTMLElement> {
        const elements: Matrix<HTMLElement> = this.grid.map(index => index == null ? this.createGap("button") : this.buttons[index].node);
        elements.forEach((element, i, j) => {
            element.dataset.gridIndex = elements.getIndex(i, j).toString();
        });
        return elements;
    }

    setGridLabels(type: "row" | "column", contents: (string | null)[], {position = "start", spans}: GridLabelConfig = {}) {
        if (position === "both") {
            this.setGridLabels(type, contents, {position: "start", spans: spans});
            this.setGridLabels(type, contents, {position: "end", spans: spans});
            return;
        }

        const labelCount = type === "row" ? this.grid.n : this.grid.m;
        spans ??= new Array(contents.length).fill(1);
        const indices = [0, ...cumSums(spans)];
        const labels = contents.map((content, i) => {
            return content ? this.createGridLabel(type, content, indices[i], spans[i]) : this.createGap("label");
        });

        let i = 0;
        for (const span of spans) {
            if (span > 1) labels.splice(i + 1, 0, ...(new Array(span - 1).fill(null)));
            i += span;
        }

        if (labels.length !== labelCount) {
            throw new Error(`Number of labels ${labels.length} and rows/columns ${labelCount} don't match.`);
        }

        const otherType = type === "row" ? "column" : "row";
        if (this.labelPositions.has(otherType + "start" as LabelPosition)) {
            labels.splice(0, 0, this.createGap("label"));
        }
        if (this.labelPositions.has(otherType + "end" as LabelPosition)) {
            labels.push(this.createGap("label"));
        }

        const pos = type + position as LabelPosition;
        const deleteCount = this.labelPositions.has(pos) ? 1 : 0;
        let spliced: (HTMLSpanElement | null)[];
        if (type === "row") {
            spliced = this.elements.spliceColumn(position === "end" ? this.elements.m : 0, deleteCount, labels);
        } else {
            spliced = this.elements.spliceRow(position === "end" ? this.elements.n : 0, deleteCount, labels);
        }

        this.labelPositions.add(pos);
        this.gridLabelFitter.unfit(...this.getLabelContents(spliced));
        this.gridLabelFitter.fit(...this.getLabelContents(labels));

        this.updateNodeElements();
    }

    getLabelContents(labels: (HTMLSpanElement | null)[]) {
        return labels
            .filter(x => x != null)
            .map(label => label.querySelector("span"))
            .filter(x => x != null);
    }

    createGridLabel(type: "row" | "column", content: string, index: number, span: number = 1): HTMLSpanElement {
        const element = DOMUtils.tag("span", `.grid-label.grid-${type}-label`);
        element.setAttribute("tabindex", "0");
        element.append(DOMUtils.tag("span", ".grid-label-content", content));
        element.dataset[type] = index.toString();

        if (span !== 1) {
            element.dataset.span = span.toString();
            element.style.setProperty("grid-" + type, "span " + span);
        }

        return element;
    }

    setGridTemplateColumns(): void {
        let value = `repeat(${this.grid.m}, minmax(var(--button-min-width), var(--button-max-width)))`;
        if (this.labelPositions.has("rowstart")) value = "auto " + value;
        if (this.labelPositions.has("rowend")) value += " auto";

        this.node.style.setProperty("grid-template-columns", value);
    }

    rangeTargetIndex(target: EventTarget): number | undefined {
        if (!(target instanceof Element)) return;

        const el = target.closest(".selector-button, .selector-button-gap");
        if (!el || !(el instanceof HTMLElement)) return;
        const index = parseInt(el.dataset.gridIndex ?? "");

        return isNaN(index) ? undefined : index;
    }

    setRangeMode(mode: SchemaGridRangeMode): void {
        this.rangeMode = mode;
    }

    getRangeIndices(start: number, stop: number): number[] {
        return this.getGridRangeIndices(start, stop)
            .map(index => this.grid.getFromIndex(index))
            .filter(x => x != null);
    }

    getGridRangeIndices(start: number, stop: number): number[] {
        switch (this.rangeMode) {
            case "walkRows":
                return rangeBetween(start, stop);
            case "walkColumns":
                return rangeBetween(
                    this.grid.rowToColumnMajor(start), this.grid.rowToColumnMajor(stop)
                ).map(x => this.grid.columnToRowMajor(x));
            case "grid":
                const [startRow, startColumn] = this.grid.getCartesian(start);
                const [stopRow, stopColumn] = this.grid.getCartesian(stop);
                return matrixIndices(
                    rangeBetween(startRow, stopRow),
                    rangeBetween(startColumn, stopColumn)
                ).map(([i, j]) => this.grid.getIndex(i, j));
            default:
                throw new Error("Invalid range mode.");
        }
    }

    bindListeners() {
        super.bindListeners();

        this.onLabelClick = this.onLabelClick.bind(this);
        this.onLabelPointerOverOut = this.onLabelPointerOverOut.bind(this);
        this.onLabelPointerUpCancel = this.onLabelPointerUpCancel.bind(this);
        this.onLabelPointerDown = this.onLabelPointerDown.bind(this);
    }

    setupListeners() {
        super.setupListeners();

        this.node.addEventListener("click", this.onLabelClick);
        this.node.addEventListener("keypress", this.onLabelClick);
        this.node.addEventListener("pointerover", this.onLabelPointerOverOut);
        this.node.addEventListener("pointerout", this.onLabelPointerOverOut);
        this.node.addEventListener("pointerdown", this.onLabelPointerDown);
    }

    removeListeners() {
        super.removeListeners();

        this.node.removeEventListener("click", this.onLabelClick);
        this.node.removeEventListener("keypress", this.onLabelClick);
        this.node.removeEventListener("pointerover", this.onLabelPointerOverOut);
        this.node.removeEventListener("pointerout", this.onLabelPointerOverOut);
        this.node.removeEventListener("pointerdown", this.onLabelPointerDown);

        this.removeDocumentLabelListeners();
    }

    getIndicesFromLabelEvent(event: Event): number[] | undefined {
        if (!(event.target instanceof Element)) return;
        const element = event.target.closest(".grid-label");
        if (!(element instanceof HTMLElement)) return;

        const isRowLabel = element.classList.contains("grid-row-label");
        const callback = isRowLabel ? this.grid.getRow.bind(this.grid) : this.grid.getColumn.bind(this.grid);
        const index = isRowLabel ? parseInt(element.dataset.row as string) : parseInt(element.dataset.column as string);
        const indices = callback(index);

        const span = parseInt(element.dataset.span ?? "");
        if (!isNaN(span)) for (let i = 1; i < span; i++) {
            indices.push(...callback(index + i));
        }

        return indices.filter(x => x != null);
    }

    onLabelClick(event: PointerEvent | KeyboardEvent): void {
        if (event.type === "keydown" && (event as KeyboardEvent).key !== "Enter") return;

        const indices = this.getIndicesFromLabelEvent(event);
        if (indices) this.toggleItems(indices);
    }

    onLabelPointerOverOut(event: PointerEvent): void {
        const indices = this.getIndicesFromLabelEvent(event);
        if (!indices) return;

        if (event.type === "pointerover") {
            this.buttonsAddClass(indices, "hover");
        } else {
            this.buttonsRemoveClass(indices, "hover");
        }
    }

    onLabelPointerDown(event: PointerEvent): void {
        const indices = this.getIndicesFromLabelEvent(event);
        if (!indices) return;

        this.buttonsAddClass(indices, "active");
        this.gridLabelActiveIndices = indices;

        this.addDocumentLabelListeners();
    }

    onLabelPointerUpCancel(): void {
        const indices = this.gridLabelActiveIndices;
        if (indices) this.buttonsRemoveClass(indices, "active");

        this.gridLabelActiveIndices = null;
        this.removeDocumentLabelListeners();
    }

    addDocumentLabelListeners(): void {
        document.addEventListener("pointerup", this.onLabelPointerUpCancel, {once: true});
        document.addEventListener("pointercancel", this.onLabelPointerUpCancel, {once: true});
    }

    removeDocumentLabelListeners(): void {
        document.removeEventListener("pointerup", this.onLabelPointerUpCancel);
        document.removeEventListener("pointercancel", this.onLabelPointerUpCancel);
    }
}
