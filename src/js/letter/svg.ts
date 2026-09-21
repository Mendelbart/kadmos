import {Nodeable} from "./letter";

interface SVGTemplate {
    string: string;
    keys: string[];
}

export class SVGNodeable implements Nodeable<SVGElement> {
    node: SVGElement;
    xml: string;
    alt: string;

    constructor(xml: string, {alt}: {alt?: string} = {}) {
        this.xml = xml;
        this.node = parseSVGToNode(xml);
        this.node.classList.add("svg-nodeable");
        this.node.setAttribute("preserveAspectRatio", "meet");
        this.node.removeAttribute("height");
        this.node.removeAttribute("width");
        this.alt = alt ?? xml;
    }

    getNode(): SVGElement {
        return this.node.cloneNode(true) as SVGElement;
    }

    stringValue(): string {
        return this.alt;
    }

    static fromTemplate(template: SVGTemplate, data: (string | number)[]): SVGNodeable {
        let string = template.string;
        for (const [index, d] of data.entries()) {
            string = string.replace(escapedRegExp("$" + template.keys[index] + "$", 'g'), d.toString());
        }
        return new SVGNodeable(string);
    }
}

function parseSVGToNode(xml: string): SVGElement {
    const parser = new DOMParser();
    return parser.parseFromString(xml, "image/svg+xml").documentElement as unknown as SVGElement;
}

function escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

function escapedRegExp(string: string, flags?: string) {
    return new RegExp(escapeRegExp(string), flags);
}