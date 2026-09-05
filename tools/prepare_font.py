#!/usr/bin/env python3
"""
Prepare a CJK font so pdf-lib can embed it and Chrome will actually draw it.

    pip install fonttools
    python tools/prepare_font.py NotoSansTC[wght].ttf --weight 400

Two things go wrong at this step, and neither reports an error:

1. **A CFF/PostScript font (.otf) embeds as CIDFontType0.** The text is in the
   PDF — you can select it, search it, copy it — and Chrome's built-in viewer
   draws *nothing*. Same file opens fine in Acrobat, which is how you lose an
   afternoon. You need TrueType outlines (`glyf`), which embed as
   CIDFontType2.

2. **A variable font's default instance is often Thin.** Embed
   `NotoSansTC[wght].ttf` as-is and you get weight 100 — hairline strokes that
   look like a rendering bug rather than a font choice. You have to pin an
   instance first.

This script fixes 2, and refuses loudly on 1.
"""

import argparse
import os
import sys

try:
    from fontTools.ttLib import TTFont
    from fontTools.varLib import instancer
except ImportError:
    sys.exit("fontTools is required:  pip install fonttools")


def describe(font):
    return {
        "outlines": "glyf (TrueType)" if "glyf" in font else "CFF (PostScript)",
        "variable": "fvar" in font,
        "weight": font["OS/2"].usWeightClass,
        "glyphs": font["maxp"].numGlyphs,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("font", help="a .ttf — variable or static")
    ap.add_argument("--weight", type=int, default=400,
                    help="weight to pin a variable font at (default 400)")
    ap.add_argument("--out", help="output path (default: <name>-Static<weight>.ttf)")
    args = ap.parse_args()

    if not os.path.exists(args.font):
        sys.exit("No such file: " + args.font)

    font = TTFont(args.font)
    before = describe(font)

    print("in:  %s" % os.path.basename(args.font))
    print("     %s, weight %s, %s glyphs, %s" % (
        before["outlines"], before["weight"], before["glyphs"],
        "variable" if before["variable"] else "static"))

    if "glyf" not in font:
        sys.exit(
            "\nThis font has CFF (PostScript) outlines.\n"
            "\n"
            "pdf-lib will embed it as CIDFontType0. The text will be present and\n"
            "selectable, and Chrome's PDF viewer will not paint a single glyph —\n"
            "with no error, in either the console or the file.\n"
            "\n"
            "Get the TrueType build instead. For Noto: the `Noto_Sans_TC.zip`\n"
            "download from fonts.google.com contains .ttf files; the `notofonts`\n"
            "GitHub releases ship both. Look for 'glyf' — that is the one."
        )

    if before["variable"]:
        print("\npinning wght=%d …" % args.weight)
        font = instancer.instantiateVariableFont(
            font, {"wght": args.weight}, updateFontNames=True)
    elif before["weight"] != args.weight:
        print("\nnote: static font, already weight %s — --weight is ignored"
              % before["weight"])

    stem = os.path.splitext(os.path.basename(args.font))[0]
    for junk in ("[wght]", "-VariableFont_wght", "-VF"):
        stem = stem.replace(junk, "")
    out = args.out or ("%s-Static%d.ttf" % (stem, args.weight))

    font.save(out)

    check = TTFont(out)
    after = describe(check)
    print("\nout: %s" % out)
    print("     %s, weight %s, %s glyphs, %.1f MB" % (
        after["outlines"], after["weight"], after["glyphs"],
        os.path.getsize(out) / 1048576))

    problems = []
    if after["outlines"] != "glyf (TrueType)":
        problems.append("output is not TrueType — Chrome will not draw it")
    if after["variable"]:
        problems.append("output is still variable — the instance did not pin")
    if problems:
        print()
        for p in problems:
            print("  !! " + p)
        sys.exit(1)

    print("\nReady to embed. Do not ship this file as-is —")
    print("pass { subset: true } to embedFont so only the glyphs you use go in")
    print("(a full CJK font is megabytes; a page of Chinese is tens of KB).")


if __name__ == "__main__":
    main()
