import {compile} from "json-schema-to-typescript"
import schema from "./dataset.schema.json" with {type: "json"}
import {recurse} from "../jedison/Schema.js";
import fs from "node:fs";

recurse(schema, () => true, x => {
    if (Array.isArray(x)) {
        for (const [index, value] of x.entries()) {
            if (value.$ref === "#/$defs/component") {
                x.splice(index, 1);
                break;
            }
        }
    }
});
delete schema.$defs.component;
recurse(schema, x => x.title, x => {delete x.title});
recurse(schema, x => x["x-interface"], x => {x.title = "Schema" + x["x-interface"]});
recurse(schema, x => typeof x === "object" && !Array.isArray(x), x => {
    for (const key of Object.keys(x)) {
        if (key.substring(0, 2) === "x-") {
            delete x[key];
        }
    }
});
compile(schema, "KadmosDataset", {format: false, additionalProperties: false}).then(ts => fs.writeFileSync("dataset.schema.d.ts", ts));
