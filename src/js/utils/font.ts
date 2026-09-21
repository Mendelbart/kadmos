import * as ObjectUtils from "./object";
import _font_data from '../../json/fonts.json';

export interface FontFaceData extends Record<string, any> {
    fallback?: string,
    weight?: string,
    scale?: number,
    shift?: number,
    variationSettings?: FontFaceVariationSettings,
    styleset?: Record<string, number>,
    display?: FontDisplay,
    style?: string,
    url?: string
}

export interface ElementFontProperties extends Record<string, any> {
    weight?: number,
    stretch?: string,
    style?: string,
    scale?: number,
    shift?: number,
    styleset?: string,
    letterSpacing?: string,
    lineHeight?: number,
    variationSettings?: string | ElementVariationSettings,
}

const FONT_DATA: Record<string, FontFaceData> = Object.fromEntries(_font_data.map(font => [font.family, font]));
const DEFAULT_FONTFACE_DATA: FontFaceData = {
    display: "swap",
    weight: "400",
    style: "normal",
};

export type ElementVariationSettings = Record<string, string | number | undefined>;
export type FontFaceVariationSettings = Record<string, string | undefined>;

const FONT_TRANSFORM_PROPERTIES = ["shift", "scale", "lineHeight"] as const;
const FONT_PROPERTY_KEYS: Record<keyof ElementFontProperties, string> = {
    weight: "font-weight",
    stretch: "font-stretch",
    style: "font-style",
    scale: "--font-scale",
    shift: "--font-shift",
    styleset: "font-variant-alternates",
    letterSpacing: "--letter-spacing",
    lineHeight: "--line-height",
    variationSettings: "font-variation-settings"
};


const FONT_FACES: Record<string, FontFace> = {};

function defaultFontURL(family: string): string {
    const url = `/kadmos/assets/fonts/scripts/${family.replace(/ /g, "")}.woff2`;
    const format = supportsVariableFonts() ? 'woff2-variations' : 'woff2';
    return `url("${url}") format("${format}")`;
}

function supportsSupports(): boolean {
    return "CSS" in window && "supports" in CSS;
}

export function supportsStylesets(): boolean {
    return supportsSupports() && CSS.supports("font-variant-alternates", "styleset(x)");
}

export function supportsVariableFonts(): boolean {
    return supportsSupports() && CSS.supports("font-variation-settings", "normal");
}

function getFontFace(family: string): FontFace {
    const data = Object.assign({}, DEFAULT_FONTFACE_DATA, FONT_DATA[family]);

    if (data.styleset && supportsStylesets()) {
        document.styleSheets[0].insertRule(
            `@font-feature-values "${family}" {@styleset {` +
            Object.entries(data.styleset).map(([name, value]) => `${name}: ${value};`).join("") +
            '}}'
        );
        delete data.styleset;
    }

    if (data.variationSettings) {
        const newDescriptors = digestFontFaceVariationSettings(data.variationSettings);
        delete data.variationSettings;
        Object.assign(data, newDescriptors);
    }

    return new FontFace(family, data.url ?? defaultFontURL(family), {
        // @ts-ignore
        ...data, variationSettings: data.variationSettings ? variationSettingsString(data.variationSettings): undefined
    });
}

function digestFontFaceVariationSettings(variationSettings: FontFaceVariationSettings): FontFaceData {
    const result: FontFaceData = {};

    variationSettings = Object.assign({}, variationSettings);

    const {wght, wdth} = variationSettings;
    if (wght != null) {
        result.weight = wght;
        delete variationSettings.wght;
    }
    if (wdth != null) {
        result.stretch = wdth.split(" ").map(x => x + "%").join(" ");
        delete variationSettings.wdth;
    }

    if (Object.keys(variationSettings).length > 0) {
        result.variationSettings = variationSettings;
    }

    return result;
}

function toInt(int: number | string) {
    return typeof int === "number" ? int : parseInt(int);
}

function digestFontVariationSettings(variationSettings: ElementVariationSettings): ElementFontProperties {
    const result: ElementFontProperties = {};
    
    variationSettings = Object.assign({}, variationSettings);

    if (variationSettings.wght != null) {
        result.weight = toInt(variationSettings.wght);
        delete variationSettings.wght;
    }
    if (variationSettings.wdth != null) {
        result.stretch = variationSettings.wdth + "%";
        delete variationSettings.wdth;
    }

    if (Object.keys(variationSettings).length > 0) {
        result.variationSettings = variationSettings;
    }

    return result;
}

export function clearFont(element: HTMLElement): void {
    for (const property of Object.values(FONT_PROPERTY_KEYS)) {
        element.style.removeProperty(property);
    }
}

function setStylesets(element: HTMLElement, stylesets: string | string[], family: string): void {
    const data = FONT_DATA[family];
    if (!data) throw new Error("Unknown family.");
    if (!data.styleset) throw new Error("Family doesn't have stylesets.");

    stylesets = Array.isArray(stylesets) ? stylesets : [stylesets];

    if (supportsStylesets()) {
        element.style.setProperty(
            "font-variant-alternates",
            `styleset(${stylesets.join(", ")})`
        );
    } else {
        const ssIDs: number[] = stylesets.map(name => data.styleset![name]);
        const ssIDsStr = ssIDs.map(id => `"ss${id.toString().padStart(2, "0")}"`).join(', ');
        element.style.setProperty("font-feature-settings", ssIDsStr);
    }
}


function validateFamily(family: string): void {
    if (!FONT_DATA[family]) throw new Error(`Unknown family ${family}.`);
}

function variationSettingsString(varSettings: Record<string, string | number | undefined>):string {
    return Object.entries(varSettings)
        .filter(([_, value]) => value != null)
        .map(([key, value]) => `"${key}" ${value}`).join(",");
}


export class Font {
    family: string;
    params: ElementFontProperties;

    constructor(family: string, params: ElementFontProperties = {}) {
        validateFamily(family);
        this.family = family;
        this.params = params;
    }

    static get(family: string): Font {
        return new this(family, ObjectUtils.onlyKeys(FONT_DATA[family], FONT_TRANSFORM_PROPERTIES));
    }

    load(): Promise<FontFace> {
        if (!FONT_FACES[this.family]) {
            FONT_FACES[this.family] = getFontFace(this.family);
            document.fonts.add(FONT_FACES[this.family]);
        }

        return FONT_FACES[this.family].load();
    }

    applyProperties(...properties: (ElementFontProperties | undefined | null)[]): Font {
        const newParams = Object.assign({}, this.params);
        for (let props of properties) {
            if (!props) continue;

            if (props.variationSettings && typeof props.variationSettings !== "string") {
                props = Object.assign({}, props, digestFontVariationSettings(props.variationSettings));
            }

            for (const [key, value] of Object.entries(props)) {
                if (key === "shift") {
                    newParams.shift ??= 0;
                    newParams.shift += value;
                } else if (key === "scale") {
                    newParams.scale ??= 1;
                    newParams.scale *= value;
                } else {
                    newParams[key] = value;
                }
            }
        }

        return new Font(this.family, newParams);
    }

    applyTo(element: HTMLElement): void {
        const data = this.getFontData();

        clearFont(element);
        element.style.fontFamily = this.family + ", " + (data.fallback ?? "system-ui, sans-serif");

        for (let [key, value] of Object.entries(this.params)) {
            if (key === "styleset") {
                setStylesets(element, value, this.family);
            } else if (key === "variationSettings") {
                element.style.setProperty(FONT_PROPERTY_KEYS[key], variationSettingsString(value));
            } else {
                if (typeof value === "number") value = Math.round(value * NumericPropertiesRounding) / NumericPropertiesRounding;

                element.style.setProperty(FONT_PROPERTY_KEYS[key], value);
            }
        }

        element.classList.add("font-transform");
    }

    getFontData(): FontFaceData {
        return FONT_DATA[this.family];
    }

    getWeightLimits(): [number, number] {
        const data = this.getFontData();
        const weights = data.variationSettings?.wght ?? data.weight ?? 400;
        if (typeof weights === "number") return [weights, weights];

        let [min, max] = weights.split(" ", 2);
        if (max == null) max = min;

        return [parseInt(min), parseInt(max)];
    }
}

const NumericPropertiesRounding = 10000;
