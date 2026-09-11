"""Japanese retail price (¥) for every product → data/prices.json  {productId: {jpy, source, url, title, checkedAt}}.

    python scripts/xlsx/fetch_prices.py                # Amazon.co.jp page of the matched ASIN (data/ja-source.json), Rakuten fallback
    python scripts/xlsx/fetch_prices.py --only 173,250 # a few products
    python scripts/xlsx/fetch_prices.py --retry        # re-try products that failed last time

The result is merged into data/seed.json (costJpy / costSource / costUrl) by apply_prices.py, and the app converts it to VND with the
DCOM rate every night (Kho hàng › Công thức giá).
Requires: playwright (pip install playwright && playwright install chromium)
"""
import argparse, json, os, re, sys, time
from datetime import datetime, timezone
from urllib.parse import quote
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SEED = os.path.join(ROOT, "data", "seed.json")
JA = os.path.join(ROOT, "data", "ja-source.json")
OUT = os.path.join(ROOT, "data", "prices.json")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36"

ap = argparse.ArgumentParser()
ap.add_argument("--only")
ap.add_argument("--retry", action="store_true")
ap.add_argument("--limit", type=int, default=0)
args = ap.parse_args()

seed = json.load(open(SEED, encoding="utf-8"))
products = seed["products"]
ja = json.load(open(JA, encoding="utf-8"))
prices = json.load(open(OUT, encoding="utf-8")) if os.path.exists(OUT) else {}
only = {int(x) for x in args.only.split(",")} if args.only else None


def yen(s):
    m = re.search(r"([\d,]{2,})", (s or "").replace("￥", "").replace("¥", ""))
    v = int(m.group(1).replace(",", "")) if m else None
    return v if v and 50 <= v <= 500000 else None


def amazon_price(pg, url):
    pg.goto(url, wait_until="domcontentloaded", timeout=60000)
    pg.wait_for_timeout(1500)
    if pg.locator("form[action*='validateCaptcha']").count():
        raise RuntimeError("captcha")
    title = pg.locator("#productTitle").first.inner_text().strip() if pg.locator("#productTitle").count() else ""
    for sel in ("#corePrice_feature_div .a-price .a-offscreen", "#corePriceDisplay_desktop_feature_div .a-price .a-offscreen", "#apex_desktop .a-price .a-offscreen", "#price_inside_buybox", "#priceblock_ourprice", ".a-price .a-offscreen"):
        loc = pg.locator(sel).first
        if loc.count():
            v = yen(loc.inner_text())
            if v:
                return v, title
    # unavailable listing: try the "other sellers" price
    loc = pg.locator("#aod-price-0 .a-offscreen, .olp-text-box .a-color-price").first
    if loc.count():
        v = yen(loc.inner_text())
        if v:
            return v, title
    return None, title


def rakuten_price(pg, name):
    pg.goto(f"https://search.rakuten.co.jp/search/mall/{quote(name)}/", wait_until="domcontentloaded", timeout=60000)
    pg.wait_for_timeout(1500)
    items = pg.eval_on_selector_all(".searchresultitem", """els => els.slice(0, 8).map(e => ({
        title: (e.querySelector('.title, h2')?.innerText || '').trim(),
        price: (e.querySelector('.price--OX_YW, .price, [class*="price"]')?.innerText || ''),
        url: e.querySelector('a[href*="item.rakuten.co.jp"]')?.href || ''
    }))""")
    for it in items:
        v = yen(it["price"])
        if v and it["url"] and not re.search(r"(セット|まとめ買い|\d+個セット|[×x]\s?\d+(?!\d)(?!\s?(包|袋|錠|粒|g|ml|枚)))", it["title"], re.I):
            return v, it["title"], it["url"]
    return None, "", ""


todo = []
for p in products:
    pid = int(p["id"])
    if only and pid not in only:
        continue
    prev = prices.get(str(pid))
    if prev and prev.get("jpy") and not only:
        continue
    if prev and not prev.get("jpy") and not args.retry and not only:
        continue
    todo.append(p)
if args.limit:
    todo = todo[: args.limit]
print(f"{len(todo)} products to fetch", flush=True)

done = 0
with sync_playwright() as pw:
    browser = pw.chromium.launch()
    ctx = browser.new_context(user_agent=UA, locale="ja-JP", viewport={"width": 1280, "height": 900})
    pg = ctx.new_page()
    for p in todo:
        pid = str(p["id"])
        name_ja = p.get("nameJa") or ""
        src = ja.get(pid) or {}
        url = src.get("url") or (f"https://www.amazon.co.jp/dp/{src['asin']}" if src.get("asin") else "") or (p.get("supplierUrl") if "amazon.co.jp" in (p.get("supplierUrl") or "") else "")
        rec = {"jpy": None, "source": "", "url": "", "title": "", "checkedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"), "weak": bool(src.get("weak"))}
        try:
            if url:
                v, title = amazon_price(pg, url)
                if v:
                    rec.update(jpy=v, source="amazon", url=url, title=title)
            if not rec["jpy"] and (name_ja or src.get("title")):
                v, title, rurl = rakuten_price(pg, src.get("title") or name_ja)
                if v:
                    rec.update(jpy=v, source="rakuten", url=rurl, title=title)
            if not rec["jpy"]:
                rec["error"] = "no price"
        except Exception as e:  # noqa: BLE001
            rec["error"] = str(e)[:200]
            if "captcha" in str(e):
                print("captcha — cooling down 90 s", flush=True)
                time.sleep(90)
        prices[pid] = rec
        done += 1
        print(f"[{done}/{len(todo)}] #{pid} {p['name'][:40]!r} → {rec['jpy']} {rec['source']} {rec.get('error', '')}", flush=True)
        json.dump(prices, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        time.sleep(1.2)
    browser.close()

ok = sum(1 for v in prices.values() if v.get("jpy"))
print(f"done: {ok}/{len(prices)} priced")
