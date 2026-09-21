import {argmax, mapFromKeys, avg, full} from "../utils/array";
import {osaDistance} from "./string-metrics";
import {Matrix, SubString} from "../utils";

export type MarkedGuess = [grade: number, markedGuess: HTMLSpanElement, markedSolution: HTMLSpanElement];

export interface QuizAnswer {
    display: string;
    grade(guess: string): number;
    mark(guess: string): MarkedGuess;
}

export interface StringAnswerRecipe {
    type: "string",
    properties?: StringAnswerConfig,
}

export interface NumberAnswerRecipe {
    type: "number" | "integer"
    properties?: NumberAnswerConfig,
}

export interface ListAnswerRecipe {
    type: "list",
    items: StringAnswerRecipe | NumberAnswerRecipe | ListAnswerRecipe,
    properties?: ListAnswerConfig
}

export interface QuizAnswerTypeMap {
    string: StringAnswer,
    number: NumberAnswer,
    integer: NumberAnswer,
    list: ListAnswer<QuizAnswer>
}

export type QuizAnswerRecipe = StringAnswerRecipe | NumberAnswerRecipe | ListAnswerRecipe;

const factories: {[type in QuizAnswerRecipe["type"]]: (recipe: QuizAnswerRecipe & {type: type}) => (value: string) => QuizAnswerTypeMap[type]} = {
    string: ({properties}: StringAnswerRecipe) => (value: string) => new StringAnswer(value, properties),
    number: ({properties}: NumberAnswerRecipe) => (value: string) => new NumberAnswer(value, properties),
    integer({properties}: NumberAnswerRecipe) {
        const config = Object.assign({}, properties, {integer: true});
        return (value: string)=> new NumberAnswer(value, config);
    },
    list({items, properties}: ListAnswerRecipe): (value: string) => ListAnswer<QuizAnswer> {
        const callback = QuizAnswerFactory(items);
        return (value: string) => new ListAnswer<QuizAnswer>(value, callback, properties);
    }
}

export function QuizAnswerFactory<type extends QuizAnswerRecipe["type"]>(recipe: QuizAnswerRecipe & {type: type}): (value: string) => QuizAnswerTypeMap[type] {
    return factories[recipe.type](recipe);
}

export const DefaultListSplitter = "[,;/]";

export abstract class SimpleQuizAnswer<T> implements QuizAnswer {
    display: string;
    value: T;
    maxDist: number;

    protected constructor(display: string, value: T, maxDist: number = 0) {
        this.display = display;
        this.value = value;
        this.maxDist = maxDist;
    }

    parseValue(value: string): T | undefined {
        throw new Error("Not implemented.");
    }

    distance(value: T, guess: T): number {
        throw new Error("Not implemented.");
    }

    grade(guess: string): number {
        const guessValue = this.parseValue(guess);
        if (guessValue == null) return 0;

        const dist = this.distance(this.value, guessValue);
        return gradeFromDist(dist, this.maxDist);
    }

    mark(guess: string): MarkedGuess {
        const grade = this.grade(guess);
        return [grade, markedSpan(guess, grade), markedSpan(this.display, grade)];
    }
}

/**
 * `distanceMode` is either `'linear'`, `'log'` or e.g. `'logBASE'` with a numeric base (default 10).
 */
export interface NumberAnswerConfig {
    integer?: boolean;
    maxDist?: number;
    distanceMode?: string;
}

export class NumberAnswer extends SimpleQuizAnswer<number> {
    distanceMode: "linear" | "log";
    logBase?: number;
    integer?: boolean;

    constructor(display: string, config: NumberAnswerConfig = {}) {
        const {
            maxDist = 0,
            distanceMode = "linear",
            integer = false
        } = config;

        const value = integer ? parseInt(display) : parseFloat(display);

        super(display, value, maxDist);

        if (distanceMode.substring(0, 3) === "log") {
            this.distanceMode = "log";
            const logBaseString = distanceMode.substring(3);
            this.logBase = logBaseString ? parseFloat(logBaseString) : 10;
        } else {
            this.distanceMode = "linear";
        }

        this.integer = integer;
    }

    parseValue(guess: string): number | undefined {
        const result = this.integer ? parseInt(guess) : parseFloat(guess);
        if (Number.isNaN(result)) return undefined;
        return result;
    }

    distance(value: number, guess: number): number {
        if (this.distanceMode === "log") {
            return Math.abs(Math.log(value / guess)) / Math.log(this.logBase ?? 10);
        } else {
            return Math.abs(value - guess);
        }
    }
}

export interface StringSubstitution {
    pattern: string | RegExp,
    repl: string[]
}

export interface StringAnswerConfig {
    maxDist?: number;
    maxDistMult?: number;
    substitutions?: StringSubstitution[];
    forceSubstitutions?: boolean;
    caseSensitive?: boolean;
    ignoreBrackets?: string | false;
}

export class StringAnswer implements QuizAnswer {
    display: string;
    config: Required<StringAnswerConfig>;
    values: string[];

    constructor(display: string, config: StringAnswerConfig = {}) {
        this.config = Object.assign({}, {
            maxDist: 0,
            maxDistMult: Infinity,
            substitutions: [],
            forceSubstitutions: false,
            caseSensitive: false,
            ignoreBrackets: "("
        }, config);
        this.display = display;

        this.values = this.applySubstitutions(display, this.config).map(s => this.standardizeString(s));
    }

    getMaxDist(value: string): number {
        return this.config.maxDist + Math.floor(value.length / this.config.maxDistMult);
    }

    applySubstitutions(display: string, config: {substitutions: StringSubstitution[], forceSubstitutions: boolean}): string[] {
        let vals = [display];
        const flags = this.config.caseSensitive ? "gu" : "gui";

        for (const {pattern, repl} of config.substitutions) {
            const regex = new RegExp(pattern, flags);
            vals = vals.flatMap(val => {
                const newVals = repl.map(sub => val.replace(regex, sub));
                if (!config.forceSubstitutions) newVals.push(val);
                return newVals;
            });
        }

        return [...new Set(vals)];
    }

    standardizeString(str: string): string {
        str = str.trim().normalize("NFKD").replace(/\p{M}/gu, "");
        if (!this.config.caseSensitive) str = str.toLowerCase();

        if (this.config.ignoreBrackets) {
            for (const opening of this.config.ignoreBrackets.split("")) {
                if (!"([{".includes(opening)) {
                    console.error("Invalid opening ignore bracket.");
                    continue;
                }

                str = removeBrackets(str, opening as "(" | "[" | "{");
            }
        }

        return str;
    }

    private _grade(guess: string, value: string) {
        return gradeFromDist(osaDistance(guess, value), this.getMaxDist(value));
    }

    grade(guess: string): number {
        guess = this.standardizeString(guess);
        return Math.max(...this.values.map(value => this._grade(guess, value)));
    }

    mark(guess: string): MarkedGuess {
        const grade = this.grade(guess);
        return [grade, markedSpan(guess, grade), markedSpan(this.display, grade)];
    }
}


export interface ListAnswerConfig {
    splitter?: string | RegExp;
    gradeMode?: "one" | "all"
}

export class ListAnswer<T extends QuizAnswer> implements QuizAnswer {
    config: Required<ListAnswerConfig> & {splitter: RegExp};
    display: string;
    values: SubString[];
    answers: T[];

    constructor(value: string, callback: (item: string) => T, config: ListAnswerConfig = {}) {
        this.display = value;

        this.config = {
            splitter: new RegExp(config.splitter ?? DefaultListSplitter, "gu"),
            gradeMode: config.gradeMode ?? "one"
        };

        this.values = new SubString(value).split(this.config.splitter);
        this.answers = this.values.map(answer => callback(answer.str));
    }

    splitGuesses(guessesStr: string): SubString[] {
        return new SubString(guessesStr).split(this.config.splitter, true);
    }

    grade(guessesStr: string): number {
        const answerGrades = this.gradingData(this.splitGuesses(guessesStr))[2];
        return this.calculateGrade(answerGrades);
    }

    calculateGrade(answerGrades: number[]): number {
        return this.config.gradeMode === "all" ? avg(answerGrades) : Math.max(...answerGrades);
    }

    gradingData(guesses: SubString[]): [Matrix<number>, number[], number[]] {
        const n = this.answers.length;
        const m = guesses.length;

        const grades = Matrix.full(n, m, (i, j) => this.answers[i].grade(guesses[j].str));
        const bestGuessIndices = full(n, i => argmax(grades.getRow(i)));
        const answerGrades = bestGuessIndices.map((j, i) => grades.get(i, j));

        return [grades, bestGuessIndices, answerGrades];
    }

    mark(guessesStr: string): MarkedGuess {
        const guesses = this.splitGuesses(guessesStr);
        const [grades, bestGuessIndices, answerGrades] = this.gradingData(guesses);

        const grade = this.calculateGrade(answerGrades);
        const markedGuess = replaceWithElements(guessesStr, mapFromKeys(
            guesses, (guess, j) => markedSpan(guess.str, Math.max(...grades.getColumn(j)))
        ));

        let markedSolution;

        if (this.config.gradeMode === "all") {
            markedSolution = replaceWithElements(this.display, mapFromKeys(
                this.values, (value, i) => markedSpan(value.str, grades.get(i, bestGuessIndices[i]))
            ));
        } else {
            const answerIndex = argmax(answerGrades);

            if (passes(grade)) {
                const guessIndex = bestGuessIndices[answerIndex];
                const value = this.values[answerIndex];

                markedSolution = replaceWithElements(this.display, new Map([
                    [value, markedSpan(value.str, grades.get(answerIndex, guessIndex))]
                ]));
            } else {
                markedSolution = replaceWithElements(this.display, mapFromKeys(
                    this.values, value => markedSpan(value.str, 0)
                ));
            }
        }

        return [grade, markedGuess, markedSolution];
    }
}


export function passes(grade: number): boolean {
    return grade >= 0.5;
}

function markedSpan(value: string, grade: number): HTMLSpanElement {
    const span = document.createElement("SPAN");
    span.dataset.correct = grade === 1 ? "true" : grade > 0 ? "partially" : "false";
    span.textContent = value;

    return span;
}

function replaceWithElements(display: string, elements: Map<SubString, HTMLElement>): HTMLSpanElement {
    const container = document.createElement("span");
    let i = 0;

    for (const [substr, element] of elements) {
        if (substr.start > i) {
            container.append(display.substring(i, substr.start));
        }
        container.append(element);
        i = substr.end;
    }

    if (i < display.length) {
        container.append(display.substring(i));
    }

    return container;
}

function gradeFromDist(dist: number, maxDist: number = 0): number {
    if (dist > maxDist) return 0;
    if (maxDist === 0) return 1;

    return 0.5 + 0.5 * (maxDist - dist) / maxDist;
}


const closingBrackets = Object.freeze({"(": ")", "[": "]", "{": "}"});

function removeBrackets(str: string, opening: '(' | '[' | '{' = '('): string {
    let i = 0;
    let depth = 0;
    let bracketStart = -1;
    const closing = closingBrackets[opening];

    while (i < str.length) {
        const char = str.charAt(i);
        if (char === opening) {
            depth += 1;
            if (depth === 1) bracketStart = i;
        } else if (char === closing && depth > 0) {
            depth -= 1;
            if (depth === 0) {
                str = str.substring(0, bracketStart) + str.substring(i + 1);
                i = bracketStart - 1;
            }
        }

        i++;
    }

    return str;
}
