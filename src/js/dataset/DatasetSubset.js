import {Matrix, ObjectUtils, ParametricValue} from "../utils";
import {range} from "../utils/array";
import {DefaultListSplitter, QuizAnswerFactory} from "../quiz/answer";
import {LetterCombination, Letter, createNodeable} from "../letter";
import {Selector, SelectorBlock, SelectorGridBlock} from "../selector";
import {completeIndexSubsets, containsDuplicates, parseMatrixRanges, parseRanges} from "../utils/indices";
import {ButtonGroup, ValueElement, SettingCollection} from "../settings";
import QuizItem from '../quiz/QuizItem';


export const DEFAULT_FORM_KEY = "0";
const DEFAULT_FORMS = {
    data: {},
    exclusive: false
};
DEFAULT_FORMS.data[DEFAULT_FORM_KEY] = "Default";



export default class DatasetSubset {
    /**
     * @param key
     * @param label
     * @param properties
     * @param items
     * @param selector
     * @param [forms]
     * @param [variants]
     * @param [letterType]
     */
    constructor(key, {label, forms, properties, items, selector, variants, letterType = "string"}) {
        this.key = key;
        this.label = label;
        this.forms = this.processForms(forms);
        this.properties = this.processProperties(properties);
        this.variants = variants;
        this.letterType = letterType;

        this.items = this.processItems(items);
        /** @type {Record<string, Map<*, number>>} */
        this.itemIndexMaps = {};

        this.processVariantIndices();

        this.selectorData = this.processSelectorData(selector);
    }

    processSelectorData(selectorData) {
        selectorData ??= {};
        selectorData.blocks ??= [selectorData.block ?? {}];
        delete selectorData.block;

        for (const block of selectorData.blocks) {
            if (block.letters) {
                block.indices = this.getLetterIndices(block.letters, selectorData.defaultLetterKey);
            }
        }

        return selectorData;
    }

    processForms(forms) {
        forms ??= DEFAULT_FORMS;
        for (const [key, form] of Object.entries(forms.data)) {
            if (typeof form === "string") {
                forms.data[key] = {label: form};
            }
        }
        return forms;
    }

    processProperties(properties) {
        for (const data of Object.values(properties)) {
            data.factory = QuizAnswerFactory(data.config);
        }
        return properties;
    }

    processVariantIndices() {
        if (!this.variants) return;

        for (const [key, value] of Object.entries(this.variants.data)) {
            if (this.variants.useKeyAsLang) value.lang ??= key;

            if (value.letters) {
                value.indices = this.getLetterIndices(value.letters, this.variants.defaultLetterKey);
                value.includesItem = new Array(this.items.length).fill(false);
                for (const index of value.indices) {
                    value.includesItem[index] = true;
                }
            } else {
                value.indices = range(this.items.length);
                value.includesItem = new Array(this.items.length).fill(true);
            }
        }
    }

    /**
     * @param {string[]} properties
     * @param {any[][]} data
     * @returns {DatasetItem[]}
     */
    processItems({properties, data}) {
        const propParams = properties.map(key => {
            const [prop, params] = processPropKey(key);
            if (!(prop in this.properties)) throw new Error("Unknown property " + prop);
            return [prop, params];
        });

        return data.map(([forms, propValues]) => new DatasetItem(
            this.processLetterForms(forms),
            this.processItemProperties(propParams, propValues)
        ));
    }

    /**
     * @param {[string, Record<string, string[]>][]} propParams
     * @param {(string|Record<string, *>)[]} values
     * @returns {Record<string, ParametricValue>}
     */
    processItemProperties(propParams, values) {
        const paramKeys = ["variant", "language"];
        const result = ObjectUtils.map(this.properties, () => new ParametricValue(paramKeys));

        if (typeof values === "string") values = [values];

        for (const [index, [prop, params]] of propParams.entries()) {
            if (index >= values.length) break;
            extendPropertyValue(result[prop], params, values[index]);
        }

        return result;
    }

    /**
     * @param {string|string[]|Record<string,string>} display
     * @returns {Record<string, string>}
     */
    standardizeLetterForms(display) {
        if (typeof display === "string") {
            if (Object.keys(this.forms.data).length === 1) {
                display = [display];
            } else {
                display = display.split("");
            }
        }

        if (Array.isArray(display)) {
            const formKeys = Object.keys(this.forms.data);
            display = Object.fromEntries(
                display
                    .map((str, index) => [formKeys[index], str])
                    .filter(([_, str]) => str != null)
            );
        }

        if (typeof display !== "object") {
            throw new Error("Invalid display format: need array or object.");
        }

        return ObjectUtils.onlyKeys(display, Object.keys(this.forms.data), true);
    }

    /**
     * @param {any} display
     * @returns {Record<string, Nodeable>}
     */
    processLetterForms(display) {
        display = this.standardizeLetterForms(display);
        return ObjectUtils.map(display, str => createNodeable(this.letterType, str));
    }

    hasSetting(key) {
        switch (key) {
            case "variant":
                return this.variants != null
            case "properties":
                return Object.keys(this.properties).length > 1;
            case "forms":
                return Object.keys(this.ungroupedForms()).length > 1;
            default:
                throw new Error(`Invalid settings key ${key}.`);
        }
    }

    /**
     * @param {string} form
     * @returns {boolean}
     */
    hasCombine(form) {
        if (!this.forms.exclusive) return false;
        return !!this.forms.data[form].combine;
    }

    /**
     * @param variant
     * @returns {string | null}
     */
    getLang(variant) {
        if (this.variants && variant) {
            if ("lang" in this.variants.data[variant]) return this.variants.data[variant].lang;
            if (this.variants.useKeyAsLang) return variant;
        }
        return null;
    }

    /**
     * @param {string | Record<string,string>} which
     * @param {string} [defaultKey]
     * @returns {number[]}
     */
    getLetterIndices(which, defaultKey = "i1") {
        let result;
        if (typeof which === "string") {
            result = parseRanges(which, x => this.getLetterIndex(defaultKey, x));
        } else {
            result = Object.entries(which)
                .map(([key, ranges]) => parseRanges(
                    ranges, x => this.getLetterIndex(key, x)
                ))
                .flat();
        }

        if (containsDuplicates(result)) {
            console.warn("Indices contain duplicates");
            return Array.from(new Set(result));
        }

        return result;
    }

    /**
     * @param {string} key
     * @param {string | number} value
     * @returns {number}
     */
    getLetterIndex(key, value) {
        if (key === "i0" || key === "i1") {
            value = parseInt(value);
            return key === "i1" ? value - 1 : value;
        }

        let mapKey;

        if (key.substring(0, 5) === "prop:") {
            let [prop, params] = processPropKey(key.substring(5));
            params = toSingleParams(params);
            mapKey = "prop:" + createSinglePropKey(prop, params);
            this.itemIndexMaps[mapKey] ??= this.createPropertyIndexMap(prop, params);
        } else if (key === "form" || key.substring(0, 5) === "form:") {
            const formKey = key === "form" ? Object.keys(this.forms.data)[0] : key.substring(5);
            mapKey = "form:" + formKey;
            this.itemIndexMaps[mapKey] ??= this.createFormIndexMap(formKey);
        } else {
            throw new Error(`Invalid key ${key}.`);
        }

        if (!this.itemIndexMaps[mapKey].has(value)) {
            console.log(this.itemIndexMaps[mapKey]);
            throw new Error(`Couldn't find value ${value} with key ${mapKey}.`);
        }

        return this.itemIndexMaps[mapKey].get(value);
    }

    /**
     * @param {string} property
     * @param {Record<string, string>} params
     * @returns {Map<string|number, number>}
     */
    createPropertyIndexMap(property, params) {
        const splitter = this.getPropertySplitter(property);
        return new Map(this.items.map((item, index) => [
            item.getProperty({
                property: property,
                splitter: splitter,
                params: params
            }),
            index
        ]));
    }

    /**
     * @param {string} formKey
     * @returns {Map<string, number>}
     */
    createFormIndexMap(formKey) {
        return new Map(this.items.map(
            (item, index) => [item.forms[formKey].stringValue(), index]
        ));
    }

    /**
     * @param property
     * @returns {RegExp | null}
     */
    getPropertySplitter(property) {
        let config = this.properties[property].config;
        let regex = "";
        while (config.type === "list") {
            const splitter = config.properties?.splitter ?? DefaultListSplitter;
            if (regex.length > 0) regex += "|";
            regex += splitter;
            config = config.items;
        }
        return regex ? new RegExp(regex, "g") : null;
    }

    ungroupedForms() {
        return ObjectUtils.filter(this.forms.data, f => !("groupWith" in f));
    }

    /**
     * @param {number} index
     * @param {string} [variant]
     * @return
     */
    isItemIncluded(index, variant) {
        return !variant || this.variants.data[variant].includesItem[index];
    }

    getSelectorSettings(checked = {}) {
        const settings = {};
        if (this.variants) {
            settings.variant = this.variantSetting(checked.variant);
        }
        if (this.hasSetting("forms")) {
            settings.forms = this.formsSetting(checked.forms);
        }
        return SettingCollection.createFrom(settings);
    }

    /**
     * @param {Record<string, boolean>} [checked]
     * @returns {ButtonGroup}
     */
    propertySetting(checked) {
        return ButtonGroup.from(
            ObjectUtils.map(this.properties, p => p.label),
            {
                label: "Properties",
                checked: checked ?? ObjectUtils.map(this.properties, p => !!p.active)
            }
        );
    }


    /**
     * @param {string[]} [checked]
     * @returns {ButtonGroup}
     */
    formsSetting(checked) {
        const label = this.forms.label;
        const ungroupedForms = this.ungroupedForms();
        let defaultChecked = Object.keys(ungroupedForms);
        if (this.forms.exclusive) defaultChecked = defaultChecked[0];
        return ButtonGroup.from(
            ObjectUtils.map(ungroupedForms, (p) => p.label),
            {
                label: label,
                exclusive: this.forms.exclusive,
                checked: checked ?? defaultChecked,
            },
        );
    }

    /**
     * @param {string} [selected]
     * @returns {Setting}
     */
    variantSetting(selected) {
        const data = ObjectUtils.map(this.variants.data, (variant) => variant.label);
        selected ||=  this.variants.default || Object.keys(this.variants.data)[0];
        const label = this.variants.setting?.label || "Variant";

        if (this.variants.setting?.type === "buttonGroup") {
            return ButtonGroup.from(data, {
                label: label,
                exclusive: true,
                checked: selected
            });
        } else {
            const groups = this.variants.groups ? Object.values(this.variants.groups) : []
            return ValueElement.createSelect(data, {
                label: label,
                selected: selected,
                groups: groups
            });
        }
    }


    // ==================================== SELECTOR ================
    /**
     * @param {SelectorGridBlock} block
     * @param {[number, number]} dimensions
     * @param {string} gaps
     * @param {"rows" | "columns"} [fillDirection="rows"]
     */
    setupSelectorGrid(block, {dimensions, gaps, fillDirection = "rows"} = {}) {
        const covered = new Matrix(...dimensions).fill(true);
        for (const [i, j] of parseMatrixRanges(gaps, x => parseInt(x) - 1)) {
            covered.set(i, j, false);
        }
        block.generateGrid(covered, fillDirection);
    }

    /**
     * @param {SelectorGridBlock} block
     * @param {string} type
     * @param {string | string[]} labels
     * @param {Record<string, *>} config
     */
    setupGridLabels(block, type, labels, config) {
        if (typeof labels === "string") {
            labels = labels.split("");
        }
        block.setGridLabels(type, labels, config);
    }

    /**
     * @returns {Selector}
     */
    createSelector() {
        const subsets = completeIndexSubsets(this.selectorData.blocks.map(block => block.indices), this.items.length);

        return new Selector(this.items, subsets, (items, b) => {
            const data = this.selectorData.blocks[b];
            if (data.grid) {
                const block = new SelectorGridBlock(items);

                this.setupSelectorGrid(block, data);
                if (data.rowLabels) this.setupGridLabels(block, "row", data.rowLabels, {position: data.rowLabelPosition, spans: data.rowLabelSpans});
                if (data.columnLabels) this.setupGridLabels(block, "column", data.columnLabels, {position: data.columnLabelPosition, spans: data.columnLabelSpans});

                if (data.rangeMode) block.setRangeMode(data.rangeMode);

                return block;
            } else {
                return new SelectorBlock(items);
            }
        });
    }

    getSelectorBlockStyles() {
        const baseStyle = this.selectorData.style ?? {};
        return this.selectorData.blocks.map(block => Object.assign(baseStyle, block.style));
    }


    /**
     * @param {string[] | string} [value]
     * @returns {string[]}
     */
    getFormKeysFromGrouped(value) {
        if (!value) return Object.keys(this.forms.data);

        if (typeof value === "string") {
            value = [value];
        }

        const keys = value.slice();

        for (const [key, form] of Object.entries(this.forms.data)) {
            if ("groupWith" in form && value.includes(form.groupWith)) {
                const index = keys.indexOf(form.groupWith);
                if (index !== -1) {
                    keys.splice(index + 1, 0, key);
                }
            }
        }

        return keys;
    }

    getSelectorItemLabel(index) {
        const property = this.selectorData.label.property;
        const splitFirst = this.selectorData.label.splitFirst ?? true;
        return this.items[index].getProperty({
            property,
            splitter: splitFirst ? this.getPropertySplitter(property) : null
        })
    }

    // =================================== QUIZ ITEMS ===================================
    getAnswerFactories() {
        return ObjectUtils.map(this.properties, p => p.factory);
    }

    /**
     * @param {DatasetItem[]} items
     * @param {string[]} properties
     * @param {string[]} forms
     * @param {Record<string, string>} [params]
     * @returns {QuizItem[]}
     */
    getQuizItems(items, properties, forms, params) {
        const result = [];
        const factories = this.getAnswerFactories();

        for (const item of items) {
            const availableForms = item.getAvailableForms(forms);
            const answers = item.getQuizAnswers(properties, factories, params);
            result.push(availableForms.map(
                form => new QuizItem(item.getForm(form), answers)
            ));
        }

        return result.flat();
    }


    /**
     * @param {string[]} properties
     * @param {string[]} forms
     * @param {Record<string, string>} [params]
     * @returns {QuizItem[]}
     */
    getReferenceItems(properties, forms, params) {
        const factories = this.getAnswerFactories();

        if (!this.forms.exclusive) forms = Object.keys(this.forms.data);

        return this.items.map(item => new QuizItem(
            item.combineForms(forms),
            item.getQuizAnswers(properties, factories, params)
        ));
    }

    defaultFormKey() {
        return Object.keys(this.forms.data)[0];
    }

    getFormConfig(form) {
        form ??= this.defaultFormKey();
        return this.forms.data[form];
    }

    /**
     * @param {string} form
     * @return {string[] | undefined}
     */
    combineMethods(form) {
        return this.getFormConfig(form).combine;
    }

    /**
     * @param {string} [form]
     * @param {number} [selected]
     * @return {ValueElement}
     */
    letterSelect({form, selected} = {}) {
        form ??= this.defaultFormKey();
        return ValueElement.createSelect(
            Object.fromEntries(
                this.items
                    .map((item, index) => [index, item])
                    .filter(([_, item]) => item.hasForm(form))
                    .map(([index, item]) => [
                        index,
                        item.getForm(form).stringValue() + " – " + this.getSelectorItemLabel(index)
                    ])
            ),
            {selected: typeof selected === "number" ? selected.toString() : selected}
        );
    }

    /**
     * @param {number} index
     * @param {string} [form]
     * @return {Letter}
     */
    getLetterForm(index, form) {
        return this.items[index].getForm(form ?? this.defaultFormKey());
    }
}


class DatasetItem {
    /**
     * @param {Record<string, Nodeable>} forms
     * @param {Record<string, ParametricValue>} properties
     */
    constructor(forms, properties) {
        this.forms = forms;
        this.properties = properties;
    }

    /**
     * @param {string[]} properties
     * @param {Record<string, function>} factories
     * @param {Record<string, string>} [params]
     * @returns {Object<string,QuizAnswer>}
     */
    getQuizAnswers(properties, factories, params) {
        return ObjectUtils.fromKeys(properties, prop => factories[prop](this.properties[prop].get(params)));
    }

    /**
     * Returns the form keys that this letter possesses, optionally constrained to elements of the argument `forms`.
     * @param {string[]} forms
     * @returns {string[]}
     */
    getAvailableForms(forms) {
        return forms.filter(form => this.hasForm(form));
    }

    /**
     * @param {string} form
     * @returns {Letter}
     */
    getForm(form) {
        return new Letter(this.forms[form], form);
    }

    /**
     * @param {string} form
     * @returns {boolean}
     */
    hasForm(form) {
        return form in this.forms;
    }

    /**
     * @param {string[]} forms
     * @returns {LetterCombination}
     */
    combineForms(forms) {
        const letters = forms.filter(form => this.hasForm(form)).map(form => this.getForm(form));
        return new LetterCombination(letters);
    }

    /**
     * Counts the number of QuizItems this DatasetItem supplies, i.e. the number of form keys that are set
     * for this item.
     * @param forms
     */
    countQuizItems(forms) {
        return forms.reduce((acc, form) => form in this.forms ? acc + 1 : acc, 0);
    }

    /**
     * @param {string} property
     * @param {string | RegExp} [splitter]
     * @param {Record<string, string>} [params]
     * @returns {string | number}
     */
    getProperty({
                    property,
                    splitter,
                    params = {}
                } = {}) {
        let value = this.properties[property].get(params);
        if (splitter) value = value.split(new RegExp(splitter, "g"))[0].trim();
        return value;
    }
}



/**
 * @param {string} prop
 * @param {Record<string, string>} params
 * @returns {string}
 */
function createSinglePropKey(prop, params) {
    let propKey = prop;
    for (const key of ["variant", "language"]) {
        if (key in params) propKey += `>${key}:${params[key]}`;
    }
    return propKey;
}

/**
 * @param {string} key
 * @returns {[string, Record<string, string[]>]}
 */
function processPropKey(key) {
    const [prop, paramsStr] = key.split(">", 2);
    return [prop, parsePropParams(paramsStr)];
}

/**
 * @param {string} paramsStr
 * @param {Record<string, string[]>} [baseParams]
 * @returns {Record<string, string[]>}
 */
function parsePropParams(paramsStr, baseParams) {
    const params = Object.assign({}, baseParams);
    if (!paramsStr) return params;

    for (const str of paramsStr.split(">")) {
        const [key, value] = str.split(":");
        extendPropParams(params, key, value);
    }

    return params;
}


const propKeyRegistry = {
    variant: ["v", "var", "variant"],
    language: ["l", "lang", "langauge"]
}
const propKeyDict = {};
for (const [k, vs] of Object.entries(propKeyRegistry)) {
    for (const v of vs) {
        propKeyDict[v] = k;
    }
}

/**
 * @param {Record<string, string[] | string>} params
 * @param {string} key
 * @param {string} value
 */
function extendPropParams(params, key, value) {
    if (!propKeyDict[key]) throw new Error("Invalid property key " + key);

    key = propKeyDict[key];
    if (key in params) throw new Error(`${key} already set.`);

    if (key === "variant" && "language" in params) {
        console.warn("Setting variant after language.");
    }

    params[key] = value.split(",");
}


/**
 * @param {ParametricValue} propVal
 * @param {Record<string, string | string[]>} params
 * @param {any} value
 */
function extendPropertyValue(propVal, params, value) {
    const isSingleValue = typeof value === "string" || typeof value === "number";

    if (isSingleValue) {
        propVal.set(params, value);
    } else {
        for (const [paramsStr, val] of Object.entries(value)) {
            extendPropertyValue(propVal, parsePropParams(paramsStr, params), val);
        }
    }
}

/**
 * @param {Record<string, string[]>} params
 * @returns {Record<string, string>}
 */
function toSingleParams(params) {
    const result = {};
    for (const [key, value] of Object.entries(params)) {
        if (value.length > 1) {
            throw new Error(`Can only parse index for one ${key} value.`);
        }

        if (value.length === 1) {
            result[key] = value[0];
        }
    }
    return result;
}
