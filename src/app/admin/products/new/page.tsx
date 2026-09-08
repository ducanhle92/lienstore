import { ProductForm } from "@/components/sites/lienstore/admin/ProductForm";
import { PageHeader } from "@/components/sites/lienstore/admin/ui";
import { requireAdmin } from "@/lib/auth";
import { getCategories } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function NewProduct() {
  await requireAdmin("products");
  const categories = await getCategories();
  return (
    <>
      <PageHeader title="Thêm sản phẩm" back={{ href: "/admin/products/", label: "Sản phẩm" }} />
      <ProductForm categories={categories} />
    </>
  );
}
