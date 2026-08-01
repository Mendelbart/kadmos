import json
from jsonschema.exceptions import ValidationError
from os import scandir, path
import logging

from utils import validate_dataset, JSON_SRC_DIR, DATASETS_SRC_DIR

logger = logging.getLogger(__name__)

def main():
    logging.basicConfig(filename="logs/register.log", level=logging.INFO)
    meta = dict()

    for e in scandir(DATASETS_SRC_DIR):
        if not e.is_file():
            continue

        with open(e.path, "r") as file:
            data = json.load(file)

        try:
            validate_dataset(data)
        except ValidationError as e:
            logger.error("ValidationError: ", file.name, e)
            continue

        meta[data["key"]] = {"name": data["name"], "file": path.relpath(file.name, DATASETS_SRC_DIR)}

    meta = dict(sorted(meta.items(), key=lambda x: x[1]["name"]))
    with open(path.join(JSON_SRC_DIR, "datasets_meta.json"), "w") as metafile:
        json.dump(meta, metafile, indent=2)

    print(meta)


if __name__ == "__main__":
    main()
