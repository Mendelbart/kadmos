import json
from jsonschema.validators import Draft202012Validator
from os import path

ROOT = "/home/felix/Programming/kadmos"
SRC = path.join(ROOT, "src")
DIST = path.join(ROOT, "dist")
JSON_SRC_DIR = path.join(SRC, "json")
DATASETS_SRC_DIR = path.join(JSON_SRC_DIR, "datasets")
DATASETS_DIST_DIR = path.join(DIST, "json/datasets")
COMPONENTS_DIR = path.join(JSON_SRC_DIR, "components")


with open(path.join(JSON_SRC_DIR, "dataset.schema.json"), "r") as schema_file:
    schema = json.load(schema_file)
    validator = Draft202012Validator(schema)


def validate_dataset(dataset):
    validator.validate(dataset)
