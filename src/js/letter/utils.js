import {StringLetter, ImageLetter} from "./letter";
import {BrailleString} from "./braille";

/**
 * @param {"string"|"braille"|"image"} type
 * @param {any} data
 * @returns {ImageLetter|StringLetter|BrailleString}
 */
export function createNodeable(type, data) {
    switch (type) {
        case "string":
            return new StringLetter(data);
        case "braille":
            return new BrailleString(data);
        case "image":
            return new ImageLetter(data);
        default:
            throw new Error("Invalid Letter type.");
    }
}
