from svgpathtools import svg2paths
from scripts.svgutils import *
from scripts.utils import COMPONENTS_DIR, ROOT
import json
import os


cwd = os.path.join(ROOT, "scripts/datasets/bsl")

height = 450
padding = 10
digits_pow = 1

template = SVGTemplate.path_template(height=height, digits_pow=digits_pow)


def main():
    components = dict()
    components["template"] = template.serialize()
    items = []

    for i in range(97, 97 + 26):
        letter = chr(i)
        path = PathWrapper(svg2paths(os.path.join(cwd, f"png/{letter}.svg"))[0][0])
        path.transform("translate(0,450) scale(0.1,-0.1)")
        path.align_x(padding)
        width = round(path.width(padding))
        d_string = path.d(digits_pow=digits_pow)

        items.append([[[width, d_string]], letter])

    template.write_items_to_dir(os.path.join(cwd, "svg"), items)

    components["letters"] = items
    with open(os.path.join(COMPONENTS_DIR, "bsl.json"), 'w') as f:
        json.dump(components, f, indent=2)


if __name__ == "__main__":
    main()
