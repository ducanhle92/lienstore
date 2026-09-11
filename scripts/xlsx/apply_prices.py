"""Merge data/prices.json (from fetch_prices.py) into data/seed.json as costJpy / costSource / costUrl / costCheckedAt
and bump meta.costRev so every server picks the ¥ costs up at the next start (sqlite.ts syncCosts).

    python scripts/xlsx/apply_prices.py            # merge + report
    python scripts/xlsx/apply_prices.py --report   # report only (docs/reports/gia-von-<date>.csv)
"""
import argparse, csv, json, os
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SEED = os.path.join(ROOT, "data", "seed.json")
PRICES = os.path.join(ROOT, "data", "prices.json")
ap = argparse.ArgumentParser()
ap.add_argument("--report", action="store_true")
args = ap.parse_args()

seed = json.load(open(SEED, encoding="utf-8"))
prices = json.load(open(PRICES, encoding="utf-8"))
rows = []
n = 0
for p in seed["products"]:
    rec = prices.get(str(p["id"]))
    if not rec or not rec.get("jpy"):
        rows.append([p["id"], p["name"], "", "", "", (rec or {}).get("error", "chưa cào")])
        continue
    if not args.report:
        p["costJpy"] = int(rec["jpy"])
        p["costSource"] = rec.get("source", "")
        p["costUrl"] = rec.get("url", "")
        p["costCheckedAt"] = rec.get("checkedAt", "")
        n += 1
    rows.append([p["id"], p["name"], rec["jpy"], rec.get("source", ""), rec.get("url", ""), "nguồn yếu — kiểm tra lại" if rec.get("weak") else ""])

if not args.report:
    seed.setdefault("meta", {})
    seed["meta"]["costRev"] = int(seed["meta"].get("costRev", 0)) + 1
    json.dump(seed, open(SEED, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"seed updated: {n} products with costJpy, costRev = {seed['meta']['costRev']}")

os.makedirs(os.path.join(ROOT, "docs", "reports"), exist_ok=True)
out = os.path.join(ROOT, "docs", "reports", f"gia-von-jpy-{date.today().isoformat()}.csv")
with open(out, "w", encoding="utf-8-sig", newline="") as f:
    w = csv.writer(f)
    w.writerow(["ID", "Tên sản phẩm", "Giá Nhật (¥)", "Nguồn", "Link", "Ghi chú"])
    w.writerows(rows)
print("report:", out, "|", sum(1 for r in rows if r[2]), "có giá /", len(rows))
