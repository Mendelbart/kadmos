import {DOMUtils, Observable} from '../utils';
import Game from "../game/Game";
import QuizDealer from "../quiz/QuizDealer";
import {CardFactory} from "../quiz/card";
import {SettingCollection, Slider} from "../settings";


export default class DatasetMediator extends Observable {
    /**
     * @param {Dataset} dataset
     */
    constructor(dataset) {
        super();
        this.dataset = dataset;
        if (this.dataset.hasSetting("subset")) {
            this.subsetSetting = this.dataset.subsetSetting();
            this.subsetSetting.observers.push(() => this.updateSubset());
        }

        this.updateSubset();
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

        this.selectorSettings.observers.push(() => this.setupCombineSettings());
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

    setupCombineSettings() {
        this.removeCombineSettings();

        if (this.selectorSettings.has("forms") && !this.selectorSettings.get("forms").exclusive) return;

        const form = this.currentForms();
        if (!this.subset.getFormConfig(form).combine) return;

        /** @type {ButtonGroup} */
        this.combineMethodSetting = this.dataset.combineMethodSetting(this.subset.key, form);
        this.combineMethodSetting.observers.push(value => this.setupCombineLetterSettings(value));
        this.selectorSettings.node.insertAdjacentElement("afterend", this.combineMethodSetting.node)
        this.setupCombineLetterSettings();
    }

    /**
     * @param {string} [method]
     */
    setupCombineLetterSettings(method) {
        this.removeCombineLettersSetting();

        method ??= this.combineMethodSetting.value;
        /** @type SettingCollection */
        this.combineLettersSettings = this.dataset.combineLettersSettings(method, this.subset.key);
        this.combineLettersSettings.observers.push(() => this.applyCombineSettings());
        this.combineMethodSetting.node.insertAdjacentElement("afterend", this.combineLettersSettings.node);
        this.applyCombineSettings();
    }

    applyCombineSettings() {
        const form = this.currentForms();
        const method = this.combineMethodSetting.value;
        const combiner = this.dataset.combine.methods[method].combiner;
        const values = this.dataset.getCombineLetters(method, this.combineLettersSettings.getValues());
        const index = values.indexOf(null);

        this.selector.updateButtonContents((content, item) => {
            this.findFormElement(content, form).replaceChildren(
                item.getForm(form).getNode({combine: {combiner: combiner, values: values, index: index}})
            );
        });
    }

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
            const property = this.subset.selectorData.label.property;
            this.selector.labelButtons(item => item.getProperty({
                property: property,
                splitter: this.subset.getPropertySplitter(property)
            }));
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
        return Object.assign(
            {checked: this.selector.getChecked({includeDisabled: true})},
            this.selectorSettings.getValues(),
            this.gameSettings.getValues()
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
            this.setupCombineSettings();
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
            this.updateSelectorFont(variant);
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
        const property = Object.keys(this.subset.properties)[0];

        return new CardFactory(
            (card, item, {combine}) => {
                card.display(item.content.getNode({combine}));
                card.setLabel("bottom", item.answers[property].display);
            },
            card => DOMUtils.setAttrs(card.displayNode, attrs)
        );
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
        game.setReferenceItems(referenceItems, (card, item, {property, combine}) => {
            card.display(item.content.getNode({combine}));
            card.setLabel("bottom", item.answers[property].display);
        });

        game.setupCardSettings(this.getCardSettings(), this.cardSettingsCallback(params.variant));

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
    getCardSettings() {
        const sc = new SettingCollection();

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

        return sc;
    }

    /**
     * @param {string} [variant]
     * @returns {function(Card, {family, weight}, string?): void}
     */
    cardSettingsCallback(variant) {
        return (card, {family, weight}, changed) => {
            if (!changed || changed === "family") {
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
