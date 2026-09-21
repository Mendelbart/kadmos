#!/usr/bin/env python3
import json
from subprocess import run
from os import listdir
from os.path import join
import re
import warnings
import unicodedata

from utils import DATASETS_DIST_DIR, ROOT, DIST

source_fonts_dir = join(ROOT, "fonts/scripts")
subset_fonts_dir = join(DIST, "assets/fonts/scripts")

def get_family(font_data, dataset_fonts, default):
    family = default
    if "key" in font_data:
        family = dataset_fonts[font_data["key"]]["family"]

    return family

def unicode_range_to_chars(r: str):
    r = r.split("-")
    if len(r) == 1:
        start = stop = r[0]
    else:
        start, stop = r

    start = int(start, 16)
    stop = int(stop, 16)

    return [chr(i) for i in range(start, stop + 1)]


def unicodes_to_chars(unicodes: str):
    result = []
    for r in unicodes.split(","):
        result.extend(unicode_range_to_chars(r))

    return result


def ord_to_unicode(n, prefix=""):
    return prefix + hex(n)[2:]


def chars_to_unicodes(chars, **kwargs):
    return ords_to_unicodes([ord(char) for char in chars], **kwargs)


def ords_to_unicodes(ords, prefix="", closegaps=0):
    ords = list(set(ords))
    ords.sort()
    laststartord = ords[0]
    result = [ord_to_unicode(ords[0], prefix=prefix)]
    for n, lastord in zip(ords[1:] + [None], ords):
        if n is None or n - (lastord + 1) > closegaps:
            if laststartord < lastord:
                result[-1] += "-" + ord_to_unicode(lastord, prefix="")

            if n is not None:
                result.append(ord_to_unicode(n, prefix=prefix))
                laststartord = n

    return ",".join(result)


def contains_subsettable_fonts(fonts, subsettable_fonts):
    for font_data in fonts.values():
        if not "family" in font_data:
            raise ValueError("No family specified in font entry.")

        if font_data["family"] in subsettable_fonts:
            return True

    return False


def get_default_font(fonts):
    for key, font_data in fonts.items():
        if "default" in font_data and font_data["default"]:
            return font_data["family"]

    if len(fonts) == 1:
        return list(fonts.values())[0]["family"]
    else:
        raise ValueError("No default font specified.")


def parse_chars(string: str) -> set[str]:
    if string is None:
        return set()

    return set(string)


def print_labeled(label: str, content: str, just: int = 14, wrap='[ ,./;:-]', wrap_at: int = 40):
    if wrap is None:
        lines = [content]
    else:
        lines = []
        while len(content) > wrap_at:
            pattern = fr'(?<=({wrap}))'
            parts = re.split(pattern, content[:wrap_at])
            if len(parts) == 1:
                n = len(re.split(pattern, content[wrap_at:], maxsplit=1)[0])
            else:
                n = -len(parts[-1])

            lines.append(content[:wrap_at - n])
            content = content[wrap_at - n:]

        if len(content) > 0:
            lines.append(content)
        elif len(lines) == 0:
            lines = ['']

    print(f'{label}:'.rjust(just), lines[0])

    for line in lines[1:]:
        print(''.rjust(just), line)



def main():
    with open("src/json/fonts.json", 'r') as fontsJSON:
        fonts = json.load(fontsJSON)

    fonts = {font["family"]: font for font in fonts}
    charsets = {family: set() for family in fonts}
    stylesets = {family: set() for family in fonts}


    def update_charset(family, chrs: set):
        if family not in fonts:
            warnings.warn(f"Family '{family}' not font in fonts.json.")
            return

        charsets[family].update(chrs)


    for filename in listdir(DATASETS_DIST_DIR):
        with open(join(DATASETS_DIST_DIR, filename), "r") as datasetJSON:
            dataset = json.load(datasetJSON)

        print("Processing dataset", dataset["metadata"]["name"])

        if "fonts" in dataset["letterConfig"]:
            dataset_fonts = dataset["letterConfig"]["fonts"]["data"]
        else:
            continue

        if not contains_subsettable_fonts(dataset_fonts, fonts):
            continue

        default_font = get_default_font(dataset_fonts)
        dataset_chars = set()

        if "gameHeading" in dataset["metadata"]:
            game_heading = dataset["metadata"]["gameHeading"]
            game_heading_font = default_font
            if "font" in game_heading:
                game_heading_font = get_family(game_heading["font"], dataset_fonts, default_font)

            if "string" in game_heading:
                update_charset(game_heading_font, parse_chars(game_heading["string"]))

        items = []
        for subset in dataset["subsets"].values():
            if "items" in subset and "data" in subset["items"]:
                items.extend(subset["items"]["data"])

        for item in items:
            dataset_chars.update(*(parse_chars(i) for i in item[0] if i is not None))

        if "manualUnicodes" in dataset["letterConfig"]["fonts"]:
            dataset_chars.update(unicodes_to_chars(dataset["letterConfig"]["fonts"]["manualUnicodes"]))

        for font_data in dataset_fonts.values():
            family = font_data["family"]
            if family not in fonts:
                continue

            update_charset(family, dataset_chars)

            if "params" in font_data and "styleset" in font_data["params"]:
                vals = re.split(r",\s*", font_data["params"]["styleset"])

                for val in vals:
                    stylesets[family].add(fonts[family]["styleset"][val])


    for family, font in fonts.items():
        if "sourceFilename" not in font:
            font["sourceFilename"] = family.replace(" ", "") + ".ttf"

        if "subsetFilename" not in font:
            font["subsetFilename"] = family.replace(" ", "") + ".woff2"

        chars_list = list(charsets[family])

        if len(chars_list) == 0:
            print(f'Skipping "{family}" with no characters.')
            continue

        chars_list.sort()
        chars = re.sub('.', lambda match: "\u200a" + match.group() if unicodedata.category(match.group())[0] == "M" else match.group(), ''.join(chars_list))
        unicodes = chars_to_unicodes(charsets[family])
        command = ["hb-subset", join(source_fonts_dir, font["sourceFilename"])]

        print(f'Subsetting {family.upper()} with {len(chars_list)} characters.')
        print_labeled('unicodes', unicodes, wrap=",")
        print_labeled('chars', chars, wrap=".")

        if "variationSettings" in font:
            variations = []
            for key, value in font["variationSettings"].items():
                if " " in value:
                    continue
                variations.append(f"{key}={value}")

            if len(variations) > 0:
                command.append(f'--variations={','.join(variations)}')
                print_labeled('variations', ', '.join(variations))

        if len(stylesets[family]) > 0:
            command.append(f'--layout-features={",".join([f"ss{ss_id:02d}" for ss_id in stylesets[family]])}')
            print_labeled('stylesets', ','.join((str(s) for s in stylesets[family])))

        command.extend([
            "--retain-gids",
            "--passthrough-tables",
            "--unicodes", unicodes,
            "--output-file", join(subset_fonts_dir, font["subsetFilename"])
        ])
        run(command)
        print()


if __name__ == "__main__":
    main()
