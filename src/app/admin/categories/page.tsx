import Image from "next/image";
import Link from "next/link";
import { deleteCategoryAction } from "@/app/admin/categories/actions";
import { ConfirmSubmit } from "@/components/sites/lienstore/admin/ConfirmSubmit";
import { btnPrimary, Card, Flash, PageHeader } from "@/components/sites/lienstore/admin/ui";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { requireAdmin } from "@/lib/auth";
import { buildCategoryTree, type CategoryNode } from "@/lib/categories";
import { getCategories } from "@/lib/db";
import type { ShopCategory } from "@/types/shop";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

type Node = CategoryNode<ShopCategory & { count: number }>;

function Actions({ c }: { c: ShopCategory & { count: number } }) {
  return (
    <span className="flex items-center gap-3 whitespace-nowrap text-[13px]">
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
    </span>
  );
}

function Icon({ c, size }: { c: ShopCategory; size: number }) {
  return c.image ? <Image src={c.image} alt="" width={size} height={size} unoptimized className="rounded border border-[#e5e7eb] object-cover" style={{ width: size, height: size }} /> : <span className="inline-block rounded border border-dashed border-[#d1d5db]" style={{ width: size, height: size }} />;
}

/** Danh mục: parents in the left column, their children (and grandchildren) in the right column. */
export default async function AdminCategories({ searchParams }: Props) {
  await requireAdmin("categories");
  const sp = await searchParams;
  const saved = Array.isArray(sp.saved) ? sp.saved[0] : sp.saved;
  const deleted = Array.isArray(sp.deleted) ? sp.deleted[0] : sp.deleted;
  const categories = await getCategories();
  const tree = buildCategoryTree(categories) as Node[];

  return (
    <>
      <PageHeader
        title="Danh mục sản phẩm"
        subtitle={`${categories.length} danh mục (${tree.length} danh mục cha) · hiển thị ở menu, sidebar, lưới trang chủ và ô tìm kiếm`}
        actions={
          <Link href="/admin/categories/new/" className={btnPrimary}>
            + Thêm danh mục
          </Link>
        }
      />
      {saved ? <Flash>Đã lưu danh mục “{saved}”.</Flash> : null}
      {deleted ? <Flash>Đã xoá danh mục.</Flash> : null}
      <Card>
        <div className="mb-2 grid grid-cols-[minmax(260px,1fr)_2fr] gap-4 border-b border-[#e5e7eb] px-2 pb-2 text-[12px] font-semibold uppercase tracking-wide text-[#6b7280]">
          <span>Danh mục cha</span>
          <span>Danh mục con</span>
        </div>
        <ul className="m-0 list-none divide-y divide-[#f0f0f0] p-0">
          {tree.map((g) => (
            <li key={g.category.slug} className="grid grid-cols-[minmax(260px,1fr)_2fr] gap-4 px-2 py-4">
              <div className="flex items-start gap-3">
                <Icon c={g.category} size={48} />
                <div className="min-w-0">
                  <Link href={`/admin/categories/${encodeURIComponent(g.category.slug)}/`} className="text-[15px] font-bold text-lien-heading hover:text-lien-blue">
                    {g.category.name}
                  </Link>
                  <div className="font-mono text-[12px] text-lien-muted">{g.category.slug}</div>
                  <div className="mt-0.5 text-[12px] text-lien-muted">
                    <Link href={`/admin/products/?category=${g.category.slug}`} className="text-lien-blue hover:underline">
                      {g.category.count} sản phẩm trực tiếp
                    </Link>
                    {g.total !== g.category.count ? ` · ${g.total} gồm danh mục con` : ""}
                  </div>
                  {g.category.description ? <p className="m-0 mt-1 line-clamp-2 text-[12px] text-lien-muted">{g.category.description.replace(/<[^>]+>/g, "")}</p> : null}
                  <div className="mt-2">
                    <Actions c={g.category} />
                  </div>
                </div>
              </div>
              <div>
                {g.children.length === 0 ? (
                  <p className="m-0 text-[13px] text-lien-muted">
                    Chưa có danh mục con ·{" "}
                    <Link href={`/admin/categories/new/?parent=${g.category.slug}`} className="text-lien-blue hover:underline">
                      thêm
                    </Link>
                  </p>
                ) : (
                  <ul className="m-0 list-none divide-y divide-[#f5f5f5] rounded-md border border-[#e5e7eb] p-0">
                    {g.children.map((c) => (
                      <li key={c.category.slug} className="px-3 py-2">
                        <div className="flex items-center gap-3">
                          <Icon c={c.category} size={32} />
                          <div className="min-w-0 flex-1">
                            <Link href={`/admin/categories/${encodeURIComponent(c.category.slug)}/`} className="text-[14px] font-semibold text-lien-heading hover:text-lien-blue">
                              {c.category.name}
                            </Link>
                            <span className="ml-2 font-mono text-[12px] text-lien-muted">{c.category.slug}</span>
                          </div>
                          <Link href={`/admin/products/?category=${c.category.slug}`} className="w-14 text-right text-[13px] font-semibold text-lien-blue hover:underline" title="Sản phẩm">
                            {c.total}
                          </Link>
                          <Actions c={c.category} />
                        </div>
                        {c.children.length ? (
                          <ul className="m-0 mt-1 list-none space-y-1 pl-11">
                            {c.children.map((gc) => (
                              <li key={gc.category.slug} className="flex items-center gap-3 text-[13px]">
                                <Fa name="angle-right" className="text-[10px] text-lien-muted" />
                                <Link href={`/admin/categories/${encodeURIComponent(gc.category.slug)}/`} className="flex-1 text-lien-text hover:text-lien-blue">
                                  {gc.category.name} <span className="font-mono text-[11px] text-lien-muted">{gc.category.slug}</span>
                                </Link>
                                <span className="w-14 text-right font-semibold text-lien-blue">{gc.total}</span>
                                <Actions c={gc.category} />
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
