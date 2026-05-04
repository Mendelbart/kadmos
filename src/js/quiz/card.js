import {DOMUtils, ElementFitter} from "../utils";

export const Corners = Object.freeze({
    TOP_RIGHT: "tr",
    TOP_LEFT: "tl",
    BOTTOM_RIGHT: "br",
    BOTTOM_LEFT: "bl"
});


export class Card {
    constructor() {
        this.displayNode = DOMUtils.createElement("div.qc-display");
        this.node = DOMUtils.createElement("div.quiz-card", this.displayNode);

        this.fitter = new ElementFitter();
        /** @type {Record<string, HTMLDivElement>} */
        this.labels = {};
        /** @type {Record<string, HTMLDivElement>} */
        this.cornerLabels = {};
    }

    clearDisplay() {
        this.fitter.clearParent(this.displayNode, false);
        this.displayNode.replaceChildren();
    }

    /**
     * @param {Node} node
     */
    display(node) {
        this.clearDisplay();
        this.displayNode.replaceChildren(node);
        this.fitter.fit(node);
    }

    /**
     * @param {"top" | "bottom"} position
     * @param {HTMLElement | string} content
     */
    setLabel(position, content) {
        if (typeof content === "string") content = DOMUtils.createElement("span.qc-label-content", content);

        if (this.labels[position]) {
            this.fitter.clearParent(this.labels[position], false);
            this.labels[position].replaceChildren(content);
        } else {
            this.labels[position] = DOMUtils.createElement("div.qc-label.qc-label-" + position, content);

            if (position === "top") {
                this.node.prepend(this.labels[position]);
            } else {
                this.node.append(this.labels[position]);
            }
        }

        this.fitter.fit(content);
    }

    /**
     * @param {{top?: string|HTMLElement, bottom?: string|HTMLElement}} contents
     */
    setLabels(contents) {
        for (const position of Object.keys(this.labels)) {
            if (!contents[position]) this.removeLabel(position);
        }
        for (const [position, content] of Object.entries(contents)) {
            this.setLabel(position, content);
        }
    }

    /**
     * @param {{tl?: string|Node, tr?: string|Node, bl?: string|Node, br?: string|Node}} contents
     */
    setCornerLabels(contents) {
        for (const position of Object.keys(this.labels)) {
            if (!contents[position]) this.removeCornerLabel(position);
        }
        for (const [position, content] of Object.entries(contents)) {
            this.setCornerLabel(position, content);
        }
    }

    /**
     * @param {"tl"|"tr"|"bl"|"br"} position
     * @param {string | Node} content
     */
    setCornerLabel(position, content) {
        if (typeof content === "string") content = DOMUtils.createElement("span.qc-corner-label-content", content);

        if (this.cornerLabels[position]) {
            this.cornerLabels[position].replaceChildren(content);
            this.node.append(this.cornerLabels[position]);
        } else {
            this.cornerLabels[position] = DOMUtils.createElement("div.qc-corner-label.qc-corner-" + position, content);
        }
    }

    removeCornerLabel(position) {
        this.cornerLabels[position].remove();
        delete this.cornerLabels[position];
    }

    removeLabel(position) {
        this.fitter.clearParent(this.labels[position], true);
        this.labels[position].remove();
        delete this.labels[position];
    }

    removeLabels() {
        for (const position of Object.keys(this.labels)) {
            this.removeLabel(position);
        }
    }

    removeCornerLabels() {
        for (const position of Object.keys(this.cornerLabels)) {
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

    teardown() {
        this.fitter.teardown();
    }
}


export class CardFactory {
    /**
     * @param {CardFactory | function(Card, QuizItem, Record<string, *>)} display
     * @param {function(Card): void} [setup]
     */
    constructor(display, setup) {
        if (typeof display === 'function') {
            this.displayCallback = display;
            if (setup) this.setup = setup;
        } else {
            this.displayCallback = display.displayCallback;
            if (setup) {
                this.setup = card => {
                    setup(card);
                    display.setup(card);
                }
            } else {
                this.setup = display.setup;
            }
        }

        this.config = {};
    }

    /**
     * @param {string} key
     * @param {any} value
     */
    setConfig(key, value) {
        this.config[key] = value;
    }

    /**
     * @param {string} key
     */
    removeConfig(key) {
        delete this.config[key];
    }

    /**
     * @param {Card} card
     * @param {QuizItem} item
     */
    display(card, item) {
        card.clear();
        this.displayCallback(card, item, this.config);
    }

    /**
     * @param {QuizItem} [item]
     * @returns Card
     */
    createCard(item) {
        const card = new Card();
        if (this.setup) this.setup(card);
        if (item) this.display(card, item);
        return card;
    }
}
