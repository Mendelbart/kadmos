#!/usr/bin/env python3
import json
import sys
import os

from jsonschema.exceptions import ValidationError

from utils import validate_dataset, COMPONENTS_DIR, DATASETS_DIST_DIR, DATASETS_SRC_DIR


def insert_components(data):
    if isinstance(data, list):
        items = enumerate(data)
    elif isinstance(data, dict):
        items = data.items()
    else:
        return

    for key, value in items:
        if isinstance(value, dict) and "$component" in value:
            data[key] = get_component(value["$component"])
        else:
            insert_components(value)


def get_component(path, dir=COMPONENTS_DIR):
    if isinstance(path, str):
        path = os.path.normpath(path).split(os.path.sep)

    dirname = os.path.join(dir, path[0])
    jsonfilename = dirname + ".json"
    if os.path.isfile(jsonfilename):
        with open(jsonfilename, "r") as f:
            return get_value_through_keys(json.load(f), path[1:])

    if os.path.isdir(dirname):
        return get_component(path[1:], dirname)

    print(path, dir, jsonfilename)
    raise ValueError("Component path doesn't exist.")


def get_value_through_keys(data, keys):
    if len(keys) == 0:
        return data

    if isinstance(data, list):
        key = int(keys[0])
    else:
        key = keys[0]

    return get_value_through_keys(data[key], keys[1:])


def process_dataset(filename: str):
    with open(filename, "r") as f:
        dataset = json.load(f)

    try:
        validate_dataset(dataset)
    except ValidationError as e:
        raise ValueError("Invalid dataset.", e)

    insert_components(dataset)
    try:
        validate_dataset(dataset)
    except ValidationError as e:
        raise ValueError("Invalid component.", e)

    relpath = os.path.relpath(filename, DATASETS_SRC_DIR)
    with open(os.path.join(DATASETS_DIST_DIR, relpath), "w") as f:
        json.dump(dataset, f, separators=(',', ':'))


if __name__ == "__main__":
    if len(sys.argv) >= 2:
        process_dataset(sys.argv[1])
    else:
        process_dataset(os.path.join(DATASETS_SRC_DIR, "asl.json"))
