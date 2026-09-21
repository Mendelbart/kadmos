import {Observable} from "../utils";
import {tag} from "../utils/dom";
import {Setting} from "./ValueElement";
import {map} from "../utils/object";

export type SettingsValues = {[x: string]: any} | any[];
export type ObservableSetting<T> = Setting<T> & Observable<[T, ...any]>;
export type Settings<T> = {
    [K in keyof T]: ObservableSetting<T[K]>
}

export default class SettingCollection<T extends SettingsValues> extends Observable<[T, (keyof T)?]> {
    private readonly settings: Settings<T>;
    readonly node: HTMLDivElement;

    constructor(settings: Settings<T>) {
        super();

        this.settings = settings;
        this.node = tag("div", ".settings");
        this.node.role = "group";

        for (const [key, setting] of _entries(settings)) {
            this.node.append(setting.node);
            setting.observers.push(() => this.observers.call(this.getValues(), key));
        }
    }

    observerArgs(): [T] {
        return [this.getValues()];
    }

    get size() {
        return Object.keys(this.settings).length;
    }

    get<K extends keyof T>(key: K): ObservableSetting<T[K]> {
        return this.settings[key];
    }

    has<K extends string>(key: K): key is K & keyof T {
        return key in this.settings;
    }

    replace<K extends keyof T>(key: K, setting: ObservableSetting<T[K]>) {
        this.settings[key] = setting;
    }

    getValues(): T {
        if (Array.isArray(this.settings)) {
            return this.settings.map(setting => setting.value) as T;
        } else {
            return map(this.settings, setting => setting.value) as T;
        }
    }

    setValues(values: Partial<T>): void {
        for (const [key, value] of _entries(values)) {
            if (value == null || !this.settings[key]) continue;
            this.settings[key].value = value;
        }
    }

    getValue<K extends keyof T>(key: K): T[K] {
        return this.get(key).value;
    }

    replaceWith(sc: SettingCollection<any>): void {
        this.node.replaceWith(sc.node);
        this.teardown();
    }

    teardown(): void {
        for (const setting of Object.values(this.settings)) {
            setting.teardown();
        }
        super.teardown();
    }

    remove() {
        this.node.remove();
    }
}

function _entries<T extends SettingsValues>(values: T): [keyof T, T[keyof T]][] {
    return (Array.isArray(values) ? [...values.entries()] : Object.entries(values)) as [keyof T, T[keyof T]][];
}
