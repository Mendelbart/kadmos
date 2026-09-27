import StringCombiner from "./combine";
import {span, StylableElement} from "../utils/dom";
import {SchemaDiacriticOverlayConfig} from "../../json/dataset.schema";

export interface Nodeable<E extends StylableElement = StylableElement> {
    getNode(): E,
    stringValue(): string
}

export interface CombineConfig {
    combiner: StringCombiner;
    values: string[];
    index: number;
}

export class StringLetter implements Nodeable<HTMLSpanElement> {
    string: string;

    constructor(string: string) {
        this.string = string;
    }

    getNode(): HTMLSpanElement {
        return span(".letter-string", this.string);
    }

    stringValue() {
        return this.string;
    }
}


export class DiacriticLetter implements Nodeable<HTMLSpanElement> {
    base: string
    diacritic: string
    overlay?: SchemaDiacriticOverlayConfig

    constructor(base: string, diacritic: string, overlay?: SchemaDiacriticOverlayConfig) {
        this.base = base;
        this.diacritic = diacritic;

        if (overlay && diacritic.match(new RegExp(overlay.pattern))) {
            this.overlay = overlay;
        }
    }

    getNode() {
        if (!this.overlay) {
            return span(".letter-string",
                span(".letter-diacritic-base", this.base),
                span(".letter-diacritic", this.diacritic)
            );
        }

        const base = span(".letter-diacritic-base", this.base);
        base.style.setProperty(this.overlay.position, "0");
        return span(".letter-string.diacritic-overlay-container",
            span(".letter-diacritic", this.base + this.diacritic),
            base
        );
    }

    stringValue(): string {
        return this.base + this.diacritic;
    }
}


/**
 * Creates a `span.letter-combination` element containing all letter form nodes as children that have `data-form="{FORM-KEY}"`.
 */
export class LetterFormsCombination implements Nodeable<HTMLSpanElement> {
    letters: [Nodeable, string][]

    constructor(letters: [Nodeable, string][]) {
        this.letters = letters;
    }

    getNode(): HTMLSpanElement {
        return span(".letter-combination", ...this.letters.map(([letter, form]) => {
            const node = letter.getNode();
            node.dataset.form = form;
            node.classList.add("letter");
            return node;
        }));
    }

    stringValue(): string {
        return this.letters.map(n => n[0].stringValue()).join("");
    }
}
