from svgpathtools import svg2paths
from scripts.svgutils import *
from scripts.utils import COMPONENTS_DIR, ROOT
import json
import os


cwd = os.path.join(ROOT, "scripts/datasets/asl")


def main():
    components = dict()
    scale_fac = 10
    height = 240
    padding = (5, 10)
    digits_pow = 1
    letters = "abcdefghijklmnopqrstuvwxy0246813579z"

    items = []

    paths, attributes = svg2paths(os.path.join(cwd, "ASL alphabet.svg"))

    maxheight = 0

    for i in range(36):
        letter = letters[i]
        path = PathWrapper(paths[2*i + 1]).scale(scale_fac)

        if letter == 'z':
            path.scale(0.8)

        path.align(padding=padding, height=height, to=("left", "bottom"))

        width, path_height = path.dims(padding)
        if path_height > maxheight:
            maxheight = path_height

        width = round(width)

        d_string = path.d(digits_pow=digits_pow)

        items.append([[[width, d_string]], letter])

    items.sort(key=lambda x: x[1])

    template = SVGTemplate.path_template(height=height, digits_pow=digits_pow)
    template.write_items_to_dir(os.path.join(cwd, "svg"), items)

    components["template"] = template.serialize()
    components["letters"] = items[10:]
    components["digits"] = items[1:10] + [items[0]]

    print("MAX HEIGHT:", maxheight)

    with open(os.path.join(COMPONENTS_DIR, "asl.json"), "w") as f:
        json.dump(components, f, indent=2)


if __name__ == "__main__":
    main()
