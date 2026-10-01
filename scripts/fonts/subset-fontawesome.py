"""Subset the Font Awesome 4.7 icon font to the glyphs listed in src/components/sites/lienstore/shared/icons.tsx.

    python scripts/fonts/subset-fontawesome.py        (needs: pip install fonttools brotli)

Writes public/sites/lienstore/shared/fonts/fontawesome-subset.woff2 (+ .json manifest of the code points kept).
scripts/tests/icons-font.test.ts fails when icons.tsx gains a glyph that is not in the manifest — run this again then.
"""
import json
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
SRC = ROOT / "scripts/fonts/fontawesome-webfont-4.7-full.woff2"
ICONS = ROOT / "src/components/sites/lienstore/shared/icons.tsx"
OUT = ROOT / "public/sites/lienstore/shared/fonts/fontawesome-subset.woff2"
MANIFEST = OUT.with_suffix(".json")

text = ICONS.read_text(encoding="utf8")
body = text[text.index("const GLYPHS") :]
body = body[: body.index("} as const")]
cps = sorted({ord(ch) for _, ch in re.findall(r'"?([a-z0-9-]+)"?:\s*"(.)"', body)})
if not cps:
    sys.exit("no glyphs found in icons.tsx")
unicodes = ",".join(f"U+{cp:04X}" for cp in cps)
subprocess.run(
    [sys.executable, "-m", "fontTools.subset", str(SRC), f"--unicodes={unicodes}", "--flavor=woff2", f"--output-file={OUT}", "--no-hinting", "--desubroutinize", "--name-IDs=*", "--layout-features=*"],
    check=True,
)
MANIFEST.write_text(json.dumps({"source": SRC.name, "codepoints": [f"U+{cp:04X}" for cp in cps]}, indent=0) + "\n", encoding="utf8")
print(f"{len(cps)} glyphs -> {OUT.name}: {OUT.stat().st_size // 1024} KB (full font {SRC.stat().st_size // 1024} KB)")
