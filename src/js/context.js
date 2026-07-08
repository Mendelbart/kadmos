import {SettingCollection, Slider, ButtonGroup, Switch} from "./settings";
import Game from "./game/Game";
import {Dataset, DEFAULT_DATASET, TERMS} from "./dataset/Dataset.js";
import DATASETS_METADATA from '../json/datasets_meta.json';
import {DOMUtils, ObjectUtils} from "./utils";
import {encodeBase64BoolArray, decodeBase64BoolArray} from "./utils/base64";
import DatasetMediator from "./dataset/DatasetMediator";


/** @type {Game} */
let GAME;

/** @type {Dataset} */
let DATASET;
/** @type {DatasetMediator} */
let DSM;

const GENERIC_GAME_SETTINGS = Game.genericSettings();

/** @type {SettingCollection} */
let PAGE_SETTINGS;


/******************** SETUP ***********************/
export function setup() {
    setupPageSettings();
    setupButtonListeners();

    window.addEventListener("popstate", () => DOMUtils.transition(readFromSearchParams));

    DOMUtils.transition(() => {
        document.getElementById("generic-game-settings").append(GENERIC_GAME_SETTINGS.node);

        setupDatasetSelect();
        readFromSearchParams(false);
    });
}

function setupButtonListeners() {
    document.getElementById("start-game-button").addEventListener("click", () => DOMUtils.transition(startGame));
    document.getElementById("stop-game-button").addEventListener("click", () => GAME.finish());
    document.getElementById("item-submit-button").addEventListener("click", () => {
        GAME.transition(() => GAME.submitRound());
    });
    document.getElementById("item-next-button").addEventListener("click", () => {
        GAME.transition(() => GAME.newRound());
    });
}

function setupDatasetSelect() {
    const select = document.getElementById("datasetSelect");
    DOMUtils.setOptions(
        select, ObjectUtils.map(DATASETS_METADATA, data => data.name)
    );

    select.addEventListener("change", (e) => {
        Dataset.fetch(e.target.value).then(
            dataset => DOMUtils.transition(() => {
                DOMUtils.unsetSearchParam("subset");
                return selectDataset(dataset);
            })
        ).catch(err => console.error(err));
    });
}


/**
 * @param {boolean} playing
 */
function setPlaying(playing) {
    if (!playing) {
        DOMUtils.showPage(document.getElementById('game-filters'));
        GAME?.cleanup();
    }

    DOMUtils.toggleShown(playing,
        [
            document.getElementById('game-container'),
            document.getElementById('stop-game-button'),
            document.getElementById('progress-bar')
        ],
        [
            document.getElementById('new-game-settings')
        ]
    );
}


/***************************** PAGE SETTINGS ************************/
const PageSettingCreators = {
    accentHue: getAccentHueSetting,
    colorMode: getPageLightDarkModeSetting,
    keepKeyboardOpen: getKeepKeyboardOpenSetting,
    useViewTransitions: getViewTransitionSetting
}

function setupPageSettings() {
    PAGE_SETTINGS = SettingCollection.createFrom(ObjectUtils.map(PageSettingCreators,
        (creator, key) => creator(window.localStorage.getItem(key))
    ));

    PAGE_SETTINGS.observers.push((values, changedKey) => {
        if (changedKey) window.localStorage.setItem(changedKey, values[changedKey]);
    });

    document.getElementById("page-settings")?.remove();

    const dialog = DOMUtils.createDialog(
        "Settings", PAGE_SETTINGS.node,
        document.getElementById("open-settings-button")
    );
    dialog.id = "page-settings";
    document.body.append(dialog);
}


/**
 * @param {string} [value]
 * @returns {Slider}
 */
function getAccentHueSetting(value) {
    let hue = parseInt(value);
    if (Number.isNaN(hue)) hue = 250;
    setAccentHue(hue);
    const slider = Slider.create(0, 360, hue);
    slider.label("Accent Hue");
    slider.observers.push(hue => setAccentHue(hue));
    slider.node.id = "accentHueSlider";
    return slider;
}

/**
 * @param {number} hue
 */
function setAccentHue(hue) {
    document.documentElement.style.setProperty("--accent-hue", hue);
}

/**
 * @param {"dark" | "light" | "default"} [mode]
 * @returns {ButtonGroup}
 */
function getPageLightDarkModeSetting(mode = "default") {
    setLightDarkMode(mode);

    const colorModeSetting = ButtonGroup.from(
        {
            default: "Default",
            dark: "Dark",
            light: "Light",
        },
        {
            label: "Color Theme",
            exclusive: true,
            checked: mode
        }
    );

    colorModeSetting.observers.push(mode => DOMUtils.transition(() => setLightDarkMode(mode)));
    return colorModeSetting;
}

/**
 * @param {"dark" | "light" | "default"} mode
 */
function setLightDarkMode(mode) {
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

const SwitchTrueValue = "1";
const SwitchFalseValue = "0";
/**
 * @param {string} [value]
 * @returns Switch
 */
function getKeepKeyboardOpenSetting(value) {
    const sw = getSwitch("Keep Keyboard Open", value ?? window.isMobile.toString());
    sw.observers.push((value) => {
        if (GAME) GAME.keepKeyboardOpen = value === SwitchTrueValue;
    });

    return sw;
}

/**
 * @param {string} value
 * @returns Switch
 */
function getViewTransitionSetting(value) {
    value ??= SwitchTrueValue;
    const sw = getSwitch("Use View Transitions", value);
    sw.observers.push((val) => {
        window.useViewTransitions = val === SwitchTrueValue;
    });
    window.useViewTransitions = value === SwitchTrueValue;
    return sw;
}

/**
 * @param {string} label
 * @param {string} [value]
 * @returns Switch
 */
function getSwitch(label, value) {
    const sw = Switch.create(label);
    sw.setValues(SwitchFalseValue, SwitchTrueValue);
    sw.value = value;
    return sw;
}




/************************************ SELECTOR ********************************/
/**
 * @param {Dataset} dataset
 */
function selectDataset(dataset) {
    DATASET = dataset;
    DOMUtils.setSearchParams({dataset: dataset.key});
    updateDocumentTitle();

    return DATASET.loadFonts().then(() => {
        setupTerms();

        DOMUtils.showPage(document.getElementById('game-filters'));

        setupDSM();
        DSM.setSettings(getCachedSettings());
        checkPagesNextButton();
        setupGameHeading(DSM.selectorSettings.getDefault("variant"));
    }).catch(err => console.error(err));
}

function updateDocumentTitle() {
    document.title = DATASET ? `${DATASET.name} - Kadmos` : "Kadmos";
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

    DSM = new DatasetMediator(DATASET, {subset: DOMUtils.getSearchParam("subset")});
    if (DATASET.hasSetting("subset")) {
        DOMUtils.setSearchParams({subset: DSM.subsetSetting.value});
        DSM.subsetSetting.observers.push(value => DOMUtils.setSearchParams({subset: value}));
    }

    DSM.selector.observers.push(checkPagesNextButton);
    DSM.observers.push(saveSettings);
    if (DSM.subsetSetting) DSM.subsetSetting.observers.push(() => {
        DSM.setSettings(getCachedSettings());
    });

    document.getElementById('dataset-filter-settings').replaceChildren(DSM.selectorSettings.node, DSM.selector.node);
    if (DSM.subsetSetting) document.getElementById('dataset-filter-settings').prepend(DSM.subsetSetting.node);
    document.getElementById("dataset-game-settings").replaceChildren(DSM.gameSettings.node);

    if (DSM.selectorSettings.has("variant")) {
        DSM.selectorSettings.addObserverTo("variant", variant => {
            setupGameHeading(variant);
        });
    }
}

function setupGameHeading(variant) {
    const heading = document.getElementById('game-heading');
    heading.querySelector("h1").replaceChildren(DATASET.getGameHeading(variant));
    heading.dir = DATASET.getDir();
}

function checkPagesNextButton() {
    document.querySelector('#game-settings-pages .pages-next-button').disabled = DSM.checkedCount() === 0;
}


/***************************************** GAME *******************************/
function startGame() {
    GAME?.cleanup();

    saveSettings(DSM.getSettingsValues());

    GAME = DSM.getGame();

    const seed = GENERIC_GAME_SETTINGS.getValue("seed");
    if (seed) GAME.seed(seed);

    GAME.keepKeyboardOpen = PAGE_SETTINGS.getValue("keepKeyboardOpen") === SwitchTrueValue;

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
    document.getElementById("datasetSelect").value = datasetKey;

    Dataset.fetch(datasetKey).then(
        dataset => selectDataset(dataset)
    ).then(() => {
        if (["1", "true"].includes(searchParams.get("play"))) {
            startGame();
        } else {
            setPlaying(false);
        }
    });
}

/**
 * @returns {string}
 */
function localStorageSettingsKey() {
    if (DATASET.hasSetting("subset")) {
        return "script_" + DATASET.key + "_" + DSM.subset.key;
    }

    return "script_" + DATASET.key;
}

function saveSettings(values) {
    DOMUtils.setSearchParams({dataset: DATASET.key});
    if (DATASET.hasSetting("subset")) {
        DOMUtils.setSearchParams({subset: DSM.subset.key});
    } else {
        DOMUtils.unsetSearchParam("subset");
    }

    if (values.checked) {
        values.checked = encodeBase64BoolArray(values.checked);
    }
    if (values.combineKeys) {
        values.combineKeys = values.combineKeys.join(",");
    }

    window.localStorage.setItem(localStorageSettingsKey(), JSON.stringify(values));
}

/**
 * @returns {Record<string,any>}
 */
function getCachedSettings() {
    const settingsJSON = window.localStorage.getItem(localStorageSettingsKey());
    if (!settingsJSON) return {};

    try {
        const values = JSON.parse(settingsJSON);
        if (typeof values.checked === "string") {
            values.checked = decodeBase64BoolArray(values.checked);
        }
        if (values.combineKeys) {
            values.combineKeys = values.combineKeys.split(",");
        }
        return values;
    } catch (e) {
        console.error(e);
        return {};
    }
}
