"""
Collect the Japanese product content (title, feature bullets, description) from Amazon.co.jp for every product that has an
Amazon link or an ASIN matched earlier by Japanese-name search, and grab a white-background main image for products that
have none. Output: data/ja-source.json  {id: {asin, url, title, bullets[], description, image}}.

  poetry run python scripts/xlsx/fetch_ja_content.py            # all linked / matched products
  poetry run python scripts/xlsx/fetch_ja_content.py --only 2261,2262 --images-only
"""
import argparse, io, json, re, time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SEED = ROOT / "data" / "seed.json"
OUT = ROOT / "data" / "ja-source.json"
IMG_DIR = ROOT / "public" / "sites" / "lienstore" / "shared" / "products" / "import"
WEB_DIR = "/sites/lienstore/shared/products/import"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36"

ap = argparse.ArgumentParser()
ap.add_argument("--only")
ap.add_argument("--matched", default=str(ROOT / "docs" / "reports" / "dimensions-new-products-2026-09-09.json"), help="report json with 'matched' ASINs")
ap.add_argument("--images-only", action="store_true")
ap.add_argument("--limit", type=int, default=0)
args = ap.parse_args()

seed = json.loads(SEED.read_text(encoding="utf-8"))
products = seed["products"]
existing = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}

asin_of = {}
for p in products:
    m = re.search(r"/(?:dp|gp/product)/([A-Z0-9]{10})", p.get("supplierUrl") or "")
    if m:
        asin_of[p["id"]] = m.group(1)
if Path(args.matched).exists():
    for r in json.loads(Path(args.matched).read_text(encoding="utf-8")):
        m = re.search(r"\(([A-Z0-9]{10})\)", r.get("matched") or "")
        if m and r["id"] not in asin_of:
            asin_of[r["id"]] = m.group(1)

only = {int(x) for x in args.only.split(",")} if args.only else None
todo = [p for p in products if p["id"] in asin_of and (only is None or p["id"] in only) and (str(p["id"]) not in existing or args.images_only or only)]
if args.limit:
    todo = todo[: args.limit]
print(f"{len(todo)} product(s) with an ASIN to read (of {len(asin_of)} known)", flush=True)

from playwright.sync_api import sync_playwright
from PIL import Image
import requests

def clean(t):
    t = re.sub(r"[‎‏]", "", t or "")
    return re.sub(r"[ \t]+", " ", t).strip()

def read_product(pg, asin):
    pg.goto(f"https://www.amazon.co.jp/dp/{asin}", wait_until="domcontentloaded", timeout=60000)
    pg.wait_for_timeout(1500)
    title = clean(pg.locator("#productTitle").first.inner_text()) if pg.locator("#productTitle").count() else ""
    bullets = []
    for el in pg.locator("#feature-bullets li span.a-list-item").all():
        t = clean(el.inner_text())
        if t and "詳細はこちら" not in t and "もっと見る" not in t:
            bullets.append(t)
    desc = ""
    for sel in ("#productDescription", "#aplus_feature_div", "#aplus"):
        loc = pg.locator(sel).first
        if loc.count():
            d = clean(loc.inner_text())
            if len(d) > len(desc):
                desc = d
    # detail table rows that carry usage info (原材料・成分, 使用方法, ご注意)
    extra = {}
    for sel in ("#productDetails_techSpec_section_1 tr", "#productDetails_detailBullets_sections1 tr", "#important-information .a-section"):
        for el in pg.locator(sel).all():
            t = clean(el.inner_text())
            for key in ("原材料", "成分", "使用方法", "使い方", "ご注意", "注意", "内容量", "商品サイズ", "ブランド", "対象", "香り"):
                if t.startswith(key) and len(t) < 800:
                    extra[key] = t
    img = ""
    for sel in ("#landingImage", "#imgTagWrapperId img", "#main-image"):
        loc = pg.locator(sel).first
        if loc.count():
            img = loc.get_attribute("data-old-hires") or loc.get_attribute("src") or ""
            break
    img = re.sub(r"\._[A-Z0-9_,]+_\.", ".", img or "")
    return {"asin": asin, "url": f"https://www.amazon.co.jp/dp/{asin}", "title": title, "bullets": bullets[:12], "description": desc[:4000], "extra": extra, "image": img}

def save_image(slug, url):
    r = requests.get(url, timeout=30, headers={"User-Agent": UA})
    r.raise_for_status()
    im = Image.open(io.BytesIO(r.content)).convert("RGB")
    # Amazon main images are white-background by rule; keep a light sanity check on the frame
    w, h = im.size
    px = [im.getpixel((x, y)) for x in range(0, w, max(1, w // 20)) for y in (0, h - 1)] + [im.getpixel((x, y)) for y in range(0, h, max(1, h // 20)) for x in (0, w - 1)]
    white = sum(1 for p in px if min(p) > 235) / len(px)
    if white < 0.5:
        return None
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    full = im.copy(); full.thumbnail((1200, 1200)); full.save(IMG_DIR / f"{slug}.jpg", "JPEG", quality=88)
    th = Image.new("RGB", (300, 300), "white"); t = im.copy(); t.thumbnail((300, 300)); th.paste(t, ((300 - t.width) // 2, (300 - t.height) // 2))
    th.save(IMG_DIR / f"{slug}-300x300.jpg", "JPEG", quality=88)
    return f"{WEB_DIR}/{slug}.jpg"

with sync_playwright() as pw:
    b = pw.chromium.launch()
    ctx = b.new_context(locale="ja-JP", user_agent=UA, viewport={"width": 1280, "height": 900})
    pg = ctx.new_page()
    done = 0
    for i, p in enumerate(todo, 1):
        asin = asin_of[p["id"]]
        try:
            data = read_product(pg, asin)
        except Exception as e:  # noqa: BLE001
            print(f"[{i}/{len(todo)}] #{p['id']} ERROR {str(e)[:80]}", flush=True)
            continue
        data["slug"] = p["slug"]
        data["name"] = p["name"]
        data["imageSaved"] = None
        if not p.get("images") and data["image"]:
            try:
                data["imageSaved"] = save_image(p["slug"], data["image"])
            except Exception as e:  # noqa: BLE001
                data["imageError"] = str(e)[:80]
        existing[str(p["id"])] = data
        done += 1
        print(f"[{i}/{len(todo)}] #{p['id']} {asin} bullets={len(data['bullets'])} desc={len(data['description'])} img={'saved' if data['imageSaved'] else '-'} {data['title'][:50]}", flush=True)
        if done % 10 == 0:
            OUT.write_text(json.dumps(existing, ensure_ascii=False, indent=1), encoding="utf-8")
        time.sleep(1.0)
    b.close()
OUT.write_text(json.dumps(existing, ensure_ascii=False, indent=1), encoding="utf-8")
print(f"saved {len(existing)} entries → {OUT}")
