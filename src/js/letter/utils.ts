import {Nodeable, StringLetter, StringLetterConfig} from "./letter";
import {ImageNodeable} from "./image";
import {BrailleString} from "./braille";
import {SVGNodeable} from "./svg";

export type LetterType = keyof LetterElementMap;
export interface LetterElementMap {
    string: [HTMLSpanElement, [StringLetterConfig]],
    braille: [HTMLSpanElement, []],
    image: [HTMLImageElement, []],
    svg: [SVGElement, []]
}
export type NodeableFromLetterKey<K extends LetterType> = Nodeable<LetterElementMap[K][0], LetterElementMap[K][1]>;


export function createNodeable<K extends LetterType>(type: K, data: string): NodeableFromLetterKey<K>;
export function createNodeable(type: "string" | "braille" | "image" | "svg", data: string) {
    if (type === "string") return new StringLetter(data);
    if (type === "braille") return new BrailleString(data);
    if (type === "image") return new ImageNodeable(data);
    if (type === "svg") return new SVGNodeable(data);

    throw new Error("Invalid Letter type.");
}
