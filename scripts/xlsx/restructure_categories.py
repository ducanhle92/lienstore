"""
Compact the category tree (42 → 26 nodes, two levels max), rename categories to plain Vietnamese, and remap every
product. Writes data/seed.json (categories, product.categories, meta.categoryMoves, meta.seededAt) and prints the plan.

  python scripts/xlsx/restructure_categories.py [--dry]

meta.categoryMoves {oldSlug: newSlug} is applied by the server on start (syncContent): product links move to the new
slug and the old category row is deleted — so admin-edited products on prod follow the new tree too.
"""
import datetime, json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SEED = ROOT / "data" / "seed.json"
ICON = "/sites/lienstore/shared/categories/icons/3d"

# slug → (name VI, name JA, parent slug or None, icon file of an existing category to reuse | None = keep own)
TREE = {
    "suc-khoe": ("Sức khỏe", "ヘルスケア", None, None),
    "thuc-pham-chuc-nang-functional-foods": ("Thực phẩm chức năng", "サプリメント", "suc-khoe", None),
    "tu-thuoc-gia-dinh-family-medicine": ("Tủ thuốc gia đình", "常備薬", "suc-khoe", None),
    "giam-can-diet": ("Giảm cân", "ダイエット", "suc-khoe", None),
    "goc-chi-em-chung-minh-women": ("Sức khỏe phụ nữ", "女性の健康", "suc-khoe", None),
    "san-pham-danh-cho-nam-men": ("Dành cho nam", "メンズ", "suc-khoe", None),
    "cham-soc-rang-mieng-oral-care": ("Chăm sóc răng miệng", "オーラルケア", "suc-khoe", None),
    "my-pham": ("Mỹ phẩm", "コスメ", None, None),
    "sua-rua-mat-tay-trang": ("Sữa rửa mặt & tẩy trang", "洗顔・クレンジング", "my-pham", "sua-rua-mat"),
    "duong-da-mat": ("Dưỡng da mặt", "スキンケア", "my-pham", "kem-duong-danh-cho-mat-face-cream"),
    "mat-na-mask": ("Mặt nạ", "フェイスマスク", "my-pham", None),
    "chong-nang-uv": ("Chống nắng", "日やけ止め", "my-pham", None),
    "tri-mun-acne-treatment": ("Trị mụn", "ニキビケア", "my-pham", None),
    "mat-eyes": ("Chăm sóc mắt", "アイケア", "my-pham", None),
    "trang-diem-makeup": ("Trang điểm", "メイクアップ", "my-pham", None),
    "cham-soc-body": ("Chăm sóc body", "ボディケア", "my-pham", None),
    "cham-soc-toc": ("Chăm sóc tóc", "ヘアケア", "my-pham", "phuc-hoi-toc-tai-nha-hair"),
    "dung-cu-lam-dep": ("Dụng cụ làm đẹp", "美容ツール", "my-pham", "dung-cu-cham-soc-da-skincare-tools"),
    "mom-and-baby": ("Mẹ và bé", "ママ＆ベビー", None, None),
    "thuc-pham-do-uong-food-drink": ("Thực phẩm & đồ uống", "食品・飲料", None, None),
    "nha-cua-doi-song": ("Nhà cửa & đời sống", "ホーム＆リビング", None, None),
    "thoi-trang-phu-kien": ("Thời trang & phụ kiện", "ファッション・アクセサリー", None, None),
    "thoi-trang-fashion": ("Thời trang", "ファッション", "thoi-trang-phu-kien", None),
    "dong-ho-watch": ("Đồng hồ", "腕時計", "thoi-trang-phu-kien", None),
    "do-choi-suu-tap": ("Đồ chơi & sưu tập", "おもちゃ・ホビー", None, None),
    "the-bai-pokemon": ("Thẻ bài Pokémon", "ポケモンカード", "do-choi-suu-tap", None),
}

# old slug → new slug (old category disappears)
MOVES = {
    "iherb": "thuc-pham-chuc-nang-functional-foods",
    "cham-soc-suc-khoe": "tu-thuoc-gia-dinh-family-medicine",
    "cham-soc-da-mat": "my-pham",
    "sua-rua-mat": "sua-rua-mat-tay-trang",
    "tay-trang-cleansing": "sua-rua-mat-tay-trang",
    "tay-te-bao-chet-exfoliate-dead-skin": "sua-rua-mat-tay-trang",
    "kem-duong-danh-cho-mat-face-cream": "duong-da-mat",
    "nuoc-hoa-hong-lotion": "duong-da-mat",
    "tinh-chat-duong": "duong-da-mat",
    "tri-nam-tan-nhang-treat-melasma-freckles": "duong-da-mat",
    "dung-cu-cham-soc-da-skincare-tools": "dung-cu-lam-dep",
    "son-moi-lipstick": "trang-diem-makeup",
    "duong-the-body": "cham-soc-body",
    "sua-tam-shower-gel": "cham-soc-body",
    "cham-soc-co-the": "cham-soc-body",
    "phuc-hoi-toc-tai-nha-hair": "cham-soc-toc",
    "dau-goi-dau-xa": "cham-soc-toc",
    "dung-cu-nha-bep-kitchen-tools": "nha-cua-doi-song",
    "nen-thom-candle": "nha-cua-doi-song",
    "do-gia-dung-household": "nha-cua-doi-song",
}

dry = "--dry" in sys.argv
seed = json.loads(SEED.read_text(encoding="utf-8"))
old = {c["slug"]: c for c in seed["categories"]}
assert all(k in old for k in MOVES), [k for k in MOVES if k not in old]
assert all(v in TREE for v in MOVES.values()), [v for v in MOVES.values() if v not in TREE]
missing = set(old) - set(TREE) - set(MOVES)
assert not missing, f"categories without a plan: {missing}"


def resolve(slug):
    seen = set()
    while slug in MOVES and slug not in seen:
        seen.add(slug)
        slug = MOVES[slug]
    return slug


cats = []
for slug, (name, ja, parent, icon_from) in TREE.items():
    src = old.get(slug) or old.get(icon_from or "") or {}
    image = src.get("image")
    if icon_from and old.get(icon_from):
        image = old[icon_from].get("image") or image
    cats.append({"slug": slug, "name": name, "description": (old.get(slug) or {}).get("description", ""), "image": image, "parent": parent, "nameJa": ja})

moved = 0
for p in seed["products"]:
    new = []
    for c in p["categories"]:
        r = resolve(c)
        if r not in new:
            new.append(r)
    # a product linked to a parent and one of its children only needs the child
    parents = {TREE[s][2] for s in new if TREE[s][2]}
    new = [s for s in new if s not in parents] or new
    if new != p["categories"]:
        moved += 1
    p["categories"] = new

from collections import Counter

direct = Counter(c for p in seed["products"] for c in p["categories"])
kids = {}
for c in cats:
    kids.setdefault(c["parent"], []).append(c)


def total(slug):
    return direct[slug] + sum(total(k["slug"]) for k in kids.get(slug, []))


for c in kids[None]:
    print(f"{c['name']} [{c['slug']}] total={total(c['slug'])}")
    for k in kids.get(c["slug"], []):
        print(f"   {k['name']} [{k['slug']}] {direct[k['slug']]}")
print(f"{len(old)} → {len(cats)} categories; {moved} products relinked; empty: {[c['slug'] for c in cats if total(c['slug']) == 0]}")

if not dry:
    seed["categories"] = cats
    meta = seed.setdefault("meta", {})
    meta["categoryMoves"] = {k: resolve(k) for k in MOVES}
    meta["seededAt"] = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    SEED.write_text(json.dumps(seed, ensure_ascii=False, indent=1), encoding="utf-8")
    print("seed written; seededAt =", meta["seededAt"])
