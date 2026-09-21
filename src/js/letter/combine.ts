import {full} from "../utils/array";

export interface StringCombinerConfig {
    regExpFlags?: string;
    separator?: string;
}

export default class StringCombiner {
    n: number;
    templates: Map<RegExp, string>;
    regExpFlags: string;
    separator: string;
    defaultPattern: RegExp;
    defaultTemplate: string;

    constructor(n: number, templates: [(string | RegExp | null)[], string][], config: StringCombinerConfig = {}) {
        this.n = n;
        this.templates = this.processTemplates(templates);
        this.regExpFlags = config.regExpFlags ?? "u";
        this.separator = config.separator ?? "\t";

        this.defaultPattern = this.joinRegExps(new Array(this.n).fill(".*?"));
        this.defaultTemplate = full(this.n, i => templateGroup(i)).join("");
    }

    processTemplates(templates: [(string | RegExp | null)[], string][]): Map<RegExp, string> {
        const result = new Map<RegExp, string>();

        for (const [regexps, template] of templates) {
            result.set(this.joinRegExps(regexps), template);
        }
        return result;
    }

    joinRegExps(regexps: (string | RegExp | null)[]) {
        const pattern = regexps.map(
            (regex, index) => sourceGroup(index, regex)
        ).join(this.separator);
        return new RegExp("^" + pattern + "$", this.regExpFlags);
    }

    joinValues(values: string[]): string {
        return values.join(this.separator);
    }

    combine(values: string[]): string {
        this.validateValues(values);

        const str = this.joinValues(values);
        for (const [regex, template] of this.templates) {
            if (str.match(regex)) return str.replace(regex, template);
        }

        return str.replace(this.defaultPattern, this.defaultTemplate);
    }

    validateValues(values: string[]): void {
        if (!Array.isArray(values) || values.length !== this.n) {
            throw new Error("Invalid input, need string array of length " + this.n);
        }

        for (const value of values) {
            if (value.includes(this.separator)) {
                throw new Error("Value must be string and not contain the combiner's separator string.");
            }
        }
    }
}

export function sourceGroup(index: number, regex: string | RegExp | null): string {
    if (regex == null) regex = ".*?";
    if (typeof regex !== "string") regex = regex.source;
    return `(?<g${index}>${regex})`;
}

export function templateGroup(index: number): string {
    return `$<g${index}>`;
}
