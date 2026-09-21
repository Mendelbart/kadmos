import {arraysEqual} from "./array";

export type Values<T> = T[keyof T][]
export type Keys<T> = (keyof T)[]
export type Entry<T> = {[K in keyof T]: [K, T[K]]}[keyof T]
export type Entries<T> = Entry<T>[];

export function map<T extends object, V>(obj: T, callback: (value: T[keyof T], key: keyof T) => V): { [K in keyof T]: V } {
    return Object.fromEntries(
        (Object.entries(obj) as Entries<T>).map(
            ([k, v]) => [k, callback(v, k)]
        )
    ) as Record<keyof T, V>;
}

export function filter<T extends object>(obj: T, fn: (value: T[keyof T], key: keyof T) => boolean): T {
    return Object.fromEntries(
        (Object.entries(obj) as Entries<T>).filter(
            ([k, v]) => fn(v, k)
        )
    ) as T;
}

export function filterKeys<T extends object>(obj: T, fn: (value: T[keyof T], key: keyof T) => boolean): (keyof T)[] {
    return (Object.entries(obj) as  Entries<T>).filter(
        ([k, v]) => fn(v, k)
    ).map(([k, _]) => k);
}

export function withoutKeys<T extends object>(obj: T, ...keys: (keyof T)[]): Partial<T> {
    const result: Partial<T> = Object.assign({}, obj);
    for (const key of keys) {
        delete result[key];
    }
    return result;
}

export type OnlyKeys<T extends object, K> = {[P in keyof T]: P extends K ? T[P] : never};

export function onlyKeys<T extends object, K extends keyof T>(obj: T, keys: Iterable<K>, warnOtherKeys = false): Partial<OnlyKeys<T, K>> {
    const keySet = new Set<keyof T>(keys);
    const result: Partial<OnlyKeys<T, K>> = {};
    for (const [key, value] of Object.entries(obj) as Entries<T>) {
        if (keySet.has(key)) {
            result[key as K] = value as K extends K ? T[K] : never;
        } else if (warnOtherKeys) {
            console.warn(`Filtered out key "${String(key)}".`);
            console.trace();
        }
    }

    return result;
}

export function fromKeys<K extends string, V>(keys: K[], callback: (key: K, index: number) => V): Record<K, V> {
    return Object.fromEntries(keys.map((key, index) => [key, callback(key, index)])) as Record<K, V>;
}

/**
 * Convenience method for standardizing a subset of keys. Useful for `checked` or `disabled` inputs.
 */
export function subsetToBoolRecord<K extends string>(subset: K[] | Record<K, boolean>, keys: K[]): Record<K, boolean> {
    if (Array.isArray(subset)) {
        const result = Object.fromEntries(keys.map(key => [key, false])) as Record<K, boolean>;
        for (const key of subset) {
            result[key] = true;
        }
        return result;
    }

    if (!arraysEqual(Object.keys(subset).sort(), keys.sort())) {
        console.log(subset, keys);
        console.warn("Subset object keys don't match keys list.");
        console.log(Object.keys(subset).sort(), keys.sort());
    }
    return fromKeys(keys, key => subset[key]);
}
