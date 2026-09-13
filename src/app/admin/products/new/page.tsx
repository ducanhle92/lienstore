import { ProductForm } from "@/components/sites/lienstore/admin/ProductForm";
import { PageHeader } from "@/components/sites/lienstore/admin/ui";
import { requireAdmin } from "@/lib/auth";
import { getCategories, getImportQuoteConfig, getPricingConfig, getPurchaseSourceDefault, listProductGroups, listPurchaseSources } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function NewProduct() {
  await requireAdmin("products");
  const [categories, quote, pricing, groups, sources] = await Promise.all([getCategories(), getImportQuoteConfig(), getPricingConfig(), listProductGroups(), listPurchaseSources()]);
  return (
    <>
      <PageHeader title="Thêm sản phẩm" back={{ href: "/admin/products/", label: "Sản phẩm" }} />
      <ProductForm categories={categories} quote={quote} pricing={pricing} defaultSource={await getPurchaseSourceDefault()} groups={groups} sources={sources} />
    </>
  );
}
