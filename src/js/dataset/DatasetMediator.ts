import {DOMUtils, Observable} from '../utils';
import Game, {GameConfig} from "../game/Game";
import QuizDealer from "../quiz/QuizDealer";
import {Card, CardFactory} from "../quiz/card";
import {RadioButtonGroup, SettingCollection, Slider} from "../settings";
import {LetterType, NodeableFromLetterKey} from "../letter/utils";
import {Dataset, DatasetGameSettings} from "./Dataset";
import DatasetSubset, { DatasetSelector, SelectorSettings} from "./DatasetSubset";
import QuizItem from "../quiz/QuizItem";
import {SettingsValues} from "../settings/SettingCollection";


export interface DatasetMediatorSettings {
    selector?: SettingCollection<SelectorSettings>,
    game?: SettingCollection<DatasetGameSettings>,
    subset?: RadioButtonGroup,
    combine?: {method: RadioButtonGroup, keys: SettingCollection<number[]>}
}

export interface DatasetSettingsValues {
    selector?: SelectorSettings & {checked: boolean[]},
    game?: DatasetGameSettings,
    subset?: string,
    combine?: {
        method: string,
        keys: number[]
    }
}

export interface SubsetCache {
    selector?: Partial<SelectorSettings> & {checked?: boolean[]},
    game?: Partial<DatasetGameSettings>,
    combine?: {
        [form: string]: {
            method: string,
            keys?: {
                [method: string]: number[]
            }
        }
    }
}
export type DatasetCache = Record<string, SubsetCache>;

export interface FontSettings {
    family: string;
    weight: number;
}

export default class DatasetMediator<K extends LetterType> extends Observable<[DatasetSettingsValues]> {
    dataset: Dataset<K>;
    subset: DatasetSubset<K>;
    settings: DatasetMediatorSettings;
    settingsCache: DatasetCache;
    subsetCache: SubsetCache;
    selector: DatasetSelector<K>;

    /**
     * @param {Dataset} dataset
     * @param [settingsCache]
     * @param [settingsValues]
     */
    constructor(dataset: Dataset<K>, settingsCache: DatasetCache | null, settingsValues: DatasetSettingsValues = {}) {
        super();
        this.dataset = dataset;

        this.settings = {};
        const subsetKey = this.dataset.getSubset(settingsValues.subset).key;
        this.settingsCache = this.updateCacheToValues(settingsCache, settingsValues, subsetKey);

        this.updateSubset = this.updateSubset.bind(this);
        this.applyCombineSettings = this.applyCombineSettings.bind(this);
        this.updateCache = this.updateCache.bind(this);

        if (this.dataset.hasSetting("subset")) {
            this.settings.subset = this.dataset.subsetSetting(subsetKey);
            this.settings.subset.observers.push(this.updateSubset, this.callObservers);
        }

        this.subset = this.getSubset();
        this.subsetCache = this.getSubsetCache();

        this.updateCache();
        this.observers.push(this.updateCache);

        this.selector = this.subset.createSelector();
        this.setupSettings();
        this.setupSelector();
        this.setupObservers();
    }

    getSubset() {
        return this.dataset.getSubset(this.settings.subset?.value);
    }

    getSubsetCache() {
        return this.settingsCache[this.subset.key] ??= {};
    }

    updateSubset() {
        this.subset = this.getSubset();
        this.subsetCache = this.getSubsetCache();

        this.setupSettings();
        this.updateSelector();
        this.setupObservers();
    }

    updateCacheToValues(cache: DatasetCache | null, values: DatasetSettingsValues, subsetKey?: string): DatasetCache {
        subsetKey ??= this.subset.key;
        cache ??= {};
        const subCache = cache[subsetKey] ??= {};

        for (const key of ["selector", "game"] as const) {
            if (values[key]) {
                subCache[key] ??= {};
                Object.assign(subCache[key], values[key]);
            }
        }

        const form = subCache.selector?.forms?.[0];
        if (values.combine && form) {
            subCache.combine ??= {};
            if (subCache.combine[form]) {
                subCache.combine[form].method = values.combine.method;
            } else {
                subCache.combine[form] = {method: values.combine.method};
            }

            const keys = subCache.combine[form].keys ??= {};
            keys[values.combine.method] = values.combine.keys;
        }

        return cache;
    }

    updateCache() {
        this.updateCacheToValues(this.settingsCache, this.getSettingsValues());
    }

    replaceSetting<T extends SettingsValues>(newSC: SettingCollection<T>, oldSC?: SettingCollection<T>) {
        if (oldSC) oldSC.replaceWith(newSC);
        return newSC;
    }

    setupSettings() {
        this.settings.selector = this.replaceSetting(
            this.subset.getSelectorSettings(this.subsetCache.selector),
            this.settings.selector
        );
        this.settings.game = this.replaceSetting(
            this.dataset.getGameSettings(this.subset.key, this.subsetCache.game),
            this.settings.game
        );
        
        this.settings.selector.node.classList.add("inline");
    }

    removeCombineSettings() {
        this.removeCombineMethodSetting();
        this.removeCombineKeysSetting();
        delete this.settings.combine;
    }

    removeCombineMethodSetting() {
        if (this.settings.combine?.method) {
            this.settings.combine.method.remove();
            this.settings.combine.method.teardown();
        }
    }

    removeCombineKeysSetting() {
        if (this.settings.combine?.keys) {
            this.settings.combine.keys.remove();
            this.settings.combine.keys.teardown();
        }
    }

    setupCombineSettings() {
        this.removeCombineSettings();
        if (!this.settings.selector) throw new Error("Selector setting must be set up first.");

        const form = this.currentForms()[0];
        if (!form || !this.subset.hasCombine(form)) return;

        const method = this.subsetCache.combine?.[form]?.method;
        const methodSetting = this.dataset.combineMethodSetting(this.subset.key, form, method);
        this.settings.selector.node.append(methodSetting.node);
        const keysSettings = this.getCombineKeysSettings(methodSetting.value);
        this.settings.combine = {method: methodSetting, keys: keysSettings};

        methodSetting.node.insertAdjacentElement("afterend", keysSettings.node);
        methodSetting.observers.push(() => DOMUtils.transition(
            () => {
                this.updateCombineKeysSetting();
                this.applyCombineSettings();
                this.callObservers();
            },
            ["selector-forms"]
        ));
    }
    
    getCombineKeysSettings(method: string) {
        const form = this.currentForms()[0];

        const setting = this.dataset.combineLettersSettings(method, this.subset.key, this.subsetCache.combine?.[form]?.keys?.[method]);
        setting.observers.push(this.applyCombineSettings, this.callObservers);
        setting.node.classList.add("inline");

        return setting;
    }

    updateCombineKeysSetting() {
        this.removeCombineKeysSetting();
        if (!this.settings.combine) throw new Error("Combine method setting must be set up before keys setting.");

        this.settings.combine.keys = this.getCombineKeysSettings(this.settings.combine.method.value);
        this.settings.combine.method.node.insertAdjacentElement("afterend", this.settings.combine.keys.node);
    }

    applyCombineSettings() {
        const combineConfig = this.getCombineConfig();
        const form = this.currentForms()[0];

        if (this.selector) this.selector.updateButtonContents((content, item) => {
            this.findFormElement(content, form).replaceChildren(
                item.getForm(form).getNode({combine: combineConfig})
            );
        });
    }
    
    getCombineConfig() {
        const values = this.getCombineSettingsValues()
        if (!values) return undefined;
        return this.dataset.getCombineConfig(this.subset.key, values.method, values.keys);
    }

    getCombineSettingsValues() {
        const settings = this.settings.combine;
        if (!settings) return undefined;

        return {
            method: settings.method.value,
            keys: settings.keys.getValues()
        };
    }

    setupSelector() {
        this.applySelectorStyles();
        this.readSelectorSettings();

        const checked = this.subsetCache.selector?.checked ?? new Array<boolean>(this.subset.items.length).fill(true);
        this.selector.setChecked((_, i) => checked[i]);
    }

    updateSelector() {
        const selector = this.subset.createSelector();
        this.selector.replaceWith(selector);
        this.selector = selector;
        this.setupSelector();
    }

    setupObservers() {
        if (!this.settings.selector || !this.settings.game) throw new Error("Settings not set up yet.");
        this.settings.selector.observers.push((values, changed) => DOMUtils.transition(
            () => {
                this.applySelectorSettings(values, changed);
                this.callObservers();
            },
            ["selector-forms"]
        ));

        this.selector.observers.push(this.callObservers);
        this.settings.game.observers.push(this.callObservers);
    }

    observerArgs(): [DatasetSettingsValues] {
        return [this.getSettingsValues()];
    }

    updateSelectorFont(variant?: string) {
        const font = this.dataset.getSelectorDisplayFont(this.subset.key, variant);
        this.selector.updateButtonContents(content => {
            font.applyTo(content);
        });
    }

    applySelectorStyles() {
        this.selector.node.dir = this.dataset.getDir();

        const blockStyles = this.subset.getSelectorBlockStyles();
        this.selector.blocks.forEach((block, index) => {
            block.applyStyle(blockStyles[index]);
        });
    }

    findFormElement(content: HTMLElement, form: string): HTMLElement {
        for (const elem of content.querySelectorAll(".letter") as NodeListOf<HTMLElement>) {
            if (elem.dataset.form === form) return elem;
        }
        throw new Error("Form element not found.");
    }

    getCheckedItems() {
        return this.selector.getCheckedItems();
    }

    getVariant() {
        return this.settings.selector?.getValue("variant");
    }

    getLanguage() {
        return this.settings.game?.getValue("language");
    }

    checkedCount(includeDisabled?: boolean): number {
        return this.selector.checkedCount(includeDisabled);
    }

    getSettingsValues(): DatasetSettingsValues {
        const values: DatasetSettingsValues = {};

        if (this.subset) values.subset = this.subset.key;
        if (this.settings.selector) {
            values.selector = {
                ...this.settings.selector.getValues(),
                checked: this.selector.getChecked({includeDisabled: true})
            }
        }

        if (this.settings.game?.size) values.game = this.settings.game.getValues();
        values.combine = this.getCombineSettingsValues();

        return values;
    }

    currentForms(): string[] {
        const defaultKey = this.subset.defaultFormKey();
        return this.settings.selector?.getValue("forms") ?? [defaultKey];
    }

    readSelectorSettings() {
        this.applySelectorSettings(this.settings.selector?.getValues() ?? {});
        this.applyCombineSettings();
    }

    applySelectorSettings({forms, variant}: Partial<SelectorSettings>, changed?: string) {
        const formKeys = this.subset.getFormKeysFromGrouped(forms);

        this.selector.updateButtonContents(content => content.classList.add("font-transform"));

        if (!changed || changed === "forms") {
            this.selector.updateButtonContents(content => {
                (content.querySelectorAll(".letter") as NodeListOf<HTMLElement>).forEach(elem => {
                    const form = elem.dataset.form;
                    if (!form) {
                        console.error("Form not set in .letter dataset.");
                        return;
                    }
                    const shown = formKeys.includes(form);
                    DOMUtils.toggleShown(shown, elem);
                });
            });
        }

        if (!changed || changed === "variant") {
            if (this.dataset.hasFonts()) this.updateSelectorFont(variant);
            const lang = this.dataset.getLang(this.subset.key, variant);
            if (lang) this.selector.updateButtonContents(content => {
                content.lang = lang;
            });
        }

        this.selector.setDisabled(
            (item, index) => !this.subset.isItemIncluded(index, variant) || item.countQuizItems(formKeys) === 0
        );

        this.setupCombineSettings();
    }

    getActiveForms(): string[] {
        return this.subset.getFormKeysFromGrouped(this.settings.selector?.getValue("forms"));
    }

    getActiveProperties() {
        return this.settings.game?.getValue("properties") ?? Object.keys(this.subset.properties);
    }

    getGameParams() {
        return {
            variant: this.getVariant(),
            language: this.getLanguage()
        };
    }

    /**
     * @returns {CardFactory}
     */
    getCardFactory(): CardFactory<QuizItem<NodeableFromLetterKey<K>>, any> {
        const attrs = this.dataset.getLetterNodeAttrs(this.subset.key, this.getVariant());
        const property = this.cardLabelProperty();
        const config = {property, combine: this.getCombineConfig()};

        return new CardFactory(
            (card, item, {combine, property}) => {
                card.display(item.content.getNode({combine}));
                card.setLabel("bottom", item.answers[property].display);
            },
            {
                setup: card => {
                    DOMUtils.setAttrs(card.displayNode, attrs);
                    card.displayNode.classList.add("font-transform");
                },
                config
            }
        );
    }

    cardLabelProperty() {
        return this.getActiveProperties()[0];
    }

    getGame(config?: GameConfig) {
        const forms = this.getActiveForms();
        const properties = this.getActiveProperties();
        const params = this.getGameParams();
        const items = this.subset.getQuizItems(this.getCheckedItems(), properties, forms, params);
        const referenceItems = this.subset.getReferenceItems(properties, forms, params);

        const dealer = new QuizDealer(items);
        const cardFactory = this.getCardFactory();

        const game = new Game(dealer, cardFactory, config);
        game.setReferenceItems(referenceItems, cardFactory);

        switch (this.subset.letterConfig.type) {
            case "string":
                game.addCardSettings(this.getFontSettings(), this.fontSettingsCallback(params.variant));
                break;
            case "braille":
                game.addCardSettings(this.getBrailleSettings(), this.brailleSettingsCallback());
                break;
        }

        game.setCardDisplayMeta({
            dir: this.dataset.getDir(),
            lang: this.dataset.getLang(this.subset.key, params.variant)
        });
        game.setupAnswerElements(
            properties.map(key => {return {key: key, label: this.subset.properties[key].label}}),
            {lang: params.language}
        );

        return game;
    }

    updateSymbolWeightRange(key: string, weightSlider: Slider) {
        const [min, max] = this.dataset.getFont({key: key}, this.settings.selector?.getValue("variant")).getWeightLimits();
        weightSlider.setMin(min);
        weightSlider.setMax(max);
    }

    getFontSettings() {
        if (!this.dataset.fonts) throw new Error("Dataset doesn't have fonts.");

        const weightSlider = Slider.create(100, 900, this.dataset.gameConfig.defaultWeight ?? 500);
        weightSlider.label("Weight");

        const sc = new SettingCollection({family: this.dataset.fontFamilySetting(), weight: weightSlider});
        this.updateSymbolWeightRange(sc.getValue("family"), weightSlider);

        sc.get("family")?.observers?.push(key => this.updateSymbolWeightRange(key, weightSlider));

        return sc;
    }

    fontSettingsCallback(variant?: string): (card: Card, value: FontSettings, changed?: keyof FontSettings) => void {
        return (card, {family, weight}, changed) => {
            if (this.dataset.hasFonts() && (!changed || changed === "family")) {
                const font = this.dataset.getFont({key: family}, variant);
                font.load().then(() => {
                    font.applyTo(card.displayNode);
                    if (weight) card.displayNode.style.fontWeight = weight.toString();
                });
            } else if (weight) {
                card.displayNode.style.fontWeight = weight.toString();
            }
        }
    }
    
    getBrailleSettings() {
        const slider = Slider.create(0, 1, 0.35);
        slider.setStep(0.05);
        slider.label("Unfilled Dot Size");
        return slider;
    }

    brailleSettingsCallback() {
        return (card: Card, size: number) => {
            card.displayNode.style.setProperty("--braille-small-dot-size", size.toString());
        };
    }

    teardown() {
        this.selector.teardown();
        this.settings.selector?.teardown();
        this.settings.game?.teardown();
    }
}
