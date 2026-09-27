import {Dataset, LanguageKey} from "./Dataset";
import {LetterType} from "../letter/utils";
import DatasetSubset, {DatasetItem, DatasetSelector} from "./DatasetSubset";
import {
    SchemaFormDisplayConfig,
    SchemaGameForm,
    SchemaGameForms, SchemaGameProperties, SchemaGameProperty,
    SchemaQuizAnswerConfig
} from "../../json/dataset.schema";
import {DefaultListSplitter, getSplitter, QuizAnswer, QuizAnswerFactory} from "../quiz/answer";
import {capitalize, map} from "../utils/object";
import {LetterFormsCombination, StringLetter} from "../letter";
import {DiacriticLetter, Nodeable} from "../letter/letter";
import {SettingCollection, Slider} from "../settings";
import ConstantSetting from "../settings/ConstantSetting";
import {createButtonGroup} from "../settings/ButtonGroup";
import {DOMUtils, ObjectUtils} from "../utils"
import {hide, show, StylableElement, toggleShown} from "../utils/dom";
import Game, {GameConfig, SettingCallbackPair} from "../game/Game";
import QuizDealer from "../quiz/QuizDealer";
import QuizItem from "../quiz/QuizItem";
import {CardFactory} from "../quiz/card";
import {Font} from "../utils/font";


export interface GameProperty {
    label: string,
    key: string,
    config: SchemaQuizAnswerConfig,
    factory: (value: string) => QuizAnswer
}

export interface GameForm {
    label: string,
    key: string,
    displayConfig: SchemaFormDisplayConfig
    groupWith?: string
}

export interface GameFormsConfig {
    label: string,
    data: Record<string, GameForm>,
    exclusive: boolean
}

export interface DatasetSingleGameSettings {
    variant: string,
    language: LanguageKey,
    properties: string[],
    forms: string[]
}

export interface DatasetSingleGameConfig {
    settings: DatasetSingleGameSettings,
    selector: boolean[]
}

export interface GameProperties {
    data: Record<string, GameProperty>,
    exclusive: boolean
    label: string
}

export default class DatasetSingleGame<K extends LetterType> {
    dataset: Dataset<K>
    subset: DatasetSubset<K>
    properties: GameProperties
    forms: GameFormsConfig
    label: string

    constructor(dataset: Dataset<K>, subset: DatasetSubset<K>, config: {forms?: SchemaGameForms, properties?: SchemaGameProperties, label: string}) {
        this.dataset = dataset;
        this.subset = subset;
        this.properties = this.processProperties(config.properties);
        this.forms = this.processForms(config.forms);
        this.label = config.label;
    }

    processProperties(properties: SchemaGameProperties = {}): GameProperties {
        const data = properties.data ?? ObjectUtils.map(this.subset.properties,
            (_, key) => {return {label: capitalize(key)}}
        );
        const exclusive = properties.exclusive ?? false
        return {
            data: map(data, (property, key) => this.processProperty(property, key as string)),
            exclusive: exclusive,
            label: properties.label ?? exclusive ? "Property" : "Properties"
        };
    }

    processProperty(config: SchemaGameProperty, key: string): GameProperty {
        const refKey = config.key ?? key;
        const propertyConfig = Object.assign({}, this.subset.properties[refKey].config, config.config);
        return {
            label: config.label,
            key: refKey,
            config: propertyConfig,
            factory: QuizAnswerFactory(propertyConfig)
        };
    }

    processForms(forms: SchemaGameForms = {}): GameFormsConfig {
        const data = forms.data ?? ObjectUtils.fromKeys(this.subset.forms, key => {return {label: capitalize(key)}});
        const exclusive = forms.exclusive ?? true;
        return {
            label: forms.label ?? exclusive ? "Form" : "Forms",
            exclusive: exclusive,
            data: map<Record<string, SchemaGameForm>, GameForm>(data, (form, key) => {
                return {
                    label: form.label,
                    key: form.key ?? key,
                    displayConfig: form.displayConfig ?? {type: "normal"},
                    groupWith: form.groupWith
                };
            })
        }
    }

    getPropertySplitter(property: string): RegExp | undefined {
        const config = this.properties.data[property].config;

        if ("list" in config && config.list && config.list.length > 0) {
            return new RegExp(config.list.map(
                listConfig => listConfig.splitter ?? DefaultListSplitter
            ).join("|"), "g");
        }
    }

    getSelector(checked?: boolean[]) {
        const selector = this.subset.createSelector({
            content: item => this.getLetterCombination(item).getNode()
        });
        selector.updateButtonContents(content => content.classList.add("font-transform"));

        checked ??= new Array<boolean>(this.subset.items.length).fill(true);
        selector.setChecked(checked);
        selector.node.dir = this.dataset.getDir();

        return selector;
    }

    getSelectorLabel(item: DatasetItem<K>, settings: DatasetSingleGameSettings) {
        const property = this.getLabelProperty(settings.properties);
        let value = item.getProperty({property: this.properties.data[property].key, params: settings});

        const splitter = getSplitter(this.properties.data[property].config);
        if (splitter) value = value.split(splitter, 2)[0].trim();

        return value;
    }

    applySelectorSettings(selector: DatasetSelector<K>, settings: DatasetSingleGameSettings): void {
        selector.updateLabels(item => this.getSelectorLabel(item, settings));

        const forms = this.getFormKeysFromGrouped(settings.forms);
        selector.updateButtonContents((content, _, index) => {
            if (!this.subset.isItemIncluded(index, settings.variant)) return;

            content.querySelectorAll(".letter").forEach(elem => {
                if (!(elem instanceof HTMLElement) || !elem.dataset.form) return;
                toggleShown(forms.includes(elem.dataset.form), elem);
            });
        });
        selector.setDisabled((item, index) =>
            !this.subset.isItemIncluded(index, settings.variant) || item.getAvailableForms(forms).length === 0
        );

        if (this.dataset.fonts) {
            selector.applyFont(this.dataset.getSelectorDisplayFont(this.subset.key, settings.variant));
        }
    }

    getLabelProperty(properties: string[]) {
        return properties.length > 0 ? properties[0] : Object.keys(this.properties.data)[0];
    }

    getLetterCombination(item: DatasetItem<K>, forms?: string[]): LetterFormsCombination {
        forms ??= Object.keys(this.forms.data);
        const letters: [Nodeable, string][] = forms.map((key): [Nodeable, string] | undefined => {
            if (!item.hasForm(this.forms.data[key].key)) return undefined;
            return [this.getForm(item, key), key];
        }).filter(x => x != null);

        return new LetterFormsCombination(letters);
    }

    getForm(item: DatasetItem<K>, key: string): Nodeable {
        const form = this.forms.data[key];
        if (!form) throw new Error(`Invalid form key ${key}, need ${Object.keys(this.forms.data)}`);

        const nodeable = item.getForm(form.key);
        if (form.displayConfig.type === "normal") return nodeable;
        if (form.displayConfig.type === "diacritic") {
            if (!(nodeable instanceof StringLetter))
                throw new Error("Cannot make diacritic out of non-string letter.");
            return new DiacriticLetter(form.displayConfig.base, nodeable.string, form.displayConfig.overlay);
        }

        throw new Error(`Invalid form display config type.`);
    }

    getFormKeysFromGrouped(value?: string[]): string[] {
        if (!value) return Object.keys(this.forms.data);

        const keys = value.slice();

        for (const [key, form] of Object.entries(this.forms.data)) {
            if (form.groupWith && value.includes(form.groupWith)) {
                const index = keys.indexOf(form.groupWith);
                if (index !== -1) keys.splice(index + 1, 0, key);
            }
        }

        return keys;
    }

    getSettings(values: Partial<DatasetSingleGameSettings> = {}): SettingCollection<DatasetSingleGameSettings> {
        return new SettingCollection({
            variant: this.subset.variantSetting(values.variant),
            language: this.dataset.languageSetting(values.language),
            properties: this.propertySetting(values.properties),
            forms: this.formsSetting(values.forms)
        });
    }

    propertySetting(checked?: string[]) {
        const propertyKeys = Object.keys(this.properties.data);
        if (propertyKeys.length === 1) return new ConstantSetting(propertyKeys);

        return createButtonGroup(
            ObjectUtils.map(this.properties.data, p => p.label),
            {
                label: this.properties.label,
                checked: checked,
                exclusiveCheckboxes: this.properties.exclusive
            }
        );
    }

    getSelectorAndSettings(values: Partial<DatasetSingleGameConfig> = {}): SettingCollection<DatasetSingleGameConfig> {
        const selector = this.getSelector(values.selector);
        const settings = this.getSettings(values.settings);
        settings.observers.push(values => {
            DOMUtils.transition(() => this.applySelectorSettings(selector, values));
        });
        this.applySelectorSettings(selector, settings.getValues());

        return new SettingCollection({settings, selector});
    }

    getQuizAnswers(item: DatasetItem<K>, settings: DatasetSingleGameSettings) {
        return ObjectUtils.fromKeys(settings.properties, key => {
            const prop = this.properties.data[key];
            return prop.factory(item.properties[prop.key].get(settings))
        });
    }

    getQuizItems(items: DatasetItem<K>[], settings: DatasetSingleGameSettings) {
        return items.flatMap(item => {
            const availableForms = item.getAvailableForms(settings.forms);
            const answers = this.getQuizAnswers(item, settings);
            return availableForms.map(
                form => new QuizItem(this.getForm(item, form), answers)
            );
        });
    }

    getReferenceItems(settings: DatasetSingleGameSettings) {
        if (!this.forms.exclusive) settings.forms = Object.keys(this.forms.data);

        return this.subset.items.map(item => new QuizItem(
            item.combineForms(settings.forms),
            this.getQuizAnswers(item, settings)
        ));
    }

    getItems(checked: boolean[]) {
        return this.subset.items.filter((_, index) => checked[index]);
    }

    getCardFactory(settings: DatasetSingleGameSettings): CardFactory<QuizItem<Nodeable>, any> {
        const attrs = this.dataset.getLetterNodeAttrs(this.subset.key, settings.variant);
        const property = this.getLabelProperty(settings.properties);

        return new CardFactory(
            (card, item, {property}) => {
                card.display(item.content.getNode());
                card.setLabel("bottom", item.answers[property].display);
            },
            {
                setup: card => {
                    DOMUtils.setAttrs(card.displayNode, attrs);
                    card.displayNode.classList.add("font-transform");
                },
                config: {property}
            }
        );
    }
    
    getGame({selector: checked, settings}: DatasetSingleGameConfig, gameConfig: Partial<GameConfig> = {}) {
        settings = {
            ...settings,
            forms: this.getFormKeysFromGrouped(settings.forms)
        };
        const items = this.getQuizItems(this.getItems(checked), settings);
        const referenceItems = this.getReferenceItems(settings);

        const dealer = new QuizDealer(items);
        const cardFactory = this.getCardFactory(settings);

        const game = new Game(dealer, cardFactory, gameConfig);
        game.setReferenceItems(referenceItems, cardFactory);

        switch (this.subset.letterConfig.type) {
            case "string":
                game.addCardSettings(this.dataset.getFontSettingsPair(settings.variant));
                break;
            case "braille":
                game.addCardSettings(brailleSettingsPair());
                break;
        }

        game.setCardDisplayMeta(this.dataset.getLetterNodeAttrs(this.subset.key, settings.variant));
        game.setupAnswerElements(
            settings.properties.map(key => {return {key: key, label: this.properties.data[key].label}}),
            {lang: settings.language}
        );

        return game;
    }

    ungroupedForms(): Record<string, GameForm> {
        return ObjectUtils.filter(this.forms.data, f => f.groupWith == null);
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
}


export interface FontSettings {
    family: string;
    weight: number;
}

export function fontSettingsPair(fonts: Record<string, Font>, labels: Record<string, string> = {}, values: Partial<FontSettings> = {}): SettingCallbackPair<FontSettings> {
    const weightSlider = Slider.create({
        min: 100,
        max: 900,
        value: values.weight ?? 500,
        label: "Weight"
    });
    const familySetting = fontFamilySetting(fonts, labels, values.family)

    weightSlider.setMinMax(fonts[familySetting.value].getWeightLimits());
    familySetting.observers.push(key => weightSlider.setMinMax(fonts[key].getWeightLimits()));

    return {
        setting: new SettingCollection({
            family: familySetting,
            weight: weightSlider
        }),
        apply: fontSettingsCallback(fonts)
    };
}

function fontSettingsCallback(fonts: Record<string, Font>) {
    return (element: StylableElement, {family, weight}: FontSettings, changed?: string) => {
        if (changed === "weight") {
            element.style.fontWeight = weight.toString();
            return;
        }

        const font = fonts[family];
        font.load().then(() => {
            font.applyTo(element);
            element.style.fontWeight = weight.toString();
        });
    };
}

function fontFamilySetting(fonts: Record<string, Font>, labels: Record<string, string> = {}, checked?: string) {
    checked ??= Object.keys(fonts)[0];
    if (Object.keys(fonts).length === 1) return new ConstantSetting(checked);

    const setting = createButtonGroup(
        ObjectUtils.map(fonts, (font, key) => labels[key] ? labels[key] : font.family),
        {
            label: "Font",
            type: "radio",
            checked: checked
        }
    );
    setting.node.classList.add("font-family-setting");
    return setting;
}

function brailleSettingsPair(): SettingCallbackPair<number> {
    return {
        setting: Slider.create({
            min: 0,
            max: 1,
            value: 0.35,
            step: 0.05,
            label: "Unfilled Dot Size"
        }),
        apply(element, size) {
            element.style.setProperty("--braille-small-dot-size", size.toString());
        }
    }
}