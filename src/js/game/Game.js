import {DOMUtils, FunctionSet} from "../utils";
import {SettingCollection, ValueElement} from "../settings";
import {passes} from "../quiz/answer";
import {avg} from "../utils/array";
import {CardFactory} from "../quiz/card";


DOMUtils.registerTemplates({
    eval: `<div class="item-eval">
    <span class="submitted"></span><span class="solution"></span>
</div>`,
    symbolContainer: `<div class="symbol-container">
    <div class="symbol-display-container"><span class="symbol"></span></div>
    <div class="symbol-label-container"><span class="symbol-label"></span></div>
</div>`
});

export default class Game {
    /**
     * @param {QuizDealer} dealer
     * @param {CardFactory | function(Card, QuizItem): void} cardFactory
     */
    constructor(dealer, cardFactory) {
        this.dealer = dealer;
        this.cardFactory = new CardFactory(cardFactory, card => {
            card.node.classList.add("game-main-card");
            this._setupCard(card);
        });
        this.onFinish = new FunctionSet();

        this.cardDisplayMeta = {};
        this.keepKeyboardOpen = false;
        this.updateProgressBar();

        /** @type {Card} */
        this.mainCard = this.cardFactory.createCard();
        document.getElementById("game-main-card-container").replaceChildren(this.mainCard.node);
        document.getElementById("item-next-button").textContent = "Next";

        this.onInputKeypress = this.onInputKeypress.bind(this);
    }

    static genericSettings() {
        return SettingCollection.createFrom({
            seed: ValueElement.createInput("text", "Seed (optional)", {id: "game-seed"})
        });
    }

    /**
     * @returns {Card[]}
     */
    allCards() {
        return [this.mainCard];
    }

    /**
     * @param {SettingCollection} settings
     * @param {function(Card, Record<string, *>, string?): void} applySettings
     */
    setupCardSettings(settings, applySettings) {
        this.cardSettings = settings;
        this.applyCardSettingsCallback = applySettings;

        this.cardSettings.observers.push((values, updatedKey) => {
            for (const card of this.allCards()) {
                this.applyCardSettingsCallback(card, values, updatedKey);
            }
        });

        document.getElementById("font-settings").replaceChildren(this.cardSettings.node);

        for (const card of this.allCards()) {
            this.applyCardSettings(card);
        }
    }

    applyCardSettings(card) {
        if (this.cardSettings) this.applyCardSettingsCallback(card, this.cardSettings.getValues());
    }

    setCardDisplayMeta(data) {
        for (const key of ["lang", "dir"]) {
            if (data[key]) {
                this.cardDisplayMeta[key] = data[key];
            } else {
                delete this.cardDisplayMeta[key];
            }
        }
        for (const card of this.allCards()) {
            this.applyCardDisplayMeta(card);
        }
    }

    /**
     * @param {Card} card
     */
    applyCardDisplayMeta(card) {
        if (this.cardDisplayMeta) {
            const {lang, dir} = this.cardDisplayMeta;
            if (lang) card.displayNode.lang = lang;
            if (dir) card.displayNode.dir = dir;
        }
    }

    /**
     * @param {Card} card
     * @private
     */
    _setupCard(card) {
        this.applyCardDisplayMeta(card);
        this.applyCardSettings(card);
    }

    /**
     * @param {{key, label, inputMode?}[]} data
     * @param {{lang}} [generalConfig]
     */
    setupAnswerInputs(data, generalConfig = {}) {
        const inputsContainer = document.getElementById('game-inputs');
        inputsContainer.replaceChildren();
        const evalsContainer = document.getElementById('game-evals');
        evalsContainer.replaceChildren();
        /** @type {Record<string, HTMLInputElement>} */
        this.inputs = {};
        /** @type {Record<string, HTMLElement>} */
        this.evals = {};
        const {lang} = generalConfig;

        for (const {key, label, inputMode} of data) {
            const input = this.inputs[key] = document.createElement('input');
            input.type = "text";
            input.placeholder = label;
            if (inputMode) input.inputMode = inputMode;
            if (lang) input.lang = lang;
            input.addEventListener("keypress", this.onInputKeypress)
            inputsContainer.appendChild(input);

            this.evals[key] = DOMUtils.getTemplate("eval");
            evalsContainer.appendChild(this.evals[key]);
        }
    }

    /**
     * @param {KeyboardEvent} event
     */
    onInputKeypress(event) {
        /** @type HTMLInputElement */
        const input = event.target.closest("input");
        if (!input) return;

        if (event.key === "Enter") {
            if (input.nextElementSibling) {
                input.nextElementSibling.focus();
            } else {
                if (this.shown === "inputs") {
                    this.transition(() => this.submitRound());
                } else {
                    this.transition(() => this.newRound());
                }
            }
        } else if (event.key === "Backspace" && event.target.default === "" && input.previousElementSibling) {
            input.previousElementSibling.focus();
            event.preventDefault();
        }
    }

    seed(seed) {
        this.dealer.rng.seed(seed);
    }

    cleanup() {
        this.mainCard.clear();
        this.updateProgressBar(0);

        document.getElementById("game-inputs").removeEventListener("keypress", this.onInputKeypress);
        document.getElementById("game-inputs").replaceChildren();
        document.getElementById("game-evals").replaceChildren();
    }

    finish() {
        setTimeout(() => this.cleanup(), 100);
        this.onFinish.call();
    }

    submitRound() {
        const item = this.dealer.currentItem;
        const grades = {};
        let hasReferenceCards = false;

        for (const [key, input] of Object.entries(this.inputs)) {
            const guess = input.value;
            const evalElement = this.evals[key];
            const [grade, markedGuess, markedSolution] = item.answers[key].mark(guess);

            grades[key] = grade;
            evalElement.querySelector(".submitted").replaceChildren(markedGuess);
            evalElement.querySelector(".solution").replaceChildren(markedSolution);

            DOMUtils.toggleShown(guess.length > 0, evalElement.querySelector(".submitted"));

            if (!passes(grade)) {
                const referenceItems = this.getReferenceItems(key, guess);
                if (referenceItems.length > 0) hasReferenceCards = true;

                const referenceCards = this.referenceCards(referenceItems, key);
                document.getElementById("game-reference-cards").append(...referenceCards.map(card => card.node));

                // // doesn't make sense, cause the referenceItems are not the same as the game items.
                // for (const item of referenceItems) {
                //     this.dealer.punish(item);
                // }
            }
        }

        if (hasReferenceCards) DOMUtils.show(document.getElementById("game-reference-cards"));

        const score = avg(Object.values(grades));
        this.dealer.submitScore(score);

        this.updateProgressBar();
        if (this.dealer.isEmpty()) {
            document.getElementById("item-next-button").textContent = "Finish";
        }
        this.show("evals");

        if (window.scrollY > 0) window.scrollTo({top: 0, behavior: "smooth"});
    }

    /**
     * @param {QuizItem[]} items
     * @param {CardFactory | function(Card, QuizItem, string): void} factory
     */
    setReferenceItems(items, factory) {
        this.referenceItems = items;
        this.referenceCardFactory = new CardFactory(factory, card => {
            card.node.classList.add("game-reference-card");
            this._setupCard(card);
        });
    }

    /**
     * @param {string} property
     * @param {string} guess
     * @returns {QuizItem[]}
     */
    getReferenceItems(property, guess) {
        if (!this.referenceItems) return [];

        let grades = this.referenceItems
            .map((item, index) => [index, item.grade(property, guess)])
            .filter(([_, grade]) => passes(grade));
        grades.sort(([i1, g1], [i2, g2]) => (g2 - g1) || (i1 - i2));

        if (grades.length > 0 && grades[0][1] === 1) {
            grades = grades.filter(([_, grade]) => grade === 1);
        }

        return grades.map(([index, _]) => this.referenceItems[index]);
    }

    /**
     * @param {QuizItem[]} referenceItems
     * @param {string} property
     * @returns {Card[]}
     */
    referenceCards(referenceItems, property) {
        this.referenceCardFactory.setConfig("property", property);
        return referenceItems.map(item => this.referenceCardFactory.createCard(item));
    }

    clearInputs() {
        for (const input of Object.values(this.inputs)) {
            input.value = "";
        }
    }

    /**
     * @param {"inputs"|"evals"} which
     */
    show(which) {
        DOMUtils.toggleShown(
            which === "inputs",
            document.getElementById("item-submit-button"),
            document.getElementById("item-next-button")
        );

        const evals = document.getElementById("game-evals");
        const inputs= document.getElementById("game-inputs");

        if (which === "inputs") {
            this.mainCard.hideLabels();
            const referenceContainer = document.getElementById("game-reference-cards");
            referenceContainer.replaceChildren();
            DOMUtils.hide(referenceContainer);
            DOMUtils.hide(evals);
            DOMUtils.show(inputs, "visibility");

            this.focus();
        } else {
            this.mainCard.showLabels();

            DOMUtils.show(evals);
            if (this.keepKeyboardOpen) {
                inputs.lastElementChild.focus();
            } else {
                DOMUtils.hide(inputs, "visibility");
                document.getElementById("item-next-button").focus();
            }
        }

        this.shown = which;
    }

    /**
     * @param {number} [value]
     */
    updateProgressBar(value) {
        value ??= this.dealer.progress();
        document.getElementById("progress-bar").style.setProperty("--progress", value);
    }

    newRound() {
        if (this.dealer.isEmpty()) {
            this.finish();
            return;
        }

        this.dealer.nextItem();
        this.displayItem(this.dealer.currentItem);

        this.clearInputs();
        this.show("inputs");
    }

    focus() {
        document.querySelector("#game-inputs input").focus({preventScroll: true});
    }

    /**
     * @param {QuizItem} item
     */
    displayItem(item) {
        this.cardFactory.display(this.mainCard, item);
    }

    /**
     * @param {function} callback
     * @param {string[]} [types]
     */
    transition(callback, types = []) {
        DOMUtils.transition(callback, types.concat(["game"]));
    }
}
