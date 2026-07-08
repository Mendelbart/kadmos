import {full} from "../utils/array";

export default class StringCombiner {
    separator = "\t"

    /**
     * @param {number} n
     * @param {Map<(string|RegExp|null)[], string> | [(string|RegExp|null)[], string][]} [templates]
     * @param {string} [regExpFlags]
     */
    constructor(n, templates, regExpFlags = "u") {
        this.n = n;
        this.templates = this.processTemplates(templates);
        this.regExpFlags = regExpFlags;

        this.defaultPattern = this.joinRegExps(new Array(this.n).fill(".*?"));
        this.defaultTemplate = full(this.n, i => this.templateGroup(i)).join("");
    }

    /**
     * @param {Map<(string|RegExp)[], string> | [(string|RegExp|null)[], string][]} templates
     * @returns {Map<RegExp, string>}
     */
    processTemplates(templates) {
        if (Array.isArray(templates)) templates = new Map(templates);

        const result = new Map();
        if (!templates) return result;

        for (const [regexps, template] of templates) {
            result.set(this.joinRegExps(regexps), template);
        }
        return result;
    }

    /**
     * @param {(string | RegExp)[]} regexps
     * @returns RegExp
     */
    joinRegExps(regexps) {
        const pattern = regexps.map(
            (regex, index) => this.sourceGroup(index, regex)
        ).join(this.separator);
        return new RegExp("^" + pattern + "$", this.regExpFlags);
    }

    joinValues(values) {
        return values.join(this.separator);
    }

    /**
     * @param {string} separator
     */
    setSeparator(separator) {
        this.separator = separator;
    }

    /**
     * @param {string[]} values
     * @returns {string}
     */
    combine(values) {
        this.validateValues(values);

        const str = this.joinValues(values);
        for (const [regex, template] of this.templates) {
            if (str.match(regex)) return str.replace(regex, template);
        }

        return str.replace(this.defaultPattern, this.defaultTemplate);
    }

    /**
     * @param {string[]} values
     */
    validateValues(values) {
        if (!Array.isArray(values) || values.length !== this.n) {
            throw new Error("Invalid input, need string array of length " + this.n);
        }

        for (const value of values) {
            if (typeof value !== "string" || value.includes(this.separator)) {
                throw new Error("Value must be string and not contain the combiner's separator string.");
            }
        }
    }

    /**
     * @param {number} index
     * @param {string | RegExp} [regex]
     * @returns {string}
     */
    sourceGroup(index, regex) {
        if (regex == null) regex = ".*?";
        if (typeof regex !== "string") regex = regex.source;
        return `(?<g${index}>${regex})`;
    }

    /**
     * @param {number} index
     * @returns {string}
     */
    templateGroup(index) {
        return `$<g${index}>`;
    }
}
