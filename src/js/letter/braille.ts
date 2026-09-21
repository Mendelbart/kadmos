import {tag} from "../utils/dom";
import {full} from "../utils/array";
import {Nodeable} from "./letter";

// https://en.wikipedia.org/wiki/Braille_ASCII#Braille_ASCII_values
const brailleASCIIOrder = " A1B'K2L@CIF/MSP\"E3H9O6R^DJG>NTQ,*5<-U8V.%[$+X!&;:4\\0Z7(_?W]#Y)";
const brailleASCIIMap = new Map(brailleASCIIOrder.split("").map((char, index) => [char, index]));


export class BrailleString implements Nodeable<HTMLSpanElement>{
    ascii: string;

    constructor(ascii: string) {
        for (const char of ascii) {
            if (!brailleASCIIMap.has(char)) throwInvalidBrailleASCII(char);
        }
        this.ascii = ascii;
    }

    getNode(): HTMLSpanElement {
        const cells = this.ascii.split("").map(char => getBrailleCell(char));

        const node = tag("span", ".braille-cells");
        node.append(...cells);
        return node;
    }

    stringValue() {
        return this.ascii.split("").map(char => brailleASCIICharToUnicode(char)).join("");
    }
}

function binaryToBools(number: number, length: number): boolean[] {
    length ??= number === 0 ? 0 : Math.floor(Math.log2(number));
    return full(length, i => (number & (1 << i)) !== 0);
}

const BrailleUnicodeStart = parseInt("2800", 16);

function brailleASCIICharToUnicode(char: string): string {
    const num = brailleASCIIMap.get(char);
    if (num == null) throw new Error("Invalid braille ascii char.");
    return brailleNumToUnicode(num);
}

function brailleNumToUnicode(num: number): string {
    return String.fromCharCode(BrailleUnicodeStart + num);
}

function getBrailleCell(char: string): HTMLSpanElement {
    const cell = tag("span", ".braille-cell");
    const num = brailleASCIIMap.get(char);
    if (num == null) throwInvalidBrailleASCII(char);

    const dots = binaryToBools(num, 6).map(filled => getBrailleDot(filled));
    cell.append(...dots);
    return cell;
}

function getBrailleDot(filled: boolean): HTMLSpanElement {
    const dot = tag("span", ".braille-dot");
    dot.classList.add(filled ? "filled" : "unfilled");
    return dot;
}

function throwInvalidBrailleASCII(char: string): never {
    throw new Error(`Invalid braille ascii character '${char}.'`);
}
