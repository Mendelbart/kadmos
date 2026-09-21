import {DOMUtils, ObjectUtils} from '../utils';
import {SettingCollection} from "../settings";
import DATASETS_METADATA from '../../json/datasets_meta.json';
import {ElementFontProperties, Font} from "../utils/font";
import DatasetSubset, {SubsetVariantsConfig} from "./DatasetSubset";
import {BrailleString, StringCombiner, StringLetter} from "../letter";
import {createButtonGroup} from "../settings/ButtonGroup";
import {
    SchemaCombineConfig, SchemaCombineMethod, SchemaCombinePropertyConfig, SchemaCombineTemplates,
    SchemaFonts, SchemaGameConfig,
    SchemaKadmosDataset, SchemaLanguages,
    SchemaLetterConfig,
    SchemaMetadata, SchemaStringLetterConfig, SchemaSubset, SchemaSubsetVariants,
    SchemaTermsConfig, SchemaVariantsConfig
} from "../../json/dataset.schema";
import {DOMFactory} from "../utils/dom";
import {LetterElementMap, LetterType} from "../letter/utils";
import ConstantSetting from "../settings/ConstantSetting";
import {ObservableSetting} from "../settings/SettingCollection";
import {CombineConfig} from "../letter/letter";

const headingElementFactory = DOMFactory(
    `<div class="heading-element"><span class="heading-element-number"></span><span class="heading-element-symbol"></span></div>`,
    {
        container: ["div"],
        number: ["span", ".heading-element-number"],
        symbol: ["span", ".heading-element-symbol"]
    }
);

const DATASETS_ROOT = "./json/datasets/";
export const DEFAULT_DATASET = "greek";

const DEFAULT_METADATA = {
    terms: {letter: "letter"},
    dir: "ltr"
};

export const TERMS = ["letter", "letters"] as const;

const DEFAULT_LANGUAGES: SchemaLanguages = {
    keys: ["en"]
};

const LANGUAGES = {
    en: "English",
    de: "German"
} as const;

const DatasetsCache: Record<string, Dataset<keyof LetterElementMap>> = {};


type DatasetMetadata = Omit<SchemaMetadata, "terms" | "dir"> & {
    terms: Required<SchemaTermsConfig>,
    dir: "rtl" | "ltr",
}
interface FontData {
    family: string,
    label: string,
    params?: ElementFontProperties,
    font: Font
}
type DatasetFonts = Omit<SchemaFonts, "data"> & {
    data: Record<string, FontData>,
    defaultKey: string
};

interface PropertyCombineConfig {
    sources: string[],
    templates?: SchemaCombineTemplates
    combiner: StringCombiner
}
type CombineMethod = Omit<SchemaCombineMethod, "properties"> & {
    combiner: StringCombiner
    properties?: Record<string, PropertyCombineConfig>
}
interface DatasetCombineConfig {
    methods: Record<string, CombineMethod>
}

export interface DatasetGameSettings {
    properties: string[];
    language: string;
}

export interface DatasetLanguages {
    keys: (keyof typeof LANGUAGES)[];
    default: string;
}


export class Dataset<K extends LetterType> {
    metadata: DatasetMetadata;
    key: string;
    letterConfig: SchemaLetterConfig & {type: K};
    fonts?: DatasetFonts;
    languages: DatasetLanguages;
    gameConfig: SchemaGameConfig;
    variants?: SchemaVariantsConfig;
    subsets: Record<string, DatasetSubset<K>>;
    combine?: DatasetCombineConfig;

    constructor(data: SchemaKadmosDataset & {letterConfig: {type: K}}) {
        this.metadata = this.processMetadata(data.metadata);
        this.key = this.metadata.key;
        this.letterConfig = data.letterConfig;
        if (this.letterConfig.type === "string") {
            const fonts = (this.letterConfig as SchemaStringLetterConfig).fonts
            this.fonts = this.processFonts(fonts);
        }
        this.languages = this.processLanguages(data.languages ?? DEFAULT_LANGUAGES);

        this.gameConfig = data.game ?? {};
        this.variants = data.variants;
        this.subsets = this.processSubsets(data.subsets);
        if (data.combine) this.combine = this.processCombine(data.combine);
    }

    static async fetch(key: keyof typeof DATASETS_METADATA): Promise<Dataset<keyof LetterElementMap>> {
        if (key in DatasetsCache) return Promise.resolve(DatasetsCache[key]);

        const response = await fetch(DATASETS_ROOT + DATASETS_METADATA[key as keyof typeof DATASETS_METADATA].file);
        const data = await response.json();
        const dataset = new this(data);
        dataset.key = key;
        DatasetsCache[key] = dataset;
        return dataset;
    }

    // ============================= INITIAL PROCESSING ============================
    processFonts(fonts: SchemaFonts): DatasetFonts {
        const data: Record<string, FontData> = {};
        let defaultKey: string | undefined = undefined;
        for (const [key, fontData] of Object.entries(fonts.data)) {
            data[key] = {
                family: fontData.family,
                params: fontData.params,
                font: Font.get(fontData.family).applyProperties(fonts.params, fontData.params),
                label: fontData.label ?? fontData.family
            }
            if (fontData.default) defaultKey = key;
        }

        return {
            ...fonts,
            data,
            defaultKey: defaultKey ?? Object.keys(fonts.data)[0]
        }
    }

    processLanguages(languages: SchemaLanguages): DatasetLanguages {
        languages.keys.forEach(key => {if (!(key in LANGUAGES)) throw new Error(`Unknown language key ${key}`)});
        return {
            keys: languages.keys as (keyof typeof LANGUAGES)[],
            default: languages.default ?? languages.keys[0]
        };
    }

    processMetadata(metadata: SchemaMetadata): DatasetMetadata {
        const result = Object.assign({}, DEFAULT_METADATA, metadata);
        const letter = result.terms.letter ?? "letter";
        const letters = result.terms.letters ?? letter;
        return {
            ...result,
            terms: {letter, letters}
        }
    }

    processSubsets(subsets: Record<string, SchemaSubset>): Record<string, DatasetSubset<K>> {
        return ObjectUtils.map(subsets, (subset, key) => {
            return new DatasetSubset<K>(key, {
                ...subset,
                variants: this.applyGlobalVariants(subset.variants, this.variants),
                letterConfig: this.letterConfig
            });
        });
    }

    applyGlobalVariants(variants?: SchemaSubsetVariants, globalVariants?: SchemaVariantsConfig): SubsetVariantsConfig | undefined {
        if (!variants) return globalVariants;
        if (!globalVariants) throw new Error("Subset variants set without global variants.");

        return {
            ...globalVariants,
            data: ObjectUtils.map(variants.letters, (letters, key) => {
                return {
                    ...globalVariants.data[key],
                    letters
                }
            })
        };
    }

    processCombine(combine: SchemaCombineConfig): DatasetCombineConfig | undefined {
        if (!combine) return undefined;

        return {
            methods: ObjectUtils.map(combine.methods, method => this.processCombineMethod(method))
        };
    }

    processCombineMethod(method: SchemaCombineMethod): CombineMethod {
        const properties = !method.properties ? undefined
            : ObjectUtils.map(method.properties, config => this.processCombineProperty(config, method.subsets.length));

        return {
            ...method,
            combiner: new StringCombiner(method.subsets.length, method.templates ?? [], {regExpFlags: method.regExpFlags}),
            properties
        };
    }

    processCombineProperty(config: SchemaCombinePropertyConfig, nSources: number): PropertyCombineConfig {
        const sources = typeof config.sources === "string"
            ? new Array<string>(nSources).fill(config.sources)
            : config.sources;
        const combiner = new StringCombiner(sources.length, config.templates ?? [], {regExpFlags: config.regExpFlags})
        return {
            sources,
            combiner
        };
    }


    // ============================= SETTINGS ============================
    subsetSetting(checked?: string) {
        checked ??= Object.keys(this.subsets)[0];
        return createButtonGroup(
            ObjectUtils.map(this.subsets, s => s.label),
            {
                checked: checked,
                type: "radio"
            }
        );
    }

    getGameSettings(subsetKey: string, checked: Partial<DatasetGameSettings> = {}) {
        const subset = this.getSubset(subsetKey);
        return new SettingCollection({
            properties: subset.propertySetting(checked.properties),
            language: this.languageSetting(checked.language),
        });
    }

    languageSetting(checked?: string) {
        const keys = this.languages.keys;
        if (keys.length === 1) return new ConstantSetting(keys[0] as string);
        
        return createButtonGroup(
            ObjectUtils.onlyKeys(LANGUAGES, keys),
            {
                label: "Language",
                checked: checked ?? this.languages.default,
                type: "radio"
            }
        );
    }

    hasSetting(key: "variant" | "subset"): boolean {
        switch (key) {
            case "variant":
                return this.variants != null;
            case "subset":
                return Object.keys(this.subsets).length > 1;
            default:
                throw new Error(`Invalid settings key ${key}.`);
        }
    }

    getLang(subset?: string, variant?: string): string | undefined {
        return this.getSubset(subset).getLang(variant) ?? this.metadata.lang;
    }

    getDir() {
        return this.metadata.dir;
    }

    getLetterNodeAttrs(subset?: string, variant?: string): { lang?: string; dir?: string; } {
        return {
            lang: this.getLang(subset, variant),
            dir: this.getDir()
        };
    }

    getSubset(key?: string) {
        if (key) {
            if (!(key in this.subsets)) throw new Error(`Invalid subset key ${key}.`);
            return this.subsets[key];
        }
        return Object.values(this.subsets)[0];
    }

    combineMethodSetting(subset: string, form: string, checked?: string) {
        if (!this.combine) throw new Error("Dataset doesn't have combine");

        const keys = this.subsets[subset].combineMethods(form);
        if (!keys) throw new Error("Form doesn't use combine.");

        return createButtonGroup(
            ObjectUtils.map(
                ObjectUtils.onlyKeys(this.combine.methods, keys),
                (method, key) => method?.label ?? (key as string)
            ),
            {type: "radio", checked: checked ?? keys[0]}
        );
    }

    combineLettersSettings(method: string, subset?: string, selected?: number[]) {
        if (!this.combine) throw new Error("Dataset doesn't have combine");
        const config = this.combine.methods[method];
        const letterConfig = config.letterConfig || new Array<null>(config.subsets.length).fill(null);

        const settings: ObservableSetting<number>[] = [];

        for (const [index, ss] of config.subsets.entries()) {
            if (ss === subset) continue;
            settings.push(this.subsets[ss].letterSelect(
                Object.assign({}, letterConfig[index], {selected: selected?.[settings.length]}))
            );
        }

        return new SettingCollection(settings);
    }

    getCombineConfig(subset: string, method: string, letterIndices: number[]): CombineConfig {
        if (!this.combine) throw new Error("Dataset doesn't have combine");
        const config = this.combine.methods[method];
        const values = config.subsets
            .filter(ss => ss != subset)
            .map((ss, index): string => {
                const key = letterIndices[index];
                const nodeable = this.subsets[ss].getLetterForm(key, config.letterConfig?.[index]?.form) as StringLetter;
                return nodeable.string;
            });
        return {
            combiner: this.combine.methods[method].combiner,
            values: values,
            index: config.subsets.indexOf(subset)
        }
    }

    // ============================= FONTS ====================================
    hasFonts() {
        return !!this.fonts;
    }
    
    loadFonts() {
        if (this.fonts) {
            const fontRef = this.metadata.gameHeading?.type === "string" ? this.metadata.gameHeading.font : undefined;
            return Promise.all([
                this.getFont(fontRef).load(),
                this.getSelectorDisplayFont().load()
            ]);
        } else {
            return Promise.resolve();
        }
    }

    getFont(config: {key?: string, params?: ElementFontProperties} = {}, variant?: string): Font {
        if (!this.fonts) throw new Error("This dataset doesn't have fonts.");
        let key = config.key ?? this.fonts.defaultKey;
        if (!(key in this.fonts.data)) {
            console.error(`Unknown font key "${key}".`);
            key = this.fonts.defaultKey;
        }

        return this.fonts.data[key].font.applyProperties(
            this.getVariantFontParams(key, variant),
            config.params
        );
    }

    getVariantFontParams(key: string, variant?: string): ElementFontProperties {
        if (this.variants && variant) {
            const fontParams = this.variants.data[variant].fontParams;
            if (fontParams?.[key]) return fontParams[key];
        }

        return {};
    }

    getSelectorDisplayFont(subset?: string, variant?: string): Font {
        return this.getFont(this.getSubset(subset).selectorData.font, variant);
    }

    fontFamilySetting(checked?: string) {
        if (!this.fonts) throw new Error("Dataset doesn't have fonts.");
        
        if (Object.keys(this.fonts.data).length === 1) return new ConstantSetting(this.fonts.defaultKey);
        
        const setting = createButtonGroup(
            ObjectUtils.map(this.fonts.data, font => font.label),
            {
                label: "Font",
                type: "radio",
                checked: checked ?? this.fonts.defaultKey
            }
        );
        setting.node.classList.add("font-family-setting");
        return setting;
    }

    getGameHeading(variant?: string) {
        const data = this.metadata.gameHeading;
        if (!data) return "Kadmos";

        if (data.type === "custom") {
            if (!(data.key in customHeadings)) {
                console.error(`Invalid custom headings key ${data.key}.`);
                return "Kadmos";
            }
            return customHeadings[data.key as keyof typeof customHeadings](...(data.data ?? []) as Parameters<typeof customHeadings[keyof typeof customHeadings]>);
        }

        const font = this.hasFonts() ? this.getFont(data.font, variant) : null;

        const span = DOMUtils.span("", data.string ?? "Kadmos");
        const lang = this.getLang();
        if (lang) span.setAttribute("lang", lang);
        span.setAttribute("dir", this.getDir());
        if (font) font.applyTo(span);

        return span;
    }
}

const customHeadings = {
    braille: () => new BrailleString("KADMOS").getNode(),
    elements: () => {
        const container = document.createElement("div");
        container.classList.add("element-heading-container");
        const els: Element[] = [];
        for (const [no, symbol] of [[19, "K"], [85, "At"], [42, "Mo"], [16, "S"]] as const) {
            const el = headingElementFactory();
            el.symbol.textContent = symbol;
            el.number.textContent = no.toString();
            els.push(el.container);
        }
        container.replaceChildren(...els);

        return container;
    }
} as const;
