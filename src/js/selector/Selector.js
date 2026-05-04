import {invertSubsets, verifyIndexSubsets} from "../utils/indices";
import SelectorBlock from "./SelectorBlock";
import {range, sum} from "../utils/array";
import {DOMUtils, Observable} from "../utils";

export default class Selector extends Observable {
    /**
     * @template T
     * @param {T[]} items
     * @param {number[][]} subsets
     * @param {function(T[], number): SelectorBlock} [createBlockCallback] Default: `(items, subsetIndex) => new SelectorBlock(items)`
     */
    constructor(items, subsets, createBlockCallback) {
        super();
        if (!verifyIndexSubsets(subsets, items.length)) throw new Error("Invalid index subsets.");
        this.items = items;
        this.subsets = subsets;
        this.subsetsInverse = invertSubsets(this.subsets, items.length);

        /** @type {SelectorBlock[]} */
        this.blocks = this.subsets.map((subset, s) => {
            const items = subset.map(i => this.items[i]);
            return createBlockCallback ? createBlockCallback(items, s) : new SelectorBlock(items);
        });

        this.blocks.forEach(block => block.observers.push(this.callObservers));
    }

    observerArgs() {
        return [this.getChecked()];
    }

    /**
     * @param {function(SelectorBlock, function)} blockFunc
     * @param callback
     * @private
     */
    _buttonCallback(blockFunc, callback) {
        this.blocks.forEach((block, s) => {
            blockFunc(block, (button, item, j) => callback(button, item, this.subsets[s][j]));
        });
    }

    /**
     * @param {function(SelectorBlock, function)} blockFunc
     * @param {function} callback
     * @private
     */
    _itemCallback(blockFunc, callback) {
        this.blocks.forEach((block, s) => {
            blockFunc(block, (item, j) => callback(item, this.subsets[s][j]));
        });
    }

    /**
     * @param {function(any, number): HTMLElement} callback
     */
    setupButtonContents(callback) {
        this._itemCallback((b, f) => b.setupButtonContents(f), callback)
    }

    _setupNode() {
        this.node = DOMUtils.createElement("div.selector", ...this.blocks.map(block => block.node));
    }

    finishSetup() {
        this.blocks.forEach(block => block.finishSetup());
        this._setupNode();
    }

    /**
     * @param {function(HTMLElement, any, number): void} callback
     */
    updateButtonContents(callback) {
        this._buttonCallback((b, f) => b.updateButtonContents(f), callback);
    }

    /**
     * @param {function(any, number): void} callback
     */
    labelButtons(callback) {
        this._itemCallback((b, f) => b.labelButtons(f), callback);
    }

    /**
     * @param {function(any, number): boolean} callback
     */
    setChecked(callback) {
        this._itemCallback((b, f) => b.setChecked(f), callback);
    }


    /**
     * @param {function(any, number): boolean} callback
     */
    setDisabled(callback) {
        this._itemCallback((b, f) => b.setDisabled(f), callback);
    }

    /**
     * @returns {any[]}
     */
    getCheckedItems() {
        return [].concat(...this.blocks.map(block => block.getCheckedItems()));
    }

    /**
     * @param {boolean} [includeDisabled=false]
     * @returns {boolean[]}
     */
    getChecked({includeDisabled = false} = {}) {
        const blocksChecked = this.blocks.map(block => block.getChecked(includeDisabled));
        return range(this.items.length).map(i => {
            const [s, j] = this.subsetsInverse[i];
            return blocksChecked[s][j];
        });
    }

    checkedCount(includeDisabled = false) {
        return sum(this.blocks.map(block => block.checkedCount(includeDisabled)));
    }

    getDisabled() {
        const blocksDisabled = this.blocks.map(block => block.getDisabled());
        return range(this.items.length).map(i => {
            const [s, j] = this.subsetsInverse[i];
            return blocksDisabled[s][j];
        });
    }

    /**
     * @param {number} index
     * @returns {boolean}
     */
    isChecked(index) {
        const [s, j] = this.subsetsInverse[index];
        return this.blocks[s].isChecked(j);
    }

    /**
     * @param {number} index
     * @returns {boolean}
     */
    isDisabled(index) {
        const [s, j] = this.subsetsInverse[index];
        return this.blocks[s].isDisabled(j);
    }

    /**
     * @param {Record<string,string>} style
     */
    applyStyle(style) {
        this.blocks.forEach(block => block.applyStyle(style));
    }

    teardown() {
        this.blocks.forEach(block => block.teardown());
    }

    /**
     * @param {Selector} selector
     */
    replaceWith(selector) {
        this.node.replaceWith(selector.node);
        this.teardown();
    }
}
