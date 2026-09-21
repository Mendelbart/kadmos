import {bisectLeft, cumSums} from "../array";

export default class RandomNumberGenerator {
    _rand: () => number;

    constructor(rand = Math.random) {
        this._rand = rand;
    }

    /**
     * @example
     * rand()           // random number in [0,1)
     * rand(b)          // random number in [0,b)
     * rand(a, b)       // random number in [a,b)
     */
    rand(): number
    rand(b: number): number
    rand(a?: number, b?: number): number
    rand(a?: number, b?: number): number {
        if (a == null) {
            a = 0;
            if (b == null) b = 1;
        } else if (b == null) {
            b = a;
            a = 0;
        }
        return this._rand() * (b - a) + a;
    }

    seed(seed: string): void {
        this._rand = seededPRNG(seed);
    }

    /**
     * Like `rand` but rounded down to integers.
     */
    randInt(a?: number, b?: number): number {
        return Math.floor(this.rand(a, b));
    }

    selectRandom<T>(items: T[]): T {
        return items[this.randInt(items.length)];
    }

    /**
     * Shuffles the array in-place.
     */
    shuffle<T>(array: T[]): T[] {
        for (let length = array.length; length > 0; length--) {
            const randomIndex = this.randInt(length);
            if (randomIndex !== length - 1) {
                [array[length - 1], array[randomIndex]] = [
                    array[randomIndex], array[length - 1]
                ];
            }
        }
        return array;
    }

    randIndexWeighted(weights: number[]): number {
        const sums = cumSums(weights);
        return bisectLeft(this.rand(sums[sums.length - 1]), sums);
    }
}

function seededPRNG(seed: string): () => number {
    return sfc32(...cyrb128(seed));
}

/**
 * Simple Fast Counter. A pseudo-random number generator, initialized with
 * four 32-bit integers.
 */
function sfc32(a: number, b: number, c: number, d: number): () => number {
    return function() {
        a |= 0; b |= 0; c |= 0; d |= 0;
        const t = (a + b | 0) + d | 0;
        d = d + 1 | 0;
        a = b ^ b >>> 9;
        b = c + (c << 3) | 0;
        c = (c << 21 | c >>> 11);
        c = c + t | 0;
        return (t >>> 0) / 4294967296;
    }
}

/**
 * Generate a PRNG seed from `str`.
 */
function cyrb128(str: string): [number, number, number, number] {
    let h1 = 1779033703, h2 = 3144134277,
        h3 = 1013904242, h4 = 2773480762;

    for (let i = 0; i < str.length; i++) {
        const k = str.charCodeAt(i);
        h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
        h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
        h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
        h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
    }

    h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
    h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
    h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
    h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);

    h1 ^= (h2 ^ h3 ^ h4);
    h2 ^= h1;
    h3 ^= h1;
    h4 ^= h1;

    return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}
