"""Give every product a white-background "packshot" as its main image, keeping the existing photos behind it.

    python scripts/xlsx/fetch_packshots.py                 # dry run: classify + look up, write the review page only
    python scripts/xlsx/fetch_packshots.py --apply         # also update data/seed.json (bumps meta.seededAt)
    python scripts/xlsx/fetch_packshots.py --only slug1,slug2 --apply

How it decides (most to least confident):
  1. reorder   – a white-background image already exists further down the gallery → move it to the front.
  2. supplier  – product has an Amazon.co.jp link (supplierUrl, verified earlier) → take that page's main image.
  3. search    – Amazon.co.jp search by name; accepted only when a brand token from the name appears in the title
                 AND the pack size matches (or the name has no size). Otherwise the product is left for manual work.
Every candidate is downloaded and re-checked to really be a white-background image before it is used.
Files go to public/sites/lienstore/shared/products/packshot/<slug>.jpg (+ -300x300.jpg); the review page lists old vs new.
"""
import argparse, json, os, re, sys, time, io
from datetime import datetime, timezone
from urllib.parse import quote
import requests
from PIL import Image, ImageChops
from playwright.sync_api import sync_playwright

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SEED = os.path.join(REPO, "data", "seed.json")
IMG_DIR = os.path.join(REPO, "public", "sites", "lienstore", "shared", "products", "packshot")
WEB_DIR = "/sites/lienstore/shared/products/packshot"
REPORT_DIR = os.path.join(REPO, "docs", "reports")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36"
SIZE = re.compile(r"(\d+(?:\.\d+)?)\s?(ml|mL|ML|g|G|gr|kg|錠|粒|カプセル|包|袋|個|本|枚|回分|日分|viên|vien|miếng|mieng|gói|goi|túi|tui|chai|lọ|lo|tuýp|tuyp|ngày|ngay)")
BUNDLE = re.compile(r"(セット|まとめ買い|\d+\s?(個|本|袋|箱)セット|[×x]\s?\d+(?!\d)(?!\s?(包|袋|錠|粒|g|ml|mL|枚|回|カプセル|本入|個入)))", re.I)
UNIT_FAMILY = {"ml": "vol", "g": "vol", "gr": "vol", "kg": "vol", "錠": "cnt", "粒": "cnt", "カプセル": "cnt", "包": "pack", "袋": "pack", "個": "pack",
               "本": "pack", "枚": "pack", "回分": "pack", "日分": "days",
               "viên": "cnt", "vien": "cnt", "miếng": "pack", "mieng": "pack", "gói": "pack", "goi": "pack", "túi": "pack", "tui": "pack",
               "chai": "pack", "lọ": "pack", "lo": "pack", "tuýp": "pack", "tuyp": "pack", "ngày": "days", "ngay": "days"}
GENERIC = set("""vien uong vien uống viên uống nuoc nước kem sua sữa bot bột tinh chat chất serum dau dầu gội xả tắm rửa mặt mat mask nhật bản nhat ban
japan combo hộp hop gói goi chai lọ tuýp túi bịch cho be bé mẹ trẻ em men women nam nu nữ dưỡng duong trắng trang da hỗ trợ ho tro bổ bo gan
xương khớp giảm cân giam can làm lam sạch sach chống chong nắng nang mụn mun tóc toc set bộ mini loại loai type new hot sale plus extra premium
gold white pure super fresh care skin beauty body hand foot face eye lip hair""".split())


def log(*a):
    print(*a, flush=True)


def size_tokens(name):
    text = (name or "").translate(str.maketrans("０１２３４５６７８９ｍｌｇ", "0123456789mlg"))
    out = set()
    for a, b in SIZE.findall(text):
        out.add((a[:-2] if a.endswith(".0") else a, UNIT_FAMILY.get(b.lower(), b.lower())))
    return out


def brand_tokens(name):
    """ASCII words (≥4 letters) or Japanese/katakana runs that are not generic shop words."""
    toks = set()
    for w in re.findall(r"[A-Za-z][A-Za-z0-9\-']{3,}", name or ""):
        if w.lower() not in GENERIC:
            toks.add(w.lower())
    for w in re.findall(r"[゠-ヿ一-鿿]{2,}", name or ""):
        toks.add(w)
    return toks


# ---------- white background check ----------
def is_white_bg(im):
    """True for a white-background packshot.

    * Letterboxed thumbnails (a photo pasted onto a white 300x300 canvas) are rejected: the non-white content is a
      full rectangle whose opposite edges are solid, surrounded by white bands.
    * Otherwise the four corner squares and the outer 2-px frame must be (almost) pure white — Amazon-style packshots
      keep a white margin even when the product is cropped tightly.
    Prefer calling this with the full-size image; the padded thumb is only a fallback.
    """
    im = im.convert("RGB").copy()
    im.thumbnail((300, 300))
    w, h = im.size

    def is_w(q):
        r, g, b = q
        return r > 243 and g > 243 and b > 243 and max(r, g, b) - min(r, g, b) < 12

    bbox = ImageChops.difference(im, Image.new("RGB", im.size, (255, 255, 255))).convert("L").point(lambda v: 255 if v > 14 else 0).getbbox()
    if not bbox:
        return False
    x0, y0, x1, y1 = bbox
    if x1 - x0 < 20 or y1 - y0 < 20:
        return False
    content = im.crop(bbox)
    cw, ch = content.size
    solid = lambda px: sum(1 for q in px if not is_w(q)) / len(px) > 0.85  # noqa: E731
    top = solid([content.getpixel((x, 0)) for x in range(cw)])
    bottom = solid([content.getpixel((x, ch - 1)) for x in range(cw)])
    left = solid([content.getpixel((0, y)) for y in range(ch)])
    right = solid([content.getpixel((cw - 1, y)) for y in range(ch)])
    band_v = (y0 + (h - y1)) / h
    band_h = (x0 + (w - x1)) / w
    if (top and bottom and band_v > 0.06) or (left and right and band_h > 0.06):
        return False  # a rectangular photo padded with white

    c = max(4, min(w, h) // 10)
    corners = []
    for xs, ys in ((range(0, c), range(0, c)), (range(w - c, w), range(0, c)), (range(0, c), range(h - c, h)), (range(w - c, w), range(h - c, h))):
        px = [im.getpixel((x, y)) for x in xs for y in ys]
        corners.append(sum(1 for q in px if is_w(q)) / len(px))
    frame = [im.getpixel((x, y)) for y in range(h) for x in range(w) if x < 2 or y < 2 or x >= w - 2 or y >= h - 2]
    frame_ratio = sum(1 for q in frame if is_w(q)) / len(frame)
    white_corners = sum(1 for r in corners if r >= 0.9)
    # 3 clean corners, or a tight crop where the product reaches two corners but the rest of the frame is white
    return (white_corners >= 3 and frame_ratio >= 0.85) or (white_corners >= 2 and frame_ratio >= 0.75) or frame_ratio >= 0.93


def local_abs(url):
    if not url or not url.startswith("/"):
        return None
    p = os.path.join(REPO, "public", *url.lstrip("/").split("/"))
    return p if os.path.exists(p) else None


def local_is_white(url):
    p = local_abs(url)
    if not p:
        return False
    try:
        return is_white_bg(Image.open(p))
    except Exception:
        return False


# ---------- Amazon ----------
def search(pg, q):
    pg.goto(f"https://www.amazon.co.jp/s?k={quote(q)}", wait_until="domcontentloaded", timeout=60000)
    pg.wait_for_timeout(1800)
    items = pg.eval_on_selector_all("div.s-result-item[data-asin]:not([data-asin=''])", """els => els.slice(0, 10).map(e => ({
        asin: e.getAttribute('data-asin'),
        title: (e.querySelector('h2')?.innerText || '').trim(),
        img: e.querySelector('img.s-image')?.src || '',
        sponsored: !!e.querySelector('[aria-label*="スポンサー"], .puis-sponsored-label-text, .s-sponsored-label-text')
    }))""")
    return [it for it in items if it["title"] and not it["sponsored"]]


def product_image(pg, asin):
    pg.goto(f"https://www.amazon.co.jp/dp/{asin}", wait_until="domcontentloaded", timeout=60000)
    pg.wait_for_timeout(1800)
    title = pg.locator("#productTitle").first.inner_text().strip() if pg.locator("#productTitle").count() else pg.title()
    img = ""
    for sel in ("#landingImage", "#imgTagWrapperId img", "#main-image"):
        loc = pg.locator(sel).first
        if loc.count():
            img = loc.get_attribute("data-old-hires") or loc.get_attribute("src") or ""
            break
    return title, big(img)


def big(url):
    return re.sub(r"\._[A-Z0-9_,]+_\.", ".", url or "")


def pick_search(cands, name):
    """Return (candidate, reason) or (None, reason) — strict: brand token in title + compatible size."""
    toks = size_tokens(name)
    brands = brand_tokens(name)
    if not brands:
        return None, "no brand token in name"
    want_bundle = bool(BUNDLE.search(name))
    for it in cands:
        t = it["title"]
        tl = t.lower()
        if not want_bundle and BUNDLE.search(t):
            continue
        if not any(b in tl for b in brands):
            continue
        if toks and not (toks & size_tokens(t)):
            continue
        return it, "brand+size match" if toks else "brand match (no size in name)"
    return None, "no candidate with brand" + (" + size" if toks else "")


def brand_query(name):
    """Short query for the 2nd pass: ASCII brand words in their original order + the first pack size (JP unit)."""
    words = [w for w in re.findall(r"[A-Za-z][A-Za-z0-9\-']{2,}", name or "") if w.lower() not in GENERIC and len(w) >= 3]
    seen = []
    for w in words:
        if w.lower() not in [x.lower() for x in seen]:
            seen.append(w)
    if not seen:
        return ""
    jp_unit = {"cnt": "粒", "vol": "", "pack": "", "days": "日分"}
    size = ""
    for num, fam in sorted(size_tokens(name)):
        if fam == "vol":
            m = re.search(rf"{re.escape(num)}\s?(ml|mL|ML|g|G|gr|kg)", name)
            size = f"{num}{(m.group(1).lower() if m else '')}"
        else:
            size = f"{num}{jp_unit.get(fam, '')}"
        break
    return " ".join(seen[:4]) + (f" {size}" if size else "")


# ---------- files ----------
def frame_white_ratio(im):
    """Share of (almost) white pixels in the outer 2-px frame — a loose background check."""
    im = im.convert("RGB").copy()
    im.thumbnail((300, 300))
    w, h = im.size
    fr = [im.getpixel((x, y)) for y in range(h) for x in range(w) if x < 2 or y < 2 or x >= w - 2 or y >= h - 2]
    return sum(1 for r, g, b in fr if r > 240 and g > 240 and b > 240) / len(fr)


def save_packshot(slug, data, lenient=False):
    """Store full + 300x300 thumb. Amazon main images are white-background by marketplace rule, so for them
    (`lenient`) only clearly non-white backgrounds are rejected — boxes that fill the frame would otherwise fail."""
    os.makedirs(os.path.join(IMG_DIR, os.path.dirname(slug)) if "/" in slug else IMG_DIR, exist_ok=True)
    im = Image.open(io.BytesIO(data)).convert("RGB")
    if not is_white_bg(im) and not (lenient and frame_white_ratio(im) >= 0.35):
        return None
    full = im.copy()
    full.thumbnail((1200, 1200))
    fp = os.path.join(IMG_DIR, f"{slug}.jpg")
    full.save(fp, "JPEG", quality=88)
    th = Image.new("RGB", (300, 300), "white")
    t = im.copy()
    t.thumbnail((300, 300))
    th.paste(t, ((300 - t.width) // 2, (300 - t.height) // 2))
    th.save(os.path.join(IMG_DIR, f"{slug}-300x300.jpg"), "JPEG", quality=88)
    return f"{WEB_DIR}/{slug}.jpg", f"{WEB_DIR}/{slug}-300x300.jpg"


def thumb_for(url):
    """Existing -300x300 sibling of a gallery image, else the image itself."""
    m = re.match(r"^(.*)(\.[a-zA-Z]+)$", url)
    if m:
        cand = f"{m.group(1)}-300x300{m.group(2)}"
        if local_abs(cand):
            return cand
    return url


def write_review(rows, stamp=None):
    """Render docs/reports/packshots-review-<stamp>.html (+ .json) from result rows."""
    os.makedirs(REPORT_DIR, exist_ok=True)
    stamp = stamp or datetime.now().strftime("%Y-%m-%d")
    changed = sum(1 for r in rows if r["new"] and r["confidence"] in ("high", "medium"))
    rp = os.path.join(REPORT_DIR, f"packshots-review-{stamp}.html")
    base = "http://localhost:3000"
    def cell(u):
        return f'<img src="{base}{u}" loading="lazy">' if u else "<em>—</em>"
    trs = "\n".join(
        f'<tr class="{r["confidence"]}"><td>{i+1}</td><td>{cell(r["old"])}</td><td>{cell(r["new"])}</td>'
        f'<td><b>{r["name"]}</b><br><small>{r["slug"]}</small><br><small>{r["amazon_title"][:120]}</small></td>'
        f'<td>{r["source"]}</td><td>{r["confidence"]}</td><td>{r["note"]}</td></tr>'
        for i, r in enumerate(rows)
    )
    html = f"""<!doctype html><meta charset="utf-8"><title>Packshot review {stamp}</title>
    <style>body{{font:13px/1.4 system-ui;margin:20px}} table{{border-collapse:collapse;width:100%}} td,th{{border:1px solid #ddd;padding:6px;vertical-align:top}}
    img{{width:110px;height:110px;object-fit:contain;background:#fff;border:1px solid #eee}} tr.high td{{background:#f3fff3}} tr.medium td{{background:#fffbe6}} tr.candidate td{{background:#eef}} tr.- td{{background:#fff}}
    .legend span{{display:inline-block;padding:2px 8px;margin-right:8px;border:1px solid #ddd}}</style>
    <h1>Ảnh đại diện nền trắng — rà soát {stamp}</h1>
    <p>{len(rows)} sản phẩm chưa có ảnh nền trắng · <b>{changed}</b> đã đổi ({sum(1 for r in rows if r['confidence']=='high')} high, {sum(1 for r in rows if r['confidence']=='medium')} medium) · {sum(1 for r in rows if r['confidence']=='candidate')} candidate chờ duyệt · {sum(1 for r in rows if not r['new'])} chưa tìm được.
    Mở khi dev server đang chạy (ảnh lấy từ {base}). Ảnh cũ vẫn giữ trong gallery, đứng sau ảnh mới.</p>
    <p class="legend"><span style="background:#f3fff3">high: đảo thứ tự ảnh sẵn có hoặc lấy từ link Amazon đã xác minh</span><span style="background:#fffbe6">medium: tìm trên Amazon theo tên, khớp thương hiệu + quy cách — nên xem lại</span><span style="background:#eef">candidate: tìm được theo thương hiệu nhưng tên không có quy cách để đối chiếu — CHƯA áp dụng, duyệt tay rồi báo để áp dụng</span><span>—: chưa tìm được, cần làm tay</span></p>
    <table><tr><th>#</th><th>Ảnh cũ</th><th>Ảnh mới</th><th>Sản phẩm</th><th>Nguồn</th><th>Độ tin</th><th>Ghi chú</th></tr>{trs}</table>"""
    open(rp, "w", encoding="utf-8").write(html)
    json.dump(rows, open(os.path.join(REPORT_DIR, f"packshots-review-{stamp}.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    log(f"review: {rp}")
    return rp


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--only", default="", help="comma-separated slugs")
    ap.add_argument("--skip-search", action="store_true", help="only reorder + supplier pages")
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    seed = json.load(open(SEED, encoding="utf-8"))
    only = set(s.strip() for s in args.only.split(",") if s.strip())
    now = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    sess = requests.Session()
    sess.headers["User-Agent"] = UA
    rows = []
    changed = 0
    todo = []
    for p in seed["products"]:
        if only and p["slug"] not in only:
            continue
        gallery = [i for i in (p.get("images") or []) if i] or ([p.get("thumb")] if p.get("thumb") else [])
        if gallery and local_is_white(gallery[0]):
            continue  # already a packshot (judged on the full-size image, not the padded thumb)
        todo.append((p, gallery))
    if args.limit:
        todo = todo[: args.limit]
    log(f"{len(todo)} product(s) without a white-background main image")

    with sync_playwright() as pw:
        b = pw.chromium.launch()
        pg = b.new_context(locale="ja-JP", user_agent=UA, viewport={"width": 1280, "height": 900}).new_page()
        for n, (p, gallery) in enumerate(todo, 1):
            slug, name = p["slug"], p["name"]
            old_thumb = p.get("thumb") or (gallery[0] if gallery else "")
            row = {"slug": slug, "name": name, "old": old_thumb, "new": "", "source": "", "confidence": "", "note": "", "amazon_title": ""}
            try:
                # 1) reorder existing white image
                white = next((g for g in gallery[1:] if local_is_white(g)), None)
                if white:
                    new_thumb = thumb_for(white)
                    others = [g for g in (p.get("images") or []) if g != white and not g.endswith("-300x300" + os.path.splitext(g)[1])]
                    p["images"] = [white] + [g for g in others if g != new_thumb]
                    p["thumb"] = new_thumb
                    row.update(new=new_thumb, source="reorder", confidence="high", note="ảnh nền trắng đã có trong gallery, đưa lên đầu")
                    changed += 1
                else:
                    asin = None
                    src = ""
                    sup = p.get("supplierUrl") or ""
                    m = re.search(r"amazon\.co\.jp/(?:.*/)?dp/([A-Z0-9]{10})", sup)
                    if m:
                        asin, src, conf = m.group(1), "supplier", "high"
                    elif not args.skip_search:
                        cands = search(pg, name)
                        it, reason = pick_search(cands, name)
                        if not it:
                            q2 = brand_query(name)
                            if q2:
                                it, reason = pick_search(search(pg, q2), name)
                                if it:
                                    reason += f" (query: {q2})"
                                else:
                                    reason += f" (also tried: {q2})"
                        if it:
                            asin, src = it["asin"], "search"
                            conf = "medium" if reason == "brand+size match" else "candidate"
                            row["note"] = reason
                        else:
                            row.update(source="search", confidence="-", note=reason)
                    if asin:
                        title, img = product_image(pg, asin)
                        row["amazon_title"] = title
                        if img:
                            r = sess.get(img, timeout=30)
                            if conf == "candidate":
                                # brand matched but the name has no pack size to confirm → keep for manual review only
                                cand = save_packshot(f"candidates/{slug}", r.content, lenient=True) if r.ok else None
                                row.update(new=cand[1] if cand else "", source=src, confidence="candidate", note=row["note"] + f" · ASIN {asin} · CHƯA ÁP DỤNG, cần duyệt")
                                continue_row = True
                            else:
                                continue_row = False
                            saved = None if continue_row else (save_packshot(slug, r.content, lenient=True) if r.ok else None)
                            if continue_row:
                                pass
                            elif saved:
                                full, th = saved
                                old_imgs = [g for g in (p.get("images") or []) if g and not g.endswith("-300x300" + os.path.splitext(g)[1])]
                                p["images"] = [full] + old_imgs
                                p["thumb"] = th
                                if src == "search":
                                    p["supplierUrl"] = p.get("supplierUrl") or f"https://www.amazon.co.jp/dp/{asin}"
                                row.update(new=th, source=src, confidence=conf, note=(row["note"] + " · " if row["note"] else "") + f"ASIN {asin}")
                                changed += 1
                            else:
                                row.update(source=src, confidence="-", note=f"ảnh Amazon {asin} không phải nền trắng / tải lỗi")
                        else:
                            row.update(source=src, confidence="-", note=f"không lấy được ảnh từ {asin}")
                if row["new"]:
                    p["updatedAt"] = now
            except Exception as e:  # keep going
                row.update(confidence="-", note=f"lỗi: {str(e)[:120]}")
            rows.append(row)
            log(f"[{n}/{len(todo)}] {slug[:50]:50} {row['source']:8} {row['confidence']:6} {row['note'][:70]}")
            time.sleep(0.8)
        b.close()

    write_review(rows)

    if args.apply and changed:
        seed["meta"]["seededAt"] = now
        json.dump(seed, open(SEED, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        log(f"seed.json updated: {changed} product(s), seededAt={now}")
    elif changed:
        log("dry run — re-run with --apply to write seed.json (packshot files were saved already)")


if __name__ == "__main__":
    main()
