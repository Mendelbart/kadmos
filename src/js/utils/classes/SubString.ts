export default class SubString {
    source: string;
    str: string;
    start: number;
    end: number;

    constructor(source: string, start: number = 0, end: number = source.length) {
        this.source = source;
        this.str = source.substring(start, end);
        this.start = start;
        this.end = end;
    }

    sub(start: number = 0, end?: number): SubString {
        return new SubString(
            this.source,
            start + this.start,
            end != null ? end + this.start : this.end
        );
    }

    get length() {
        return this.end - this.start;
    }

    split(splitter: RegExp, includeEmpty: boolean = false): SubString[] {
        const result = [];
        const matches = this.str.matchAll(splitter);

        let i = 0;
        for (const match of matches) {
            if (!includeEmpty && i === match.index) continue;

            result.push(this.sub(i, match.index));
            i = match.index + match[0].length;
        }

        if (includeEmpty || i < this.length) result.push(this.sub(i));

        return result;
    }

    trim(): SubString {
        const startTrim = this.str.match(/^\s*/)?.[0]?.length ?? 0;
        const endTrim = this.str.match(/\s*$/)?.[0]?.length ?? 0;

        if (startTrim === 0 && endTrim === 0) return this;

        return new SubString(this.source, this.start + startTrim, this.end - endTrim);
    }
}
