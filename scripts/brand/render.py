import pathlib, sys
from playwright.sync_api import sync_playwright

HERE = pathlib.Path(__file__).parent
OUT = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / "out"
OUT.mkdir(parents=True, exist_ok=True)
URL = (HERE / "logo.html").resolve().as_uri()

import os
ONLY = os.environ.get('ONLY')
JOBS = [  # kind, selector, transparent?, outputs [(name, width)]
    ("red", ".logo", False, [("logo-dark-1600.png", 1600), ("logo-dark-800.png", 800), ("logo-dark-400.png", 400)]),
    ("white", ".logo", False, [("logo-light-1600.png", 1600), ("logo-light-800.png", 800), ("logo-light-400.png", 400)]),
    ("trans", ".logo", True, [("logo-transparent-1600.png", 1600), ("logo-transparent-800.png", 800), ("logo-transparent-400.png", 400)]),
    ("transwhite", ".logo", True, [("logo-white-1600.png", 1600), ("logo-white-800.png", 800), ("logo-white-400.png", 400)]),
    ("icon", ".icon", True, [("icon-512.png", 512), ("icon-192.png", 192), ("icon-180.png", 180), ("icon-48.png", 48), ("icon-32.png", 32), ("icon-16.png", 16)]),
    ("round", ".icon", True, [("icon-round-512.png", 512), ("icon-round-192.png", 192)]),
    ("og", ".og", False, [("og-image-1200x630.png", 1200)]),
]

with sync_playwright() as p:
    b = p.chromium.launch()
    for kind, sel, transparent, outs in JOBS:
        if ONLY and kind != ONLY: continue
        for name, width in outs:
            base = {"logo": 800, "icon": 512, "og": 1200}[sel.strip(".")]
            scale = width / base
            pg = b.new_page(viewport={"width": 1400, "height": 800}, device_scale_factor=scale)
            pg.goto(f"{URL}?k={kind}")
            pg.wait_for_timeout(1500)  # fonts
            pg.evaluate("document.fonts.ready")
            pg.locator(sel).screenshot(path=str(OUT / name), omit_background=transparent)
            pg.close()
            print("wrote", name)
    b.close()
