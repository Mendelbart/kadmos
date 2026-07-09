/**
 * @typedef {HTMLElement | NodeListOf<HTMLElement> | HTMLElement[] | HTMLCollection} HTMLElements
 */

import * as ObjectHelper from './object';

let IdPrefixCounter = 0;

/** @type {Record<string. HTMLTemplateElement>} */
const TEMPLATES = {};

/**
 * @param {Record<string,string>} htmlTemplates
 */
export function registerTemplates(htmlTemplates) {
    for (const [key, html] of Object.entries(htmlTemplates)) {
        registerTemplate(key, html);
    }
}

/**
 * Register a template, which can be retrieved as a Node using `getTemplate(key)`.
 * @param {string} key
 * @param {string|Node} html
 */
export function registerTemplate(key, html) {
    if (key in TEMPLATES) {
        console.warn(`Overwriting existing template key ${key}.`);
    }

    const template = document.createElement("TEMPLATE");
    if (typeof html === "string") {
        template.insertAdjacentHTML("beforeend",  html);
    } else {
        template.append(html);
    }

    TEMPLATES[key] = template;
}


/**
 * @param {string} key
 * @returns {HTMLElement}
 */
export function getTemplate(key) {
    if (!(key in TEMPLATES)) {
        console.error("Unknown template key " + key);
    }
    return TEMPLATES[key].firstChild.cloneNode(true);
}

registerTemplates({
    buttonLabel: `<label class="button"></label>`,
    buttonInput: `<input class="button-check form-input" autocomplete="off">`
});

/**
 * @param {string} type
 * @param {string} value
 * @param {string | Node} [labelContent]
 * @param {string} [id]
 * @returns {[HTMLInputElement, HTMLLabelElement]} [inputNode, labelNode]
 */
export function button(type, value, labelContent, id) {
    const input = getTemplate("buttonInput");
    const label = getTemplate("buttonLabel");
    id ??= uniqueIdPrefix("button") + value;

    setAttrs(input, {
        type: type,
        value: value,
        id: id
    });
    label.htmlFor = id;
    label.tabIndex = 0;

    if (labelContent) {
        if (typeof labelContent === "string") {
            label.textContent = labelContent;
        } else {
            label.append(labelContent);
        }
    }

    return [input, label];
}

/**
 * @param {string | Node} element - Element or ID to label.
 * @param {string} content
 * @param {string} [defaultId]
 */
export function label(element, content, defaultId) {
    const label = document.createElement("LABEL");
    if (element instanceof Node) {
        element = setDefaultId(element, defaultId);
    }
    label.setAttribute("for", element);
    label.textContent = content;
    return label;
}

/**
 * @param {string} html
 * @returns {HTMLCollection}
 */
export function htmlToElements(html) {
    const template = document.createElement("TEMPLATE");
    template.innerHTML = html;
    return template.content.children;
}

/**
 * @param {string} html
 */
export function htmlToElement(html) {
    const elements = htmlToElements(html);
    if (elements.length !== 1) {
        throw new Error("HTML doesn't contain exactly one element.");
    }
    return elements[0];
}

/**
 * @param {string} str of the format tag#id.class1.class2 etc
 * @param {string | Node} children
 * @returns {HTMLElement}
 */
export function createElement(str, ...children) {
    const [tagId, ...classes] = str.split(".");
    const [tag, id] = tagId.split("#");
    const element = document.createElement(tag);

    if (id) element.id = id;
    element.classList.add(...classes);

    for (const child of children) {
        element.append(child);
    }

    return element;
}

/**
 *
 * @param {HTMLSelectElement} select
 * @param {Record<string,string>} data
 * @param {string} [selected] default: first key of `data`
 * @param {string[]} [disabled]
 * @param {{label, keys}[]} [groups]
 */
export function setOptions(select, data, {
    selected,
    disabled = [],
    groups = []
} = {}) {
    selected ??= Object.keys(data)[0];

    const grouped = ObjectHelper.map(data, () => false);
    let before;

    for (const {label, keys} of groups) {
        /** @type {HTMLOptGroupElement} **/
        const optgroup = document.createElement("OPTGROUP");
        optgroup.label = label;
        for (const key of keys) {
            if (!(key in data)) {
                console.warn(`Unknown grouped key ${key} in group ${label}.`);
                continue;
            }
            optgroup.append(createOption(key, data[key], selected, disabled));
            grouped[key] = true;
        }

        select.add(optgroup);
        if (!before) before = optgroup;
    }

    for (const [key, value] of Object.entries(data)) {
        if (!grouped[key]) {
            select.add(createOption(key, value, selected, disabled), before);
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
function createOption(key, value, selected, disabled) {
    const option = document.createElement("OPTION");
    option.value = key;
    option.textContent = value;
    if (selected === key) option.selected = "selected";
    if (disabled.includes(key)) option.disabled = "disabled";
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

/**
 * Set the `attrs` on the `object`.
 * @param {Element} element
 * @param {Record<string,string | boolean>} attrs
 */
export function setAttrs(element, attrs) {
    for (const [key, value] of Object.entries(attrs)) {
        setAttr(element, key, value);
    }
}

/**
 * @param {Element} element
 * @param {string} key
 * @param {string | boolean} value
 */
export function setAttr(element, key, value) {
    if (booleanAttributes.has(key)) {
        if (value) {
            element.setAttribute(key, key);
        } else {
            element.removeAttribute(key);
        }
    } else if (key === "class") {
        addClass(element, value);
    } else {
        element.setAttribute(key, value);
    }
}

/**
 * @param {string} prefix
 * @param {string} [connector] - default "_"
 * @returns {string}
 */
export function uniqueIdPrefix(prefix, connector = "_") {
    IdPrefixCounter += 1;
    return prefix + IdPrefixCounter + connector;
}

/**
 * If the node doesn't have an ID, set it to defaultId.
 * Return its ID.
 * @param {Element} element
 * @param {string} defaultId
 * @returns
 */
export function setDefaultId(element, defaultId) {
    if (element.hasAttribute("id")) {
        element.id = defaultId;
        return defaultId;
    } else {
        return element.id;
    }
}

/**
 * @param {HTMLElements} elements
 * @param {function(HTMLElement): void} callback
 */
export function forEachElement(elements, callback) {
    if (!elements) {
        return;
    }
    if (elements instanceof Node) {
        callback(elements);
    } else {
        for (const element of elements) {
            callback(element);
        }
    }
}

/**
 * Toggle classes depending on the given `bool`: Add `trueClasses` and `falseClasses`
 * if `bool` is truthy, and vice versa.
 * @param {boolean} bool
 * @param {HTMLElements} elements
 * @param {string | string[]} trueClasses
 * @param {string | string[]} [falseClasses]
 */
export function classIfElse(bool, elements, trueClasses, falseClasses) {
    if (!bool) [trueClasses, falseClasses] = [falseClasses, trueClasses];

    trueClasses = classesToList(trueClasses);
    falseClasses = classesToList(falseClasses);

    forEachElement(elements, (elem) => {
        elem.classList.remove(...falseClasses);
        elem.classList.add(...trueClasses);
    });
}

/**
 * @param {HTMLElements} elements
 * @param {string | string[]} classes
 */
export function addClass(elements, classes) {
    classIfElse(true, elements, classes);
}

/**
 * @param {HTMLElements} elements
 * @param {string | string[]} classes
 */
export function removeClass(elements, classes) {
    classIfElse(false, elements, classes);
}

/**
 * @param {HTMLElements} elements
 * @param {"display"|"visibility"|"opacity"} [property] default "display"
 */
export function show(elements, property = "display") {
    forEachElement(elements, elem => {
        elem.style.removeProperty(property);
    });
}


const hideValues = {
    display: "none",
    visibility: "hidden",
    opacity: "0"
}
/**
 * @param {HTMLElements} elements
 * @param {"display"|"visibility"|"opacity"} [property] default "display"
 */
export function hide(elements, property = "display") {
    forEachElement(elements, elem => {
        elem.style.setProperty(property, hideValues[property]);
    });
}

/**
 * @param {boolean} showFirst
 * @param {HTMLElements} first
 * @param {HTMLElements} [second]
 * @param {"display"|"visibility"|"opacity"} [property] default "display"
 */
export function toggleShown(showFirst, first, second, property = "display") {
    if (showFirst) {
        if (second) {
            hide(second, property);
        }
        show(first, property);
    } else {
        hide(first, property);
        if (second) {
            show(second, property);
        }
    }
}

/**
 * @param {string | string[]} classes
 * @returns {string[]}
 */
export function classesToList(classes) {
    classes ??= [];
    if (typeof classes === "string")
        return classes.split(" ");
    return Array.from(classes);
}


/**
 * @param {HTMLElement} element
 * @param {number} scale
 */
export function scaleElement(element, scale) {
    element.style.scale = scale === 1 ? "" : scale;
}


/**
 * @param {HTMLElement} container
 */
export function setupPages(container) {
    showPage(container.querySelector('.page-content'), container);

    container.querySelector('.pages-next-button').addEventListener('click', () => transition(() =>
        showPage(document.getElementById(container.dataset.openPage).nextElementSibling, container)
    ));
    container.querySelector('.pages-back-button').addEventListener('click', () => transition(() =>
        showPage(document.getElementById(container.dataset.openPage).previousElementSibling, container)
    ));
}

/**
 * @param {HTMLElement} page
 * @param {HTMLElement?} [container]
 */
export function showPage(page, container = null) {
    container ??= page.closest(".pages-container");
    hide(container.querySelectorAll('.page-content'));
    hide(container.querySelectorAll('.page-heading'));
    show(page);
    show(container.querySelector(`.page-heading[data-for="${page.id}"]`));

    container.dataset.openPage = page.id;

    toggleShown(!!page.previousElementSibling, container.querySelector('.pages-back-button'));
    toggleShown(
        !!page.nextElementSibling,
        container.querySelector('.pages-next-button'),
        container.querySelector('.pages-finish-button')
    );

    if (!page.nextElementSibling) {
        container.querySelector('.pages-finish-button').focus();
    }
}


/**
 * @param {HTMLElement} container
 * @param {boolean} [closable]
 */
export function setupRibbon(container, closable = false) {
    const contents = container.querySelector(".ribbon-contents");
    const inputs = container.querySelectorAll(".ribbon-buttons input[type=checkbox]");
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

/**
 * @param {Event} event
 */
function ribbonButtonsChangeListener(event) {
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


registerTemplate("dialog",
`<dialog closedby="any">
    <div class="heading-with-buttons">
        <h1></h1>
        <button type="button" class="icon-button dialog-close-button" aria-label="Close"><i class="fa fa-xmark"></i></button>
    </div>
    <div class="dialog-content"></div>
</dialog>`)
let dialogCount = 0;

/**
 * @param {string} heading
 * @param {Node | string} content
 * @param {HTMLElement} [openButton]
 * @returns {HTMLDialogElement}
 */
export function createDialog(heading, content, openButton) {
    const dialog = getTemplate("dialog");
    const h1 = dialog.querySelector("h1");
    h1.textContent = heading;
    dialog.querySelector(".dialog-content").append(content);
    setupDialog(dialog, {
        close: dialog.querySelector(".dialog-close-button"),
        open: openButton
    });

    dialogCount++;
    const id = "dialog" + dialogCount;
    const headingId = id + "heading";
    h1.id = headingId;
    dialog.setAttribute("aria-labelledby", headingId);

    return dialog;
}

/**
 * @param {HTMLDialogElement} dialog
 * @param {{open?: HTMLElement, close?: HTMLElement}} [buttons]
 */
export function setupDialog(dialog, buttons = {}) {
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
function showDialog(dialog) {
    transition(() => {
        dialog.showModal();
        document.documentElement.style.overflowY = "hidden";
    }, ["dialog", "ease-in"]);
}

/**
 * @param {HTMLDialogElement} dialog
 */
function hideDialog(dialog) {
    transition(() => {
        dialog.close();
        document.documentElement.style.removeProperty("overflow-y");
    }, ["dialog", "ease-out"]);
}


/**
 * @param {Record<string, string|number|boolean>} params
 */
export function setSearchParams(params) {
    const url = new URL(location);
    let hasChanged = false;

    for (const [key, value] of Object.entries(params)) {
        const encodedValue = encodeURIComponent(value);

        if (url.searchParams.get(key) !== encodedValue) {
            url.searchParams.set(key, encodedValue);
            hasChanged = true;
        }
    }

    if (hasChanged) {
        history.pushState({}, "", url);
    }
}

export function unsetSearchParam(...keys) {
    const url = new URL(location);
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

export function hasSearchParam(key) {
    return new URL(location).searchParams.has(key);
}


export function getSearchParam(key) {
    return new URL(location).searchParams.get(key);
}


/**
 * @param func
 * @returns {function(): Promise}
 */
function wrapInPromise(func) {
    return () => new Promise((resolve) => resolve(func())).catch(console.error);
}

window.useViewTransitions = true;
/**
 * @param {Function} update
 * @param {string[]} [types=[]]
 */
export function transition(update, types = []) {
    update = wrapInPromise(update);

    if (window.useViewTransitions && document.startViewTransition) {
        document.startViewTransition({update: update, types: types});
    } else {
        requestAnimationFrame(update);
    }
}

/**
 * @param {HTMLElement} element
 * @param {string} attribute
 * @param value
 * @private
 */
export function setARIA(element, attribute, value) {
    element.setAttribute("aria-" + attribute, value);
}

/**
 * @param {HTMLElement} element
 * @param {string} attribute
 * @returns {?string}
 */
export function getARIA(element, attribute) {
    return element.getAttribute("aria-" + attribute);
}

/**
 * Using RegEx from http://detectmobilebrowsers.com/
 * @returns {boolean}
 */
function isMobileBrowser() {
    let check = false;
    (function(a){if(/(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series[46]0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i.test(a)||/1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br[ev]w|bumb|bw-[nu]|c55\/|capi|ccwa|cdm-|cell|chtm|cldc|cmd-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc-s|devi|dica|dmob|do[cp]o|ds(12|-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly[-_]|g1 u|g560|gene|gf-5|g-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd-[mpt]|hei-|hi(pt|ta)|hp( i|ip)|hs-c|ht(c[- _agpst]|tp)|hu(aw|tc)|i-(20|go|ma)|i230|iac[- \/]|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja[tv]a|jbro|jemu|jigs|kddi|keji|kgt[ \/]|klon|kpt |kwc-|kyo[ck]|le(no|xi)|lg( g|\/[klu]|50|54|-[a-w])|libw|lynx|m1-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t[- ov]|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30[02]|n50[025]|n7(0[01]|10)|ne([cm]-|on|tf|wf|wg|wt)|nok[6i]|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan[adt]|pdxg|pg(13|-([1-8]|c))|phil|pire|pl(ay|uc)|pn-2|po(ck|rt|se)|prox|psio|pt-g|qa-a|qc(07|12|21|32|60|-[2-7]|i-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h-|oo|p-)|sdk\/|se(c[-01]|47|mc|nd|ri)|sgh-|shar|sie[-m]|sk-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h-|v-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl-|tdg-|tel[im]|tim-|t-mo|to(pl|sh)|ts(70|m-|m3|m5)|tx-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c[- ]|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas-|your|zeto|zte-/i.test(a.substring(0,4))) check = true;})(navigator.userAgent||navigator.vendor||window.opera);
    return check;
}
window.isMobile = isMobileBrowser();


let pixelRatioMediaQuery;
function updatePixelRatio() {
    if (pixelRatioMediaQuery) pixelRatioMediaQuery.removeEventListener("change", updatePixelRatio);
    pixelRatioMediaQuery = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    pixelRatioMediaQuery.addEventListener("change", updatePixelRatio);

    document.documentElement.style.setProperty("--device-pixel-ratio", window.devicePixelRatio);
}

export function trackDevicePixelRatio() {
    updatePixelRatio();
}