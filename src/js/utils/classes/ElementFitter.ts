import Observable from "./Observable";
import {scaleElement, StylableElement} from "../dom";


export class SizeWatcher<T extends Element> extends Observable<[T[]]> {
    sizes: WeakMap<T, ResizeObserverSize>;
    resizeObserver: ResizeObserver;

    constructor() {
        super();
        this.sizes = new WeakMap();

        this.updateSize = this.updateSize.bind(this);

        this.resizeObserver = new ResizeObserver(entries => {
            entries.forEach(entry => this.updateSize(entry));
            this.observers.call(entries.map(entry => entry.target) as T[]);
        });
    }

    watch(element: T): void {
        this.resizeObserver.observe(element);
    }

    unwatch(element: T): void {
        this.resizeObserver.unobserve(element);
        if (this.sizes.has(element)) {
            this.sizes.delete(element);
        }
    }

    updateSize(entry: ResizeObserverEntry) {
        this.sizes.set(entry.target as T, entry.contentBoxSize[0]);
    }

    getSize(element: T): ResizeObserverSize | undefined {
        return this.sizes.get(element);
    }

    teardown(): void {
        this.resizeObserver.disconnect();
        super.teardown();
    }
}

const sizeWatcher = new SizeWatcher<StylableElement>();

type SizeDimension = "width" | "height" | "both";
interface ElementFitterConfig {
    uniformFactor?: number,
    dimension?: SizeDimension
}

export default class ElementFitter {
    watcher: SizeWatcher<StylableElement>;
    dimension: SizeDimension;
    uniformFactor: number;
    scales: Map<StylableElement, number>;
    minScale: number;
    maxScale: number;
    private childrenFromParent: WeakMap<StylableElement, Set<StylableElement>>;

    constructor(config: ElementFitterConfig = {}) {
        this.watcher = sizeWatcher;
        this.updateParents = this.updateParents.bind(this);
        this.watcher.observers.push(this.updateParents);

        this.dimension = config.dimension ?? "width";
        this.uniformFactor = config.uniformFactor ?? Infinity;

        this.scales = new Map();
        this.minScale = Infinity;
        this.maxScale = -Infinity;

        this.childrenFromParent = new WeakMap();
    }

    fit(...children: StylableElement[]) {
        for (const child of children) {
            this._add(child);
        }
        this.updateChildren(children);
    }

    private _add(child: StylableElement) {
        const parent = child.parentElement;
        if (!parent) throw new Error("Cannot fit child without parent.");
        const set = this.childrenFromParent.get(parent);
        if (set) {
            set.add(child);
        } else {
            this.childrenFromParent.set(parent, new Set([child]));
        }

        this.watcher.watch(parent);
    }

    private _unfit(child: StylableElement) {
        const parent = child.parentElement;
        if (!parent) return;
        this.childrenFromParent.get(child.parentElement)?.delete(child);
        this.scales.delete(child);
    }

    unfit(...children: StylableElement[]): void {
        for (const child of children) {
            this._unfit(child);
        }
    }

    clearParent(parent: StylableElement, unwatch: boolean = true) {
        const children = this.childrenFromParent.get(parent);
        if (children) {
            this.unfit(...children);
            this.childrenFromParent.delete(parent);
        }
        if (unwatch) this.watcher.unwatch(parent);
    }

    updateParents(parents: StylableElement[]) {
        this.updateChildren(parents.flatMap(parent => {
            if (!(parent instanceof HTMLElement)) return [];
            const children = this.childrenFromParent.get(parent);
            return children ? [...children] : [];
        }));
    }

    updateMinMaxScale() {
        const values = [...this.scales.values()];
        this.minScale = Math.min(...values);
        this.maxScale = Math.max(...values);
    }

    updateChildren(children?: StylableElement[]): void {
        const prevMin = this.minScale;
        const prevMax = this.maxScale;

        if (children) {
            for (const child of children) {
                this._updateScale(child);
            }
        } else {
            this.scales.forEach((_, child) => {
                this._updateScale(child);
            });
        }

        this.updateMinMaxScale();

        if (!children || (
            (this.minScale !== prevMin || this.maxScale !== prevMax)
            && (this.uniformityActive() || this.uniformityActive(prevMin, prevMax))
        )) {
            this._applyAllScales();
        } else {
            this._applyScales(children);
        }
    }

    uniformityActive(min = this.minScale, max = this.maxScale): boolean {
        return max / min > this.uniformFactor;
    }

    private _updateScale(child: StylableElement) {
        const parent = child.parentElement;
        if (!parent) return;
        const parentSize = this.watcher.getSize(parent);
        if (!parentSize) return;

        const scale = computeScale(child, parentSize, this.dimension);
        if (scale == null) return;

        this.scales.set(child, scale);
    }

    private _applyScale(child: StylableElement, scale?: number) {
        scale ??= this.scales.get(child);
        if (scale == null) return;
        scaleElement(child, Math.min(scale, this.minScale * this.uniformFactor));
    }

    private _applyScales(children: StylableElement[]) {
        for (const child of children) {
            this._applyScale(child);
        }
    }

    private _applyAllScales() {
        for (const [child, scale] of this.scales) {
            this._applyScale(child, scale);
        }
    }

    teardown(): void {
        this.scales.clear();
        this.watcher.observers.remove(this.updateParents);
    }
}

function computeScale(child: StylableElement, parentSize: ResizeObserverSize, dimension: SizeDimension): number | null {
    let scale = 1;

    const boundingRect = child.getBoundingClientRect();
    const childScale = parseScale(getComputedStyle(child).scale) ?? 1;

    if (dimension === "both" || dimension === "width") {
        const widthScale = getScale(boundingRect.width / childScale, parentSize.inlineSize);
        if (widthScale == null) return null;
        scale = Math.min(scale, widthScale);
    }

    if (dimension === "both" || dimension === "height") {
        const heightScale = getScale(boundingRect.height / childScale, parentSize.blockSize);
        if (heightScale == null) return null;
        scale = Math.min(scale, heightScale);
    }

    return scale;
}

function parseScale(value: string) {
    value = value.trim();
    if (value === "none") return null;
    const num = value.charAt(value.length - 1) === "%"
        ? parseFloat(value.substring(0, value.length - 1)) / 100
        : parseFloat(value);
    return isNaN(num) ? null : num;
}

function getScale(elementSize: number, containerSize: number, grow: boolean = false): number | null {
    if (elementSize === 0 || containerSize === 0 || isNaN(elementSize) || isNaN(containerSize)) return null;

    const scale = containerSize / elementSize;

    return grow ? scale : Math.min(scale, 1);
}
