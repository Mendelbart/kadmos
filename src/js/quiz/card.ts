import {DOMUtils, ElementFitter} from "../utils";
import {Keys} from "../utils/object";
import {StylableElement} from "../utils/dom";

export type LabelPosition = "top" | "bottom";
export type CornerLabelPosition = "tl" | "tr" | "bl" | "br";

type Labels = Partial<Record<LabelPosition, HTMLDivElement>>;
type CornerLabels = Partial<Record<CornerLabelPosition, HTMLDivElement>>;


export class Card {
    displayNode: HTMLDivElement;
    node: HTMLDivElement;
    fitter: ElementFitter;
    labels: Labels;
    cornerLabels: CornerLabels;

    constructor() {
        this.displayNode = DOMUtils.tag("div", ".qc-display");
        this.node = DOMUtils.tag("div", ".quiz-card", this.displayNode);

        this.fitter = new ElementFitter();
        this.labels = {};
        this.cornerLabels = {};
    }

    clearDisplay() {
        this.fitter.clearParent(this.displayNode, false);
        this.displayNode.replaceChildren();
    }

    display(node: StylableElement): void {
        this.clearDisplay();
        this.displayNode.replaceChildren(node);
        this.fitter.fit(node);
    }

    setLabel(position: LabelPosition, content: HTMLElement | string) {
        if (typeof content === "string") content = DOMUtils.tag("span", ".qc-label-content", content);

        if (this.labels[position]) {
            this.fitter.clearParent(this.labels[position], false);
            this.labels[position].replaceChildren(content);
        } else {
            this.labels[position] = DOMUtils.tag("div", ".qc-label.qc-label-" + position, content);

            if (position === "top") {
                this.node.prepend(this.labels[position]);
            } else {
                this.node.append(this.labels[position]);
            }
        }

        this.fitter.fit(content);
    }

    setLabels(contents: Partial<Record<LabelPosition, HTMLElement | string>>) {
        for (const position of Object.keys(this.labels) as Keys<Labels>) {
            if (!contents[position]) this.removeLabel(position);
        }
        for (const [position, content] of Object.entries(contents)) {
            if (content) this.setLabel(position as LabelPosition, content);
        }
    }

    /**
     * @param {{tl?: string|Node, tr?: string|Node, bl?: string|Node, br?: string|Node}} contents
     */
    setCornerLabels(contents: Partial<Record<CornerLabelPosition, HTMLElement | string>>) {
        for (const position of Object.keys(this.cornerLabels) as Keys<CornerLabels>) {
            if (!contents[position as CornerLabelPosition]) this.removeCornerLabel(position);
        }
        for (const [position, content] of Object.entries(contents)) {
            this.setCornerLabel(position as CornerLabelPosition, content);
        }
    }

    setCornerLabel(position: CornerLabelPosition, content: string | HTMLElement) {
        if (typeof content === "string") content = DOMUtils.tag("span", ".qc-corner-label-content", content);

        if (this.cornerLabels[position]) {
            this.cornerLabels[position].replaceChildren(content);
            this.node.append(this.cornerLabels[position]);
        } else {
            this.cornerLabels[position] = DOMUtils.tag("div", ".qc-corner-label.qc-corner-" + position, content);
        }
    }

    removeCornerLabel(position: CornerLabelPosition): void {
        this.cornerLabels[position]?.remove();
        delete this.cornerLabels[position];
    }

    removeLabel(position: LabelPosition): void {
        if (!this.labels[position]) return;
        this.fitter.clearParent(this.labels[position], true);
        this.labels[position].remove();
        delete this.labels[position];
    }

    removeLabels(): void {
        for (const position of Object.keys(this.labels) as Keys<Labels>) {
            this.removeLabel(position);
        }
    }

    removeCornerLabels(): void {
        for (const position of Object.keys(this.cornerLabels) as Keys<CornerLabels>) {
            this.removeCornerLabel(position);
        }
    }

    clear() {
        this.clearDisplay();
        this.removeLabels();
        this.removeCornerLabels();
    }

    showLabels() {
        DOMUtils.show(Object.values(this.labels).map(el => el.firstElementChild), "visibility");
        DOMUtils.show(Object.values(this.cornerLabels).map(el => el.firstElementChild));
    }

    hideLabels() {
        DOMUtils.hide(Object.values(this.labels).map(el => el.firstElementChild), "visibility");
        DOMUtils.hide(Object.values(this.cornerLabels).map(el => el.firstElementChild));
    }

    teardown(): void {
        this.fitter.teardown();
    }
}

export type CardDisplayFn<T, C extends {}> = (card: Card, item: T, config: C) => void;
export class CardFactory<T, C extends {}> {
    displayCallback: CardDisplayFn<T, C>;
    config: C;
    setup?: (card: Card) => void;

    constructor(display: CardFactory<T, C> | CardDisplayFn<T, C>, {setup, config}: {setup?: (card: Card) => void, config?: C}) {
        let cf = {};
        if (typeof display === 'function') {
            this.displayCallback = display;
            if (setup) this.setup = setup;
        } else {
            this.displayCallback = display.displayCallback;
            if (setup) {
                this.setup = card => {
                    setup(card);
                    if (display.setup) display.setup(card);
                }
            } else {
                this.setup = display.setup;
            }
            cf = display.config;
        }

        this.config = Object.assign({}, cf, config);
    }

    setConfig(key: keyof C, value: C[keyof C]): void {
        this.config[key] = value;
    }

    display(card: Card, item: T) {
        card.clear();
        this.displayCallback(card, item, this.config);
    }

    createCard(item?: T): Card {
        const card = new Card();
        if (this.setup) this.setup(card);
        if (item) this.display(card, item);
        return card;
    }
}
