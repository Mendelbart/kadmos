import {DOMUtils} from "./utils";
import {setup} from "./context.js";
import {registerServiceWorker} from "./utils/dom.ts";

// --------------- GAME SETUP -----------------
(function () {
    document.querySelectorAll(".ribbon").forEach((element) => {
        DOMUtils.setupRibbon(element, element.classList.contains("ribbon-closable"));
    });

    setup();

    registerServiceWorker("/kadmos/js/sw.js");
})();
