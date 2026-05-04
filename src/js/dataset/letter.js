import {DOMUtils} from '../utils';

/**
 * @interface CardContent
 *//**
 * @function CardContent#getNode
 * @param {Record<string, *>} [config]
 * @returns HTMLElement
 */

/** @implements CardContent */
export class Letter {
    /**
     * @param {any} data
     * @param {string | number} key
     * @param {string} [form]
     */
    constructor(data, key, form) {
        this.data = data;
        this.key = key;
        this.form = form;
    }

    getNode(config) {
        throw new Error('Not implemented');
    }
}

/**
 * @typedef {{combiner: StringCombiner, values: string[], index: number}} CombineConfig
 */


export class StringLetter extends Letter {
    /**
     * @param {CombineConfig} [combine]
     * @returns {HTMLElement}
     */
    getNode({combine} = {}) {
        const content = combine ? this.combineSelf(combine) : this.data;
        const node = DOMUtils.createElement("span.letter.letter-string", content);
        if (this.form) node.dataset.form = this.form;
        return node;
    }

    /**
     * @param {CombineConfig} config
     * @returns {string}
     */
    combineSelf(config) {
        const {combiner, values, index} = config;
        return combiner.combine(values.toSpliced(index, 1, this.data));
    }
}


export class ImageLetter extends Letter {
    /**
     * @returns {HTMLImageElement}
     */
    getNode() {
        const img = new Image();
        img.src = this.data;
        img.classList.add('letter', 'letter-image');
        return img;
    }
}


/** @implements CardContent */
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
    getNode(...args) {
        return DOMUtils.createElement("span.letter-combination", ...this.letters.map(letter => letter.getNode(...args)));
    }
}
