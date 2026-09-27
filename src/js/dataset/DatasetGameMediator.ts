import {LetterType} from "../letter/utils";
import {Dataset} from "./Dataset";
import DatasetSingleGame, {DatasetSingleGameConfig} from "./DatasetSingleGame";
import {SettingCollection} from "../settings";
import {ObservableSetting} from "../settings/SettingCollection";
import {GameConfig} from "../game/Game";
import {Observable} from "../utils";
import {transition} from "../utils/dom";

export default class DatasetGameMediator<K extends LetterType> extends Observable<[DatasetSingleGameConfig]> {
    dataset: Dataset<K>
    gameSetting: ObservableSetting<string>
    game: DatasetSingleGame<K>
    settings: SettingCollection<DatasetSingleGameConfig>

    constructor(dataset: Dataset<K>) {
        super();
        this.dataset = dataset;
        this.gameSetting = dataset.gameSetting();
        this.game = dataset.games[this.gameSetting.value];
        this.settings = this.getSettings();

        this.gameSetting.observers.push(key => transition(() => {
            this.game = dataset.games[key];
            this.settings = this.settings.replaceWith(this.getSettings());
        }));
    }

    getSettings() {
        const settings = this.game.getSelectorAndSettings();
        settings.observers.push(this.callObservers);
        return settings;
    }

    settingsValid() {
        return this.checkedCount() > 0 && this.settings.get("settings").getValue("properties").length > 0;
    }

    checkedCount(): number {
        return this.settings.get("selector").checkedCount();
    }

    getGame(gameConfig?: Partial<GameConfig>) {
        return this.game.getGame(this.settings.getValues(), gameConfig);
    }

    observerArgs(): [DatasetSingleGameConfig] {
        return [this.settings.getValues()];
    }

    teardown() {
        this.gameSetting.teardown();
        this.settings.teardown();
    }
}