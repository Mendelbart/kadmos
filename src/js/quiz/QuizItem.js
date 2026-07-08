import {ObjectUtils} from '../utils';
import {avg} from "../utils/array";

export default class QuizItem {
    /**
     * @param {Nodeable} content
     * @param {Record<string, QuizAnswer>} answers
     */
    constructor(content, answers) {
        this.content = content;
        this.answers = answers;
    }

    /**
     * @param {Record<string, string>} guesses
     * @returns number
     */
    gradeAll(guesses) {
        const grades = ObjectUtils.map(guesses, (guess, key) => this.grade(key, guess));
        return avg(Object.values(grades));
    }

    /**
     * @param {Record<string,string>} guesses
     * @returns {[number, Record<string, HTMLSpanElement>, Record<string, HTMLSpanElement>]}
     */
    markAll(guesses) {
        const marked = ObjectUtils.map(guesses, (guess, key) => this.mark(key, guess));
        const grade = avg(Object.values(marked).map(x => x[0]));
        return [grade, ObjectUtils.map(marked, x => x[1]), ObjectUtils.map(marked, x => x[2])];
    }

    /**
     * @param {string} key
     * @param {string} guess
     * @returns {number}
     */
    grade(key, guess) {
        return this.answers[key].grade(guess);
    }

    /**
     * @param {string} key
     * @param {string} guess
     * @returns {[number,HTMLSpanElement,HTMLSpanElement]}
     */
    mark(key, guess) {
        return this.answers[key].mark(guess);
    }
}
