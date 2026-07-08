import {createElement} from "../utils/dom";
import {full} from "../utils/array";

// https://en.wikipedia.org/wiki/Braille_ASCII#Braille_ASCII_values
const brailleASCIISource = [
    [" ", "000000"],
    ["!", "011101"],
    ["\"", "000010"],
    ["#", "001111"],
    ["$", "110101"],
    ["%", "100101"],
    ["&", "111101"],
    ["'", "001000"],
    ["(", "111011"],
    [")", "011111"],
    ["*", "100001"],
    ["+", "001101"],
    [",", "000001"],
    ["-", "001001"],
    [".", "000101"],
    ["/", "001100"],
    ["0", "001011"],
    ["1", "010000"],
    ["2", "011000"],
    ["3", "010010"],
    ["4", "010011"],
    ["5", "010001"],
    ["6", "011010"],
    ["7", "011011"],
    ["8", "011001"],
    ["9", "001010"],
    [":", "100011"],
    [";", "000011"],
    ["<", "110001"],
    ["=", "111111"],
    [">", "001110"],
    ["?", "100111"],
    ["@", "000100"],
    ["A", "100000"],
    ["B", "110000"],
    ["C", "100100"],
    ["D", "100110"],
    ["E", "100010"],
    ["F", "110100"],
    ["G", "110110"],
    ["H", "110010"],
    ["I", "010100"],
    ["J", "010110"],
    ["K", "101000"],
    ["L", "111000"],
    ["M", "101100"],
    ["N", "101110"],
    ["O", "101010"],
    ["P", "111100"],
    ["Q", "111110"],
    ["R", "111010"],
    ["S", "011100"],
    ["T", "011110"],
    ["U", "101001"],
    ["V", "111001"],
    ["W", "010111"],
    ["X", "101101"],
    ["Y", "101111"],
    ["Z", "101011"],
    ["[", "010101"],
    ["\\", "110011"],
    ["]", "110111"],
    ["^", "000110"],
    ["_", "000111"]
];
const brailleASCIIData = new Map(brailleASCIISource.map(
    ([char, dotsString]) => [char, dotsString.split("").map(x => x === "1")]
));

/** @implements Nodeable */
export class BrailleString {
    /**
     * @param {string} ascii
     */
    constructor(ascii) {
        for (const char of ascii) {
            if (!brailleASCIIData.has(char)) throwInvalidBrailleASCII(char);
        }
        this.ascii = ascii;
    }

    /**
     * @returns {HTMLSpanElement}
     */
    getNode() {
        const cells = this.ascii.split("").map(char => getBrailleCell(char));

        const node = createElement("span.braille-cells");
        node.append(...cells);
        return node;
    }

    stringValue() {
        return this.ascii.split("").map(char => brailleBoolsToUnicode(brailleASCIIData.get(char))).join("");
    }
}

/**
 * @param {boolean[]} bools
 */
function boolsToBinary(bools) {
    return bools.reduce((s, v, i) => v ? s + (1 << i) : s, 0);
}

/**
 * @param {number} number
 * @param {number} [length]
 * @returns {boolean[]}
 */
function binaryToBools(number, length) {
    length ??= number === 0 ? 0 : Math.floor(Math.log2(number));
    return full(length, i => number & (1 << i) !== 0);
}

const BrailleUnicodeStart = parseInt("2800", 16);
/**
 * @param {boolean[]} filled
 * @returns {string}
 */
function brailleBoolsToUnicode(filled) {
    return String.fromCharCode(BrailleUnicodeStart + boolsToBinary(filled));
}

/**
 * @param {string} char
 * @returns {boolean[]}
 */
function brailleUnicodeToBools(char) {
    return binaryToBools(char.charCodeAt(0) - BrailleUnicodeStart, 6);
}

/**
 * @param {string} char - Braille ASCII character
 * @returns HTMLSpanElement
 */
function getBrailleCell(char) {
    const cell = createElement("span.braille-cell");
    const isFilled = brailleASCIIData.get(char);
    if (!isFilled) throwInvalidBrailleASCII(char);

    const dots = isFilled.map(filled => getBrailleDot(filled));
    cell.append(...dots);
    return cell;
}

/**
 * @param {boolean} filled
 * @returns HTMLSpanElement
 */
function getBrailleDot(filled) {
    const dot = createElement("span.braille-dot");
    dot.classList.add(filled ? "filled" : "unfilled");
    return dot;
}

function throwInvalidBrailleASCII(char) {
    throw new Error(`Invalid braille ascii character '${char}.'`);
}
