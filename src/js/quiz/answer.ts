import {argmax, mapFromKeys, avg, full} from "../utils/array";
import {osaDistance} from "./string-metrics";
import {Matrix, SubString} from "../utils";

export type MarkedGuess = [grade: number, markedGuess: HTMLSpanElement, markedSolution: HTMLSpanElement];

export interface QuizAnswer {
    display: string;
    grade(guess: string): number;
    mark(guess: string): MarkedGuess;
}

export type StringAnswerRecipe = StringAnswerConfig & {type: "string", list?: ListAnswerConfig[]};
export type NumberAnswerRecipe = NumberAnswerConfig & {type: "number"};

export interface QuizAnswerTypeMap {
    string: StringAnswer | ListAnswer<"string">,
    number: NumberAnswer
}

export interface QuizAnswerRecipeMap {
    string: StringAnswerRecipe,
    number: NumberAnswerRecipe
}

const factories: {[K in keyof QuizAnswerTypeMap]: (recipe: QuizAnswerRecipeMap[K]) => (value: string) => QuizAnswerTypeMap[K]} = {
    string: (recipe: StringAnswerRecipe) => {
        if (recipe.list && recipe.list.length > 0) {
            const listConfig = recipe.list[0];
            const factory = factories.string(
                {...recipe, list: recipe.list.slice(1)}
            );
            return (value: string) => new ListAnswer(value, factory, listConfig);
        }
        return (value: string) => new StringAnswer(value, recipe);
    },
    number: (config: NumberAnswerConfig) => (value: string) => new NumberAnswer(value, config),
}

export function QuizAnswerFactory<K extends keyof QuizAnswerTypeMap>(recipe: QuizAnswerRecipeMap[K]): (value: string) => QuizAnswerTypeMap[K] {
    return factories[recipe.type as K](recipe);
}

export const DefaultListSplitter = "[,;/]";

export function getSplitter(recipe: StringAnswerRecipe | NumberAnswerRecipe): RegExp | undefined {
    if ("list" in recipe && recipe.list && recipe.list.length > 0) {
        return new RegExp(recipe.list.map(
            listConfig => listConfig.splitter ?? DefaultListSplitter
        ).join("|"), "g");
    }
}

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
            if (distanceMode !== "linear") console.error(`Invalid distance mode ${distanceMode}`);
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

export interface StringAnswerConfig {
    maxDist?: number;
    maxDistMult?: number;
    substitutions?: [string | RegExp, string][];
    gradeSubstitutions?: GradeSubstitution[];
    caseSensitive?: boolean;
}
export type GradeSubstitution = [string | RegExp, string[]];

export class StringAnswer implements QuizAnswer {
    display: string;
    values: string[];
    config: {
        maxDist: number,
        maxDistMult: number,
        gradeSubstitutions: [RegExp, string[]][],
        caseSensitive: boolean
    };

    constructor(display: string, config: StringAnswerConfig = {}) {
        const caseSensitive = config.caseSensitive ?? false;
        const gradeSubstitutions = (config.gradeSubstitutions ?? []).map(
            ([pattern, repls]): [RegExp, string[]] => [this.toRegex(pattern, caseSensitive), repls]
        );
        this.display = this.applySingleSubstitutions(display, config.substitutions ?? []);
        this.config = {
            maxDist: config.maxDist ?? 0,
            maxDistMult: config.maxDistMult ?? 0,
            gradeSubstitutions,
            caseSensitive
        }

        this.values = this.applyGradeSubstitutions(this.display, this.config.gradeSubstitutions).map(s => this.standardizeString(s));
    }

    toRegex(value: string | RegExp, caseSensitive: boolean) {
        return new RegExp(value, caseSensitive ? "gui" : "gu");
    }

    getMaxDist(value: string): number {
        if (this.config.maxDistMult === 0) return this.config.maxDist;
        return this.config.maxDist + Math.floor(value.length / this.config.maxDistMult);
    }

    applySingleSubstitutions(value: string, substitutions: [string | RegExp, string][]): string {
        for (const [pattern, repl] of substitutions) {
            value = value.replace(new RegExp(pattern, "gu"), repl);
        }
        return value;
    }

    applyGradeSubstitutions(display: string, substitutions: [RegExp, string[]][]): string[] {
        let vals = [display];

        for (const [regex, repls] of substitutions) {
            vals = vals.flatMap(val => repls.map(repl => val.replace(regex, repl)));
        }

        return [...new Set(vals)];
    }

    applySingleGradeSubstitutions(guess: string, substitutions: [RegExp, string[]][]): string {
        for (const [regex, repls] of substitutions) {
            guess = guess.replace(regex, repls[0]);
        }
        return guess;
    }

    standardizeString(str: string): string {
        str = str.trim().normalize("NFKD").replace(/\p{M}/gu, "");
        if (!this.config.caseSensitive) str = str.toLowerCase();

        return str;
    }

    private _grade(guess: string, value: string): number {
        return gradeFromDist(osaDistance(guess, value), this.getMaxDist(value));
    }

    grade(guess: string): number {
        guess = this.standardizeString(this.applySingleGradeSubstitutions(guess.trim(), this.config.gradeSubstitutions));
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

export class ListAnswer<T extends keyof QuizAnswerTypeMap> implements QuizAnswer {
    config: Required<ListAnswerConfig> & {splitter: RegExp};
    display: string;
    values: SubString[];
    answers: QuizAnswerTypeMap[T][];

    constructor(value: string, callback: (item: string) => QuizAnswerTypeMap[T], config: ListAnswerConfig = {}) {
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
