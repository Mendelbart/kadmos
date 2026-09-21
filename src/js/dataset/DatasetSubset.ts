import {Matrix, ObjectUtils, ParametricValue} from "../utils";
import {range} from "../utils/array";
import {DefaultListSplitter, QuizAnswer, QuizAnswerFactory} from "../quiz/answer";
import {LetterFormsCombination, createNodeable, SVGNodeable} from "../letter";
import {Selector, SelectorBlock, SelectorGridBlock} from "../selector";
import {
    completeIndexSubsets,
    containsDuplicates,
    coveredBySubset,
    parseMatrixRanges,
    parseRanges
} from "../utils/indices";
import {SettingCollection} from "../settings";
import QuizItem from '../quiz/QuizItem';
import {createButtonGroup} from "../settings/ButtonGroup";
import {createSelect, stringToNumberSetting, TransformedSetting} from "../settings/ValueElement";
import {
    SchemaFontReference,
    SchemaFormConfig,
    SchemaFormsConfig,
    SchemaLetterConfig, SchemaLetterRanges, SchemaQuizAnswerConfig, SchemaSelectorBlock,
    SchemaSelectorConfig,
    SchemaSubset, SchemaSubsetItems,
    SchemaSubsetProperties, SchemaSVGLetterConfig, SchemaVariantData, SchemaVariantsConfig
} from "../../json/dataset.schema";
import {Nodeable} from "../letter/letter";
import {ObservableSetting} from "../settings/SettingCollection";
import {LetterElementMap, NodeableFromLetterKey} from "../letter/utils";
import ConstantSetting from "../settings/ConstantSetting";
import {SelectorButtonCallbacks} from "../selector/SelectorBlock";

export interface SubsetProperty {
    label: string,
    factory: (value: string) => QuizAnswer,
    config: SchemaQuizAnswerConfig,
    active?: boolean
}


export const DEFAULT_FORM_KEY = "0";
const DEFAULT_FORMS: SchemaFormsConfig = {
    data: {},
    exclusive: false
};
DEFAULT_FORMS.data[DEFAULT_FORM_KEY] = {label: "Default"};

export interface LetterItemTypeMap {
    string: string,
    braille: string,
    image: string,
    svg: (string | number)[]
}

export type SubsetVariants = Omit<SchemaVariantsConfig, "data"> & {data: Record<string, SubsetVariantData>};

export interface SubsetVariantData {
    label: string,
    lang?: string,
    indices: number[],
    includesItem: boolean[],
    fonts?: Record<string, SchemaFontReference>;
}
export type SubsetVariantsConfig = Omit<SchemaVariantsConfig, "data"> & {data: Record<string, SchemaVariantData & {letters?: SchemaLetterRanges}>};

export type SelectorBlockConfig = SchemaSelectorBlock & {indices: number[] | null};
export type SelectorData = Omit<SchemaSelectorConfig, "blocks"> & {blocks: SelectorBlockConfig[]};

export interface SelectorSettings {
    variant: string,
    forms: string[]
}

export type DatasetSelector<K extends keyof LetterElementMap> = Selector<DatasetItem<NodeableFromLetterKey<K>>>;

export interface DatasetAnswerParams {
    variant?: string,
    language?: string
}
const DatasetAnswerParamKeys: (keyof DatasetAnswerParams)[] = ["variant", "language"];

export type DatasetAnswerValue = ParametricValue<string, keyof DatasetAnswerParams>;


export default class DatasetSubset<K extends keyof LetterElementMap> {
    key: string;
    label: string;
    letterConfig: SchemaLetterConfig & {type: K};
    forms: SchemaFormsConfig;
    properties: Record<string, SubsetProperty>;
    variants?: SubsetVariants;
    items: DatasetItem<NodeableFromLetterKey<K>>[];
    itemIndexMaps: Record<string, Map<string | number, number>>;
    selectorData: SelectorData

    constructor(key: string, data: Omit<SchemaSubset, "letterConfig" | "variants"> & {letterConfig: SchemaLetterConfig & {type: K}, variants?: SubsetVariantsConfig}) {
        this.key = key;
        this.label = data.label;
        this.letterConfig = data.letterConfig;
        this.forms = this.processForms(data.forms);
        this.properties = this.processProperties(data.properties);
        this.items = this.processItems(data.items);
        this.itemIndexMaps = {};
        if (data.variants) this.variants = this.processVariants(data.variants);

        this.selectorData = this.processSelectorData(data.selector);
    }

    processSelectorData(selectorData: SchemaSelectorConfig): SelectorData {
        return {
            ...selectorData,
            blocks: (selectorData.blocks ?? [{}]).map(block => {
                return {
                    ...block,
                    indices: block.letters == null ? null : this.getLetterIndices(block.letters)
                }
            })
        }
    }

    processForms(forms?: SchemaFormsConfig) {
        return forms ?? DEFAULT_FORMS;
    }

    processProperties(properties: SchemaSubsetProperties): Record<string, SubsetProperty> {
        return ObjectUtils.map(properties, data => {
            return {
                ...data,
                factory: QuizAnswerFactory(data.config)
            };
        });
    }

    processVariants(variants: SubsetVariantsConfig): SubsetVariants {
        return {
            ...variants,
            data: ObjectUtils.map(variants.data, (value, key) => {
                const lang = value.lang ?? (variants.useKeyAsLang ? key : undefined);
                const indices = value.letters ? this.getLetterIndices(value.letters) : range(this.items.length);
                const includesItem = coveredBySubset(this.items.length, indices);
                return {...value, lang, indices, includesItem};
            })
        };
    }

    processItems({properties, data}: SchemaSubsetItems): DatasetItem<NodeableFromLetterKey<K>>[] {
        const propParams: [string, DatasetAnswerParams][] = properties.map(key => {
            const [prop, params] = processPropKey(key);
            if (!(prop in this.properties)) throw new Error("Unknown property " + prop);
            return [prop, params];
        });

        return data.map(([forms, propValues]) => new DatasetItem(
            this.processLetterForms(this.validateLetterForms(forms)),
            this.processItemProperties(propParams, propValues)
        ));
    }
    
    validateLetterForms(forms: unknown[]): (LetterItemTypeMap[K] | null)[] {
        if (this.letterConfig.type === "svg") {
            forms.forEach(form => {
                if (form == null) return;
                if (Array.isArray(form) && form.every(value => typeof value === "string" || typeof value === "number")) return;
                throw new Error(`Invalid svg form, need (string | number)[], got ${form}`);
            });
        } else {
            forms.forEach(form => {
                if (form == null) return;
                if (typeof form !== "string") throw new Error(`Invalid item form, need string, got ${form}.`);
            });
        }
        return forms as (LetterItemTypeMap[K] | null)[];
    }

    processItemProperties(propParams: [string, DatasetAnswerParams][], values: (string | number)[]): Record<string, DatasetAnswerValue> {
        const result = ObjectUtils.map(this.properties, () => new ParametricValue(DatasetAnswerParamKeys, "---"));

        for (const [index, [prop, params]] of propParams.entries()) {
            if (index >= values.length) break;
            extendPropertyValue(result[prop], params, values[index]);
        }

        return result;
    }

    standardizeLetterForms(forms: (LetterItemTypeMap[K] | null)[]): Record<string, LetterItemTypeMap[K]> {
        const formKeys = Object.keys(this.forms.data);
        return Object.fromEntries(
            forms
                .map((str, index) => [formKeys[index], str])
                .filter(([_, str]) => str != null)
        );
    }

    processLetterForms(forms: (LetterItemTypeMap[K] | null)[]): Record<string, NodeableFromLetterKey<K>> {
        return ObjectUtils.map(this.standardizeLetterForms(forms), data => this.getNodeable(data));
    }

    getNodeable(data: LetterItemTypeMap[K]): NodeableFromLetterKey<K> {
        if (this.letterConfig.type === "svg") {
            return SVGNodeable.fromTemplate((this.letterConfig as SchemaSVGLetterConfig).template, data as (string | number)[]);
        }

        return createNodeable(this.letterConfig.type, data as string);
    }

    hasCombine(form: string): boolean {
        if (!this.forms.exclusive) return false;
        return !!this.forms.data[form].combine;
    }

    getLang(variant?: string): string | undefined {
        if (this.variants && variant) {
            if ("lang" in this.variants.data[variant]) return this.variants.data[variant].lang;
            if (this.variants.useKeyAsLang) return variant;
        }
        return undefined;
    }

    getLetterIndices(which: Record<string, string | undefined>): number[] {
        const result = Object.entries(which)
            .flatMap(([key, ranges]) => {
                if (ranges == null) return [];
                return parseRanges(ranges, x => this.getLetterIndex(key, x));
            });

        if (containsDuplicates(result)) {
            console.warn("Indices contain duplicates");
            return [...new Set(result)];
        }

        return result;
    }

    getLetterIndex(key: string, value: string | number): number {
        if (key === "i0" || key === "i1") {
            if (typeof value === 'string') value = parseInt(value);
            return key === "i1" ? value - 1 : value;
        }

        let mapKey;

        if (key.substring(0, 5) === "prop:") {
            let [prop, params] = processPropKey(key.substring(5));
            mapKey = "prop:" + createSinglePropKey(prop, params);
            this.itemIndexMaps[mapKey] ??= this.createPropertyIndexMap(prop, params);
        } else if (key === "form" || key.substring(0, 5) === "form:") {
            const formKey = key === "form" ? Object.keys(this.forms.data)[0] : key.substring(5);
            mapKey = "form:" + formKey;
            this.itemIndexMaps[mapKey] ??= this.createFormIndexMap(formKey);
        } else {
            throw new Error(`Invalid key ${key}.`);
        }

        const result = this.itemIndexMaps[mapKey].get(value);
        if (result == null) {
            console.log(this.itemIndexMaps[mapKey]);
            throw new Error(`Couldn't find value ${value} with key ${mapKey}.`);
        }

        return result;
    }

    createPropertyIndexMap(property: string, params: DatasetAnswerParams): Map<string | number, number> {
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

    createFormIndexMap(formKey: string): Map<string, number> {
        return new Map(this.items
            .filter(item => item.hasForm(formKey))
            .map(
                (item, index) => [item.getForm(formKey).stringValue(), index]
            )
        );
    }

    getPropertySplitter(property: string) {
        let config = this.properties[property].config;
        let regex = "";
        while (config.type === "list") {
            const splitter = config.properties?.splitter ?? DefaultListSplitter;
            if (regex.length > 0) regex += "|";
            regex += splitter;
            config = config.items;
        }
        return regex ? new RegExp(regex, "g") : undefined;
    }

    ungroupedForms(): Record<string, SchemaFormConfig> {
        return ObjectUtils.filter(this.forms.data, f => !("groupWith" in f));
    }

    isItemIncluded(index: number, variant?: string): boolean {
        if (this.variants && variant) {
            return this.variants.data[variant].includesItem[index];
        }
        return true;
    }

    getSelectorSettings(checked: Partial<SelectorSettings> = {}) {
        return new SettingCollection({
            variant: this.variantSetting(checked.variant),
            forms: this.formsSetting(checked.forms)
        });
    }

    propertySetting(checked?: string[]) {
        const propertyKeys = Object.keys(this.properties);
        if (propertyKeys.length === 1) return new ConstantSetting(propertyKeys);

        return createButtonGroup(
            ObjectUtils.map(this.properties, p => p.label),
            {
                label: "Properties",
                checked: checked ?? ObjectUtils.filterKeys(this.properties, p => !!p.active)
            }
        );
    }

    formsSetting(checked?: string[]) {
        const ungroupedForms = this.ungroupedForms();
        const keys = Object.keys(ungroupedForms);

        if (keys.length === 1) return new ConstantSetting(keys);

        const label = this.forms.label;
        const defaultChecked = this.forms.exclusive ? [keys[0]] : keys;
        return createButtonGroup(
            ObjectUtils.map(ungroupedForms, (p) => p.label),
            {
                label: label,
                type: "checkbox",
                checked: checked ?? defaultChecked,
                exclusiveCheckboxes: this.forms.exclusive
            },
        );
    }

    variantSetting(selected?: string): ObservableSetting<string> {
        if (!this.variants) return new ConstantSetting("null");

        const data = ObjectUtils.map(this.variants.data, (variant) => variant.label);
        selected ||=  this.variants.default || Object.keys(this.variants.data)[0];
        const label = this.variants.setting?.label || "Variant";

        if (this.variants.setting?.type === "buttonGroup") {
            return createButtonGroup(data, {
                label: label,
                type: "radio",
                checked: selected
            });
        } else {
            const groups = this.variants.groups ? Object.values(this.variants.groups) : []
            return createSelect(data, {
                label: label,
                selected: selected,
                groups: groups
            });
        }
    }


    // ==================================== SELECTOR ================
    getGridLayout(dimensions: [number, number], gaps?: string) {
        const [n, m] = dimensions;
        const layout = new Matrix(n, m, new Array(n * m).fill(true));

        if (gaps) for (const [i, j] of parseMatrixRanges(gaps, x => parseInt(x) - 1)) {
            layout.set(i, j, false);
        }
        return layout;
    }

    createSelector(): DatasetSelector<K> {
        const subsets = completeIndexSubsets(this.selectorData.blocks.map(block => block.indices), this.items.length);

        return new Selector(this.items, subsets, (items, b) => this.getSelectorBlock(items, b));
    }

    getSelectorButtonCallbacks(): SelectorButtonCallbacks<DatasetItem<NodeableFromLetterKey<K>>> {
        const forms = Object.keys(this.forms.data);
        return {
            content: item => item.combineForms(forms).getNode(),
            ...(this.selectorData.label ? {label: item => this.getSelectorItemLabel(item)} : {})
        };
    }

    getSelectorBlock(items: DatasetItem<NodeableFromLetterKey<K>>[], blockIndex: number) {
        const data = this.selectorData.blocks[blockIndex];
        const buttonCallbacks = this.getSelectorButtonCallbacks();
        if (!data.grid) return new SelectorBlock(items, buttonCallbacks);

        const block = new SelectorGridBlock(items, buttonCallbacks, this.getGridLayout(data.dimensions, data.gaps), data.fillDirection);

        if (data.rowLabels) block.setGridLabels("row", data.rowLabels, {position: data.rowLabelPosition, spans: data.rowLabelSpans});
        if (data.columnLabels) block.setGridLabels("column", data.columnLabels, {position: data.columnLabelPosition, spans: data.columnLabelSpans});

        if (data.rangeMode) block.setRangeMode(data.rangeMode);

        return block;
    }

    getSelectorBlockStyles() {
        const baseStyle = this.selectorData.style ?? {};
        return this.selectorData.blocks.map(block => Object.assign(baseStyle, block.style));
    }

    getFormKeysFromGrouped(value?: string[]): string[] {
        if (!value) return Object.keys(this.forms.data);

        const keys = value.slice();

        for (const [key, form] of Object.entries(this.forms.data)) {
            if (form.groupWith && value.includes(form.groupWith)) {
                const index = keys.indexOf(form.groupWith);
                if (index !== -1) {
                    keys.splice(index + 1, 0, key);
                }
            }
        }

        return keys;
    }

    getSelectorItemLabel(item: DatasetItem<NodeableFromLetterKey<K>>): string {
        if (!this.selectorData.label) throw new Error("Selector doesn't have labels.");
        const property = this.selectorData.label.property;
        const splitFirst = this.selectorData.label.splitFirst ?? true;
        return item.getProperty({
            property,
            splitter: splitFirst ? this.getPropertySplitter(property) : undefined
        });
    }

    // =================================== QUIZ ITEMS ===================================
    getAnswerFactories() {
        return ObjectUtils.map(this.properties, p => p.factory);
    }

    getQuizItems(items: DatasetItem<NodeableFromLetterKey<K>>[], properties: string[], forms: string[], params: DatasetAnswerParams) {
        const factories = this.getAnswerFactories();

        return items.flatMap(item => {
            const availableForms = item.getAvailableForms(forms);
            const answers = item.getQuizAnswers(properties, factories, params);
            return availableForms.map(
                form => new QuizItem(item.getForm(form), answers)
            );
        });
    }

    getReferenceItems(properties: string[], forms: string[], params: DatasetAnswerParams) {
        const factories = this.getAnswerFactories();

        if (!this.forms.exclusive) forms = Object.keys(this.forms.data);

        return this.items.map(item => new QuizItem(
            item.combineForms(forms),
            item.getQuizAnswers(properties, factories, params)
        ));
    }

    defaultFormKey(): string {
        return Object.keys(this.forms.data)[0];
    }

    getFormConfig(form?: string) {
        return this.forms.data[form ?? this.defaultFormKey()];
    }

    combineMethods(form: string): string[] | undefined {
        return this.getFormConfig(form).combine;
    }

    letterSelect({form, selected}: {form?: string, selected?: number} = {}): TransformedSetting<number> {
        form ??= this.defaultFormKey();
        const select = createSelect(
            Object.fromEntries(
                range(this.items.length)
                    .filter(index => this.items[index].hasForm(form))
                    .map(index => [index, this.getLetterSelectLabel(index, form)])
            )
        );
        
        const setting = stringToNumberSetting(select);
        if (selected) setting.value = selected;
        return setting;
    }

    getLetterSelectLabel(index: number, form: string): string {
        const item = this.items[index];
        let value = item.getForm(form).stringValue();
        if (this.selectorData.label) value += " – " + this.getSelectorItemLabel(item);
        return value;
    }

    getLetterForm(index: number, form?: string): NodeableFromLetterKey<K> {
        return this.items[index].getForm(form ?? this.defaultFormKey());
    }
}


export class DatasetItem<N extends Nodeable<any>> {
    forms: Record<string, N>;
    properties: Record<string, DatasetAnswerValue>;

    constructor(forms: Record<string, N>, properties: Record<string, DatasetAnswerValue>) {
        this.forms = forms;
        this.properties = properties;
    }

    getQuizAnswers(properties: string[], factories: Record<string, (value: string) => QuizAnswer>, params: DatasetAnswerParams): Record<string, QuizAnswer> {
        return ObjectUtils.fromKeys(properties, prop => factories[prop](this.properties[prop].get(params)));
    }

    /**
     * Returns the form keys that this letter possesses, optionally constrained to elements of the argument `forms`.
     */
    getAvailableForms(forms: string[]): string[] {
        return forms.filter(form => this.hasForm(form));
    }

    getForm(form: string): N {
        if (!this.forms[form]) throw new Error(`Item doesn't have form key ${form}.`);
        return this.forms[form];
    }

    hasForm(form: string): boolean {
        return form in this.forms;
    }

    combineForms(forms: string[]) {
        return new LetterFormsCombination(forms
            .filter(form => this.hasForm(form))
            .map(form => [this.getForm(form), form])
        );
    }

    /**
     * Counts the number of QuizItems this DatasetItem supplies, i.e. the number of form keys that are set
     * for this item.
     */
    countQuizItems(forms: string[]) {
        return forms.reduce((acc, form) => form in this.forms ? acc + 1 : acc, 0);
    }

    getProperty(config: {
        property: string,
        splitter?: string | RegExp,
        params?: DatasetAnswerParams
    }) {
        let value = this.properties[config.property].get(config.params ?? {});
        if (config.splitter) value = value.split(new RegExp(config.splitter, "g"))[0].trim();
        return value;
    }
}



function createSinglePropKey(prop: string, params: DatasetAnswerParams): string {
    let propKey = prop;
    for (const key of DatasetAnswerParamKeys) {
        if (key in params) propKey += `>${key}:${params[key]}`;
    }
    return propKey;
}

function processPropKey(key: string): [string, DatasetAnswerParams] {
    const [prop, paramsStr] = key.split(">", 2);
    return [prop, parsePropParams(paramsStr)];
}

/**
 * @param {string} paramsStr
 * @param {Record<string, string[]>} [baseParams]
 * @returns {Record<string, string[]>}
 */
function parsePropParams(paramsStr: string, baseParams?: DatasetAnswerParams): DatasetAnswerParams {
    const params = Object.assign({}, baseParams);
    if (!paramsStr) return params;

    for (const str of paramsStr.split(">")) {
        const [key, value] = str.split(":");
        if (!(key in propKeyDict)) throw new Error(`Invalid property key ${key}.`);
        extendPropParams(params, key as keyof typeof propKeyDict, value);
    }

    return params;
}


const propKeyRegistry: Record<keyof DatasetAnswerParams, string[]> = {
    variant: ["v", "var", "variant"],
    language: ["l", "lang", "language"]
} as const;

function invertRegistry<R extends Record<string, readonly string[]>>(r: R): {readonly [K in keyof R as R[K][number]]: K} {
    const result: Record<string, string> = {};
    for (const [k, vs] of Object.entries(r)) {
        for (const v of vs) {
            result[v] = k;
        }
    }
    return result as {[K in keyof R as R[K][number]]: K};
}
const propKeyDict = invertRegistry(propKeyRegistry);

function extendPropParams(params: DatasetAnswerParams, key: keyof typeof propKeyDict, value: string) {
    if (!(key in propKeyDict)) throw new Error("Invalid property key " + key);

    const paramKey = propKeyDict[key];
    if (paramKey in params) throw new Error(`${key} already set.`);

    if (paramKey === "variant" && "language" in params) {
        console.warn("Setting variant after language.");
    }

    params[paramKey] = value;
}

function extendPropertyValue<T extends string | number>(propVal: DatasetAnswerValue, params: DatasetAnswerParams, value: T | Record<string, T>) {
    const isSingleValue = typeof value === "string";

    if (isSingleValue) {
        propVal.set(params, value);
    } else {
        for (const [paramsStr, val] of Object.entries(value)) {
            extendPropertyValue(propVal, parsePropParams(paramsStr, params), val);
        }
    }
}
