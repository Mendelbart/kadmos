import {DOMUtils, FunctionSet} from "../utils";
import {SettingCollection, Switch} from "../settings";
import {passes} from "../quiz/answer";
import {avg} from "../utils/array";
import {Card, CardDisplayFn, CardFactory} from "../quiz/card";
import {createInput} from "../settings/ValueElement";
import QuizDealer from "../quiz/QuizDealer";
import {
    ElementAttrs,
    input,
    grabNodes,
    selectNode,
    DOMFactory
} from "../utils/dom";
import QuizItem, {QuizAnswers} from "../quiz/QuizItem";
import {ObservableWithNode} from "../utils/classes/Observable";


export interface CardDisplayMeta {
    lang?: string;
    dir?: "rtl" | "ltr" | "auto";
}

type SettingsCallbackPair<P extends any[]> = [ObservableWithNode<P>, (card: Card, ...args: P) => void]

export interface GameConfig {
    keepKeyboardOpen: boolean;
    fastMode: boolean;
    seed: string;
}

const GameContainer = grabNodes(selectNode<HTMLDivElement>(document, "#game-container"), {
    progressBar: "#progress-bar",
    cards: "#game-cards",
    mainCardContainer: "#game-main-card-container",
    referenceCards: "#game-reference-cards",
    inputsEvalsContainer: "#game-inputs-evals-container",
    inputs: "#game-inputs",
    evals: "#game-evals",
    footer: "#game-footer",
    submitButton: "#item-submit-button",
    nextButton: "#item-next-button",
    cardSettings: "#card-settings",
});
const GC = GameContainer;

export default class Game<T, A extends QuizAnswers> {
    readonly dealer: QuizDealer<QuizItem<T, A>>;
    readonly cardFactory: CardFactory<QuizItem<T, A>, any>;
    readonly onFinish: FunctionSet<() => any>;
    readonly cardDisplayMeta: CardDisplayMeta;
    readonly cardSettings: SettingsCallbackPair<any[]>[];
    readonly mainCard: Card;

    config: GameConfig;

    private reference?: {
        items: QuizItem<T, any>[];
        cards: Card[];
        cardFactory: CardFactory<QuizItem<T, any>, any>;
    }

    private elements?: {
        inputs: HTMLInputElement[];
        evals: EvalElement[];
        keys: (keyof A)[];
        shown: "inputs" | "evals"
    }

    constructor(dealer: QuizDealer<QuizItem<T, A>>, cardFactory: CardFactory<QuizItem<T, A>, any>, config?: Partial<GameConfig>) {
        this.dealer = dealer;
        this.cardFactory = new CardFactory(cardFactory, {
            setup: card => {
                card.node.classList.add("game-main-card");
                this._setupCard(card);
            }
        });
        this.onFinish = new FunctionSet();

        this.cardDisplayMeta = {};
        this.updateProgressBar();
        this.config = Object.assign({keepKeyboardOpen: false, fastMode: false, seed: ""}, config ?? {});

        this.cardSettings = [];
        GC.cardSettings.replaceChildren();

        this.mainCard = this.cardFactory.createCard();
        GC.mainCardContainer.replaceChildren(this.mainCard.node);
        GC.nextButton.textContent = "Next";

        this.onInputKeypress = this.onInputKeypress.bind(this);
        this.fastModeOnInput = this.fastModeOnInput.bind(this);
    }

    static genericSettings(values?: Partial<GameConfig>): SettingCollection<GameConfig> {
        const sc = new SettingCollection({
            seed: createInput("text", "Seed (optional)", {id: "game-seed"}),
            fastMode: Switch.create("Fast Mode"),
            keepKeyboardOpen: Switch.create("Keep Keyboard Open")
        });
        if (values) sc.setValues(values);
        return sc;
    }

    allCards(): Card[] {
        return [this.mainCard].concat(this.reference?.cards ?? []);
    }

    addCardSettings<P extends any[]>(settings: ObservableWithNode<P>, applySettings: (card: Card, ...args: P) => void): void {
        this.cardSettings.push([settings, applySettings]);
        settings.observers.push((...args) => {
            for (const card of this.allCards()) {
                applySettings(card, ...args);
            }
        });

        GC.cardSettings.append(settings.node);

        for (const card of this.allCards()) {
            this.applyCardSettings(card);
        }
    }

    applyCardSettings(card: Card): void {
        for (const [settings, applySettings] of this.cardSettings) {
            applySettings(card, ...settings.observerArgs());
        }
    }

    setCardDisplayMeta(data: CardDisplayMeta): void {
        Object.assign(this.cardDisplayMeta, data);

        for (const card of this.allCards()) {
            this.applyCardDisplayMeta(card);
        }
    }

    applyCardDisplayMeta(card: Card): void {
        if (this.cardDisplayMeta) {
            const {lang, dir} = this.cardDisplayMeta;
            if (lang) card.displayNode.lang = lang;
            if (dir) card.displayNode.dir = dir;
        }
    }

    _setupCard(card: Card): void {
        this.applyCardDisplayMeta(card);
        this.applyCardSettings(card);
    }

    setupAnswerElements(data: (GameInputConfig & {key: keyof A})[], config?: GameInputConfig) {
        const inputsContainer = document.getElementById('game-inputs') as HTMLDivElement;
        inputsContainer.replaceChildren();
        const evalsContainer = document.getElementById('game-evals') as HTMLDivElement;
        evalsContainer.replaceChildren();

        const keys = data.map(attrs => attrs.key);
        const inputs = data.map(attrs => createGameInput(Object.assign({}, config, attrs)));
        const evals = data.map(() => createEvalElement());

        inputs.forEach(input => {
            input.addEventListener("keydown", this.onInputKeypress);
            input.addEventListener("input", this.fastModeOnInput);
            inputsContainer.append(input);
        });
        evalsContainer.append(...evals.map(e => e.container));

        this.elements = {inputs, evals, keys, shown: "inputs"};
        this.show("inputs");
    }

    onInputKeypress(event: KeyboardEvent): void {
        if (!this.elements) throw new Error("Answer elements not set up yet.");
        const input = event.target;
        if (!(input instanceof HTMLInputElement)) return;

        if (event.key === "Enter") {
            if (input.nextElementSibling instanceof HTMLElement) {
                input.nextElementSibling.focus();
            } else {
                if (this.elements.shown === "inputs") {
                    if (!this.config.fastMode || input.value) this.transition(() => this.submitRound());
                } else {
                    this.transition(() => this.newRound());
                }
            }
        } else if (event.key === "Backspace" && input.value === "" && input.previousElementSibling instanceof HTMLElement) {
            input.previousElementSibling.focus();
            event.preventDefault();
        }
    }

    fastModeOnInput(event: Event) {
        if (!this.elements) throw new Error("Answer elements not set up yet.");
        const input = event.target;
        if (!(input instanceof HTMLInputElement)) return;

        if (this.config.fastMode && this.allInputsCorrect()) {
            this.transition(() => {
                this.submitScore(1);
                this.newRound();
            })
        }
    }

    putSettings(settings: Partial<GameConfig>) {
        Object.assign(this.config, settings);
        if (settings.seed) this.seed(settings.seed);
    }

    seed(seed: string): void {
        this.dealer.rng.seed(seed);
    }

    cleanup() {
        this.mainCard.clear();
        this.updateProgressBar(0);

        GC.inputs.removeEventListener("keypress", this.onInputKeypress);
        GC.inputs.replaceChildren();
        GC.evals.replaceChildren();
    }

    finish() {
        setTimeout(() => this.cleanup(), 100);
        this.onFinish.call();
        this.teardown();
    }

    teardown() {
        GC.cardSettings.replaceChildren();
    }

    allInputsCorrect() {
        return this.gradeInputs().every(grade => grade === 1);
    }

    gradeInputs() {
        if (!this.elements) throw new Error("Inputs not setup yet.");

        const {inputs, keys} = this.elements;
        const item = this.dealer.currentItem;

        return inputs.map((input, index) => item.grade(keys[index], input.value));
    }

    submitRound() {
        if (!this.elements) throw new Error("Inputs not setup yet.");

        const item = this.dealer.currentItem;
        const grades: number[] = [];
        if (this.reference) this.reference.cards = [];

        for (const [index, input] of this.elements.inputs.entries()) {
            const key = this.elements.keys[index] as keyof A & string;
            const guess = input.value;
            const evalElement = this.elements.evals[index];
            const [grade, markedGuess, markedSolution] = item.mark(key, guess);

            grades[index] = grade;
            evalElement.submitted.replaceChildren(markedGuess);
            evalElement.solution.replaceChildren(markedSolution);

            DOMUtils.toggleShown(guess.length > 0, [evalElement.submitted]);

            if (this.reference && !passes(grade)) {
                const referenceItems = this.getReferenceItems(key, guess);
                this.reference.cards = this.getReferenceCards(referenceItems, key);
                GC.referenceCards.append(...this.reference.cards.map(card => card.node));

                // // doesn't make sense, cause the referenceItems are not the same as the game items.
                // for (const item of referenceItems) {
                //     this.dealer.punish(item);
                // }
            }
        }

        if (this.reference && this.reference.cards.length > 0) DOMUtils.show([GC.referenceCards]);

        this.submitScore(avg(grades))
        this.show("evals");
        this.scrollUp();
    }

    scrollUp() {
        if (window.scrollY > 0) window.scrollTo({top: 0, behavior: "smooth"});
    }

    submitScore(score: number) {
        this.dealer.submitScore(score);

        this.updateProgressBar();
        if (this.dealer.isEmpty()) {
            GC.nextButton.textContent = "Finish";
        }
    }

    /**
     * @param {QuizItem[]} items
     * @param {CardFactory | function(Card, QuizItem, string): void} factory
     */
    setReferenceItems<A extends QuizAnswers>(items: QuizItem<T,A>[], factory: CardFactory<QuizItem<T,A>,any> | CardDisplayFn<QuizItem<T,A>,any>): void {
        this.reference = {
            cards: [],
            items: items,
            cardFactory: new CardFactory<QuizItem<T,A>,any>(factory, {
                setup: card => {
                    card.node.classList.add("game-reference-card");
                    this._setupCard(card);
                }
            })
        };
    }

    getReferenceItems(property: string, guess: string): QuizItem<T,any>[] {
        if (!this.reference) return [];

        const items = this.reference.items;
        let grades = items
            .map((item, index) => [index, item.grade(property, guess)])
            .filter(([_, grade]) => passes(grade));
        grades.sort(([i1, g1], [i2, g2]) => (g2 - g1) || (i1 - i2));

        if (grades.length > 0 && grades[0][1] === 1) {
            grades = grades.filter(([_, grade]) => grade === 1);
        }

        return grades.map(([index, _]) => items[index]);
    }

    getReferenceCards(referenceItems: QuizItem<T,any>[], property: string): Card[] {
        if (!this.reference) throw new Error("Reference items not setup");
        const factory = this.reference.cardFactory;
        factory.setConfig("property", property);
        return referenceItems.map(item => factory.createCard(item));
    }

    clearInputs() {
        if (!this.elements) return;
        this.elements.inputs.forEach(input => {input.value = ""});
    }

    /**
     * @param {"inputs"|"evals"} which
     */
    show(which: "inputs" | "evals") {
        if (!this.elements) throw new Error("Game elements not set up yet.");

        DOMUtils.toggleShown(
            which === "inputs",
            [GC.submitButton],
            [GC.nextButton]
        );

        if (which === "inputs") {
            this.mainCard.hideLabels();
            GC.referenceCards.replaceChildren();
            DOMUtils.hide([GC.referenceCards, GC.evals]);
            DOMUtils.show([GC.inputs], "visibility");

            this.focus();
        } else {
            this.mainCard.showLabels();

            DOMUtils.show([GC.evals]);
            if (this.config.keepKeyboardOpen) {
                this.elements.inputs[this.elements.inputs.length - 1].focus();
            } else {
                DOMUtils.hide([GC.inputs], "visibility");
                GC.nextButton.focus();
            }
        }

        this.elements.shown = which;
    }

    updateProgressBar(value?: number): void {
        value ??= this.dealer.progress();
        GC.progressBar.style.setProperty("--progress", value.toString());
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
        if (this.elements) this.elements.inputs[0].focus({preventScroll: true});
    }

    displayItem(item: QuizItem<T, A>): void {
        this.cardFactory.display(this.mainCard, item);
    }

    transition(callback: () => void, types: string[] = []): void {
        DOMUtils.transition(callback, types.concat(["game"]));
    }
}

interface GameInputConfig {
    label?: string,
    inputMode?: string,
    lang?: string
}

function createGameInput(config: GameInputConfig) {
    const attrs: ElementAttrs = {
        type: "text"
    };
    if (config.label) attrs.placeholder = config.label;
    if (config.inputMode) attrs.inputMode = config.inputMode;
    if (config.lang) attrs.lang = config.lang;

    return input(attrs);
}

interface EvalElement {
    container: HTMLDivElement,
    submitted: HTMLSpanElement,
    solution: HTMLSpanElement
}
const createEvalElement: () => EvalElement = DOMFactory(
    `<div class="item-eval"><span class="submitted"></span><span class="solution"></span></div>`,
    {
        container: ["div"],
        submitted: ["span", ".submitted"],
        solution: ["span", ".solution"]
    }
);