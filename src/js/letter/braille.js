import {createElement} from "../utils/dom";
import {full} from "../utils/array";

// https://en.wikipedia.org/wiki/Braille_ASCII#Braille_ASCII_values
const brailleASCIIOrder = " A1B'K2L@CIF/MSP\"E3H9O6R^DJG>NTQ,*5<-U8V.%[$+X!&;:4\\0Z7(_?W]#Y)";
const brailleASCIIMap = new Map(brailleASCIIOrder.split("").map((char, index) => [char, index]));

/** @implements Nodeable */
export class BrailleString {
    /**
     * @param {string} ascii
     */
    constructor(ascii) {
        for (const char of ascii) {
            if (!brailleASCIIMap.has(char)) throwInvalidBrailleASCII(char);
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
        return this.ascii.split("").map(char => brailleNumToUnicode(brailleASCIIMap.get(char))).join("");
    }
}

/**
 * @param {number} number
 * @param {number} [length]
 * @returns {boolean[]}
 */
function binaryToBools(number, length) {
    length ??= number === 0 ? 0 : Math.floor(Math.log2(number));
    return full(length, i => (number & (1 << i)) !== 0);
}

const BrailleUnicodeStart = parseInt("2800", 16);
/**
 * @param {number} num
 * @returns {string}
 */
function brailleNumToUnicode(num) {
    return String.fromCharCode(BrailleUnicodeStart + num);
}

/**
 * @param {string} char - Braille ASCII character
 * @returns HTMLSpanElement
 */
function getBrailleCell(char) {
    const cell = createElement("span.braille-cell");
    const num = brailleASCIIMap.get(char);
    if (num == null) throwInvalidBrailleASCII(char);

    const dots = binaryToBools(num, 6).map(filled => getBrailleDot(filled));
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
