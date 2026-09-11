import type { CatalogProduct } from "@/types/shop";

/** Filters of Admin › Sản phẩm, shared by the page and its CSV export. Pure. */
export function filterProducts(all: CatalogProduct[], sp: Record<string, string | string[] | undefined>): CatalogProduct[] {
  const first = (k: string) => {
    const v = sp[k];
    return ((Array.isArray(v) ? v[0] : v) ?? "").trim();
  };
  const q = first("q").toLowerCase();
  const status = first("status");
  const category = first("category");
  const stock = first("stock");
  const fulfillment = first("fulfillment");
  const sort = first("sort") || "updated";
  const dir = first("dir") === "asc" ? 1 : -1;
  const items = all
    .filter((p) => !q || `${p.name} ${p.slug} ${p.sku ?? ""} #${p.id}`.toLowerCase().includes(q))
    .filter((p) => !status || p.status === status)
    .filter((p) => !category || p.categories.includes(category))
    .filter((p) => !stock || (stock === "out" ? p.stockStatus === "discontinued" : p.stockStatus === "instock"))
    .filter((p) => !fulfillment || p.fulfillment === fulfillment);
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
