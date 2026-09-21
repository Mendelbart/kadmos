type ValueNodeValue<T> = T | ValueNodeSerialized<T>;
interface ValueNodeSerialized<T> {
    [x: string]: ValueNodeValue<T>;
}

class ValueNode<T, K extends string = string> {
    default: T | ValueNode<T, K>;
    isRoot: boolean;
    children: {[K1 in K]?: ValueNode<T, K>};

    constructor(value: T | ValueNode<T, K>, isRoot: boolean = false, children: {[K1 in K]?: ValueNode<T, K>} = {}) {
        this.default = value;
        this.isRoot = isRoot;
        this.children = children;
    }

    getDefault(): T {
        return this.default instanceof ValueNode ? this.default.getDefault() : this.default;
    }

    setDefault(value: T): void {
        if (this.default instanceof ValueNode) {
            this.default.setDefault(value);
        } else {
            this.default = value;
        }
    }

    setChild(key: K, value: ValueNode<T, K>): void {
        this.children[key] = value;
    }

    getChild(key: K): ValueNode<T, K> | undefined {
        return this.children[key];
    }

    serialize<V>(defaultKey: string = "default", callback: (value: T) => V): ValueNodeValue<V> {
        const defaultObject = this.default instanceof ValueNode
            ? this.default.serialize(defaultKey, callback)
            : callback(this.default);
        if (Object.keys(this.children).length === 0) return defaultObject;

        const obj: ValueNodeSerialized<V> = {};
        obj[defaultKey] = defaultObject;
        for (const [key, node] of Object.entries(this.children)) {
            if (!node) continue;
            obj[key] = (node as ValueNode<T,K>).serialize(defaultKey, callback);
        }
        return obj;
    }
}


export type ParamRecord<K extends string> = Partial<Record<K, string | undefined>>
export default class ParametricValue<T, K extends string = string> {
    paramKeys: K[];
    root: ValueNode<number>;
    values: T[];

    constructor(paramKeys: K[], defaultValue: T) {
        this.paramKeys = paramKeys;
        this.root = new ValueNode(0, true);
        this.values = [defaultValue];
    }

    set(params: ParamRecord<K>, value: T): void {
        const node = this._getNode(params, true);

        if (node.isRoot) {
            this.values[node.getDefault()] = value;
        } else {
            node.isRoot = true;
            node.setDefault(this.values.length);
            this.values.push(value);
        }
    }

    get(params: ParamRecord<K>): T {
        return this.values[this._getNode(params).getDefault()];
    }

    private _paramLevel(params: ParamRecord<K>): number {
        for (let i = this.paramKeys.length - 1; i >= 0; i--) {
            if (params[this.paramKeys[i]] != null) return i + 1;
        }

        return 0;
    }

    private _getNode(params: ParamRecord<K>, createNodes: boolean = false): ValueNode<number> {
        let node = this.root;
        const level = this._paramLevel(params);
        let done;

        for (const [i, key] of this.paramKeys.entries()) {
            if (i >= level) return node;

            [node, done] = this._getParamNode(node, params, key, createNodes);
            if (done) return node;
        }

        return node;
    }

    private _getParamNode(node: ValueNode<number>, params: ParamRecord<K>, key: K, createNodes: boolean = false): [ValueNode<number>, boolean] {
        if (params[key] != null) {
            const paramVal = params[key];
            if (createNodes) node.setChild(paramVal, new ValueNode(node.getDefault()));

            const child = node.getChild(paramVal);
            if (child) return [child, false];
        }

        if (createNodes && !(node.default instanceof ValueNode)) {
            node.default = new ValueNode<number>(node.default);
        }

        return node.default instanceof ValueNode ? [node.default, false] : [node, true];
    }

    toObject(defaultKey: string = "default") {
        return this.root.serialize(defaultKey, i => this.values[i]);
    }
}
