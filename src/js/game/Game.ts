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
    DOMFactory, GrabbedNodes, div
} from "../utils/dom";
import QuizItem, {QuizAnswers} from "../quiz/QuizItem";
import {ObservableWithNode} from "../utils/classes/Observable";
import Ribbon from "../utils/classes/Ribbon";


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

const GameGrabNodes = {
    container: ["div"],
    progressBar: ["div", ".game-progress-bar"],
    cards: ["div", ".game-cards"],
    mainCardContainer: ["div", ".game-main-card-container"],
    referenceCards: ["div", ".game-reference-cards"],
    inputsEvalsContainer: ["div", ".game-inputs-evals-container"],
    inputs: ["div", ".game-inputs"],
    evals: ["div", ".game-evals"],
    footer: ["div", ".game-footer"],
    submitButton: ["button", ".game-submit-button"],
    nextButton: ["button", ".game-next-button"]
} as const;

const gameContainerFactory = DOMFactory(
    `<div class="game-container">
    <div class="game-progress-bar"></div>

    <div class="game-cards">
        <div class="game-main-card-container"></div>
        <div class="game-reference-cards"></div>
    </div>

    <div class="game-inputs-evals-container">
        <div class="game-inputs"></div>
        <div class="game-evals"></div>
    </div>

    <div class="game-footer">
        <button type="submit" class="button-accent game-submit-button">Submit</button>
        <button type="button" class="button-accent game-next-button">Next</button>
    </div>
</div>`,
    GameGrabNodes
);


export default class Game<T, A extends QuizAnswers> {
    readonly nodes: GrabbedNodes<typeof GameGrabNodes>;
    readonly node: HTMLDivElement;
    readonly dealer: QuizDealer<QuizItem<T, A>>;
    readonly cardFactory: CardFactory<QuizItem<T, A>, any>;
    readonly onFinish: FunctionSet<() => any>;
    readonly cardDisplayMeta: CardDisplayMeta;
    readonly mainCard: Card;

    settings?: {
        ribbon: Ribbon,
        container: HTMLDivElement,
        pairs: SettingsCallbackPair<any[]>[];
    }

    readonly listeners: {
        submit: () => void,
        next: () => void,
        keydown: (event: KeyboardEvent) => void,
        input: (event: Event) => void
    }

    readonly config: GameConfig;

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
        this.nodes = gameContainerFactory();
        this.node = this.nodes.container;
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

        this.mainCard = this.cardFactory.createCard();
        this.nodes.mainCardContainer.append(this.mainCard.node);

        this.listeners = {
            keydown: this.onInputKeydown.bind(this),
            input: this.fastModeOnInput.bind(this),
            next: () => this.transition(() => this.newRound()),
            submit: () => this.transition(() => this.submitRound())
        };

        this.setupEventListeners();
    }

    getSettings() {
        const container = div(".card-settings");
        const ribbon = new Ribbon({closable: true});
        ribbon.node.classList.add("card-settings-ribbon");
        ribbon.addContent("", container);
        this.nodes.container.append(ribbon.node);
        return {
            pairs: [],
            ribbon,
            container
        };
    }

    setupEventListeners() {
        this.nodes.nextButton.addEventListener("click", this.listeners.next);
        this.nodes.submitButton.addEventListener("click", this.listeners.submit);
        this.nodes.inputs.addEventListener("keydown", this.listeners.keydown);
        this.nodes.inputs.addEventListener("input", this.listeners.input);
    }

    removeEventListeners() {
        this.nodes.nextButton.removeEventListener("click", this.listeners.next);
        this.nodes.submitButton.removeEventListener("click", this.listeners.submit);
        this.nodes.inputs.removeEventListener("keydown", this.listeners.keydown);
        this.nodes.inputs.removeEventListener("input", this.listeners.input);
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
        return this.reference ? [this.mainCard, ...this.reference.cards] : [this.mainCard];
    }

    addCardSettings<P extends any[]>(settings: ObservableWithNode<P>, applySettings: (card: Card, ...args: P) => void): void {
        if (!this.settings) this.settings = this.getSettings();

        this.settings.pairs.push([settings, applySettings]);
        settings.observers.push((...args) => {
            for (const card of this.allCards()) {
                applySettings(card, ...args);
            }
        });

        this.settings.container.append(settings.node);

        for (const card of this.allCards()) {
            this.applyCardSettings(card);
        }
    }

    applyCardSettings(card: Card): void {
        if (this.settings) {
            for (const [settings, applySettings] of this.settings.pairs) {
                applySettings(card, ...settings.observerArgs());
            }
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
        const keys = data.map(attrs => attrs.key);
        const inputs = data.map(attrs => createGameInput(Object.assign({}, config, attrs)));
        const evals = data.map(() => createEvalElement());

        this.nodes.inputs.append(...inputs);
        this.nodes.evals.append(...evals.map(e => e.container));

        this.elements = {inputs, evals, keys, shown: "inputs"};
        this.show("inputs");
    }

    onInputKeydown(event: KeyboardEvent): void {
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

    remove() {
        this.mainCard.clear();
        this.updateProgressBar(0);
        this.removeEventListeners();
        this.node.remove();
    }

    finish() {
        setTimeout(() => this.remove(), 100);
        this.onFinish.call();
        this.teardown();
    }

    teardown() {
        if (this.settings) this.settings.pairs.forEach(s => s[0].teardown());
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
                this.nodes.referenceCards.append(...this.reference.cards.map(card => card.node));

                // // doesn't make sense, cause the referenceItems are not the same as the game items.
                // for (const item of referenceItems) {
                //     this.dealer.punish(item);
                // }
            }
        }

        if (this.reference && this.reference.cards.length > 0) DOMUtils.show(this.nodes.referenceCards);

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
            this.nodes.nextButton.textContent = "Finish";
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
            this.nodes.submitButton,
            this.nodes.nextButton
        );

        if (which === "inputs") {
            this.mainCard.hideLabels();
            this.nodes.referenceCards.replaceChildren();
            DOMUtils.hide([this.nodes.referenceCards, this.nodes.evals]);
            DOMUtils.show(this.nodes.inputs, "visibility");

            this.focus();
        } else {
            this.mainCard.showLabels();

            DOMUtils.show(this.nodes.evals);
            if (this.config.keepKeyboardOpen) {
                this.elements.inputs[this.elements.inputs.length - 1].focus();
            } else {
                DOMUtils.hide(this.nodes.inputs, "visibility");
                this.nodes.nextButton.focus();
            }
        }

        this.elements.shown = which;
    }

    updateProgressBar(value?: number): void {
        value ??= this.dealer.progress();
        this.nodes.progressBar.style.setProperty("--progress", value.toString());
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