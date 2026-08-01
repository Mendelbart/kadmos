from svgpathtools.path import Path, translate, scale, transform
from svgpathtools.parser import parse_transform
import re
import os

class SVGTemplate:
    def __init__(self, string: str, keys: list[str]):
        self.string = string
        self.keys = keys

    @classmethod
    def path_template(cls, *, width = None, height = None, version = "1.1", digits_pow = 0, xmin = 0, ymin = 0):
        widthstr = "$width$" if width is None else width
        heightstr = "$height$" if height is None else height
        string = f'<svg version="{version}" width="{widthstr}" height="{heightstr}" viewBox="{xmin} {ymin} {widthstr} {heightstr}" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" transform="scale({10**(-digits_pow)})" d="$d$"/></svg>'
        keys = []
        if width is None:
            keys.append("width")
        if height is None:
            keys.append("height")
        keys.append("d")

        return cls(string, keys)

    def json(self):
        return f"""{{
    "template": "{self.string.replace('"', '\\"')}",
    "templateKeys": [{", ".join([f'"{key}"' for key in self.keys])}]
}}"""

    def serialize(self):
        return {"string": self.string, "keys": self.keys}

    def instance(self, values):
        result = self.string
        if len(values) != len(self.keys):
            raise ValueError("Length of keys and values don't match.")

        for key, value in zip(self.keys, values):
            result = re.sub(rf'\${key}\$', str(value), result)

        return result

    def write_to_file(self, file, values):
        file.write(self.instance(values))

    def write_items_to_dir(self, dirname, items):
        for forms, name in items:
            filename = os.path.join(dirname, name + ".svg")
            with open(filename, "w") as f:
                self.write_to_file(f, forms[0])


def format_items(items):
    return "[\n" + ",\n".join(["\t" + str(item).replace("'", '"') for item in items]) + "\n]"


class PathWrapper:
    def __init__(self, path: Path):
        self.path = path
        self._bbox = None
        self._reset_bbox()

    def _reset_bbox(self):
        self._bbox = None

    def bbox(self):
        if self._bbox is None:
            self._bbox = self.path.bbox()
        return self._bbox

    def dims(self, padding = 0):
        if isinstance(padding, tuple):
            padx, pady = padding
        else:
            padx = pady = padding

        xmin, xmax, ymin, ymax = self.bbox()
        return xmax - xmin + padx * 2, ymax - ymin + pady * 2

    def width(self, padding = 0):
        return self.dims(padding)[0]

    def height(self, padding = 0):
        return self.dims(padding)[1]

    def d(self, rel=True, digits_pow=0, ndigits=None):
        d = self.path.d(rel=rel)
        d = re.sub(r'\d+\.\d+', lambda match: str(round(float(match.group()) * 10 ** digits_pow, ndigits)), d)
        d = re.sub(r' ?([a-z-]) ?', lambda match: match.group(1), d)

        return d

    def scale(self, sx, sy = None, origin: complex = 0j):
        self.path = scale(self.path, sx, sy, origin)
        self._reset_bbox()

        return self

    def translate(self, z0):
        self.path = translate(self.path, z0)
        return self

    def transform(self, tf):
        if isinstance(tf, str):
            tf = parse_transform(tf)

        self.path = transform(self.path, tf)
        self._reset_bbox()
        return self

    def align_x(self, padding: float = 0, width = None, to = "left"):
        xmin, xmax = self.bbox()[:2]

        if width is None or to == "left":
            left = xmin - padding
        elif to == "center":
            left = (xmin + xmax) / 2 - width / 2
        elif to == "right":
            left = xmax + padding - width
        else:
            raise ValueError("Invalid x-alignment parameter `to`, use left, center or right.")

        return self.translate(-left)

    def align_y(self, padding: float = 0, height = None, to = "top"):
        ymin, ymax = self.bbox()[2:]

        if to == "bottom":
            top = ymax + padding - height
        elif to == "top":
            top = ymin - padding
        elif to == "center":
            top = (ymax + ymin - height) / 2
        else:
            raise ValueError("Invalid alignment parameter `to`, can only align to top, bottom or center.")

        return self.translate(-top * 1j)

    def align(self, padding: float | tuple = 0, width = None, height = None, to = ("left", "top")):
        if isinstance(padding, tuple):
            padx, pady = padding
        else:
            padx = pady = padding

        return self.align_x(padding=padx, width=width, to=to[0]).align_y(padding=pady, height=height, to=to[1])
