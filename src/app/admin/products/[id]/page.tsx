import Link from "next/link";
import { notFound } from "next/navigation";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { brandHintOf } from "@/app/admin/products/actions";
import { ProductForm } from "@/components/sites/lienstore/admin/ProductForm";
import { suggestSku } from "@/lib/sku";
import { PageHeader } from "@/components/sites/lienstore/admin/ui";
import { requireAdmin } from "@/lib/auth";
import { getCategories, getImportQuoteConfig, getMonthlyUnitsSold, getPricingConfig, getProductById, getProductLabels, getPurchaseSourceDefault, listCostSources, listProductChanges, listProductGroups, listPurchaseSources } from "@/lib/db";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditProduct({ params }: Props) {
  await requireAdmin("products");
  const { id } = await params;
  const numericId = Number.parseInt(id, 10);
  if (!Number.isInteger(numericId)) notFound();
  const [product, categories, quote, pricing, defaultSource, groups, sources] = await Promise.all([getProductById(numericId), getCategories(), getImportQuoteConfig(), getPricingConfig(), getPurchaseSourceDefault(), listProductGroups(), listPurchaseSources()]);
  if (!product) notFound();
  const costSources = await listCostSources(product.id);
  const skuSuggestion = suggestSku({ id: product.id, name: product.name, categories: product.categories, createdAt: product.createdAt, brand: await brandHintOf(product) });
  return (
    <>
      <PageHeader
        title={product.name}
        subtitle={`#${product.id} · /product/${product.slug}/`}
        back={{ href: "/admin/products/", label: "Sản phẩm" }}
        actions={
          <>
            <Link href={`/admin/products/new/?from=${product.id}`} className="inline-flex items-center gap-1.5 rounded-md border border-lien-blue/60 px-3 py-1.5 text-[13px] font-semibold text-lien-blue no-underline hover:bg-lien-blue-soft" title="Tạo sản phẩm mới chép sẵn mọi thông tin của sản phẩm này (không chép ảnh)" data-testid="clone-product">
              <Fa name="plus" /> Nhân bản sang sản phẩm mới
            </Link>
            <a href={`/product/${product.slug}/`} target="_blank" rel="noreferrer" className="text-[14px] text-lien-blue hover:underline">
              Xem trên cửa hàng ↗
            </a>
          </>
        }
      />
      <ProductForm product={product} categories={categories} quote={quote} pricing={pricing} skuSuggestion={skuSuggestion} labels={await getProductLabels()} costSources={costSources} defaultSource={defaultSource} groups={groups} sources={sources} monthlySales={getMonthlyUnitsSold(product.id, 6)} changes={listProductChanges(product.id, 60)} />
    </>
  );
}
