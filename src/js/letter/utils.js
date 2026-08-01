import {StringLetter} from "./letter";
import {ImageNodeable} from "./image";
import {BrailleString} from "./braille";
import {SVGNodeable} from "./svg";

/**
 * @param {"string"|"braille"|"image"|"svg"} type
 * @param {any} data
 * @returns {ImageNodeable|StringLetter|BrailleString|SVGNodeable}
 */
export function createNodeable(type, data) {
    switch (type) {
        case "string":
            return new StringLetter(data);
        case "braille":
            return new BrailleString(data);
        case "image":
            return new ImageNodeable(data);
        case "svg":
            return new SVGNodeable(data);
        default:
            throw new Error("Invalid Letter type.");
    }
}
