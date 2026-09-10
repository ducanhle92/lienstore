"""
Find a Japanese source page on Amazon.co.jp for products that have none yet (or whose recorded source was wrong):
search by the Japanese name, drop bundles / wrong pack sizes, read the best candidate's page (title, bullets,
description, detail rows, main image) and store it in data/ja-source.json with the search evidence so a reviewer
can judge the match:  {id: {..., matchedBy: "search", query, candidates: [{asin,title}], weak: bool, previous?: {...}}}

  poetry run python scripts/xlsx/find_ja_sources.py                 # every product without a source entry
  poetry run python scripts/xlsx/find_ja_sources.py --ids 2083,2113 # re-search these (old entry kept under "previous")
  poetry run python scripts/xlsx/find_ja_sources.py --limit 5 --dry
"""
import argparse, io, json, re, time
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[2]
SEED = ROOT / "data" / "seed.json"
OUT = ROOT / "data" / "ja-source.json"
IMG_DIR = ROOT / "public" / "sites" / "lienstore" / "shared" / "products" / "import"
WEB_DIR = "/sites/lienstore/shared/products/import"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36"

ap = argparse.ArgumentParser()
ap.add_argument("--ids", help="comma-separated product ids to (re)search")
ap.add_argument("--limit", type=int, default=0)
ap.add_argument("--dry", action="store_true", help="search only, do not read product pages / write the file")
args = ap.parse_args()

seed = json.loads(SEED.read_text(encoding="utf-8"))
products = {p["id"]: p for p in seed["products"]}
existing = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}

if args.ids:
    todo = [products[int(x)] for x in args.ids.split(",") if int(x) in products]
else:
    todo = [p for p in seed["products"] if str(p["id"]) not in existing]
if args.limit:
    todo = todo[: args.limit]
print(f"{len(todo)} product(s) to search", flush=True)

# --- ranking (same rules as amazon_jp_lookup.py) -------------------------------------------------------------------
BUNDLE = re.compile(r"(セット|まとめ買い|\d+\s?(個|本|袋|箱)セット|[×x]\s?\d+(?!\d)(?!\s?(包|袋|錠|粒|g|ml|mL|枚|回|カプセル|本入|個入)))", re.I)
SIZE = re.compile(r"(\d+(?:\.\d+)?)\s?(ml|mL|g|kg|錠|粒|包|袋|枚|本|回分|カプセル|日分|個)", re.I)
UNIT_FAMILY = {"ml": "vol", "g": "vol", "kg": "vol", "錠": "cnt", "粒": "cnt", "カプセル": "cnt", "包": "pack", "袋": "pack", "個": "pack",
               "本": "pack", "枚": "pack", "回分": "pack", "日分": "days"}
Z2H = str.maketrans("０１２３４５６７８９ｍｌｇ", "0123456789mlg")


def size_tokens(name):
    text = (name or "").translate(Z2H)
    out = set()
    for a, b in SIZE.findall(text):
        num = a[:-2] if a.endswith(".0") else a
        out.add((num, UNIT_FAMILY.get(b.lower(), b.lower())))
    return out


WORD_SPLIT = re.compile(r"[\s／/（）()【】\[\]、,，・]+")


def keyword_score(name, title):
    """+4 for every word of the name found in the title, -3 for every one missing (sizes and brand-in-parentheses ignored)."""
    tt = title.translate(Z2H).lower()
    score, missing = 0, []
    for w in WORD_SPLIT.split((name or "").translate(Z2H)):
        w = w.strip().lower()
        if len(w) < 2 or SIZE.fullmatch(w) or w.isdigit():
            continue
        if w in tt:
            score += 4
        else:
            score -= 3
            missing.append(w)
    return score, missing


def rank(cands, name):
    want_bundle = bool(BUNDLE.search(name))
    toks = size_tokens(name)
    scored = []
    for it in cands:
        t = it["title"]
        if not want_bundle and BUNDLE.search(t):
            continue
        if not want_bundle:
            tt = t.translate(Z2H)
            nums = {num for num, _ in toks}
            mults = [m.group(1) for m in re.finditer(r"[×x]\s?(\d+)", tt)]
            if any(n not in nums and int(n) >= 2 and (toks or int(n) <= 12) for n in mults):
                continue
        score, missing = keyword_score(name, t)
        it["missing"] = missing
        if toks and toks & size_tokens(t):
            score += 10
        elif toks:
            score -= 20
        if it["price"]:
            score += 3
        if "医薬品" in t and "医薬品" in name:
            score += 1
        scored.append((score, it))
    scored.sort(key=lambda x: -x[0])
    return [(s, it) for s, it in scored]


def search(pg, q):
    pg.goto(f"https://www.amazon.co.jp/s?k={quote(q)}", wait_until="domcontentloaded", timeout=60000)
    pg.wait_for_timeout(1800)
    items = pg.eval_on_selector_all("div.s-result-item[data-asin]:not([data-asin=''])", """els => els.slice(0, 16).map(e => ({
        asin: e.getAttribute('data-asin'),
        title: (e.querySelector('h2')?.innerText || '').trim(),
        price: (e.querySelector('.a-price .a-offscreen')?.innerText || ''),
        sponsored: !!e.querySelector('[aria-label*="スポンサー"], .puis-sponsored-label-text, .s-sponsored-label-text')
    }))""")
    return [it for it in items if it["title"] and not it["sponsored"]]


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
    extra = {}
    for sel in ("#productDetails_techSpec_section_1 tr", "#productDetails_detailBullets_sections1 tr", "#important-information .a-section", "#detailBullets_feature_div li"):
        for el in pg.locator(sel).all():
            t = clean(el.inner_text())
            for key in ("原材料", "成分", "使用方法", "使い方", "ご注意", "注意", "内容量", "商品サイズ", "ブランド", "対象", "香り", "メーカー", "原産国"):
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
    import requests
    from PIL import Image
    r = requests.get(url, timeout=30, headers={"User-Agent": UA})
    r.raise_for_status()
    im = Image.open(io.BytesIO(r.content)).convert("RGB")
    w, h = im.size
    px = [im.getpixel((x, y)) for x in range(0, w, max(1, w // 20)) for y in (0, h - 1)] + [im.getpixel((x, y)) for y in range(0, h, max(1, h // 20)) for x in (0, w - 1)]
    if sum(1 for p in px if min(p) > 235) / len(px) < 0.5:
        return None
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    full = im.copy(); full.thumbnail((1200, 1200)); full.save(IMG_DIR / f"{slug}.jpg", "JPEG", quality=88)
    th = Image.new("RGB", (300, 300), "white"); t = im.copy(); t.thumbnail((300, 300)); th.paste(t, ((300 - t.width) // 2, (300 - t.height) // 2))
    th.save(IMG_DIR / f"{slug}-300x300.jpg", "JPEG", quality=88)
    return f"{WEB_DIR}/{slug}.jpg"


def queries(p):
    """Japanese name first; then the name without slashes/parentheses; then the Latin brand words of the Vietnamese name."""
    out = []
    ja = (p.get("nameJa") or "").strip()
    if ja:
        out.append(ja)
        simple = re.sub(r"[（(].*?[）)]", " ", ja).replace("／", " ").replace("/", " ")
        simple = re.sub(r"\s+", " ", simple).strip()
        if simple and simple != ja:
            out.append(simple)
    latin = " ".join(w for w in re.findall(r"[A-Za-z][A-Za-z0-9\-\.]+", p["name"]) if len(w) > 2)
    if latin and latin.lower() not in {q.lower() for q in out}:
        out.append(latin)
    return out[:3]


from playwright.sync_api import sync_playwright

with sync_playwright() as pw:
    b = pw.chromium.launch()
    ctx = b.new_context(locale="ja-JP", user_agent=UA, viewport={"width": 1280, "height": 900})
    pg = ctx.new_page()
    done = 0
    for i, p in enumerate(todo, 1):
        best, used_q, cands = None, "", []
        try:
            for q in queries(p):
                ranked = rank(search(pg, q), q if q == (p.get("nameJa") or "").strip() else (p.get("nameJa") or q))
                if ranked:
                    best, used_q, cands = ranked[0], q, [{"asin": it["asin"], "title": it["title"][:120], "score": s, "missing": it.get("missing", [])} for s, it in ranked[:4]]
                    if best[0] >= 0:
                        break
        except Exception as e:  # noqa: BLE001
            print(f"[{i}/{len(todo)}] #{p['id']} SEARCH ERROR {str(e)[:80]}", flush=True)
            continue
        if not best:
            print(f"[{i}/{len(todo)}] #{p['id']} no result  {p['name'][:50]}", flush=True)
            existing.setdefault(str(p["id"]), {}).update({"slug": p["slug"], "name": p["name"], "matchedBy": "none", "query": used_q})
            continue
        score, it = best
        weak = score < 0 or bool(it.get("missing")) or (not size_tokens(p.get("nameJa") or "") and score < 3)
        if args.dry:
            print(f"[{i}/{len(todo)}] #{p['id']} {'WEAK ' if weak else ''}{it['asin']} s={score} q={used_q[:30]} → {it['title'][:60]}", flush=True)
            continue
        try:
            data = read_product(pg, it["asin"])
        except Exception as e:  # noqa: BLE001
            print(f"[{i}/{len(todo)}] #{p['id']} READ ERROR {str(e)[:80]}", flush=True)
            continue
        data.update({"slug": p["slug"], "name": p["name"], "matchedBy": "search", "query": used_q, "candidates": cands, "weak": weak, "imageSaved": None})
        old = existing.get(str(p["id"]))
        if old and old.get("asin") and old.get("asin") != data["asin"]:
            data["previous"] = {k: old.get(k) for k in ("asin", "url", "title")}
        if not p.get("images") and data["image"]:
            try:
                data["imageSaved"] = save_image(p["slug"], data["image"])
            except Exception as e:  # noqa: BLE001
                data["imageError"] = str(e)[:80]
        existing[str(p["id"])] = data
        done += 1
        print(f"[{i}/{len(todo)}] #{p['id']} {'WEAK ' if weak else ''}{data['asin']} s={score} bullets={len(data['bullets'])} desc={len(data['description'])} {data['title'][:55]}", flush=True)
        if done % 10 == 0:
            OUT.write_text(json.dumps(existing, ensure_ascii=False, indent=1), encoding="utf-8")
        time.sleep(0.8)
    b.close()
if not args.dry:
    OUT.write_text(json.dumps(existing, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"saved {len(existing)} entries → {OUT}")
