import {DOMUtils, ObjectUtils} from '../utils';
import {SettingCollection, ButtonGroup} from "../settings";
import DATASETS_METADATA from '../../json/datasets_meta.json';
import {Font} from "../utils/font";
import DatasetSubset from "./DatasetSubset";
import {BrailleString, StringCombiner} from "../letter";

DOMUtils.registerTemplate(
    "headingElement",
    `<div class="heading-element"><span class="heading-element-number"></span><span class="heading-element-symbol"></span></div>`
);

export const DEFAULT_SUBSET_KEY = "0";
const DATASETS_ROOT = "./json/datasets/";
export const DEFAULT_DATASET = "greek";

const DEFAULT_METADATA = {
    gameHeading: "Kadmos",
    terms: {letter: "letter"},
    lang: "en",
    dir: "ltr"
};

export const TERMS = ["letter", "letters"];

const DEFAULT_LANGUAGES = {
    keys: ["en"]
}

const LANGUAGES = {
    en: "English",
    de: "German"
}

const DatasetsCache = {};

/**
 * @typedef {object} JSONDataset
 * @property {string} key Unique key for this script dataset. Preferably from the <a href="https://www.iana.org/assignments/language-subtag-registry/language-subtag-registry">IANA Language Subtag Registry</a>.
 * @property {string} name Name of the dataset
 * @property {object} metadata
 * @property {*} metadata.gameHeading
 * @property {string} [metadata.lang] Value of the HTML lang attribute for letters of this script. Default "en".
 * @property {"ltr"|"rtl"} [metadata.dir="ltr"] Direction of the script: ltr for left-to-right (default) or rtl for right-to-left.
 * @property {object} [metadata.terms] Specify what the equivalent of e.g. "letter" and "letters" in this font are called.
 * @property {string} [metadata.terms.letter="letter"]
 * @property {string} [metadata.terms.letters] Default: terms.letter + 's'
 * @property {object} [languages]
 * @property {array} languages.keys Language subtags. In items, use "p:PROPERTY_SUBTAG" (e.g. "p:name_de") as key to specify language-specific property values.
 * @property {string} [languages.default]
 * @property {object} fonts A registry of the fonts used by the dataset, with lowercase keys.
 * @property {object} selector
 * @property {*} [selector.font]
 * @property {object} [selector.label] Settings for the label underneath letters in the selector. If not set, these won't appear.
 * @property {string} selector.label.property Which property to label the items with.
 * @property {boolean} [selector.label.splitFirst=true] If true, the property value will be split using the splitter value, and only the first part will be used as a label. E.g. for the letter "Aleph/Alef", the label string will be "Aleph"
 * @property {string} [selector.label.splitter="[,;/]"]
 * @property {object} [selector.style]
 * @property {string} [selector.defaultActive]
 * @property {object} [game]
 * @property {number} [game.defaultWeight=400]
 * @property {object} [forms]
 * @property {object} forms.data
 * @property {string} [forms.label="Forms"] Label of the forms setting. Default "Forms".
 * @property {boolean} [forms.exclusive=false] If true, you can only select one form to play at a time.
 * @property {object} properties
 * @property {object} [variants]
 * @property {object} variants.data
 * @property {object} [variants.groups]
 * @property {object} items
 * @property {"string"} [items.symbolType]
 * @property {array} items.properties Keys to assign the property entries of data rows to. Use `{PROPERTY}_{LANG}` for properties of a specific language.
 * @property {array} items.data Array with [[...displayforms], ...properties] entries matching the template. If first element is a string, it will be split into individual characters for forms. Use a single-item array if this isn't wanted.
 */


export class Dataset {
    /**
     * @param {JSONDataset} data
     */
    constructor(data) {
        this.key = data.key;
        this.name = data.name;
        this.letterConfig = data.letterConfig ?? {};
        this.letterConfig.type ??= "string";
        this.metadata = this.processMetadata(data.metadata);
        if (data.fonts) this.fonts = this.processFonts(data.fonts);
        this.languages = data.languages ?? DEFAULT_LANGUAGES;
        this.languages.default ??= this.languages.keys[0];

        this.gameConfig = data.game ?? {};
        this.variants = data.variants;
        this.subsets = this.processSubsets(data);
        this.combine = this.processCombine(data.combine);
    }

    /**
     * @param {string} key
     * @returns {Promise<Dataset>}
     */
    static fetch(key) {
        if (!(key in DATASETS_METADATA)) {
            throw new Error(`Invalid dataset key "${key}".`);
        }

        if (key in DatasetsCache) return Promise.resolve(DatasetsCache[key]);

        return fetch(DATASETS_ROOT + DATASETS_METADATA[key].file)
            .then(response => response.json())
            .then(data => {
                const dataset = new this(data);
                dataset.key = key;
                DatasetsCache[key] = dataset;
                return dataset;
            })
            .catch(err => console.error(err));
    }

    // ============================= INITIAL PROCESSING ============================
    /**
     * @param fonts
     * @returns {{data: Record<string, {family: string, font: Font, label: string}>, defaultKey: string}}
     */
    processFonts(fonts) {
        let defaultKey;
        for (const [key, data] of Object.entries(fonts.data)) {
            data.font = Font.get(data.family).applyParams(fonts.params ?? {}, data.params);
            if (data.default) defaultKey = key;
            data.label ??= data.family;
        }
        defaultKey ??= Object.keys(fonts.data)[0];
        fonts.defaultKey = defaultKey;
        return fonts;
    }

    processMetadata(metadata) {
        metadata = Object.assign({}, DEFAULT_METADATA, metadata);
        metadata.terms.letter ||= "letter";
        metadata.terms.letters ||= metadata.terms.letter + "s";
        return metadata;
    }

    /**
     * @param data
     * @returns {Record<string,DatasetSubset>}
     */
    processSubsets(data) {
        if (!data.subsets) {
            data.letterConfig = this.letterConfig;
            return Object.fromEntries([[DEFAULT_SUBSET_KEY, new DatasetSubset(DEFAULT_SUBSET_KEY, this.key, data)]]);
        }

        const subsets = {};
        for (const [key, subset] of Object.entries(data.subsets)) {
            if (subset.variants) subset.variants = this.applyGlobalVariants(subset.variants, this.variants);
            subset.letterConfig = this.letterConfig;
            subsets[key] = new DatasetSubset(key, this.key, subset);
        }
        return subsets;
    }

    applyGlobalVariants(variants, globalVariants) {
        if (!variants) return globalVariants;
        const result = Object.assign({}, globalVariants);
        result.data = {};
        for (const [key, letters] of Object.entries(variants.data)) {
            result.data[key] = Object.assign({}, globalVariants.data[key], {letters: letters});
        }
        result.defaultLetterKey = variants.defaultLetterKey ?? globalVariants.defaultLetterKey;
        return result;
    }

    /**
     * @param combine
     * @return {?Record<string, *>}
     */
    processCombine(combine) {
        if (!combine) return null;

        for (const method of Object.values(combine.methods)) {
            method.combiner = new StringCombiner(method.subsets.length, method.templates, method.regExpFlags);

            if (method.properties === "auto" || !method.properties) {
                method.properties = {};
                for (const key of Object.keys(this.subsets[method.subsets[0]].properties)) {
                    if (method.subsets.every(k => k in this.subsets[k].properties)) {
                        method.properties[key] = {sources: method.subsets.map(() => key)};
                    }
                }
            }

            for (const config of Object.values(method.properties)) {
                config.combiner = new StringCombiner(config.sources.length, config.templates, config.regExpFlags);
            }
        }

        return combine;
    }


    // ============================= SETTINGS ============================
    subsetSetting(checked) {
        checked ??= Object.keys(this.subsets)[0];
        return ButtonGroup.from(
            ObjectUtils.map(this.subsets, s => s.label),
            {
                checked: checked,
                exclusive: true
            }
        );
    }

    /**
     * @param {string} [subsetKey]
     * @param {{properties?: Record<string, boolean>, language?: string}} [checked]
     * @returns {SettingCollection}
     */
    getGameSettings(subsetKey, checked = {}) {
        const settings = {};
        const subset = this.getSubset(subsetKey);
        if (subset.hasSetting("properties")) {
            settings.properties = subset.propertySetting(checked.properties);
        }
        if (this.hasSetting("language")) {
            settings.language = this.languageSetting(checked.language);
        }
        return SettingCollection.createFrom(settings);
    }
    
    /**
     * @param {string} [checked]
     * @returns {ButtonGroup}
     */
    languageSetting(checked) {
        return ButtonGroup.from(
            ObjectUtils.onlyKeys(LANGUAGES, this.languages.keys, true),
            {
                label: "Language",
                checked: checked ?? this.languages.default,
                exclusive: true
            }
        );
    }

    /**
     * @param {string} key
     * @returns {boolean}
     */
    hasSetting(key) {
        switch (key) {
            case "language":
                return this.languages.keys.length > 1;
            case "variant":
                return this.variants != null;
            case "font-family":
                return Object.keys(this.fonts.data).length > 1;
            case "subset":
                return Object.keys(this.subsets).length > 1;
            default:
                throw new Error(`Invalid settings key ${key}.`);
        }
    }

    /**
     * @param {string} [subset]
     * @param {string} [variant]
     * @returns {string | undefined}
     */
    getLang(subset, variant) {
        return this.getSubset(subset).getLang(variant) ?? this.metadata.lang;
    }

    getDir() {
        return this.metadata.dir;
    }

    /**
     * @param {string} variant
     * @returns {{lang?: string, dir?: string}}
     */
    getLetterNodeAttrs(variant) {
        const data = {};
        const lang = this.getLang(variant);
        const dir = this.getDir();
        if (lang) data.lang = lang;
        if (dir) data.dir = dir;
        return data;
    }

    /**
     * @param {string} [subset]
     * @returns {DatasetSubset}
     */
    getSubset(subset) {
        if (subset && this.hasSetting("subset")) return this.subsets[subset];
        return Object.values(this.subsets)[0];
    }

    /**
     * @param {string} subset
     * @param {string} form
     * @param {string} [checked]
     * @returns {ButtonGroup}
     */
    combineMethodSetting(subset, form, checked) {
        /** @type {string | string[]} */
        let keys = this.subsets[subset].combineMethods(form);
        if (!keys) throw new Error("Form doesn't use combine.");
        if (typeof keys === "string") keys = [keys];

        return ButtonGroup.from(
            ObjectUtils.map(
                ObjectUtils.onlyKeys(this.combine.methods, keys),
                (method, key) => method.label || key
            ),
            {exclusive: true, checked: checked || keys[0]}
        );
    }

    /**
     * @param {string} method
     * @param {string} subset
     * @param {number[]} [selected]
     * @return {SettingCollection}
     */
    combineLettersSettings(method, subset, selected) {
        const sc = new SettingCollection();
        const config = this.combine.methods[method];
        const letterConfig = config.letterConfig || new Array(config.subsets.length).fill(null);

        for (const [index, ss] of config.subsets.entries()) {
            if (ss === subset) continue;
            const setting = this.subsets[ss].letterSelect(Object.assign({}, letterConfig, {selected: selected ? selected[index] : null}));
            sc.add(index, setting);
        }

        return sc;
    }

    /**
     * @param {string} method
     * @param {number[]} combineKeys
     * @returns {(string | null)[]}
     */
    getCombineLetters(method, combineKeys) {
        const config = this.combine.methods[method];
        return config.subsets.map((ss, index) => {
            const key = combineKeys[index];
            if (key == null) return null;
            const form = config.letterConfig?.[index] ? config.letterConfig[index].form : null;
            return this.subsets[ss].getLetterForm(key, form).nodeable.string;
        });
    }

    // ============================= FONTS ====================================
    hasFonts() {
        return !!this.fonts;
    }
    
    loadFonts() {
        if (this.hasFonts()) {
            return Promise.all([
                this.getFont(this.metadata.gameHeading.font).load(),
                this.getSelectorDisplayFont().load()
            ]);
        } else {
            return Promise.resolve();
        }
    }

    /**
     * @param {string | Record<string, *>} font
     * @param {string} [variant]
     * @returns {Font}
     */
    getFont(font, variant) {
        font ??= {};
        if (typeof font === "string") font = {key: font};
        if ("family" in font) {
            console.warn(`Found family property "${font.family}" in font: Will be overwritten! Use 'key' property to reference dataset fonts instead.`);
        }

        let key = font.key ?? this.fonts.defaultKey;
        if (!(key in this.fonts.data)) {
            console.error(`Unknown font key "${key}".`);
            key = this.fonts.defaultKey;
        }

        return this.fonts.data[key].font.applyParams(
            this.getVariantFontParams(key, variant),
            ObjectUtils.withoutKeys(font, "key")
        );
    }

    /**
     * @param {string} key
     * @param {string} [variant]
     * @returns {Record<string, *>}
     */
    getVariantFontParams(key, variant) {
        if (variant) {
            const fonts = this.variants.data[variant].fonts;
            if (fonts && key in fonts) {
                return fonts[key];
            }
        }

        return {};
    }

    /**
     * @param {string} [subset]
     * @param {string} [variant]
     * @returns {Font}
     */
    getSelectorDisplayFont(subset, variant) {
        return this.getFont(this.getSubset(subset).selectorData.font, variant);
    }

    /**
     * @param {string} [checked]
     * @returns {ButtonGroup}
     */
    fontFamilySetting(checked) {
        const setting = ButtonGroup.from(
            ObjectUtils.map(this.fonts.data, font => font.label),
            {
                label: "Font",
                exclusive: true,
                checked: checked ?? this.fonts.defaultKey
            }
        );
        setting.node.classList.add("font-family-setting");
        return setting;
    }

    /**
     * @param {string} [variant]
     */
    getGameHeading(variant) {
        const data = this.metadata.gameHeading;
        const {type, lang, dir, string} = data;
        if (!type || type === "string" || type === "elements") {
            const font = this.hasFonts() ? this.getFont(data.font, variant) : null;

            if (type === "elements") {
                const container = document.createElement("div");
                container.classList.add("element-heading-container");
                const els = [];
                for (const [no, symbol] of [[19, "K"], [85, "At"], [42, "Mo"], [16, "S"]]) {
                    const el = DOMUtils.getTemplate("headingElement");
                    el.querySelector(".heading-element-symbol").textContent = symbol;
                    el.querySelector(".heading-element-number").textContent = no;
                    els.push(el);
                }
                container.replaceChildren(...els);
                if (font) font.applyTo(container);

                return container;
            }

            const span = DOMUtils.createElement("span", string ?? "Kadmos");
            span.setAttribute("lang", lang ?? this.getLang());
            span.setAttribute("dir", dir ?? this.getDir());
            if (font) font.applyTo(span);

            return span;
        } else if (type === "braille") {
            return new BrailleString(string).getNode();
        }

        return "Kadmos";
    }
}
