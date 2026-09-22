import {DOMUtils} from "./utils";
import {setup} from "./context";
import {registerServiceWorker} from "./utils/dom";

// --------------- GAME SETUP -----------------
(function () {
    document.querySelectorAll(".ribbon").forEach((element) => {
        if (element instanceof HTMLElement)
            DOMUtils.setupRibbon(element, element.classList.contains("ribbon-closable"));
    });

    setup();

    registerServiceWorker("/kadmos/sw.js");
})();
