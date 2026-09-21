import {DOMUtils} from '../utils';
import StringCombiner from "./combine";
import {StylableElement} from "../utils/dom";

export interface Nodeable<E extends StylableElement, C extends any[] = []> {
    getNode(...args: C): E,
    stringValue(): string
}

export interface CombineConfig {
    combiner: StringCombiner;
    values: string[];
    index: number;
}

export interface StringLetterConfig {
    combine?: CombineConfig;
}

export class StringLetter implements Nodeable<HTMLSpanElement, [StringLetterConfig]> {
    string: string;

    constructor(string: string) {
        this.string = string;
    }

    getNode({combine}: StringLetterConfig = {}): HTMLSpanElement {
        const content = combine ? this.combineSelf(combine) : this.string;
        return DOMUtils.tag("span", ".letter-string", content);
    }

    combineSelf(config: CombineConfig): string {
        const {combiner, values, index} = config;
        const filledValues = values.slice();
        filledValues.splice(index, 0, this.string);
        return combiner.combine(filledValues);
    }

    stringValue() {
        return this.string;
    }
}


/**
 * Creates a `span.letter-combination` element containing all letter form nodes as children that have `data-form="{FORM-KEY}"`.
 */
export class LetterFormsCombination<T extends Nodeable<StylableElement, C>, C extends any[]> implements Nodeable<HTMLSpanElement, C> {
    letters: [T, string][]

    constructor(letters: [T, string][]) {
        this.letters = letters;
    }

    getNode(...args: C): HTMLSpanElement {
        return DOMUtils.tag("span", ".letter-combination", ...this.letters.map(([letter, form]) => {
            const node = letter.getNode(...args);
            node.dataset.form = form;
            node.classList.add("letter");
            return node;
        }));
    }

    stringValue(): string {
        return this.letters.map(n => n[0].stringValue()).join("");
    }
}
