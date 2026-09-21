export default class Schema {
    constructor(data) {
        this.data = data;
        this.resolveReferences();
        this._touchUp();
    }

    /**
     * @param {function(any): boolean} resolves
     * @param {function(any, string[]): void} callback
     */
    recurse(resolves, callback) {
        recurse(this.data, resolves, callback, {toBeBlocked: this.circularRefs});
    }

    /**
     * @private
     */
    _touchUp() {
        this.recurse(x => x["x-format"] === "grid", x => {
            const columns = x["x-nColumns"] ?? 6;
            forEachProperty(x, p => {
                p["x-grid"] ??= {};
                p["x-grid"].columns ??= columns;
            });
        });

        this.recurse(x => x.type === "object", x =>
            forEachProperty(x, (p, key) => {
                p.title ??= keyToTitle(key);
                if (p.type && p.type !== "object" && x.required && x.required.includes(key)) p.title += "*";
            }, {keys: ["properties"]})
        );

        this.recurse(x => x.const != null, x => {
            x.default = x.const;
            x["x-hidden"] ??= true;
        });

        this.recurse(x => x.type === "boolean", x => {
            x["x-format"] ??= "checkbox";
        });

        this.recurse(x => x.enum && typeof x.enum[0] === "string", x => {
            x.type ??= "string";
        });

        this.recurse(x => x.type === "object" && x.required, x => {
            for (const key of x.required) {
                if (x.properties[key].type === "string") {
                    x.properties[key].minLength = 1;
                }
            }
        });

        this.recurse(x => x["x-required"], x => {
            x.required ??= [];
            x.required.push(...x["x-required"]);
        });

        this.recurse(x => x["x-enablePropertiesToggle"], x => {
            x["x-deactivateNonRequired"] = true;
        });

        this.recurse(x => x.oneOf, x => {
            x["x-switcherInput"] ??= "modal";
            for (const entry of x.oneOf) {
                if (entry.properties?.type?.const) {
                    entry["x-switcherTitle"] ??= keyToTitle(entry.properties.type.const);
                }
            }
        });
    }


    resolveReferences({circularDepth = 5} = {}) {
        this.recurse(x => x.$ref && x.$ref.substring(0, 8) === "#/$defs/", (x, keyPath) => {
            const defKey = x.$ref.substring(8);
            delete x.$ref;

            if (keyPath[0] === "$defs" && keyPath[1] === defKey) {
                // CIRCULAR REFERENCE
                for (let i = 0; i < circularDepth; i++) {
                    Object.assign(x, deepcopy(this.data.$defs[defKey]));
                }
                return;
            }

            const elem = this.data.$defs[defKey];
            const custom = {};
            if (x.properties && elem.properties) {
                custom.properties = Object.assign({}, x.properties, elem.properties);
            }
            Object.assign(x, this.data.$defs[defKey], custom);
            if (keyPath[0] === "$defs" && keyPath[1] === defKey) {
                x.blockRecurse = true;
            }
        });

        delete this.data.$defs;
    }

}

export function recurse(s, resolves, callback, {keyPath = [], toBeBlocked = new Set(), blocked = new Set()} = {}) {
    if (blocked.has(s)) return;
    if (resolves(s)) callback(s, keyPath);
    if (toBeBlocked.has(s)) blocked.add(s);

    if (Array.isArray(s) || isObject(s)) {
        const entries = Array.isArray(s) ? s.entries() : Object.entries(s);
        for (const [key, value] of entries) recurse(value, resolves, callback, {keyPath: keyPath.concat([key]), toBeBlocked, blocked});
    }
}


/**
 * @param {Object} x
 * @param {function(any, string): void} callback
 * @param {function(any): boolean} [filter=isObject]
 * @param {string[]} [keys]
 */
function forEachProperty(x, callback, {filter = isObject, keys = ["properties", "patternProperties"]} = {}) {
    for (const key of keys) {
        if (x[key]) Object.entries(x[key]).forEach(([key, value]) => {
            if (filter(value)) callback(value, key);
        });
    }
}

/**
 * @param {string} key
 * @returns {string}
 */
function keyToTitle(key) {
    return (key.charAt(0).toUpperCase() + key.substring(1)).replace(/([a-z])([A-Z])/, "$1 $2");
}

const isObject = (value) => typeof value === 'object'
    && value != null
    && !Array.isArray(value)
    && !(value instanceof RegExp)
    && !(value instanceof Date)
    && !(value instanceof Set)
    && !(value instanceof Map);

function deepcopy(s) {
    if (Array.isArray(s)) {
        return s.map(x => deepcopy(x));
    }
    if (isObject(s)) {
        return Object.fromEntries(Object.entries(s).map(([key, value]) => [key, deepcopy(value)]));
    }

    return s;
}
