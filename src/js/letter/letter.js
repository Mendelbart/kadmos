import {DOMUtils} from '../utils';

/**
 * @interface Nodeable
 *//**
 * @function Nodeable#getNode
 * @param {Record<string, *>} [config]
 * @returns {HTMLElement}
 *//**
 * @function Nodeable#stringValue
 * @returns {string}
 */

/** @implements Nodeable */
export class Letter {
    /**
     * @param {Nodeable} nodeable
     * @param {string} [form]
     */
    constructor(nodeable, form) {
        this.nodeable = nodeable;
        this.form = form;
    }

    getNode(config) {
        const node = this.nodeable.getNode(config);
        node.classList.add("letter");
        if (this.form) node.dataset.form = this.form;
        return node;
    }

    stringValue() {
        return this.nodeable.stringValue();
    }
}

/**
 * @typedef {{combiner: StringCombiner, values: string[], index: number}} CombineConfig
 */
/** @implements Nodeable */
export class StringLetter {
    /**
     * @param {string} string
     */
    constructor(string) {
        this.string = string;
    }

    /**
     * @param {CombineConfig} [combine]
     * @returns {HTMLElement}
     */
    getNode({combine} = {}) {
        const content = combine ? this.combineSelf(combine) : this.string;
        return DOMUtils.createElement("span.letter-string", content);
    }

    /**
     * @param {CombineConfig} config
     * @returns {string}
     */
    combineSelf(config) {
        const {combiner, values, index} = config;
        return combiner.combine(values.toSpliced(index, 1, this.string));
    }

    stringValue() {
        return this.string;
    }
}

/** @implements Nodeable */
export class ImageLetter {
    /**
     * @param {string} src
     */
    constructor(src) {
        this.src = src;
    }

    /**
     * @returns {HTMLImageElement}
     */
    getNode() {
        const img = new Image();
        img.src = this.src;
        img.classList.add('letter-image');
        return img;
    }

    stringValue() {
        return this.src;
    }
}


/** @implements Nodeable */
export class LetterCombination {
    /**
     * @param {Letter[]} letters
     */
    constructor(letters) {
        this.letters = letters;
    }

    /**
     * @returns {HTMLSpanElement}
     */
    getNode(config) {
        return DOMUtils.createElement("span.letter-combination", ...this.letters.map(letter => letter.getNode(config)));
    }

    stringValue() {
        return this.letters.map(n => n.stringValue()).join("");
    }
}
