import {ObjectUtils} from '../utils';
import {avg} from "../utils/array";
import {MarkedGuess, QuizAnswer} from "./answer";

export type QuizAnswers = Record<string, QuizAnswer>;

export default class QuizItem<T, A extends QuizAnswers = QuizAnswers> {
    content: T;
    answers: A

    constructor(content: T, answers: A) {
        this.content = content;
        this.answers = answers;
    }

    gradeAll(guesses: Record<keyof A, string>): number {
        const grades = ObjectUtils.map(guesses, (guess, key) => this.grade(key, guess));
        return avg(Object.values(grades));
    }

    markAll(guesses: Record<keyof A, string>): [number, Record<keyof A, HTMLSpanElement>, Record<keyof A, HTMLSpanElement>] {
        const marked = ObjectUtils.map(guesses, (guess, key) => this.mark(key, guess));
        const grade = avg(Object.values(marked).map(x => x[0]));
        return [grade, ObjectUtils.map(marked, x => x[1]), ObjectUtils.map(marked, x => x[2])];
    }

    grade(key: keyof A, guess: string): number {
        return this.answers[key].grade(guess);
    }

    mark(key: keyof A, guess: string): MarkedGuess {
        return this.answers[key].mark(guess);
    }
}
