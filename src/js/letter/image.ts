import {Nodeable} from "./letter";

export class ImageNodeable implements Nodeable<HTMLImageElement> {
    src: string;
    alt: string;

    constructor(src: string, {alt}: {alt?: string} = {}) {
        this.src = src;
        this.alt = alt ?? src;
    }

    getNode(): HTMLImageElement {
        const node = new Image();
        node.src = this.src;
        if (this.alt) node.alt = this.alt;
        node.classList.add("image-nodeable");
        return node;
    }

    stringValue(): string {
        if (this.alt) return this.alt;
        const i = this.src.lastIndexOf("/");
        const j = this.src.lastIndexOf(".");
        return this.src.substring(i + 1, j > i + 1 ? j : undefined);
    }
}
