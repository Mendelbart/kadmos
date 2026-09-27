import {Matrix, ObjectUtils, ParametricValue} from "../utils";
import {full, range} from "../utils/array";
import {DefaultListSplitter, getSplitter, QuizAnswer, QuizAnswerFactory} from "../quiz/answer";
import {LetterFormsCombination, createNodeable, SVGNodeable} from "../letter";
import {Selector, SelectorBlock, SelectorGridBlock} from "../selector";
import {
    completeIndexSubsets,
    containsDuplicates,
    coveredBySubset,
    parseMatrixRanges,
    parseRanges
} from "../utils/indices";
import {createButtonGroup} from "../settings/ButtonGroup";
import {createSelect, stringToNumberSetting, TransformedSetting} from "../settings/ValueElement";
import {
    SchemaFontReference,
    SchemaLetterConfig, SchemaLetterRanges, SchemaQuizAnswerConfig, SchemaSelectorBlock,
    SchemaSelectorConfig,
    SchemaSubset, SchemaSubsetItems,
    SchemaSubsetProperties, SchemaSVGLetterConfig, SchemaVariantData, SchemaVariantsConfig
} from "../../json/dataset.schema";
import {ObservableSetting} from "../settings/SettingCollection";
import {LetterElementMap, NodeableFromLetterKey} from "../letter/utils";
import ConstantSetting from "../settings/ConstantSetting";
import {SelectorButtonCallbacks} from "../selector/SelectorBlock";
import {capitalize} from "../utils/object";

export interface SubsetProperty {
    factory: (value: string) => QuizAnswer,
    config: SchemaQuizAnswerConfig,
    active?: boolean
}

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

export type DatasetSelector<K extends keyof LetterElementMap> = Selector<DatasetItem<K>>;

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
    properties: Record<string, SubsetProperty>;
    variants?: SubsetVariants;
    items: DatasetItem<K>[];
    itemIndexMaps: Record<string, Map<string | number, number>>;
    selectorData: SelectorData
    forms: string[]

    constructor(key: string, data: Omit<SchemaSubset, "letterConfig" | "variants"> & {letterConfig: SchemaLetterConfig & {type: K}, variants?: SubsetVariantsConfig}) {
        this.key = key;
        this.label = data.label ?? capitalize(key);
        this.letterConfig = data.letterConfig;
        this.properties = this.processProperties(data.properties);
        this.forms = data.items.forms ?? full(Math.max(...data.items.data.map(([forms]) => forms.length)), x => x.toString());
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

    processItems({properties, data}: SchemaSubsetItems): DatasetItem<K>[] {
        const propParams: [string, DatasetAnswerParams][] = properties.map(key => {
            const [prop, params] = processPropKey(key);
            if (!(prop in this.properties)) throw new Error("Unknown property " + prop);
            return [prop, params];
        });

        return data.map(([forms, propValues]) => new DatasetItem(
            this.processLetterForms(this.validateLetterForms(forms), this.forms),
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

    processLetterForms(forms: (LetterItemTypeMap[K] | null)[], formKeys: string[]): Record<string, NodeableFromLetterKey<K>> {
        const result: Record<string, NodeableFromLetterKey<K>> = {};
        for (const [index, value] of forms.entries()) {
            if (value == null) continue;
            result[formKeys[index]] = this.getNodeable(value);
        }
        return result;
    }

    getNodeable(data: LetterItemTypeMap[K]): NodeableFromLetterKey<K> {
        if (this.letterConfig.type === "svg") {
            // @ts-ignore
            return SVGNodeable.fromTemplate((this.letterConfig as SchemaSVGLetterConfig).template, data as (string | number)[]);
        }

        return createNodeable(this.letterConfig.type, data as string);
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
            const formKey = key === "form" ? this.forms[0] : key.substring(5);
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

    isItemIncluded(index: number, variant?: string): boolean {
        if (this.variants && variant) {
            return this.variants.data[variant].includesItem[index];
        }
        return true;
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

    createSelector(callbacks?: SelectorButtonCallbacks<DatasetItem<K>>): DatasetSelector<K> {
        callbacks ??= this.getSelectorButtonCallbacks();
        const subsets = completeIndexSubsets(this.selectorData.blocks.map(block => block.indices), this.items.length);

        const selector = new Selector(
            this.items,
            subsets,
            (items, b) => this.getSelectorBlock(items, callbacks, b)
        );

        selector.blocks.forEach((block, index) => {
            block.applyStyle(Object.assign({}, this.selectorData.style, this.selectorData.blocks[index].style));
        });

        return selector;
    }

    getSelectorButtonCallbacks(): SelectorButtonCallbacks<DatasetItem<K>> {
        return {
            content: item => item.combineForms(this.forms).getNode(),
            ...(this.selectorData.label ? {label: item => this.getSelectorItemLabel(item)} : {})
        };
    }

    getSelectorBlock(items: DatasetItem<K>[], callbacks: SelectorButtonCallbacks<DatasetItem<K>>, blockIndex: number) {
        const data = this.selectorData.blocks[blockIndex];
        if (!data.grid) return new SelectorBlock(items, callbacks);

        const block = new SelectorGridBlock(items, callbacks, this.getGridLayout(data.dimensions, data.gaps), data.fillDirection);

        if (data.rowLabels) block.setGridLabels("row", data.rowLabels, {position: data.rowLabelPosition, spans: data.rowLabelSpans});
        if (data.columnLabels) block.setGridLabels("column", data.columnLabels, {position: data.columnLabelPosition, spans: data.columnLabelSpans});

        if (data.rangeMode) block.setRangeMode(data.rangeMode);

        return block;
    }

    getSelectorItemLabel(item: DatasetItem<K>): string {
        if (!this.selectorData.label) throw new Error("Selector doesn't have labels.");
        const property = this.selectorData.label.property;
        const splitFirst = this.selectorData.label.splitFirst ?? true;
        return item.getProperty({
            property,
            splitter: splitFirst ? this.getPropertySplitter(property) : undefined
        });
    }

    getPropertySplitter(property: string) {
        return getSplitter(this.properties[property].config);
    }

    defaultFormKey(): string {
        return this.forms[0];
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


export class DatasetItem<K extends keyof LetterItemTypeMap> {
    forms: Record<string, NodeableFromLetterKey<K>>;
    properties: Record<string, DatasetAnswerValue>;

    constructor(forms: Record<string, NodeableFromLetterKey<K>>, properties: Record<string, DatasetAnswerValue>) {
        this.forms = forms;
        this.properties = properties;
    }

    /**
     * Returns the form keys that this letter possesses, optionally constrained to elements of the argument `forms`.
     */
    getAvailableForms(forms: string[]): string[] {
        return forms.filter(form => this.hasForm(form));
    }

    getForm(form: string): NodeableFromLetterKey<K> {
        if (this.forms[form] == null) throw new Error(`Item doesn't have form key ${form}.`);
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
