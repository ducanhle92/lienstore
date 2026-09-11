import { notFound } from "next/navigation";
import { ProductForm } from "@/components/sites/lienstore/admin/ProductForm";
import { PageHeader } from "@/components/sites/lienstore/admin/ui";
import { requireAdmin } from "@/lib/auth";
import { getCategories, getImportQuoteConfig, getPricingConfig, getProductById } from "@/lib/db";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditProduct({ params }: Props) {
  await requireAdmin("products");
  const { id } = await params;
  const numericId = Number.parseInt(id, 10);
  if (!Number.isInteger(numericId)) notFound();
  const [product, categories, quote, pricing] = await Promise.all([getProductById(numericId), getCategories(), getImportQuoteConfig(), getPricingConfig()]);
  if (!product) notFound();
  return (
    <>
      <PageHeader
        title={product.name}
        subtitle={`#${product.id} · /product/${product.slug}/`}
        back={{ href: "/admin/products/", label: "Sản phẩm" }}
        actions={
          <a href={`/product/${product.slug}/`} target="_blank" rel="noreferrer" className="text-[14px] text-lien-blue hover:underline">
            Xem trên cửa hàng ↗
          </a>
        }
      />
      <ProductForm product={product} categories={categories} quote={quote} pricing={pricing} />
    </>
  );
}
