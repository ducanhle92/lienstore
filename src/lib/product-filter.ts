import type { CatalogProduct } from "@/types/shop";

/** Filters of Admin › Sản phẩm, shared by the page and its CSV export. Pure. */
/** Web-price buckets of the admin list filter (`?price=`): none = "Liên hệ" (no price yet). */
export const PRICE_BUCKETS: Array<{ key: string; label: string }> = [
  { key: "none", label: "Chưa có giá (Liên hệ)" },
  { key: "lt100", label: "Dưới 100.000đ" },
  { key: "100-200", label: "100.000 – 200.000đ" },
  { key: "200-500", label: "200.000 – 500.000đ" },
  { key: "500-1000", label: "500.000đ – 1 triệu" },
  { key: "gt1000", label: "Trên 1 triệu" },
];
export function inPriceBucket(price: number, bucket: string): boolean {
  switch (bucket) {
    case "none":
      return price <= 0;
    case "lt100":
      return price > 0 && price < 100_000;
    case "100-200":
      return price >= 100_000 && price < 200_000;
    case "200-500":
      return price >= 200_000 && price < 500_000;
    case "500-1000":
      return price >= 500_000 && price < 1_000_000;
    case "gt1000":
      return price >= 1_000_000;
    default:
      return true;
  }
}

export function filterProducts(all: CatalogProduct[], sp: Record<string, string | string[] | undefined>): CatalogProduct[] {
  const first = (k: string) => {
    const v = sp[k];
    return ((Array.isArray(v) ? v[0] : v) ?? "").trim();
  };
  // accent-insensitive so "kem chong nang" finds "Kem chống nắng"; the Japanese name (フルグラ) is searched too
  const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d");
  const q = fold(first("q"));
  const status = first("status");
  const category = first("category");
  const stock = first("stock");
  const fulfillment = first("fulfillment");
  const source = first("source");
  const price = first("price");
  const sort = first("sort") || "updated";
  const dir = first("dir") === "asc" ? 1 : -1;
  const items = all
    .filter((p) => !q || fold(`${p.name} ${p.nameJa} ${p.slug} ${p.sku ?? ""} #${p.id}`).includes(q))
    .filter((p) => !status || p.status === status)
    .filter((p) => !category || p.categories.includes(category))
    .filter((p) => !stock || (stock === "out" ? p.stockStatus === "discontinued" : p.stockStatus === "instock"))
    .filter((p) => !fulfillment || p.fulfillment === fulfillment)
    .filter((p) => !source || (source === "none" ? !p.costSource : p.costSource === source))
    .filter((p) => !price || inPriceBucket(p.price, price));
  const cmp = (a: CatalogProduct, b: CatalogProduct): number => {
    switch (sort) {
      case "id":
        return a.id - b.id;
      case "sku":
        return (a.sku ?? "￿").localeCompare(b.sku ?? "￿", "vi");
      case "name":
        return a.name.localeCompare(b.name, "vi");
      case "price":
        return a.price - b.price;
      case "cost":
        return (a.costPrice ?? -1) - (b.costPrice ?? -1);
      case "stock":
        return (a.stock ?? -1) - (b.stock ?? -1);
      default:
        return a.updatedAt.localeCompare(b.updatedAt);
    }
  };
  return items.sort((a, b) => cmp(a, b) * dir || a.name.localeCompare(b.name, "vi"));
}
