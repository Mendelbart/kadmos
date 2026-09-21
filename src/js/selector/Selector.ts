import {invertSubsets, verifyIndexSubsets} from "../utils/indices";
import SelectorBlock, {SelectorContentsUpdateCallback} from "./SelectorBlock";
import {sumCallback} from "../utils/array";
import {DOMUtils, Observable} from "../utils";
import {SchemaSelectorBlockStyle} from "../../json/dataset.schema";

export type SelectorItemCallback<T, V=any> = (item: T, index: number) => V;

export default class Selector<T> extends Observable<[boolean[]]> {
    items: T[];
    subsets: number[][];
    subsetsInverse: [number, number][];
    blocks: SelectorBlock<T>[];
    node: HTMLDivElement;

    constructor(items: T[], subsets: number[][], createBlock: (items: T[], subsetIndex: number) => SelectorBlock<T>) {
        super();
        if (!verifyIndexSubsets(subsets, items.length)) throw new Error("Invalid index subsets.");
        this.items = items;
        this.subsets = subsets;
        this.subsetsInverse = invertSubsets(this.subsets, items.length);

        this.blocks = this.subsets.map((subset, s) => createBlock(subset.map(i => this.items[i]), s));

        this.blocks.forEach(block => block.observers.push(this.callObservers));
        this.node = DOMUtils.tag("div", ".selector", ...this.blocks.map(block => block.node));
    }

    observerArgs(): [boolean[]] {
        return [this.getChecked()];
    }

    private _itemCallback<V>(blockFunc: (block: SelectorBlock<T>, callback: SelectorItemCallback<T,V>) => void, callback: SelectorItemCallback<T>) {
        this.blocks.forEach((block, s) => {
            blockFunc(block, (item, j) => callback(item, this.subsets[s][j]));
        });
    }

    updateButtonContents(callback: SelectorContentsUpdateCallback<T>) {
        this.blocks.forEach((block, s) => {
            block.updateButtonContents((content, item, j) => callback(content, item, this.subsets[s][j]))
        });
    }

    setChecked(callback: SelectorItemCallback<T,boolean>) {
        this._itemCallback<boolean>((b, f) => b.setChecked(f), callback);
    }

    setDisabled(callback: SelectorItemCallback<T,boolean>) {
        this._itemCallback<boolean>((b, f) => b.setDisabled(f), callback);
    }

    getCheckedItems(): T[] {
        return this.items.filter((_, index) => this.isChecked(index));
    }

    getChecked({includeDisabled = false}: {includeDisabled?: boolean} = {}): boolean[] {
        return this.subsetsInverse.map(([s, j]) => this.blocks[s].isChecked(j, includeDisabled));
    }

    getDisabled(): boolean[] {
        return this.subsetsInverse.map(([s, j]) => this.blocks[s].isDisabled(j));
    }

    checkedCount(includeDisabled = false) {
        return sumCallback(this.blocks, block => block.checkedCount(includeDisabled));
    }

    isChecked(index: number): boolean {
        const [s, j] = this.subsetsInverse[index];
        return this.blocks[s].isChecked(j);
    }

    isDisabled(index: number): boolean {
        const [s, j] = this.subsetsInverse[index];
        return this.blocks[s].isDisabled(j);
    }

    applyStyle(style: SchemaSelectorBlockStyle): void {
        this.blocks.forEach(block => block.applyStyle(style));
    }

    teardown(): void {
        this.blocks.forEach(block => block.teardown());
        super.teardown();
    }

    replaceWith(selector: Selector<any>): void {
        if (this.node) {
            if (selector.node) {
                this.node.replaceWith(selector.node);
            } else {
                this.node.remove();
            }
        }
        this.teardown();
    }
}
