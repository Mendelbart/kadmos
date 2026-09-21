import {full} from "../array";

/** Representation of a nxm utils, stored in row-major order. */
export default class Matrix<T> {
    n: number
    m: number
    private readonly data: T[]

    constructor(n: number, m: number, data: T[]) {
        if (data.length !== n * m) throw new Error("Need array of size n * m.");

        this.data = data;
        this.n = n;
        this.m = m;
    }

    getIndex(i: number, j: number): number {
        return i * this.m + j;
    }

    getColumnMajorIndex(i: number, j: number): number {
        return j * this.n + i;
    }

    getCartesian(index: number): [number, number] {
        return [Math.floor(index / this.m), index % this.m];
    }

    getFromIndex(index: number): T {
        return this.get(...this.getCartesian(index));
    }

    getCartesianColumnMajor(index: number): [number, number] {
        return [index % this.n, Math.floor(index / this.n)];
    }

    rowToColumnMajor(index: number): number {
        return this.getColumnMajorIndex(...this.getCartesian(index));
    }

    columnToRowMajor(index: number): number {
        return this.getIndex(...this.getCartesianColumnMajor(index));
    }

    get(i: number, j: number): T {
        return this.data[this.getIndex(i, j)];
    }

    set(i: number, j: number, value: T) {
        this.data[this.getIndex(i, j)] = value;
    }

    fill(value: T) {
        this.data.fill(value);
        return this;
    }

    private _assertValues(values: T[], length: number): T[] {
        if (values.length !== length) {
            throw new Error(`Row/column length ${values.length} and matrix dimension ${length} do not match.`);
        }

        return values;
    }

    spliceRow(i: number, deleteCount: number = 0, values: T[]) {
        values = this._assertValues(values, this.m);
        const spliced = this.data.splice(i * this.m, deleteCount * this.m, ...values);
        this.n += 1;
        return spliced;
    }

    spliceColumn(j: number, deleteCount: number = 0, values: T[]) {
        values = this._assertValues(values, this.n);
        const spliced: T[] = [];
        for (let i = 0; i < this.n; i++) {
            spliced.push(...this.data.splice(i * (this.m + 1) + j, deleteCount, values[i]));
        }
        this.m += 1;
        return spliced;
    }

    /**
     * @returns {Matrix}
     */
    transpose(): Matrix<T> {
        return Matrix.full(this.n, this.m, (i, j) => this.get(i, j));
    }

    toRows(): T[][] {
        return full(this.n, i => this.getRow(i));
    }

    toColumns(): T[][] {
        return full(this.m, j => this.getColumn(j));
    }

    static fromRows<T>(rows: T[][]): Matrix<T> {
        return new this(rows.length, rows[0].length, rows.flat());
    }

    toString(): string {
        return this.toRows().toString();
    }

    map<V>(callback: (value: T, i: number, j: number, matrix: Matrix<T>) => V): Matrix<V> {
        return new Matrix(this.n, this.m, this.data.map((value, index) => callback(value, ...this.getCartesian(index), this)));
    }

    values(): T[] {
        return this.data;
    }

    keys(): [number, number][] {
        return full(this.length, index => this.getCartesian(index));
    }

    keysColumnsFirst(): [number, number][] {
        return full(this.length, index => this.getCartesianColumnMajor(index));
    }

    entries(): [[number, number], T][] {
        return this.data.map((value, index) => [this.getCartesian(index), value]);
    }

    entriesColumnsFirst(): [[number, number], T][] {
        return full(this.length, index => {
            const [i, j] = this.getCartesianColumnMajor(index);
            return [[i, j], this.get(i, j)];
        });
    }

    forEach(callback: (value: T, i: number, j: number, matrix: Matrix<T>) => void) {
        this.data.forEach((value, index) => callback(value, ...this.getCartesian(index), this));
    }

    get length(): number {
        return this.n * this.m;
    }

    copy(): Matrix<T> {
        return new Matrix<T>(this.n, this.m, this.data.slice());
    }

    getRow(i: number): T[] {
        return full(this.m, j => this.get(i, j));
    }

    getColumn(j: number): T[] {
        return full(this.n, i => this.get(i, j));
    }

    setRow(i: number, callback: (j: number) => T) {
        for (let j = 0; j < this.m; j++) {
            this.set(i, j, callback(j));
        }
    }

    setColumn(j: number, callback: (i: number) => T) {
        for (let i = 0; i < this.n; i++) {
            this.set(i, j, callback(i));
        }
    }

    static full<T>(n: number, m: number, callback: (i: number, j: number) => T): Matrix<T> {
        const data = new Array<T>(n * m);
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < m; j++) {
                data[i * m + j] = callback(i, j);
            }
        }
        return new this<T>(n, m, data);
    }

    displayString(): string {
        const strLens = this.map(x => String(x).length);
        // @ts-ignore
        const commonLens = strLens.toColumns().map((col, j) => Math.max(j.toString().length, ...col));
        const paddedStrs = this.map((x, i, j) => String(x).padStart(commonLens[j]));
        const indexColWidth = (this.m - 1).toString().length;
        const firstRow = " ".repeat(indexColWidth) + " │ " + commonLens.map((len, i) => i.toString().padStart(len)).join("  ");
        const secondRow = "-".repeat(indexColWidth + 1) + "┼" + "-".repeat(firstRow.length - indexColWidth - 2);
        const matrixRows = paddedStrs.toRows().map(
            (row, i) => i.toString().padStart(indexColWidth) + " │ " + row.join("  ")
        );
        return firstRow + "\n" + secondRow + "\n" + matrixRows.join("\n");
    }
}
