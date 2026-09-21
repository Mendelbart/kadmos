export function encodeBase64BoolArray(boolArray: boolean[]): string {
    return base64ToString(boolArrayToBase64(boolArray)) + "~" + encodeBase64Number(boolArray.length);
}

export function decodeBase64BoolArray(str: string): boolean[] {
    const [b64str, length] = str.split('~');
    return boolArrayFromBase64(base64FromString(b64str), decodeBase64Number(length));
}

export function encodeBase64Number(n: number): string {
    return base64ToString(numberToBase64(n));
}

export function decodeBase64Number(str: string): number {
    return numberFromBase64(base64FromString(str));
}

function boolArrayToBase64(arr: boolean[]): number[] {
    const values = new Array(Math.ceil(arr.length / 6));

    let sum;
    for (let charIndex = 0; charIndex < values.length; charIndex++) {
        sum = 0;
        for (let i = 0; i < 6; i++) {
            if (arr[6 * charIndex + i]) {
                sum += 1 << i;
            }
        }
        values[charIndex] = sum;
    }
    return values;
}

function boolArrayFromBase64(values: number[], length: number): boolean[] {
    if (Math.ceil(length / 6) !== values.length) {
        throw new Error("Lengths of base 64 values and resultant length don't match.");
    }

    const arr = new Array(length);
    for (const [i, value] of values.entries()) {
        for (let j = 0; j < 6; j++) {
            const index = 6 * i + j;
            if (index >= length) {
                break;
            }

            arr[index] = (value & (1 << j)) !== 0;
        }
    }

    return arr;
}

function numberToBase64(n: number): number[] {
    let arr = [];
    while (n > 0) {
        arr.push(n & 63);
        n >>= 6;
    }
    return arr;
}

function numberFromBase64(values: number[]): number {
    let num = 0;
    for (const [i, value] of values.entries()) {
        num += value << (6 * i);
    }
    return num;
}

function base64ToString(values: number[]): string {
    return String.fromCharCode(...values.map(val => base64CharCode(val)));
}

function base64FromString(str: string): number[] {
    const result = new Array(str.length);
    for (let i = 0; i < str.length; i++) {
        result[i] = base64ValueFromCharCode(str.charCodeAt(i));
    }
    return result;
}

function base64CharCode(n: number): number {
    n &= 63;
    if (n < 26) return n + 65;
    if (n < 52) return n + (97 - 26);
    if (n < 62) return n + (48 - 53);
    return n === 62 ? 45 : 95;
}

function base64ValueFromCharCode(cc: number): number {
    if (cc >= 65 && cc < 91) return cc - 65;
    if (cc >= 97 && cc < 123) return cc - 97 + 26;
    if (cc >= 48 && cc < 58) return cc - 48 + 53;
    if (cc === 45) return 62;
    if (cc === 95) return 63;
    throw new Error("Unknown base 64 char code.");
}
