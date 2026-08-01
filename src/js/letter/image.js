/** @implements Nodeable */
export class ImageNodeable {
    /**
     * @param {string} src
     * @param {string} [alt]
     */
    constructor(src, {alt} = {}) {
        this.src = src;
        this.alt = alt;
    }

    /**
     * @returns {HTMLImageElement}
     */
    getNode() {
        const node = new Image();
        node.src = this.src;
        node.classList.add("image-nodeable");
        return node;
    }

    /**
     * @returns {string}
     */
    stringValue() {
        if (this.alt) return this.alt;
        const i = this.src.lastIndexOf("/");
        const j = this.src.lastIndexOf(".");
        return this.src.substring(i + 1, j > i + 1 ? j : null);
    }
}
