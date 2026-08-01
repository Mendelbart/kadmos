/** @implements {Nodeable} */
export class SVGNodeable {
    /**
     * @param {string} xml
     * @param {string} [alt]
     */
    constructor(xml, {alt} = {}) {
        this.xml = xml;
        this.node = parseSVGToNode(xml);
        this.node.classList.add("svg-nodeable");
        this.node.setAttribute("preserveAspectRatio", "meet");
        this.node.removeAttribute("height");
        this.node.removeAttribute("width");
        this.alt = alt ?? xml;
    }

    /**
     * @returns {SVGElement}
     */
    getNode() {
        return this.node.cloneNode(true);
    }

    /**
     * @returns {string}
     */
    stringValue() {
        return this.alt;
    }

    /**
     * @param {string} string
     * @param {string[]} keys
     * @param {(string|number)[]} data
     * @returns {SVGNodeable}
     */
    static fromTemplate({string, keys}, data) {
        for (const [index, d] of data.entries()) {
            string = string.replaceAll("$" + keys[index] + "$", d);
        }
        return new SVGNodeable(string);
    }
}

/**
 * @param {string} xml
 * @returns {SVGElement}
 */
function parseSVGToNode(xml) {
    const parser = new DOMParser();
    return parser.parseFromString(xml, "image/svg+xml").documentElement;
}
