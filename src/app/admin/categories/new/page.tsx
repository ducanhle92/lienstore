import { CategoryForm } from "@/components/sites/lienstore/admin/CategoryForm";
import { PageHeader } from "@/components/sites/lienstore/admin/ui";
import { requireAdmin } from "@/lib/auth";
import { getAllProducts } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function NewCategory() {
  await requireAdmin("categories");
  const products = await getAllProducts(true);
  const suggestions = Array.from(new Set(products.map((p) => p.thumb).filter(Boolean))).slice(0, 24);
  return (
    <>
      <PageHeader title="Thêm danh mục" back={{ href: "/admin/categories/", label: "Danh mục" }} />
      <CategoryForm suggestions={suggestions} />
    </>
  );
}
