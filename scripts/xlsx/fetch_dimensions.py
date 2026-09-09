"""
Harvest weight (g) and package dimensions (cm, LxWxH) for the catalogue.

Sources, in order:
  1. Amazon.co.jp product page (products whose supplierUrl points to amazon.co.jp): the detail table rows
     「梱包サイズ」/「商品の寸法」/「商品サイズ」 and 「商品の重量」/「梱包重量」/「内容量」.
  2. Heuristic from the size token in the product name (500ml, 250g, 60粒 …) when Amazon has no data
     or the product has no Amazon link: liquids/creams ≈ ml×1.15 + 30 g packaging; tablets ≈ 0.5 g × count + 40 g.

Writes a JSON report (docs/reports/dimensions-<date>.json + .html) and, with --apply, fills weightG / dimsCm
into data/seed.json only where they are still empty (updatedAt is NOT bumped: the server merges these columns
even for products edited later on prod — see importCatalogue in src/lib/sqlite.ts).

Usage (poetry env with playwright):
  python scripts/xlsx/fetch_dimensions.py            # dry run, report only
  python scripts/xlsx/fetch_dimensions.py --apply    # also patch data/seed.json
  python scripts/xlsx/fetch_dimensions.py --limit 20 --no-amazon
"""
import argparse, datetime, html, json, re, time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SEED = ROOT / "data" / "seed.json"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36"

ap = argparse.ArgumentParser()
ap.add_argument("--apply", action="store_true")
ap.add_argument("--limit", type=int, default=0)
ap.add_argument("--no-amazon", action="store_true")
ap.add_argument("--force", action="store_true", help="also re-process products that already have weight and dims")
ap.add_argument("--only", help="comma-separated product ids")
ap.add_argument("--min-id", type=int, default=0, help="only products with id >= this")
ap.add_argument("--jp-names", help="JSON {slug: {jp: \"日本語名\"}} → search Amazon.co.jp by Japanese name when there is no product link")
args = ap.parse_args()

SIZE = re.compile(r"(\d+(?:[.,]\d+)?)\s?(ml|mL|ML|l|L|g|G|kg|KG|錠|粒|viên|包|袋|枚|本|回分|カプセル|gói|miếng|tờ|cái|日分|個)(?![a-zA-Z])")
DIM = re.compile(r"(\d+(?:\.\d+)?)\s*[x×✕]\s*(\d+(?:\.\d+)?)\s*[x×✕]\s*(\d+(?:\.\d+)?)\s*(cm|mm|センチ)?", re.I)
WEIGHT = re.compile(r"(\d+(?:[.,]\d+)?)\s*(kg|g|キログラム|グラム)\b", re.I)


def parse_dims(text):
    m = DIM.search(text or "")
    if not m:
        return None
    a, b, c = (float(m.group(i)) for i in (1, 2, 3))
    unit = (m.group(4) or "cm").lower()
    if unit == "mm":
        a, b, c = a / 10, b / 10, c / 10
    vals = sorted([a, b, c], reverse=True)
    if vals[0] > 120 or vals[2] <= 0:
        return None
    return "x".join(f"{v:g}" for v in vals)


def parse_weight(text):
    m = WEIGHT.search((text or "").replace(",", "."))
    if not m:
        return None
    v = float(m.group(1))
    unit = m.group(2).lower()
    g = v * 1000 if unit in ("kg", "キログラム") else v
    return int(round(g)) if 1 <= g <= 30000 else None


def heuristic(name):
    """Gross weight guess from the largest pack-size token in the product name."""
    best = None
    for m in SIZE.finditer(name or ""):
        qty = float(m.group(1).replace(",", "."))
        unit = m.group(2).lower()
        if unit in ("l",):
            qty, unit = qty * 1000, "ml"
        if unit == "kg":
            qty, unit = qty * 1000, "g"
        if unit == "ml":
            g = qty * 1.15 + 30
        elif unit == "g":
            g = qty * 1.1 + 25
        elif unit in ("錠", "粒", "viên", "カプセル"):
            g = qty * 0.5 + 40
        elif unit in ("包", "袋", "gói"):
            g = qty * 8 + 30
        elif unit in ("枚", "miếng", "tờ"):
            g = qty * 6 + 30
        elif unit in ("本", "個", "cái"):
            g = qty * 120
        else:
            continue
        # "×N" multi-pack right after the token
        tail = name[m.end(): m.end() + 6]
        mm = re.match(r"\s?[x×]\s?(\d+)", tail)
        if mm:
            g *= int(mm.group(1))
        if best is None or g > best:
            best = g
    # the catalogue is cosmetics / supplements / food: anything above 3 kg from the name is a claim ("giảm 12kg"), not a pack
    return int(round(best)) if best and best <= 3000 else None


def amazon(pg, url):
    pg.goto(url, wait_until="domcontentloaded", timeout=60000)
    pg.wait_for_timeout(1500)
    rows = {}
    for sel in ("#productDetails_techSpec_section_1 tr", "#productDetails_detailBullets_sections1 tr", "#detailBullets_feature_div li", "#prodDetails tr"):
        for el in pg.locator(sel).all():
            t = re.sub(r"\s+", " ", el.inner_text()).strip()
            if ":" in t or "：" in t:
                k, v = re.split(r"[:：]", t, 1)
                rows[k.strip().replace("‎", "").replace("‏", "")] = v.strip().replace("‎", "").replace("‏", "")
            else:
                cells = [re.sub(r"\s+", " ", c.inner_text()).strip() for c in el.locator("th, td").all()]
                if len(cells) >= 2:
                    rows[cells[0].replace("‎", "")] = cells[1].replace("‎", "")
    dims = weight = None
    for k in ("梱包サイズ", "商品の寸法", "商品サイズ", "製品サイズ", "サイズ", "Package Dimensions", "Product Dimensions"):
        for rk, rv in rows.items():
            if k in rk:
                dims = dims or parse_dims(rv)
                weight = weight or parse_weight(rv.split(";")[-1] if ";" in rv else "")
    for k in ("商品の重量", "梱包重量", "内容量", "重量", "Item Weight"):
        for rk, rv in rows.items():
            if k in rk and weight is None:
                weight = parse_weight(rv)
    return dims, weight, rows


SIZE_TOK = re.compile(r"(\d+(?:\.\d+)?)\s?(ml|mL|g|kg|錠|粒|包|袋|枚|本|カプセル|個|日分)", re.I)
def size_tokens(text):
    t = (text or "").translate(str.maketrans("０１２３４５６７８９", "0123456789"))
    return {(m.group(1), m.group(2).lower()) for m in SIZE_TOK.finditer(t)}

def amazon_search(pg, jp_name):
    """Top organic result whose title shares a pack-size token with the Japanese name (or the first one). Returns (asin, title)."""
    from urllib.parse import quote
    pg.goto(f"https://www.amazon.co.jp/s?k={quote(jp_name)}", wait_until="domcontentloaded", timeout=60000)
    pg.wait_for_timeout(1800)
    items = pg.eval_on_selector_all("div.s-result-item[data-asin]:not([data-asin=''])", """els => els.slice(0, 10).map(e => ({
        asin: e.getAttribute('data-asin'), title: (e.querySelector('h2')?.innerText || '').trim(),
        sponsored: !!e.querySelector('[aria-label*="スポンサー"], .puis-sponsored-label-text, .s-sponsored-label-text')}))""")
    items = [i for i in items if i["title"] and not i["sponsored"]]
    if not items:
        return None
    want = size_tokens(jp_name)
    for it in items:
        if want and want & size_tokens(it["title"]):
            return it["asin"], it["title"], True
    return items[0]["asin"], items[0]["title"], False

seed = json.loads(SEED.read_text(encoding="utf-8"))
products = seed["products"]
only = {int(x) for x in args.only.split(",")} if args.only else None
todo = [p for p in products if (args.force or not (p.get("weightG") and p.get("dimsCm"))) and (only is None or p["id"] in only) and p["id"] >= args.min_id]
jp_names = json.loads(Path(args.jp_names).read_text(encoding="utf-8")) if args.jp_names else {}
if args.limit:
    todo = todo[: args.limit]
print(f"{len(todo)} product(s) to process", flush=True)

results = []
pg = browser = None
if not args.no_amazon:
    from playwright.sync_api import sync_playwright

    pw = sync_playwright().start()
    browser = pw.chromium.launch()
    ctx = browser.new_context(locale="ja-JP", user_agent=UA, viewport={"width": 1280, "height": 900})
    pg = ctx.new_page()

for i, p in enumerate(todo, 1):
    url = p.get("supplierUrl") or ""
    dims = weight = None
    source = ""
    err = ""
    matched_title = ""
    if pg is not None and "amazon.co.jp" in url:
        try:
            dims, weight, rows = amazon(pg, url)
            if dims or weight:
                source = "amazon"
        except Exception as e:  # noqa: BLE001
            err = str(e)[:120]
    elif pg is not None and jp_names.get(p["slug"], {}).get("jp"):
        try:
            hit = amazon_search(pg, jp_names[p["slug"]]["jp"])
            if hit:
                asin, matched_title, sized = hit
                dims, weight, rows = amazon(pg, f"https://www.amazon.co.jp/dp/{asin}")
                if dims or weight:
                    source = "amazon-search" + ("" if sized else "-loose")
                    matched_title = f"{matched_title[:70]} ({asin})"
        except Exception as e:  # noqa: BLE001
            err = str(e)[:120]
    if dims and eval(dims.replace("x", "*")) < 10:  # "1x1x1" placeholders
        dims = None
    if weight is not None and not 15 <= weight <= 5000:  # per-bag grams or a unit slip on Amazon
        weight = None
    if not dims and weight is None:
        source = ""
    if weight is None:
        weight = heuristic(p["name"])
        if weight:
            source = source + "+heuristic" if source else "heuristic"
    results.append({"id": p["id"], "slug": p["slug"], "name": p["name"], "url": url, "weightG": weight, "dimsCm": dims, "source": source, "error": err,
                    "matched": matched_title, "hadWeight": p.get("weightG"), "hadDims": p.get("dimsCm")})
    print(f"[{i}/{len(todo)}] #{p['id']} {source or '-':>18} w={weight} d={dims} {p['name'][:50]}", flush=True)
    if pg is not None and ("amazon.co.jp" in url or matched_title):
        time.sleep(1.2)

if browser:
    browser.close()
    pw.stop()

# ---- report
day = datetime.date.today().isoformat()
rep_dir = ROOT / "docs" / "reports"
rep_dir.mkdir(parents=True, exist_ok=True)
(rep_dir / f"dimensions-{day}.json").write_text(json.dumps(results, ensure_ascii=False, indent=1), encoding="utf-8")
rows_html = "\n".join(
    f"<tr><td>{r['id']}</td><td>{html.escape(r['name'])}</td><td>{r['weightG'] or ''}</td><td>{r['dimsCm'] or ''}</td>"
    f"<td class='{'am' if r['source'].startswith('amazon') else 'he' if r['source'] else 'no'}'>{r['source'] or 'không có'}</td>"
    f"<td>{'<a href=\"' + html.escape(r['url']) + '\">link</a>' if r['url'] else ''}</td><td>{html.escape(r['error'])}</td></tr>"
    for r in results
)
n_am = sum(1 for r in results if r["source"].startswith("amazon"))
n_he = sum(1 for r in results if r["source"] == "heuristic")
n_no = sum(1 for r in results if not r["source"])
(rep_dir / f"dimensions-{day}.html").write_text(
    f"""<!doctype html><meta charset="utf-8"><title>Khối lượng & kích thước – {day}</title>
<style>body{{font:14px system-ui;margin:24px}}table{{border-collapse:collapse}}td,th{{border:1px solid #ddd;padding:4px 8px}}.am{{background:#dcfce7}}.he{{background:#fef9c3}}.no{{background:#fee2e2}}</style>
<h1>Khối lượng &amp; kích thước sản phẩm ({day})</h1>
<p>Amazon: <b>{n_am}</b> · ước lượng theo tên: <b>{n_he}</b> · không có: <b>{n_no}</b>. Ước lượng = trọng lượng đóng gói gần đúng, dùng để tính phí /kg; sửa lại trong Admin › Sản phẩm nếu cần.</p>
<table><tr><th>ID</th><th>Sản phẩm</th><th>Khối lượng (g)</th><th>Kích thước (cm)</th><th>Nguồn</th><th>URL</th><th>Lỗi</th></tr>{rows_html}</table>""",
    encoding="utf-8",
)
print(f"amazon={n_am} heuristic={n_he} none={n_no} → docs/reports/dimensions-{day}.html")

if args.apply:
    by_id = {r["id"]: r for r in results}
    changed = 0
    for p in products:
        r = by_id.get(p["id"])
        if not r:
            continue
        if not p.get("weightG") and r["weightG"]:
            p["weightG"] = r["weightG"]
            changed += 1
        if not p.get("dimsCm") and r["dimsCm"]:
            p["dimsCm"] = r["dimsCm"]
            changed += 1
        if (r["weightG"] or r["dimsCm"]) and not p.get("dimsConfidence"):
            src = r["source"]
            p["dimsConfidence"] = "high" if src == "amazon" else "medium" if src.startswith("amazon-search") and src != "amazon-search-loose" else "low"
            p["dimsSource"] = ("Amazon.co.jp (trang sản phẩm đã liên kết)" if src == "amazon" else f"Amazon JP tìm theo tên Nhật: {r['matched']}" if src.startswith("amazon-search") else "Ước lượng từ cỡ gói trong tên sản phẩm")[:300]
    seed.setdefault("meta", {})["seededAt"] = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    SEED.write_text(json.dumps(seed, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"applied {changed} field(s) to data/seed.json (meta.seededAt bumped)")
