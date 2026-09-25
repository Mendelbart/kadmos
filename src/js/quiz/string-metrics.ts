// https://en.wikipedia.org/wiki/Damerau%E2%80%93Levenshtein_distance#Optimal_string_alignment_distance
import {full} from "../utils/array";

export function osaDistance(a: string, b: string): number {
    const d = full(a.length + 1, () => new Array<number>(b.length + 1));

    for (let i = 0; i < a.length + 1; ++i) d[i][0] = i;
    for (let j = 0; j < b.length + 1; ++j) d[0][j] = j;

    let cost;

    for (let i = 0; i < a.length; ++i) {
        for (let j  = 0; j < b.length; ++j) {
            cost = a.charCodeAt(i) === b.charCodeAt(j) ? 0 : 1;

            d[i+1][j+1] = Math.min(d[i][j+1] + 1, d[i+1][j] + 1, d[i][j] + cost);

            if (
                i > 0 && j > 0
                && a.charCodeAt(i) === b.charCodeAt(j-1)
                && a.charCodeAt(i-1) === b.charCodeAt(j)
                && d[i+1][j+1] > d[i-1][j-1] + cost
            ) {
                d[i+1][j+1] = d[i-1][j-1] + cost;
            }
        }
    }

    return d[a.length][b.length];
}
