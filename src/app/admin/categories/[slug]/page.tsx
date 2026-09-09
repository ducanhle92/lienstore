import { notFound } from "next/navigation";
import { CategoryForm } from "@/components/sites/lienstore/admin/CategoryForm";
import { PageHeader } from "@/components/sites/lienstore/admin/ui";
import { requireAdmin } from "@/lib/auth";
import { getAllProducts, getCategories, getCategoryBySlug } from "@/lib/db";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function EditCategory({ params }: Props) {
  await requireAdmin("categories");
  const { slug } = await params;
  const category = await getCategoryBySlug(decodeURIComponent(slug));
  if (!category) notFound();
  const [products, allCategories] = await Promise.all([getAllProducts(true), getCategories()]);
  const suggestions = Array.from(new Set(products.filter((p) => p.categories.includes(category.slug)).map((p) => p.thumb).filter(Boolean)));
  return (
    <>
      <PageHeader
        title={category.name}
        subtitle={`/product-category/${category.slug}/ · ${category.count} sản phẩm`}
        back={{ href: "/admin/categories/", label: "Danh mục" }}
        actions={
          <a href={`/product-category/${category.slug}/`} target="_blank" rel="noreferrer" className="text-[14px] text-lien-blue hover:underline">
            Xem trên cửa hàng ↗
          </a>
        }
      />
      <CategoryForm category={category} suggestions={suggestions} allCategories={allCategories} />
    </>
  );
}
