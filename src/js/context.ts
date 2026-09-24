import {SettingCollection, Slider, Switch, RadioButtonGroup} from "./settings";
import Game, {GameConfig} from "./game/Game";
import {Dataset, DEFAULT_DATASET, TERMS} from "./dataset/Dataset";
import DATASETS_METADATA from '../json/datasets_meta.json';
import {DOMUtils, ObjectUtils} from "./utils";
import {encodeBase64BoolArray, decodeBase64BoolArray} from "./utils/base64";
import DatasetMediator, {DatasetCache, SubsetCache} from "./dataset/DatasetMediator";
import {createButtonGroup} from "./settings/ButtonGroup";
import Pages from "./utils/classes/Pages";
import {grabFromHTML, grabNode, selectNode, span, tag} from "./utils/dom";
import {SelectorSettings} from "./dataset/DatasetSubset";


const SwitchTrueValue = "1";
const SwitchFalseValue = "0";
type SwitchValue = typeof SwitchTrueValue | typeof SwitchFalseValue;

const GAME_SETTINGS_PAGES = getGameSettingsPages();
grabNode(document, "div", "#new-game-settings").append(GAME_SETTINGS_PAGES.node)

/** @type {Game} */
let GAME: Game<any, any>;

/** @type {Dataset} */
let DATASET: Dataset<any>;
/** @type {DatasetMediator} */
let DSM: DatasetMediator<any>;

const datasetSelect = grabNode(document, "select", "#datasetSelect");

const GENERIC_GAME_SETTINGS = getGenericGameSettings();
const PAGE_SETTINGS = getPageSettings();

DOMUtils.trackDevicePixelRatio();

function getGameSettingsPages() {
    const pages = new Pages();

    const {filters, settings} = grabFromHTML(
        `<div id="game-filters">
    <div id="dataset-filter-settings" class="settings"></div>
</div>
<div id="game-settings" class="settings">
    <div id="dataset-game-settings" class="settings"></div>
    <div id="generic-game-settings" class="settings"></div>
</div>`,
        {
            filters: ["div", "#game-filters"],
            settings: ["div", "#game-settings"]
        }
    );

    pages.addPage(filters, tag("h2", "", "Select ", span(".term-letters")));
    pages.addPage(settings, "Settings");
    pages.elements.buttonFinish.id = "start-game-button";
    pages.elements.buttonFinish.textContent = "Play";
    return pages;
}

function getGenericGameSettings(): SettingCollection<GameConfig> {
    const stored = localStorage.getItem("game_generic");
    let settings;
    if (stored) {
        try {
            settings = Game.genericSettings(JSON.parse(stored));
        } catch (e) {
            console.error("Error occurred during generic game settings creation:");
            console.error(e);
            settings = Game.genericSettings();
        }
    } else {
        settings = Game.genericSettings();
    }

    settings.observers.push(values => {
        localStorage.setItem("game_generic", JSON.stringify(values));
    });
    return settings;
}

/******************** SETUP ***********************/
export function setup() {
    setupButtonListeners();

    window.addEventListener("popstate", () => DOMUtils.transition(readFromSearchParams));

    DOMUtils.transition(() => {
        selectNode(document, "#generic-game-settings").append(GENERIC_GAME_SETTINGS.node);

        setupDatasetSelect();
        readFromSearchParams();
    });

    showHeading(window.localStorage.getItem("show_dataset_heading") === "true");
    selectNode(document, "#game-heading").addEventListener("dblclick", toggleHeadingShown);
}

function showHeading(showDatasetHeading: boolean) {
    DOMUtils.toggleShown(showDatasetHeading, grabNode(document, "h1", "#game-heading-dataset"), grabNode(document, "h1", "#game-heading-default"));
    window.localStorage.setItem("show_dataset_heading", showDatasetHeading.toString());
}

function toggleHeadingShown() {
    showHeading(window.localStorage.getItem("show_dataset_heading") !== "true");
}

function setupButtonListeners() {
    GAME_SETTINGS_PAGES.elements.buttonFinish.addEventListener("click", () => DOMUtils.transition(startGame));
    selectNode(document, "#stop-game-button").addEventListener("click", () => GAME.finish());
}

function setupDatasetSelect() {
    DOMUtils.setOptions(
        datasetSelect, ObjectUtils.map(DATASETS_METADATA, data => data.name)
    );

    datasetSelect.addEventListener("change", async () => {
        try {
            const dataset = await Dataset.fetch(datasetSelect.value);
            DOMUtils.transition(() => {
                DOMUtils.unsetSearchParam("subset");
                return selectDataset(dataset);
            });
        } catch (e) {
            console.error(`Error occurred fetching dataset with key ${datasetSelect.value}`);
            disableCurrentDatasetOption();
        }
    });
}

function disableCurrentDatasetOption() {
    const selectedOption = datasetSelect.querySelector("option:checked");
    if (selectedOption) (selectedOption as HTMLOptionElement).disabled = true;
}


function setPlaying(playing: boolean) {
    if (!playing) {
        GAME_SETTINGS_PAGES.open(0);
        GAME?.remove();
    }

    DOMUtils.toggleShown(playing,
        grabNode(document, "button", '#stop-game-button'),
        grabNode(document, "div", '#new-game-settings')
    );

    if (playing) document.body.append(GAME.node);
}

/***************************** PAGE SETTINGS ************************/

type ColorMode = "light" | "dark" | "default";
interface PageConfig {
    accentHue: number;
    colorMode: ColorMode;
    useViewTransitions: SwitchValue;
}


function getPageSettings() {
    const getStored = (key: string) => window.localStorage.getItem(key);
    const settings = new SettingCollection<PageConfig>({
        accentHue: getAccentHueSetting(getStored("accentHue")),
        colorMode: getPageLightDarkModeSetting(getStored("colorMode")),
        useViewTransitions: getViewTransitionSetting(getStored("useViewTransitions"))
    });

    settings.observers.push((values, changedKey) => {
        if (changedKey) window.localStorage.setItem(changedKey, values[changedKey].toString());
    });

    settings.node.remove();

    const dialog = DOMUtils.createDialog(
        "Settings", settings.node,
        selectNode(document, "#open-settings-button")
    );
    dialog.id = "page-settings";
    document.body.append(dialog);

    return settings;
}


function getAccentHueSetting(value?: string | null) {
    let hue = value == null ? value : parseInt(value);
    if (hue == null || Number.isNaN(hue)) hue = 250;
    setAccentHue(hue);
    const slider = Slider.create(0, 360, hue);
    slider.label("Accent Hue");
    slider.observers.push(hue => setAccentHue(hue));
    slider.node.id = "accentHueSlider";
    return slider;
}

function setAccentHue(hue: number) {
    document.documentElement.style.setProperty("--accent-hue", hue.toString());
}

function getColorMode(mode: string | null): ColorMode {
    if (!mode || !["default", "light", "dark"].includes(mode)) return "default";
    return mode as ColorMode;
}

function getPageLightDarkModeSetting(mode: string | null): RadioButtonGroup<ColorMode> {
    const colorMode = getColorMode(mode);

    setLightDarkMode(colorMode);

    const colorModeSetting = createButtonGroup(
        {
            default: "Default",
            dark: "Dark",
            light: "Light",
        },
        {
            label: "Color Theme",
            type: "radio",
            checked: colorMode
        }
    );

    colorModeSetting.observers.push(mode => DOMUtils.transition(() => setLightDarkMode(mode)));
    return colorModeSetting;
}

function setLightDarkMode(mode: ColorMode) {
    if (!["default", "dark", "light"].includes(mode)) {
        if (mode) console.error(`Invalid color mode ${mode}, use dark, light or default.`);
        mode = "default";
    }

    if (mode === "default") {
        document.documentElement.classList.remove("dark-mode", "light-mode");
        return;
    }

    DOMUtils.classIfElse(mode === "dark", document.documentElement, "dark-mode", "light-mode");
}

function getViewTransitionSetting(value: string | null) {
    if (value !== SwitchFalseValue && value !== SwitchTrueValue) {
        console.log(value, SwitchFalseValue, value === SwitchFalseValue);
        console.error(`Invalid switch value "${value}".`)
        value = SwitchTrueValue;
    }
    value ??= SwitchTrueValue;
    const sw = getSwitch("Use View Transitions", value as SwitchValue);
    sw.observers.push((val) => {
        window.useViewTransitions = val === SwitchTrueValue;
    });
    window.useViewTransitions = value === SwitchTrueValue;
    return sw;
}

function getSwitch(label: string, value: SwitchValue) {
    const sw = Switch.create<SwitchValue>(label, {boolValues: {true: SwitchTrueValue, false: SwitchFalseValue}});
    sw.value = value;
    return sw;
}




/************************************ SELECTOR ********************************/
async function selectDataset(dataset: Dataset<any>) {
    DATASET = dataset;
    DOMUtils.setSearchParams({dataset: dataset.key});
    updateDocumentTitle();

    try {
        await DATASET.loadFonts();
        setupTerms();

        GAME_SETTINGS_PAGES.open(0);

        setupDSM();
        checkPagesNextButton();
        setupGameHeading(DSM.settings.selector?.getValue("variant"));
    } catch (err) {
        return console.error(err);
    }
}

function updateDocumentTitle() {
    document.title = DATASET ? `${DATASET.metadata.name} - Kadmos` : "Kadmos";
}

function setupTerms() {
    for (const term of TERMS) {
        const string = DATASET.metadata.terms[term];
        document.querySelectorAll('.term-' + term).forEach(elem => {
            elem.textContent = string;
        });
    }
}

function setupDSM() {
    DSM?.teardown();

    const [subset, cache] = getStoredSettings();
    try {
        DSM = new DatasetMediator(DATASET, cache, {subset: DOMUtils.getSearchParam("subset") ?? subset});
    } catch (e) {
        console.error("Error occurred during DSM construction, probably because of invalid cache.");
        console.error(e);
        DSM = new DatasetMediator(DATASET);
    }
    DSM.observers.push(checkPagesNextButton, storeSettings);

    const filterSettings = selectNode(document, "#dataset-filter-settings")
    filterSettings.replaceChildren(DSM.settings.selector?.node ?? "", DSM.selector.node);
    if (DSM.settings.game) selectNode(document, "#dataset-game-settings").replaceChildren(DSM.settings.game.node);

    if (DSM.settings.subset) {
        filterSettings.prepend(DSM.settings.subset.node);
    }

    const variantSetting = DSM.settings.selector?.get("variant");
    if (variantSetting) variantSetting.observers.push(variant => {
        setupGameHeading(variant);
    });
}

function setupGameHeading(variant?: string) {
    selectNode(document, "#game-heading-dataset").replaceChildren(DATASET.getGameHeading(variant));
    // heading.dir = DATASET.getDir();
}

function checkPagesNextButton(): void {
    GAME_SETTINGS_PAGES.elements.buttonNext.disabled = DSM.checkedCount() === 0;
}


/***************************************** GAME *******************************/
function startGame() {
    GAME?.remove();
    GAME = DSM.getGame(GENERIC_GAME_SETTINGS.getValues());
    GAME.onFinish.push(() => setPlaying(false));

    setPlaying(true);
    GAME.newRound();
}


/************************** STORAGE ***************************/
function readFromSearchParams() {
    const searchParams = new URLSearchParams(location.search);
    let datasetKey = searchParams.get("dataset");
    if (!datasetKey || !(datasetKey in DATASETS_METADATA)) {
        datasetKey = DEFAULT_DATASET;
    }
    datasetSelect.value = datasetKey;

    Dataset.fetch(datasetKey).then(
        dataset => selectDataset(dataset)
    ).then(() => {
        if (["1", "true"].includes(searchParams.get("play") ?? "false")) {
            startGame();
        } else {
            setPlaying(false);
        }
    });
}

function localStorageSettingsKey(): string {
    return "script_" + DATASET.key;
}

type EncodedSubsetCache = Omit<SubsetCache, "selector"> & {selector?: Partial<SelectorSettings> & {checked?: string}};
type EncodedDatasetCache = Record<string, EncodedSubsetCache>;

function storeSettings() {
    const cache = encodeCache(DSM.settingsCache);
    const storage = DSM.subset.key + ";" + JSON.stringify(cache);
    window.localStorage.setItem(localStorageSettingsKey(), storage);
}

function encodeCache(cache: DatasetCache): EncodedDatasetCache {
    return ObjectUtils.map(cache, subCache => encodeSubsetCache(subCache));
}

function decodeCache(cache: EncodedDatasetCache): DatasetCache {
    return ObjectUtils.map(cache, subCache => decodeSubsetCache(subCache));
}

function encodeSubsetCache(cache: SubsetCache): EncodedSubsetCache {
    return {
        ...cache,
        selector: cache.selector ? {
            ...cache.selector,
            checked: cache.selector.checked ? encodeBase64BoolArray(cache.selector.checked) : undefined
        } : undefined
    }
}

function decodeSubsetCache(cache: EncodedSubsetCache): SubsetCache {
    return {
        ...cache,
        selector: cache.selector ? {
            ...cache.selector,
            checked: cache.selector.checked ? decodeBase64BoolArray(cache.selector.checked) : undefined
        } : undefined
    }
}

function getStoredSettings(): [undefined, undefined] | [string, DatasetCache] {
    const storage = window.localStorage.getItem(localStorageSettingsKey());
    if (!storage) return [undefined, undefined];

    const [subsetKey, settingsJSON] = storage.split(";", 2);

    try {
        const values = JSON.parse(settingsJSON) as EncodedDatasetCache;

        return [subsetKey, decodeCache(values)];
    } catch (e) {
        console.warn("Error occurred during local storage retrieval.");
        console.error(e);
        return [undefined, undefined];
    }
}
