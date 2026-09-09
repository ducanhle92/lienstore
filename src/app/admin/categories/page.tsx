import Image from "next/image";
import Link from "next/link";
import { deleteCategoryAction } from "@/app/admin/categories/actions";
import { ConfirmSubmit } from "@/components/sites/lienstore/admin/ConfirmSubmit";
import { btnPrimary, Card, Flash, PageHeader, tableClass, tdClass, thClass } from "@/components/sites/lienstore/admin/ui";
import { requireAdmin } from "@/lib/auth";
import { buildCategoryTree, flattenTree } from "@/lib/categories";
import { getCategories } from "@/lib/db";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminCategories({ searchParams }: Props) {
  await requireAdmin("categories");
  const sp = await searchParams;
  const saved = Array.isArray(sp.saved) ? sp.saved[0] : sp.saved;
  const deleted = Array.isArray(sp.deleted) ? sp.deleted[0] : sp.deleted;
  const categories = await getCategories();
  const rows = flattenTree(buildCategoryTree(categories));

  return (
    <>
      <PageHeader
        title="Danh mục sản phẩm"
        subtitle={`${categories.length} danh mục · hiển thị ở menu, sidebar, lưới trang chủ và ô tìm kiếm`}
        actions={
          <Link href="/admin/categories/new/" className={btnPrimary}>
            + Thêm danh mục
          </Link>
        }
      />
      {saved ? <Flash>Đã lưu danh mục “{saved}”.</Flash> : null}
      {deleted ? <Flash>Đã xoá danh mục.</Flash> : null}
      <Card>
        <div className="overflow-x-auto">
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass} />
                <th className={thClass}>Tên</th>
                <th className={thClass}>Slug</th>
                <th className={thClass}>Sản phẩm</th>
                <th className={thClass} />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ category: c, depth, total }) => (
                <tr key={c.slug} className="hover:bg-[#fafafa]">
                  <td className={`${tdClass} w-16`}>
                    {c.image ? <Image src={c.image} alt="" width={48} height={48} className="h-12 w-12 rounded border border-[#e5e7eb] object-cover" unoptimized /> : <span className="inline-block h-12 w-12 rounded border border-dashed border-[#d1d5db]" />}
                  </td>
                  <td className={tdClass} style={{ paddingLeft: `${16 + depth * 24}px` }}>
                    {depth ? <span className="mr-1 text-lien-muted">└</span> : null}
                    <Link href={`/admin/categories/${encodeURIComponent(c.slug)}/`} className={depth ? "text-lien-heading hover:text-lien-blue" : "font-semibold text-lien-heading hover:text-lien-blue"}>
                      {c.name}
                    </Link>
                    {c.description ? <div className="max-w-[420px] truncate text-[12px] text-lien-muted">{c.description.replace(/<[^>]+>/g, "")}</div> : null}
                  </td>
                  <td className={`${tdClass} font-mono text-[13px] text-lien-muted`}>{c.slug}</td>
                  <td className={tdClass}>
                    <Link href={`/admin/products/?category=${c.slug}`} className="text-lien-blue hover:underline">
                      {c.count}
                    </Link>
                    {total !== c.count ? <span className="ml-1 text-[12px] text-lien-muted">({total} gồm danh mục con)</span> : null}
                  </td>
                  <td className={`${tdClass} whitespace-nowrap text-right`}>
                    <div className="flex items-center justify-end gap-3">
                      <Link href={`/admin/categories/${encodeURIComponent(c.slug)}/`} className="text-lien-blue hover:underline">
                        Sửa
                      </Link>
                      <a href={`/product-category/${c.slug}/`} target="_blank" rel="noreferrer" className="text-lien-muted hover:underline">
                        Xem
                      </a>
                      <form action={deleteCategoryAction}>
                        <input type="hidden" name="slug" value={c.slug} />
                        <ConfirmSubmit message={`Xoá danh mục “${c.name}”? ${c.count} sản phẩm sẽ bị gỡ khỏi danh mục (không xoá sản phẩm).`} className="text-lien-heart hover:underline">
                          Xoá
                        </ConfirmSubmit>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
