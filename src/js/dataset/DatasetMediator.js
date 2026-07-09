import {DOMUtils, Observable} from '../utils';
import Game from "../game/Game";
import QuizDealer from "../quiz/QuizDealer";
import {CardFactory} from "../quiz/card";
import {SettingCollection, Slider} from "../settings";


export default class DatasetMediator extends Observable {
    /**
     * @param {Dataset} dataset
     * @param {string} [subset]
     */
    constructor(dataset, {subset}) {
        super();
        this.dataset = dataset;
        if (this.dataset.hasSetting("subset")) {
            /** @type ButtonGroup */
            this.subsetSetting = this.dataset.subsetSetting(subset);
            this.subsetSetting.observers.push(() => this.updateSubset());
        }

        this.updateSubset();
        this.applyCombineSettings = this.applyCombineSettings.bind(this);
    }

    updateSubset() {
        const key = this.subsetSetting ? this.subsetSetting.value : null;
        /** @type {DatasetSubset} */
        this.subset = this.dataset.getSubset(key);
        this.setupSettings();
        this.setupSelector();
        this.setupObservers();
    }

    setupSettings() {
        const selectorSettings = this.subset.getSelectorSettings();
        const gameSettings = this.dataset.getGameSettings(this.subset.key);

        if (this.selectorSettings) this.selectorSettings.replaceWith(selectorSettings);
        if (this.gameSettings) this.gameSettings.replaceWith(gameSettings);

        this.selectorSettings = selectorSettings;
        this.gameSettings = gameSettings;

        this.setupCombineSettings();
    }

    currentForms() {
        return this.selectorSettings.getDefault("forms", this.subset.defaultFormKey());
    }

    removeCombineSettings() {
        this.removeCombineMethodSetting();
        this.removeCombineLettersSetting();
    }

    removeCombineMethodSetting() {
        if (this.combineMethodSetting) {
            this.combineMethodSetting.remove();
            this.combineMethodSetting.teardown();
            this.combineMethodSetting = null;
        }
    }

    removeCombineLettersSetting() {
        if (this.combineLettersSettings) {
            this.combineLettersSettings.remove();
            this.combineLettersSettings.teardown();
            this.combineLettersSettings = null;
        }
    }

    /**
     * @return {boolean}
     */
    hasCombine() {
        if (this.selectorSettings.has("forms") && !this.selectorSettings.get("forms").exclusive) return false;
        const form = this.currentForms();
        return !!this.subset.getFormConfig(form).combine;
    }

    /**
     * @param {string} method
     * @param {number[]} keys
     */
    setupCombineSettings({method, keys} = {}) {
        this.removeCombineSettings();

        if (!this.hasCombine()) return;

        const form = this.currentForms();

        /** @type {ButtonGroup} */
        this.combineMethodSetting = this.dataset.combineMethodSetting(this.subset.key, form, method);
        this.combineMethodSetting.observers.push(value => DOMUtils.transition(
            () => {
                this.setupCombineLetterSettings(value);
                this.callObservers();
            },
            ["selector-forms"]
        ));
        this.selectorSettings.node.insertAdjacentElement("afterend", this.combineMethodSetting.node)
        this.setupCombineLetterSettings(keys);
    }

    /**
     * @param {number[]} [selected]
     */
    setupCombineLetterSettings(selected) {
        this.removeCombineLettersSetting();

        const method = this.combineMethodSetting.value;
        /** @type SettingCollection */
        this.combineLettersSettings = this.dataset.combineLettersSettings(method, this.subset.key, selected);
        this.combineLettersSettings.observers.push(this.applyCombineSettings, this.callObservers);
        this.combineMethodSetting.node.insertAdjacentElement("afterend", this.combineLettersSettings.node);
        this.applyCombineSettings();
    }
    
    getCombineSettingsValues() {
        return {
            method: this.combineMethodSetting.value,
            keys: Object.values(this.combineLettersSettings.getValues())
        };
    }

    getCombineConfig() {
        const {method, keys} = this.getCombineSettingsValues();
        /** @type StringCombiner */
        const combiner = this.dataset.combine.methods[method].combiner;
        const values = this.dataset.getCombineLetters(method, keys);
        const index = values.indexOf(null);

        return {combiner, values, index};
    }

    applyCombineSettings() {
        const form = this.currentForms();
        const combineConfig = this.getCombineConfig();

        this.selector.updateButtonContents((content, item) => {
            this.findFormElement(content, form).replaceChildren(
                item.getForm(form).getNode({combine: combineConfig})
            );
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

    setupSelector() {
        const oldSelector = this.selector;
        this.selector = this.subset.createSelector();
        this.setupSelectorButtons();
        this.selector.finishSetup();

        this.applySelectorStyles();
        const {forms, variant} = this.selectorSettings.getValues();
        this.applySelectorSettings(forms, variant);

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
        this.selectorSettings.observers.push(({forms, variant}, changed) => DOMUtils.transition(
            () => {
                this.applySelectorSettings(forms, variant, changed);
                this.callObservers();
            },
            ["selector-forms"]
        ));

        this.selector.observers.push(this.callObservers);
        this.gameSettings.observers.push(this.callObservers);
    }

    /**
     * @returns {{checked: boolean[], form?: string, variant?: string, properties?: string[], language?: string}}
     */
    getSettingsValues() {
        const {method, keys} = this.hasCombine() ? this.getCombineSettingsValues() : {};
        return Object.assign(
            {checked: this.selector.getChecked({includeDisabled: true})},
            this.selectorSettings.getValues(),
            this.gameSettings.getValues(),
            this.hasCombine() ? {combineMethod: method, combineKeys: keys} : null
        );
    }

    observerArgs() {
        return [this.getSettingsValues()];
    }

    updateSelectorFont(variant) {
        const font = this.dataset.getSelectorDisplayFont(variant);
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

    getCheckedItems() {
        return this.selector.getCheckedItems();
    }

    getVariant() {
        return this.selectorSettings.getDefault("variant", null);
    }

    getLanguage() {
        return this.gameSettings.getDefault("language", null)
    }

    /**
     * @param {boolean} [includeDisabled]
     * @returns {number}
     */
    checkedCount(includeDisabled) {
        return this.selector.checkedCount(includeDisabled);
    }

    setSettings(values) {
        if (values.checked) {
            tryMessage(
                () => this.selector.setChecked((_, index) => values.checked[index]),
                "Error setting selected selector items:"
            );
        }

        try {
            this.selectorSettings.setValues(values);
            const {forms, variant} = this.selectorSettings.getValues();
            this.applySelectorSettings(forms, variant);
            this.setupCombineSettings({method: values.combineMethod, keys: values.combineKeys});
        } catch (error) {
            console.error("Error setting selector settings values:", error);
        }

        tryMessage(() => this.gameSettings.setValues(values), "Error setting game setting values:");
    }

    /**
     * @param {string[]} [forms]
     * @param {string} [variant]
     * @param {"forms" | "variant"} [changed]
     */
    applySelectorSettings(forms, variant, changed) {
        const formKeys = this.subset.getFormKeysFromGrouped(forms);

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

        return this.subset.getFormKeysFromGrouped(this.selectorSettings.getValue("forms"));
    }

    getActiveProperties() {
        return this.gameSettings.getDefault("properties", Object.keys(this.subset.properties));
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
        return Object.keys(this.subset.properties)[0];
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

        switch (this.subset.letterType) {
            case "string":
                game.addCardSettings(this.getFontSettings(), this.fontSettingsCallback(params.variant));
                break;
            case "braille":
                game.addCardSettings(this.getBrailleSettings(), this.brailleSettingsCallback());
                break;
        }

        game.setCardDisplayMeta({dir: this.dataset.getDir(), lang: this.dataset.getLang(this.subset.key, params.variant)});

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
        this.selectorSettings.teardown();
        this.gameSettings.teardown();
    }
}

/**
 * @param {function} callback
 * @param {string} message
 */
function tryMessage(callback, message) {
    try {
        callback();
    } catch (e) {
        console.error(message, e);
    }
}
