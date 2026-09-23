import {setup} from "./context";
import {registerServiceWorker} from "./utils/dom";

// --------------- GAME SETUP -----------------
(function () {
    setup();

    registerServiceWorker("/kadmos/sw.js");
})();
