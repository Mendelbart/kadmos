import {RandomNumberGenerator} from "../utils";
import {avg, range} from "../utils/array";


interface QuizDealerConfig {
    clearScore?: number;
    maxRounds?: number;
    maxTriesPerRound?: number;
    poolSize?: number;
}

interface PoolEntry {
    index: number;
    score: number;
    tries: number;
}

interface ItemProgressTrack {
    totalScore: number;
    rounds: number;
    finished: boolean;
}

export default class QuizDealer<T> {
    items: T[];
    config: Required<QuizDealerConfig>;
    pool: PoolEntry[];
    cue: number[];
    rng: RandomNumberGenerator;
    itemData: ItemProgressTrack[];

    private _lastIndex?: number;
    private _currentIndex: number;
    private _currentPoolIndex: number;

    constructor(items: T[], config: QuizDealerConfig = {}) {
        this.items = items;
        this.config = Object.assign({}, {
            poolSize: 5,
            maxRounds: 3,
            maxTriesPerRound: 4,
            clearScore: 0.75,
        }, config);

        this.pool = [];
        this.cue = range(this.items.length);
        this.rng = new RandomNumberGenerator();

        this._currentIndex = -1;
        this._currentPoolIndex = -1;

        this.itemData = this.items.map(() => {return {totalScore: 0, rounds: 0, finished: false}});

        this._refillPool();
    }

    private _replacePoolElement(poolIndex: number): void {
        if (this._cueEmpty()) {
            this.pool.splice(poolIndex, 1);
            return;
        }

        this.pool[poolIndex] = this._drawFromCue();
    }

    private _drawFromCue(): PoolEntry {
        const cueIndex = this.rng.randIndexWeighted(this.cue.map(index => this._cueItemWeight(index)));
        const element = this._poolElement(this.cue[cueIndex]);
        this.cue.splice(cueIndex, 1);
        return element;
    }

    private _poolElement(index: number): PoolEntry {
        return {index: index, score: 0, tries: 0};
    }

    private _cueEmpty(): boolean {
        return this.cue.length === 0;
    }

    private _updatePool(): void {
        const elem = this._currentPoolElement;
        if (elem.score >= 0.75 + 0.25 * elem.tries || elem.tries >= this.config.maxTriesPerRound) {
            const index = this._currentIndex;
            this.itemData[index].totalScore += elem.score / elem.tries;
            this.itemData[index].rounds += 1;
            if (this._isFinished(index)) {
                this.itemData[index].finished = true;
            } else {
                this.cue.push(index);
            }

            this._replacePoolElement(this._currentPoolIndex);
        }
    }

    private _isFinished(index: number): boolean {
        const {totalScore, rounds} = this.itemData[index];
        return totalScore >= this.config.clearScore * rounds || rounds >= this.config.maxRounds;
    }

    private _cueItemWeight(itemIndex: number): number {
        const {totalScore, rounds} = this.itemData[itemIndex];
        return rounds === 0 ? 1 : (2 - totalScore / rounds);
    }

    private _poolElementWeight(poolScore: number): number {
        return (2 - poolScore);
    }

    isEmpty(): boolean {
        return this.pool.length === 0 || this.pool.length === 1 && this.pool[0].index === this._currentIndex;
    }

    nextItem(): T {
        if (this.isEmpty()) throw new Error("Dealer is empty.");

        this._lastIndex = this._currentIndex;
        const weights = this.pool.map(
            ({index, score}) => index === this._lastIndex ? 0 : this._poolElementWeight(score)
        );
        this._currentPoolIndex = this.rng.randIndexWeighted(weights);
        this._currentIndex = this._currentPoolElement.index;
        return this.currentItem;
    }

    get currentItem(): T {
        if (this._currentIndex === -1) throw new Error("nextItem needs to be called before currentItem is accessible.");
        return this.items[this._currentIndex];
    }

    private get _currentPoolElement(): PoolEntry {
        if (this._currentPoolIndex === -1) throw new Error("nextItem needs to be called before currentPoolElement is accessible.");
        return this.pool[this._currentPoolIndex];
    }

    submitScore(score: number): void {
        const elem = this._currentPoolElement;
        elem.score += score;
        elem.tries += 1;
        this._updatePool();
    }

    punish(item: T) {
        const index = this.items.indexOf(item);
        if (index === -1) throw new Error("Item not found.");

        const data = this.itemData[index];
        data.totalScore -= 1 / this.config.maxTriesPerRound;
        if (data.finished && !this._isFinished(index)) {
            data.finished = false;
            this.cue.push(index);
            this._refillPool();
        }
    }

    _refillPool() {
        while (this.pool.length < this.config.poolSize && !this._cueEmpty()) {
            this.pool.push(this._drawFromCue());
        }
    }

    getScores() {
        return this.itemData.map(({totalScore, rounds}) => rounds === 0 ? 0 : totalScore / rounds);
    }

    totalScore() {
        return avg(this.getScores());
    }

    progress(): number {
        return avg(this.itemData.map(({totalScore, rounds, finished}) => {
            if (finished) return 1;
            if (rounds === 0) return 0;
            return Math.max(totalScore / rounds, rounds / this.config.maxRounds);
        }));
    }
}
