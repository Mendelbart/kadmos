import {range, filterIndices} from "./array";

export function completeIndexSubsets(subsets: (number[] | null)[], n: number): number[][] {
    const covered = new Array(n).fill(false);
    let emptyIndex: number | null = null;
    const result: number[][] = new Array(subsets.length);

    for (const [index, subset] of subsets.entries()) {
        if (subset) {
            for (const i of subset) {
                if (covered[i]) console.warn(`Index ${i} covered multiple times.`)
                covered[i] = true;
            }
            result[index] = subset;
        } else {
            if (emptyIndex != null) {
                console.warn("Multiple empty subsets.");
            } else {
                emptyIndex = index;
            }
        }
    }

    const uncovered = filterIndices(covered, x => !x);
    if (emptyIndex != null) {
        result[emptyIndex] = uncovered;
    } else if (uncovered.length > 0) {
        console.warn("Subsets have uncovered indices.");
        console.log("Uncovered:", uncovered);
    }

    return result;
}

export function coveredBySubset(length: number, subset: number[]): boolean[] {
    const covered = new Array<boolean>(length).fill(false);
    for (const index of subset) {
        covered[index] = true;
    }
    return covered;
}

export function verifyIndexSubsets(subsets: number[][], n: number): boolean {
    const covered = new Array(n).fill(false);

    for (const subset of subsets) {
        for (const i of subset) {
            if (covered[i]) return false;
            covered[i] = true;
        }
    }

    return covered.every(x => x);
}

export function containsDuplicates(a: any[]): boolean {
    return new Set(a).size !== a.length;
}

export function parseRanges(str: string, parseIndex: (value: string) => number): number[] {
    return str.split(",").flatMap(range => parseRange(range.trim(), parseIndex));
}

/**
 * Julia-like range syntax: `start:stop` or `start:step:stop` (inclusive).
 * Optionally specify a function `parseIndex(string) => number` to parse the `start` and `stop`. Default is `parseInt`,
 * which is always used for `step`.
 *
 * @example
 * parseRange("2")
 * // -> [2]
 * parseRange("1:5")
 * // -> [1, 2, 3, 4, 5]
 * parseRange("6:2:-2")
 * // -> [6, 4, 2]
 * parseRange("a:z", c => c.charCodeAt(0))
 * // -> [97, 98, ..., 121, 122]
 */
export function parseRange(str: string, parseIndex: (value: string) => number = parseInt): number[] {
    const numStrs = str.split(":");
    const nArgs = numStrs.length;
    if (nArgs === 0 || nArgs > 3) throw new Error("Invalid range, 2-3 numbers.");

    const vals = numStrs.map((x, i) => {
        const index = nArgs === 3 && i === 1 ? parseInt(x) : parseIndex(x);
        if (!Number.isInteger(index)) {
            throw new Error(`Parsed non-integer index ${index}.`);
        }
        return index;
    });

    if (nArgs === 1) return vals;

    return range(
        vals[0],
        vals[nArgs - 1] + 1,
        nArgs === 3 ? vals[1] : 1
    );
}

/**
 * @example
 * const [s, j] = invertSubsets(subsets)[i]
 * // => subsets[s][j] == i
 */
export function invertSubsets(subsets: number[][], n: number): [number, number][] {
    const ind = new Array(n);
    for (const [s, subset] of subsets.entries()) {
        for (const [j, i] of subset.entries()) {
            ind[i] = [s, j];
        }
    }

    return ind;
}


/**
 * @param {string} ranges
 * @param {function(string): number} [parseIndex]
 */
export function parseMatrixRanges(ranges: string, parseIndex: (value: string) => number): [number,number][] {
    if (!ranges) return [];

    return ranges.split(";").flatMap(range => parseMatrixRange(range.trim(), parseIndex));
}

/**
 * Format: ({ROWS-RANGE}|{COLUMNS-RANGE})
 */
function parseMatrixRange(range: string, parseIndex: (value: string) => number): [number, number][] {
    if (range.charAt(0) !== '(' || range.charAt(range.length - 1) !== ')') {
        throw new Error(`Invalid matrix range syntax: Need enclosing parentheses.`);
    }

    const ranges = range.substring(1, range.length - 1).split('|');
    if (ranges.length !== 2) throw new Error("Invalid matrix range syntax: Need (ROWS|COLUMNS)");

    return matrixIndices(parseRanges(ranges[0], parseIndex), parseRanges(ranges[1], parseIndex));
}

export function matrixIndices(rows: number[], columns: number[]): [number, number][] {
    const keys: [number, number][] = [];
    for (const row of rows) {
        for (const col of columns) {
            keys.push([row, col]);
        }
    }

    return keys;
}
