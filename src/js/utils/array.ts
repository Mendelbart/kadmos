/**
 * Returns array `sums` of cumulative sums: `sums[index] = arr[0] + ... + arr[index]`.
 */
export function cumSums(arr: number[]): number[] {
    return arr.map((sum => value => sum += value)(0));
}

/**
 * Return the smallest `index` such that `val <= arr[index]`
 */
export function bisectLeft(val: number, arr: number[]): number {
    let lo = 0;
    let hi = arr.length;
    let mid;

    while (lo < hi) {
        mid = (lo + hi) >> 1;
        if (arr[mid] < val) {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }

    return lo;
}

/**
 * Return the sum of the array values.
 */
export function sum(arr: number[]): number {
    return arr.reduce((sum, cur) => sum + cur, 0);
}

/**
 * Return the average of the array values.
 */
export function avg(arr: number[]): number {
    if (arr.length === 0) {
        console.error("Cannot compute average of empty array.");
        return 0;
    }
    return sum(arr) / arr.length;
}

export function argmin(arr: number[]): number {
    let minimum = Infinity;
    let minIndex = -1;
    for (const [i, value] of arr.entries()) {
        if (value < minimum) {
            minimum = value;
            minIndex = i;
        }
    }
    return minIndex;
}

export function argmax(arr: number[]): number {
    let maximum = -Infinity;
    let maxIndex = -1;
    for (const [i, value] of arr.entries()) {
        if (value > maximum) {
            maximum = value;
            maxIndex = i;
        }
    }
    return maxIndex;
}

export function arraysEqual(a: any[], b: any[]): boolean {
    return a.length === b.length &&
        a.every((element, index) => element === b[index]);
}

export function filterIndices<T>(arr: T[], callback: (value: T, index: number, array: T[]) => boolean): number[] {
    return Array.from(arr.entries())
            .filter(([i, v]) => callback(v, i, arr))
            .map(([i, _]) => i);
}

/**
 * Range from `start` (inclusive, default 0) to `stop` (exclusive), with an optional `step` size (default `1`).
 */
export function range(stop: number): number[];
export function range(start: number, stop: number, step?: number): number[];
export function range(start: number, stop?: number, step: number = 1): number[] {
    if (stop == null) {
        stop = start;
        start = 0;
    }

    if (step === 0) throw new Error("Range step cannot be 0.");

    const n = Math.ceil((stop - start) / step);
    if (n <= 0) return [];

    return full<number>(n, i => start + step * i);
}

/**
 * Returns all integers between `a` and `b` including `a` and `b`.
 * Equivalent to `range(Math.min(a, b), Math.max(a, b))`
 */
export function rangeBetween(a: number, b: number): number[] {
    if (a > b) {
        [a, b] = [b, a];
    }
    return range(a, b + 1);
}

export function full<T>(length: number, callback: (index: number, array: T[]) => T): T[] {
    const arr = new Array<T>(length);
    for (let i = 0; i < length; i++) {
        arr[i] = callback(i, arr);
    }
    return arr;
}

export function mapFromKeys<K,V>(keys: K[], callback: (key: K, index: number) => V): Map<K,V> {
    return new Map(keys.map((val, i) => [val, callback(val, i)]));
}

export function sumCallback<T>(arr: T[], callback: (value: T, index: number, array: T[]) => number) {
    return arr.reduce((acc, value, index, array) => acc + callback(value, index, array), 0);
}
