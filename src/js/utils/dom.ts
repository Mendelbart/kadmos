import * as ObjectHelper from './object';
import {map} from "./object";

export type StylableElement = HTMLElement | SVGElement;
export type ElementAttrs = Record<string, string | boolean>;

export type SelectorPair = readonly [tagName: keyof HTMLElementTagNameMap, selector?: string];
export type SelectedElement<T extends SelectorPair | keyof HTMLElementTagNameMap | string> = T extends SelectorPair ? HTMLElementTagNameMap[T[0]] : T extends keyof HTMLElementTagNameMap ? HTMLElementTagNameMap[T] : HTMLElement;
export type GrabNodesRecord = Record<string, string | SelectorPair>;
export type GrabbedNodes<N extends GrabNodesRecord> = {[K in keyof N]: SelectedElement<N[K]>};

export type Nodes<E extends Node> = Iterable<E> | E

const domParser = new DOMParser();

let IdPrefixCounter = 0;

export function createTemplate(content: string | Node): HTMLTemplateElement {
    const template = document.createElement("template");
    if (typeof content === "string") {
        template.insertAdjacentHTML("beforeend",  content);
    } else {
        template.append(content);
    }
    return template;
}

export function assertTagName<K extends keyof HTMLElementTagNameMap>(tagName: K, element: Element): HTMLElementTagNameMap[K];
export function assertTagName<K extends keyof SVGElementTagNameMap>(tagName: K, element: Element): SVGElementTagNameMap[K];
export function assertTagName<E extends Element = Element>(tagName: string, element: E): E;
export function assertTagName(tagName: string, element: Element): Element {
    if (element.tagName !== tagName.toUpperCase()) throw new Error(`Element ${element} doesn't match tag name ${tagName}.`);
    return element;
}

export function grabNodes<N extends GrabNodesRecord>(container: ParentNode, nodes: N) {
    return map(nodes, (value) => {
        if (typeof value === "string") {
            return selectNode(container, value) as HTMLElement;
        } else {
            return grabNode(container, value[0], value[1]);
        }
    }) as GrabbedNodes<N>;
}


export function selectNode<E extends Element = Element>(parent: ParentNode, selector: string): E {
    const result = parent.querySelector<E>(selector);
    if (!result) throw new Error(`Selector "${selector}" not found in parent ${parent}.`);
    return result;
}

export function grabNode<K extends keyof HTMLElementTagNameMap>(parent: ParentNode, tagName: K, selector?: string) {
    const selectorWithTagName = !selector ? tagName : `${tagName}:is(${selector})`;
    return selectNode(parent, selectorWithTagName) as HTMLElementTagNameMap[K];
}

export function DOMFactory<N extends GrabNodesRecord>(html: string, nodes: N) {
    const doc = domParser.parseFromString(html, "text/html");
    return () => grabNodes(document.importNode(doc.body, true), nodes);
}

export function contentToElement(content: string | Element): Element {
    if (typeof content !== "string") return content;
    const el = domParser.parseFromString(content, "text/html").body.firstElementChild;
    if (!el) throw new Error("Couldn't create element from content.");
    return el;
}

export function ElementFactory<E extends Element = Element>(content: string | E): () => E;
export function ElementFactory<K extends keyof HTMLElementTagNameMap>(content: string | HTMLElementTagNameMap[K], tagName: K): () => HTMLElementTagNameMap[K];
export function ElementFactory(content: string | Element, tagName?: string): () => Element {
    const element = contentToElement(content);
    const tagged = tagName ? assertTagName(tagName, element) : element;

    return () => tagged.cloneNode(true) as Element;
}

const buttonInputFactory = ElementFactory(`<input class="button-check form-input" autocomplete="off" />`, "input");
const buttonLabelFactory = ElementFactory(`<label class="button"></label>`, "label");
export function button(type: string, value: string, labelContent?: string | Node, id?: string): [HTMLInputElement, HTMLLabelElement] {
    const input = buttonInputFactory();
    const label = buttonLabelFactory();
    id ??= uniqueIdPrefix("button") + value;

    setAttrs(input, {
        type: type,
        value: value,
        id: id
    });
    label.htmlFor = id;
    label.tabIndex = 0;

    if (labelContent) label.append(labelContent);

    return [input, label];
}

export function label(element: string | Element, content: string, defaultId: string): HTMLLabelElement {
    const label = document.createElement("label");
    if (element instanceof Node) {
        element = setDefaultId(element, defaultId);
    }
    label.htmlFor = element;
    label.textContent = content;
    return label;
}

export function tag<K extends keyof HTMLElementTagNameMap>(tagName: K, options?: string, ...children: (string | Node)[]): HTMLElementTagNameMap[K] {
    const element = document.createElement(tagName);

    if (options) {
        const {id, classList, attrs} = parseElementOptions(options);
        if (id) element.id = id;
        element.classList.add(...classList);
        setAttrs(element, attrs);
    }

    element.append(...children);

    return element;
}

export function div(options?: string, ...children: (string | Node)[]): HTMLDivElement {
    return tag("div", options, ...children);
}

export function span(options?: string, ...children: (string | Node)[]): HTMLSpanElement {
    return tag("span", options, ...children);
}

export function input(attrs: ElementAttrs): HTMLInputElement {
    const input = tag("input");
    setAttrs(input, attrs);
    return input;
}

function parseElementOptions(str: string): {id: string | null, classList: string[], attrs: ElementAttrs} {
    let id: string | null = null;
    const classList: string[] = [];
    const attrs: Record<string, string | true> = {};

    while (str.length > 0) {
        const start = str.charAt(0);
        const tail = str.substring(1);
        const matchEnd = tail.match(/[#.\[]/);
        const end = matchEnd?.index != null ? matchEnd.index : tail.length;
        const part = tail.substring(0, end);

        switch (start) {
            case "#":
                if (id != null) console.warn("Multiple id's set for element.");
                id = part;
                break;
            case ".":
                classList.push(part);
                break;
            case "[":
                const attrEnd = part.length - 1;
                if (part.charAt(attrEnd) !== "]") throw new Error("Invalid element options format, [ not ended by ]");
                const equalsIndex = part.match("=")?.index;
                const attr = part.substring(0, equalsIndex ?? attrEnd);
                const value = equalsIndex == null ? true : part.substring(equalsIndex + 1, attrEnd);
                attrs[attr] = value;
                break;
            default:
                throw new Error("Invalid element options format.");
        }
        str = str.substring(end + 1);
    }

    return {id, classList, attrs};
}


export interface SelectOptionsConfig {
    selected?: string,
    disabled?: string[],
    groups?: {label: string, keys: string[]}[]
}

export function setOptions(select: HTMLSelectElement, data: Record<string, string>, config: SelectOptionsConfig = {}): void {
    const grouped = ObjectHelper.map(data, () => false);
    let before;

    if (config.groups) for (const {label, keys} of config.groups) {
        const optgroup = document.createElement("optgroup");
        optgroup.label = label;
        for (const key of keys) {
            const value = data[key];
            if (value == null) {
                console.warn(`Unknown grouped key ${key} in group ${label}.`);
                continue;
            }
            optgroup.append(createOption(key, value, config.selected, config.disabled));
            grouped[key] = true;
        }

        select.add(optgroup);
        if (!before) before = optgroup;
    }

    for (const [key, value] of Object.entries(data)) {
        if (!grouped[key]) {
            select.add(createOption(key, value, config.selected, config.disabled), before);
        }
    }
}

/**
 * @param {string} key
 * @param {string} value
 * @param {string} selected
 * @param {string[]} disabled
 * @returns {HTMLOptionElement}
 */
function createOption(key: string, value: string, selected?: string, disabled?: string[]): HTMLOptionElement {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = value;
    if (selected === key) option.selected = true;
    if (disabled && disabled.includes(key)) option.disabled = true;
    return option;
}


const booleanAttributes = new Set([
    "allowfullscreen",
    "alpha",
    "async",
    "autofocus",
    "autoplay",
    "checked",
    "controls",
    "default",
    "defer",
    "disabled",
    "formnovalidate",
    "inert",
    "ismap",
    "itemscope",
    "loop",
    "multiple",
    "muted",
    "nomodule",
    "novalidate",
    "open",
    "playsinline",
    "readonly",
    "required",
    "reversed",
    "selected",
    "shadowrootclonable",
    "shadowrootcustomelementregistry",
    "shadowrootdelegatesfocus",
    "shadowrootserializable"
]);

export function setAttrs(element: Element, attrs: ElementAttrs) {
    for (const [key, value] of Object.entries(attrs)) {
        setAttr(element, key, value);
    }
}

export function setAttr(element: Element, key: string, value: string | boolean): void {
    if (booleanAttributes.has(key)) {
        if (value) {
            element.setAttribute(key, key);
        } else {
            element.removeAttribute(key);
        }
    } else if (key === "class") {
        if (typeof value !== "string") throw new Error("class must have string value.");
        addClass([element], value);
    } else {
        element.setAttribute(key, typeof value === "boolean" ? value.toString() : value);
    }
}

export function uniqueIdPrefix(prefix: string, connector = "_"): string {
    IdPrefixCounter += 1;
    return prefix + IdPrefixCounter + connector;
}

/**
 * If the node doesn't have an ID, set it to defaultId.
 * Return its ID.
 */
export function setDefaultId(element: Element, defaultId: string): string {
    if (element.hasAttribute("id")) element.id = defaultId;

    return element.id;
}

export function nodesToIterable<E extends Node>(nodes: Nodes<E>): Iterable<E> {
    return nodes instanceof Node ? [nodes] : nodes;
}

/**
 * Toggle classes depending on the given `bool`: Add `trueClasses` and `falseClasses`
 * if `bool` is truthy, and vice versa.
 */
export function classIfElse(bool: any, elements: Nodes<Element>, trueClasses?: string | string[], falseClasses?: string | string[]): void {
    if (!bool) [trueClasses, falseClasses] = [falseClasses, trueClasses];

    trueClasses = classesToList(trueClasses);
    falseClasses = classesToList(falseClasses);

    for (const elem of nodesToIterable(elements)) {
        elem.classList.remove(...falseClasses);
        elem.classList.add(...trueClasses);
    }
}

export function addClass(elements: Nodes<Element>, classes: string | string[]) {
    classIfElse(true, elements, classes);
}

export function removeClass(elements: Nodes<Element>, classes: string | string[]) {
    classIfElse(false, elements, classes);
}

export function show(elements: Nodes<StylableElement>, property: "display" | "visibility" | "opacity" = "display") {
    for (const elem of nodesToIterable(elements)) elem.style.removeProperty(property);
}


const hideValues = {
    display: "none",
    visibility: "hidden",
    opacity: "0"
}

export function hide(elements: Nodes<StylableElement>, property: "display" | "visibility" | "opacity" = "display") {
    const value = hideValues[property];
    for (const elem of nodesToIterable(elements)) elem.style.setProperty(property, value);
}

export function toggleShown(showFirst: boolean, first?: Nodes<StylableElement>, second?: Nodes<StylableElement>, property: "display" | "visibility" | "opacity" = "display") {
    if (showFirst) {
        if (second) hide(second, property);
        if (first) show(first, property);
    } else {
        if (first) hide(first, property);
        if (second) show(second, property);
    }
}

export function classesToList(classes?: string | string[]): string[] {
    if (typeof classes === "string") return classes.split(" ");
    return classes ?? [];
}

export function scaleElement(element: { style: CSSStyleDeclaration }, scale: number): void {
    element.style.scale = scale.toString();
}

export function setupRibbon(container: HTMLElement, closable: boolean = false) {
    const contents = container.querySelector(".ribbon-contents");
    const inputs: NodeListOf<HTMLInputElement> = container.querySelectorAll(".ribbon-buttons input[type=checkbox]");
    container.dataset.closable = closable.toString();

    let openId = container.dataset.openId;
    if (!openId) {
        for (const input of inputs) {
            if (input.checked) {
                openId = input.dataset.contentId;
                break;
            }
        }
    }

    hide(contents.querySelectorAll(".ribbon-content"));
    if (!openId && !closable) {
        openId = inputs[0].dataset.contentId;
        inputs[0].checked = true;
    }

    if (openId) {
        show([document.getElementById(openId), contents]);
    } else if (closable) {
        container.classList.add("contents-hidden");
    }

    container.querySelector('.ribbon-buttons').addEventListener("change", ribbonButtonsChangeListener);
}

function ribbonButtonsChangeListener(event: Event) {
    transition(() => {
        const input = event.target;
        const container = input.closest(".ribbon");
        const contents = container.querySelector('.ribbon-contents');

        if (input.checked) {
            const previousOpenId = container.dataset.openId;
            if (!container.classList.contains("contents-hidden") && previousOpenId) {
                hide(document.getElementById(previousOpenId));
                container.querySelector(`.ribbon-buttons input[data-content-id="${previousOpenId}"]`).checked = false;
            }

            container.dataset.openId = input.dataset.contentId;
            show([document.getElementById(input.dataset.contentId), contents]);
            container.classList.remove("contents-hidden");
        } else if (container.dataset.closable === "true") {
            container.classList.add("contents-hidden")
            hide(contents);
            container.dataset.openId = "";
        } else {
            input.checked = true;
        }
    });
}

const dialogFactory = DOMFactory(
    `<dialog closedby="any">
    <div class="heading-with-buttons">
        <h1></h1>
        <button type="button" class="icon-button dialog-close-button" aria-label="Close"><i class="fa fa-xmark"></i></button>
    </div>
    <div class="dialog-content"></div>
</dialog>`,
    {
        dialog: ["dialog"],
        h1: ["h1"],
        closeButton: ["button"],
        content: ["div", ".dialog-content"]
    }
);
let dialogCount = 0;

export function createDialog(heading: string, content: Node | string, openButton: HTMLElement): HTMLDialogElement {
    const id = "dialog" + dialogCount;
    const headingId = id + "heading";

    const els = dialogFactory();
    els.dialog.setAttribute("aria-labelledby", headingId);
    els.h1.id = headingId;
    els.h1.textContent = heading;
    els.content.append(content);

    setupDialog(els.dialog, {
        close: els.closeButton,
        open: openButton
    });

    dialogCount++;

    return els.dialog;
}

export function faIcon(key: string): HTMLElement {
    const i = document.createElement("i");
    i.classList.add("fa", "fa-" + key);
    return i;
}


/**
 * @param {HTMLDialogElement} dialog
 * @param {{open?: HTMLElement, close?: HTMLElement}} [buttons]
 */
export function setupDialog(dialog: HTMLDialogElement, buttons: { open?: HTMLElement; close?: HTMLElement; } = {}) {
    dialog.addEventListener("cancel", (event) => {
        event.preventDefault();
        hideDialog(dialog);
    });
    buttons.open?.addEventListener("click", () => showDialog(dialog));
    buttons.close?.addEventListener("click", () => hideDialog(dialog));
}

/**
 * @param {HTMLDialogElement} dialog
 */
function showDialog(dialog: HTMLDialogElement) {
    transition(() => {
        dialog.showModal();
        document.documentElement.style.overflowY = "hidden";
    }, ["dialog", "ease-in"]);
}

/**
 * @param {HTMLDialogElement} dialog
 */
function hideDialog(dialog: HTMLDialogElement) {
    transition(() => {
        dialog.close();
        document.documentElement.style.removeProperty("overflow-y");
    }, ["dialog", "ease-out"]);
}


export function setSearchParams(params: Record<string, string | number | boolean>) {
    const url = new URL(location.href);
    let hasChanged = false;

    for (const [key, value] of Object.entries(params)) {
        const encodedValue = encodeURIComponent(value);

        if (url.searchParams.get(key) !== encodedValue) {
            url.searchParams.set(key, encodedValue);
            hasChanged = true;
        }
    }

    if (hasChanged) history.pushState({}, "", url);
}

export function unsetSearchParam(...keys: string[]) {
    const url = new URL(location.href);
    let hasChanged = false;

    for (const key of keys) {
        if (url.searchParams.has(key)) {
            url.searchParams.delete(key);
            hasChanged = true;
        }
    }

    if (hasChanged) {
        history.pushState({}, "", url);
    }
}

export function hasSearchParam(key: string) {
    return new URL(location.href).searchParams.has(key);
}

export function getSearchParam(key: string): string | null {
    return new URL(location.href).searchParams.get(key);
}

function wrapInPromise<T>(func: () => T): () => Promise<T> {
    return () => new Promise<T>(
        (resolve, reject) => {
            try {
                resolve(func());
            } catch (e) {
                reject(e);
            }
        },
    );
}

declare global {
    interface Window { isMobile?: boolean; useViewTransitions?: boolean}
}
window.useViewTransitions = true;
export function transition(update: () => void, types: string[] = []) {
    update = wrapInPromise(update);

    if (window.useViewTransitions && document.startViewTransition) {
        document.startViewTransition({update: update, types: types});
    } else {
        requestAnimationFrame(update);
    }
}

export function setARIA(element: HTMLElement, attribute: string, value: string | boolean) {
    element.setAttribute("aria-" + attribute, typeof value === "boolean" ? value.toString() : value);
}

export function getARIA(element: HTMLElement, attribute: string): string | null {
    return element.getAttribute("aria-" + attribute);
}

/**
 * Using RegEx from http://detectmobilebrowsers.com/
 */
function isMobileBrowser(): boolean {
    let check = false;
    (function(a){if(/(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series[46]0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i.test(a)||/1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br[ev]w|bumb|bw-[nu]|c55\/|capi|ccwa|cdm-|cell|chtm|cldc|cmd-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc-s|devi|dica|dmob|do[cp]o|ds(12|-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly[-_]|g1 u|g560|gene|gf-5|g-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd-[mpt]|hei-|hi(pt|ta)|hp( i|ip)|hs-c|ht(c[- _agpst]|tp)|hu(aw|tc)|i-(20|go|ma)|i230|iac[- \/]|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja[tv]a|jbro|jemu|jigs|kddi|keji|kgt[ \/]|klon|kpt |kwc-|kyo[ck]|le(no|xi)|lg( g|\/[klu]|50|54|-[a-w])|libw|lynx|m1-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t[- ov]|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30[02]|n50[025]|n7(0[01]|10)|ne([cm]-|on|tf|wf|wg|wt)|nok[6i]|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan[adt]|pdxg|pg(13|-([1-8]|c))|phil|pire|pl(ay|uc)|pn-2|po(ck|rt|se)|prox|psio|pt-g|qa-a|qc(07|12|21|32|60|-[2-7]|i-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h-|oo|p-)|sdk\/|se(c[-01]|47|mc|nd|ri)|sgh-|shar|sie[-m]|sk-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h-|v-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl-|tdg-|tel[im]|tim-|t-mo|to(pl|sh)|ts(70|m-|m3|m5)|tx-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c[- ]|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas-|your|zeto|zte-/i.test(a.substring(0,4))) check = true;})(navigator.userAgent);
    return check;
}

window.isMobile = isMobileBrowser();

let pixelRatioMediaQuery: MediaQueryList;
function updatePixelRatio() {
    if (pixelRatioMediaQuery) pixelRatioMediaQuery.removeEventListener("change", updatePixelRatio);
    pixelRatioMediaQuery = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    pixelRatioMediaQuery.addEventListener("change", updatePixelRatio);

    document.documentElement.style.setProperty("--device-pixel-ratio", window.devicePixelRatio.toString());
}

export function trackDevicePixelRatio() {
    updatePixelRatio();
}
