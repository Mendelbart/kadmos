import {MarkedGuess, QuizAnswer} from "./answer";

export type QuizAnswers = Record<string, QuizAnswer>;

export default class QuizItem<T, A extends QuizAnswers = QuizAnswers> {
    content: T;
    answers: A

    constructor(content: T, answers: A) {
        this.content = content;
        this.answers = answers;
    }

    grade(key: keyof A, guess: string): number {
        return this.answers[key].grade(guess);
    }

    mark(key: keyof A, guess: string): MarkedGuess {
        return this.answers[key].mark(guess);
    }
}
