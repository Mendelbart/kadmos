import {DOMUtils, Observable, ObjectUtils} from '../utils';
import Game from "../game/Game";
import QuizDealer from "../quiz/QuizDealer";
import {CardFactory} from "../quiz/card";
import {SettingCollection, Slider} from "../settings";


export default class DatasetMediator extends Observable {
    /**
     * @param {Dataset} dataset
     * @param [settingsCache]
     * @param [settingsValues]
     */
    constructor(dataset, settingsCache = {}, settingsValues = {}) {
        super();
        this.dataset = dataset;
        /**
         * @type {{selector: SettingCollection, game: SettingCollection, subset?: ButtonGroup, combine?: {method: ButtonGroup, keys?: SettingCollection}}}
         */
        this.settings = {};
        const subsetKey = this.dataset.getSubset(settingsValues.subset).key;
        this.settingsCache = this.updateCacheToValues(this.normalizeCache(settingsCache), settingsValues, subsetKey);

        this.updateSubset = this.updateSubset.bind(this);
        this.applyCombineSettings = this.applyCombineSettings.bind(this);
        this.updateCache = this.updateCache.bind(this);

        if (this.dataset.hasSetting("subset")) {
            /** @type ButtonGroup */
            this.settings.subset = this.dataset.subsetSetting(subsetKey);
            this.settings.subset.observers.push(this.updateSubset, this.callObservers);
        }

        this.updateSubset();
        this.updateCache();
        this.observers.push(this.updateCache);
    }

    /**
     * @param {string?} key
     */
    setupSubset(key) {
        /** @type {DatasetSubset} */
        this.subset = this.dataset.getSubset(key);
        this.subsetCache = this.settingsCache[this.subset.key] ??= {};
    }

    updateSubset() {
        this.setupSubset(this.settings.subset?.value);
        this.setupSettings();
        this.setupSelector();
        this.setupObservers();
    }
    
    normalizeCache(cache) {
        if (!cache) return {};
        return ObjectUtils.map(cache, subCache => ObjectUtils.onlyKeys(subCache, ["selector", "game", "combine"]));
    }

    updateCacheToValues(cache, values, subsetKey) {
        subsetKey ??= this.subset.key;
        cache ??= {};
        cache[subsetKey] ??= {};
        const subCache = cache[subsetKey];

        for (const [key, subKeys] of [["selector", ["forms", "variant", "checked"]], ["game", ["properties", "language"]]]) {
            if (values[key]) {
                subCache[key] ??= {};
                Object.assign(subCache[key], ObjectUtils.onlyKeys(values[key], subKeys));
            }
        }

        const subset = this.dataset.getSubset(subsetKey);
        const form = subCache.selector?.forms;
        if (values.combine && form && subset.hasCombine(form)) {
            subCache.combine ??= {};
            const combine = subCache.combine[form] ??= {};
            combine.method = values.combine.method;
            combine.keys ??= {};
            combine.keys[values.combine.method] = values.combine.keys;
        }

        return cache;
    }

    updateCache() {
        this.updateCacheToValues(this.settingsCache, this.getSettingsValues());
    }

    setupSettings() {
        const selectorSettings = this.subset.getSelectorSettings(this.subsetCache.selector);
        const gameSettings = this.dataset.getGameSettings(this.subset.key, this.subsetCache.game);

        selectorSettings.node.classList.add("inline");

        if (this.settings.selector) this.settings.selector.replaceWith(selectorSettings);
        if (this.settings.game) this.settings.game.replaceWith(gameSettings);

        this.settings.selector = selectorSettings;
        this.settings.game = gameSettings;
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
            this.settings.combine.method = null;
        }
    }

    removeCombineKeysSetting() {
        if (this.settings.combine?.keys) {
            this.settings.combine.keys.remove();
            this.settings.combine.keys.teardown();
            this.settings.combine.keys = null;
        }
    }

    /**
     * @return {boolean}
     */
    hasCombine() {
        return this.subset.hasCombine(this.currentForms());
    }

    setupCombineSettings() {
        this.removeCombineSettings();
        if (!this.hasCombine()) return;

        const form = this.currentForms();
        const method = this.subsetCache.combine?.[form]?.method;
        this.settings.combine = {method: this.dataset.combineMethodSetting(this.subset.key, form, method)}

        this.settings.combine.method.observers.push(() => DOMUtils.transition(
            () => {
                this.setupCombineKeysSettings();
                this.callObservers();
            },
            ["selector-forms"]
        ));
        this.settings.selector.node.append(this.settings.combine.method.node);
        this.setupCombineKeysSettings();
    }

    setupCombineKeysSettings() {
        this.removeCombineKeysSetting();

        const method = this.settings.combine.method.value;
        /** @type SettingCollection */
        this.settings.combine.keys = this.dataset.combineLettersSettings(method, this.subset.key, this.subsetCache.combine?.[this.currentForms()]?.keys?.[method]);
        this.settings.combine.keys.observers.push(this.applyCombineSettings, this.callObservers);
        this.settings.combine.method.node.insertAdjacentElement("afterend", this.settings.combine.keys.node);
        this.settings.combine.keys.node.classList.add("inline");
        this.applyCombineSettings();
    }

    applyCombineSettings() {
        const form = this.currentForms();
        const combineConfig = this.getCombineConfig();

        if (this.selector) this.selector.updateButtonContents((content, item) => {
            this.findFormElement(content, form).replaceChildren(
                item.getForm(form).getNode({combine: combineConfig})
            );
        });
    }
    
    getCombineConfig() {
        const {method, keys} = this.getCombineSettingsValues();
        /** @type StringCombiner */
        const combiner = this.dataset.combine.methods[method].combiner;
        const values = this.dataset.getCombineLetters(method, keys);
        const index = values.indexOf(null);

        return {combiner, values, index};
    }

    getCombineSettingsValues() {
        return {
            method: this.settings.combine.method.value,
            keys: Object.values(this.settings.combine.keys.getValues()).map(i => parseInt(i))
        };
    }

    setupSelector() {
        const oldSelector = this.selector;
        /** @type {Selector} */
        this.selector = this.subset.createSelector();
        this.setupSelectorButtons();
        this.selector.finishSetup();

        this.applySelectorStyles();
        this.readSelectorSettings();

        if (this.subsetCache.selector?.checked) this.selector.setChecked((_, i) => this.subsetCache.selector.checked[i]);

        if (oldSelector) oldSelector.replaceWith(this.selector);
    }

    setupSelectorButtons() {
        const forms = Object.keys(this.subset.forms.data);
        this.selector.setupButtonContents(item => item.combineForms(forms).getNode());

        if (this.subset.selectorData.label) {
            this.selector.labelButtons((item, index) => this.subset.getSelectorItemLabel(index));
        }
    }

    setupObservers() {
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

    observerArgs() {
        return [this.getSettingsValues()];
    }

    updateSelectorFont(variant) {
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

    /**
     * @param {HTMLElement} content
     * @param {string} form
     * @returns {HTMLElement}
     */
    findFormElement(content, form) {
        for (const elem of content.querySelectorAll(".letter")) {
            if (elem.dataset.form === form) return elem;
        }
        throw new Error("Form element not found.");
    }

    getCheckedItems() {
        return this.selector.getCheckedItems();
    }

    getVariant() {
        return this.settings.selector.getDefault("variant", null);
    }

    getLanguage() {
        return this.settings.game.getDefault("language", null)
    }

    /**
     * @param {boolean} [includeDisabled]
     * @returns {number}
     */
    checkedCount(includeDisabled) {
        return this.selector.checkedCount(includeDisabled);
    }

    /**
     * @returns {{
     *  subset?: string,
     *  selector: {checked: boolean[], forms?: string, variant?: string},
     *  game: {properties?: string[], language?: string},
     *  combine?: {method: string, keys: number[]}
     * }}
     */
    getSettingsValues() {
        const values = {};

        if (this.subset) values.subset = this.subset.key;
        values.selector = this.settings.selector.getValues();
        values.selector.checked = this.selector.getChecked({includeDisabled: true});
        if (this.settings.game.size > 0) values.game = this.settings.game.getValues();
        if (this.hasCombine()) values.combine = this.getCombineSettingsValues();

        return values;
    }

    /**
     * @returns {string | string[]}
     */
    currentForms() {
        const defaultKey = this.subset.defaultFormKey();
        return this.settings.selector.getDefault("forms", this.subset.forms.exclusive ? defaultKey : [defaultKey]);
    }

    readSelectorSettings() {
        this.applySelectorSettings(this.settings.selector.getValues());
    }

    /**
     * @param {string[]} [forms]
     * @param {string} [variant]
     * @param {"forms" | "variant" | null} [changed]
     */
    applySelectorSettings({forms, variant}, changed) {
        const formKeys = this.subset.getFormKeysFromGrouped(forms);

        this.selector.updateButtonContents(content => content.classList.add("font-transform"));

        if (!changed || changed === "forms") {
            this.selector.updateButtonContents(content => {
                content.querySelectorAll(".letter").forEach(elem => {
                    const shown = formKeys.includes(elem.dataset.form);
                    DOMUtils.toggleShown(shown, elem);
                });
            });
        }

        if (!changed || changed === "variant") {
            if (this.dataset.hasFonts()) this.updateSelectorFont(variant);
            const lang = this.dataset.getLang(variant);
            if (lang) {
                this.selector.updateButtonContents(content => {
                    content.lang = lang;
                });
            }
        }

        this.selector.setDisabled(
            (item, index) => !this.subset.isItemIncluded(index, variant) || item.countQuizItems(formKeys) === 0
        );

        this.setupCombineSettings();
    }

    /**
     * @returns {string[]}
     */
    getActiveForms() {
        if (!this.subset.hasSetting("forms")) return Object.keys(this.subset.forms.data);

        return this.subset.getFormKeysFromGrouped(this.settings.selector.getValue("forms"));
    }

    getActiveProperties() {
        return this.settings.game.getDefault("properties", Object.keys(this.subset.properties));
    }

    /**
     * @returns {Record<string, string>}
     */
    getGameParams() {
        const params = {};
        if (this.dataset.variants) params.variant = this.getVariant();
        if (this.dataset.hasSetting("language")) params.language = this.getLanguage();
        return params;
    }

    /**
     * @returns {CardFactory}
     */
    getCardFactory() {
        const attrs = this.dataset.getLetterNodeAttrs(this.getVariant());
        const property = this.cardLabelProperty();
        const config = {property};
        if (this.hasCombine()) config.combine = this.getCombineConfig();

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

    /**
     * @returns {Game}
     */
    getGame() {
        const forms = this.getActiveForms();
        const properties = this.getActiveProperties();
        const params = this.getGameParams();
        const items = this.subset.getQuizItems(this.getCheckedItems(), properties, forms, params);
        const referenceItems = this.subset.getReferenceItems(properties, forms, params);

        const dealer = new QuizDealer(items);
        const cardFactory = this.getCardFactory();

        const game = new Game(dealer, cardFactory);
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
        game.setupAnswerInputs(
            properties.map(key => {return {key: key, label: this.subset.properties[key].label}}),
            {lang: params.language}
        );

        return game;
    }

    /**
     * @param {string} key
     * @param {Slider} weightSlider
     */
    updateSymbolWeightRange(key, weightSlider) {
        const [min, max] = this.dataset.getFont(key, this.variant).getWeightLimits();
        weightSlider.setMin(min);
        weightSlider.setMax(max);
    }

    /**
     * @returns {SettingCollection}
     */
    getFontSettings() {
        const sc = new SettingCollection();

        if (this.dataset.hasFonts()) {
            const weightSlider = Slider.create(100, 900, this.dataset.gameConfig.defaultWeight ?? 500);
            weightSlider.label("Weight");

            if (this.dataset.hasSetting("font-family")) {
                sc.add("family", this.dataset.fontFamilySetting());
                sc.addObserverTo("family", key => this.updateSymbolWeightRange(key, weightSlider));
                this.updateSymbolWeightRange(sc.getValue("family"), weightSlider);
            } else {
                this.updateSymbolWeightRange(this.dataset.fonts.defaultKey, weightSlider);
            }

            sc.add("weight", weightSlider);
        }

        return sc;
    }

    /**
     * @param {string} [variant]
     * @returns {function(Card, {family, weight}, string?): void}
     */
    fontSettingsCallback(variant) {
        return (card, {family, weight}, changed) => {
            if (this.dataset.hasFonts() && (!changed || changed === "family")) {
                const font = this.dataset.getFont(family, variant);
                font.load().then(() => {
                    font.applyTo(card.displayNode);
                    if (weight) card.displayNode.style.fontWeight = weight;
                });
            } else if (weight) {
                card.displayNode.style.fontWeight = weight;
            }
        }
    }
    
    getBrailleSettings() {
        const slider = Slider.create(0, 1);
        slider.setStep(0.05);
        slider.value = 0.35;
        slider.label("Unfilled Dot Size");
        return slider;
    }


    brailleSettingsCallback() {
        return (card, size) => {
            card.displayNode.style.setProperty("--braille-small-dot-size", size);
        };
    }

    teardown() {
        this.selector.teardown();
        this.settings.selector.teardown();
        this.settings.game.teardown();
    }
}
