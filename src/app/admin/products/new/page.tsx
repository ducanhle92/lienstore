import { ProductForm } from "@/components/sites/lienstore/admin/ProductForm";
import { PageHeader } from "@/components/sites/lienstore/admin/ui";
import { requireAdmin } from "@/lib/auth";
import { getCategories, getImportQuoteConfig, getPricingConfig, getProductById, getProductLabels, getPurchaseSourceDefault, listCostSources, listProductGroups, listPurchaseSources } from "@/lib/db";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** /admin/products/new/ — blank form, or a copy of `?from=<id>` (Nhân bản: same texts, prices, group…, no pictures). */
export default async function NewProduct({ searchParams }: Props) {
  await requireAdmin("products");
  const sp = await searchParams;
  const fromId = Number.parseInt(String(Array.isArray(sp.from) ? sp.from[0] : sp.from ?? ""), 10);
  const [categories, quote, pricing, groups, sources, source] = await Promise.all([getCategories(), getImportQuoteConfig(), getPricingConfig(), listProductGroups(), listPurchaseSources(), Number.isInteger(fromId) ? getProductById(fromId) : Promise.resolve(null)]);
  const costSources = source ? await listCostSources(source.id) : [];
  return (
    <>
      <PageHeader
        title={source ? "Nhân bản sản phẩm" : "Thêm sản phẩm"}
        subtitle={source ? `Chép từ #${source.id} · ${source.name}` : undefined}
        back={source ? { href: `/admin/products/${source.id}/`, label: source.name } : { href: "/admin/products/", label: "Sản phẩm" }}
      />
      <ProductForm product={source ?? undefined} clone={!!source} costSources={costSources} categories={categories} quote={quote} pricing={pricing} defaultSource={await getPurchaseSourceDefault()} groups={groups} sources={sources} labels={await getProductLabels()} />
    </>
  );
}
