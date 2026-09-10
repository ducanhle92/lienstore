"""
Product-copy rewrite pipeline (Japanese first, then Vietnamese), driven by the maker/Amazon.co.jp material in
data/ja-source.json and reviewed/written by LLM agents in batches.

  python scripts/xlsx/content_batches.py make  <dir> [--size 15] [--ids 1,2,3]
      → <dir>/batch-NN.json  one file per batch: id, slug, name, nameJa, categories, sku, current VI text, source
  python scripts/xlsx/content_batches.py merge <dir> [--rev 2] [--report docs/reports/content-rewrite-YYYY-MM-DD.html]
      → validates <dir>/out-NN.json (agent output), applies "ok" products to data/seed.json, bumps meta.contentRev,
        writes an HTML review report (applied / mismatched / skipped).

Agent output format, one object per product (list):
  {"id": 173, "match": "ok" | "mismatch" | "nosource", "matchNote": "…", "sourceUrl": "https://…",
   "nameJa": "…", "shortDescriptionJa": "<p>…</p>", "descriptionJa": "<p>…</p><ul>…</ul>…",
   "shortDescription": "<p>…</p>", "description": "<p>…</p>…"}
"""
import argparse, datetime, html, json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SEED = ROOT / "data" / "seed.json"
SRC = ROOT / "data" / "ja-source.json"
ALLOWED_TAGS = {"p", "ul", "ol", "li", "strong", "em", "br", "b"}
# product ids whose saved Amazon picture is a fair illustration even though the listing is a generic/order item
ILLUSTRATION_OK = {2233}


def strip(h):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", h or "")).strip()


def make(d: Path, size: int, ids):
    seed = json.loads(SEED.read_text(encoding="utf-8"))
    src = json.loads(SRC.read_text(encoding="utf-8"))
    cats = {c["slug"]: c["name"] for c in seed["categories"]}
    products = [p for p in seed["products"] if not ids or p["id"] in ids]
    d.mkdir(parents=True, exist_ok=True)
    for f in d.glob("batch-*.json"):
        f.unlink()
    n = 0
    for i in range(0, len(products), size):
        n += 1
        rows = []
        for p in products[i : i + size]:
            s = src.get(str(p["id"])) or {}
            rows.append(
                {
                    "id": p["id"],
                    "slug": p["slug"],
                    "name": p["name"],
                    "nameJa": p.get("nameJa") or "",
                    "sku": p.get("sku"),
                    "categories": [cats.get(c, c) for c in p["categories"]],
                    "supplierUrl": p.get("supplierUrl") or "",
                    "currentVi": strip(p.get("description"))[:1800],
                    "currentJa": strip(p.get("descriptionJa"))[:600],
                    "source": {
                        "url": s.get("url", ""),
                        "title": s.get("title", ""),
                        "bullets": s.get("bullets", []),
                        "description": (s.get("description") or "")[:3000],
                        "extra": s.get("extra", {}),
                        "matchedBy": s.get("matchedBy", "link" if s.get("asin") else "none"),
                        "weak": bool(s.get("weak")),
                        "candidates": s.get("candidates", []),
                    },
                }
            )
        (d / f"batch-{n:02d}.json").write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(products)} products → {n} batch files in {d}")


def check_html(h, field, pid, errors):
    if not h or not h.strip():
        errors.append(f"#{pid} {field}: empty")
        return
    tags = {t.lower() for t in re.findall(r"</?([a-zA-Z0-9]+)", h)}
    bad = tags - ALLOWED_TAGS
    if bad:
        errors.append(f"#{pid} {field}: disallowed tags {sorted(bad)}")
    if re.search(r"bài đăng nguồn", h, re.I):
        errors.append(f"#{pid} {field}: still says 'bài đăng nguồn'")


def merge(d: Path, rev, report: Path):
    seed = json.loads(SEED.read_text(encoding="utf-8"))
    by_id = {p["id"]: p for p in seed["products"]}
    outs = sorted(d.glob("out-*.json"))
    if not outs:
        sys.exit(f"no out-*.json in {d}")
    applied, mism, skipped, errors = [], [], [], []
    seen = set()
    for f in outs:
        try:
            rows = json.loads(f.read_text(encoding="utf-8"))
        except Exception as e:  # noqa: BLE001
            errors.append(f"{f.name}: invalid JSON ({e})")
            continue
        if isinstance(rows, dict):
            rows = rows.get("products") or rows.get("items") or list(rows.values())
        for r in rows:
            pid = r.get("id")
            p = by_id.get(pid)
            if not p:
                errors.append(f"{f.name}: unknown id {pid}")
                continue
            if pid in seen:
                errors.append(f"{f.name}: duplicate id {pid}")
                continue
            seen.add(pid)
            match = r.get("match", "ok")
            if match != "ok":
                (mism if match == "mismatch" else skipped).append({"id": pid, "name": p["name"], "note": r.get("matchNote", ""), "url": r.get("sourceUrl", "")})
                # a nosource/mismatch row may still carry copy written from general knowledge: apply only when present
                if not r.get("descriptionJa") or not r.get("description"):
                    continue
            e0 = len(errors)
            for fld in ("descriptionJa", "description", "shortDescriptionJa", "shortDescription"):
                check_html(r.get(fld), fld, pid, errors)
            if len(errors) > e0:
                continue
            if r.get("nameJa") and len(r["nameJa"]) <= 120:
                p["nameJa"] = r["nameJa"].strip()
            p["shortDescriptionJa"] = r["shortDescriptionJa"].strip()
            p["descriptionJa"] = r["descriptionJa"].strip()
            p["shortDescription"] = r["shortDescription"].strip()
            p["description"] = r["description"].strip()
            applied.append({"id": pid, "name": p["name"], "nameJa": p["nameJa"], "match": match, "url": r.get("sourceUrl", ""), "vi": strip(p["description"])[:160], "ja": strip(p["descriptionJa"])[:120]})
    missing = [p["id"] for p in seed["products"] if p["id"] not in seen]
    # Products that had no picture: use the white-background Amazon main image saved by find_ja_sources.py, but only when
    # the reviewer confirmed the source is the right product (or the picture is explicitly allowed as an illustration).
    src = json.loads(SRC.read_text(encoding="utf-8")) if SRC.exists() else {}
    ok_ids = {a["id"] for a in applied if a["match"] == "ok"} | ILLUSTRATION_OK
    pictured = []
    for p in seed["products"]:
        img = (src.get(str(p["id"])) or {}).get("imageSaved")
        if img and not p.get("images") and p["id"] in ok_ids:
            p["images"] = [img]
            p["thumb"] = img.replace(".jpg", "-300x300.jpg")
            pictured.append(p["id"])
    if pictured:
        print("pictures attached:", pictured)
    seed.setdefault("meta", {})["contentRev"] = rev
    SEED.write_text(json.dumps(seed, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"applied {len(applied)}, mismatch {len(mism)}, nosource {len(skipped)}, errors {len(errors)}, not in any output: {len(missing)} {missing[:20]}")
    for e in errors[:40]:
        print("  !", e)
    esc = html.escape
    rows_html = "".join(
        f"<tr><td>{a['id']}</td><td>{esc(a['name'])}</td><td>{esc(a['nameJa'])}</td><td>{esc(a['match'])}</td><td><a href='{esc(a['url'])}'>{esc(a['url'][:50])}</a></td><td>{esc(a['ja'])}</td><td>{esc(a['vi'])}</td></tr>"
        for a in applied
    )
    mism_html = "".join(f"<tr><td>{m['id']}</td><td>{esc(m['name'])}</td><td>{esc(m['note'])}</td><td>{esc(m['url'])}</td></tr>" for m in mism + skipped)
    err_html = "".join(f"<li>{esc(e)}</li>" for e in errors)
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(
        f"""<!doctype html><meta charset="utf-8"><title>Viết lại nội dung sản phẩm</title>
<style>body{{font:14px/1.5 system-ui;margin:24px}}table{{border-collapse:collapse;width:100%}}td,th{{border:1px solid #ddd;padding:4px 6px;vertical-align:top;font-size:13px}}th{{background:#f3f4f6;text-align:left}}</style>
<h1>Viết lại nội dung sản phẩm (JA → VI) — {datetime.date.today()}</h1>
<p>Đã áp dụng: <b>{len(applied)}</b> · Nguồn không khớp / không có nguồn: <b>{len(mism) + len(skipped)}</b> · Lỗi định dạng: <b>{len(errors)}</b> · contentRev = {rev}</p>
<h2>⚠ Cần chủ shop kiểm tra ({len(mism) + len(skipped)})</h2>
<table><tr><th>ID</th><th>Tên trên web</th><th>Ghi chú</th><th>Nguồn</th></tr>{mism_html}</table>
<h2>Đã áp dụng ({len(applied)})</h2>
<table><tr><th>ID</th><th>Tên VI</th><th>Tên JA</th><th>Khớp</th><th>Nguồn</th><th>JA (đầu)</th><th>VI (đầu)</th></tr>{rows_html}</table>
<h2>Lỗi</h2><ul>{err_html}</ul>""",
        encoding="utf-8",
    )
    print("report →", report)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["make", "merge"])
    ap.add_argument("dir")
    ap.add_argument("--size", type=int, default=15)
    ap.add_argument("--ids")
    ap.add_argument("--rev", type=int, default=2)
    ap.add_argument("--report", default=str(ROOT / "docs" / "reports" / f"content-rewrite-{datetime.date.today()}.html"))
    a = ap.parse_args()
    if a.cmd == "make":
        make(Path(a.dir), a.size, {int(x) for x in a.ids.split(",")} if a.ids else None)
    else:
        merge(Path(a.dir), a.rev, Path(a.report))
