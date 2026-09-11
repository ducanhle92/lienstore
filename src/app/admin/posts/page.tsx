import Image from "next/image";
import Link from "next/link";
import { deletePostAction, setPostStatusAction } from "@/app/admin/posts/actions";
import { ConfirmSubmit } from "@/components/sites/lienstore/admin/ConfirmSubmit";
import { ResizableTable } from "@/components/sites/lienstore/admin/ResizableTable";
import { adminInput, btnPrimary, btnSecondary, Card, Flash, PageHeader, tableClass, tdClass, thClass } from "@/components/sites/lienstore/admin/ui";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { requireAdmin } from "@/lib/auth";
import { getAllPosts } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** Tổng quan › Góc chia sẻ: blog posts — add, edit, publish / hide, delete. */
export default async function AdminPosts({ searchParams }: Props) {
  await requireAdmin("posts");
  const sp = await searchParams;
  const q = first(sp.q).trim().toLowerCase();
  const status = first(sp.status);
  const all = await getAllPosts();
  const items = all.filter((p) => !q || `${p.title} ${p.slug}`.toLowerCase().includes(q)).filter((p) => !status || p.status === status);
  const published = all.filter((p) => p.status === "publish").length;

  return (
    <>
      <PageHeader
        title="Góc chia sẻ"
        subtitle={`${all.length} bài · ${published} đang đăng · ${all.length - published} bản nháp / đã ẩn`}
        actions={
          <>
            <a href="/category/goc-chia-se/" target="_blank" rel="noreferrer" className={btnSecondary}>
              <Fa name="external-link" /> Xem trang Góc chia sẻ
            </a>
            <Link href="/admin/posts/new/" className={btnPrimary}>
              + Viết bài mới
            </Link>
          </>
        }
      />
      {first(sp.saved) ? <Flash>{first(sp.saved)}</Flash> : null}
      {first(sp.error) ? <Flash kind="error">{first(sp.error)}</Flash> : null}
      <Card>
        <form method="get" className="mb-4 grid gap-3 md:grid-cols-[1fr_200px_auto]">
          <input name="q" defaultValue={first(sp.q)} placeholder="Tìm theo tiêu đề, đường dẫn…" className={adminInput} />
          <select name="status" defaultValue={status} className={adminInput}>
            <option value="">Mọi trạng thái</option>
            <option value="publish">Đang đăng</option>
            <option value="draft">Bản nháp / ẩn</option>
          </select>
          <button type="submit" className={btnPrimary}>
            Lọc
          </button>
        </form>
        <ResizableTable id="posts">
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass} />
                <th className={thClass}>Tiêu đề</th>
                <th className={thClass}>Ngày đăng</th>
                <th className={thClass}>Trạng thái</th>
                <th className={thClass}>Cập nhật</th>
                <th className={thClass} />
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={6} className={`${tdClass} text-center text-lien-muted`}>
                    Chưa có bài viết nào.
                  </td>
                </tr>
              ) : null}
              {items.map((p) => (
                <tr key={p.slug} className="hover:bg-[#fafafa]">
                  <td className={`${tdClass} w-16`}>{p.image ? <Image src={p.image} alt="" width={56} height={40} unoptimized className="h-10 w-14 rounded border border-[#e5e7eb] object-cover" /> : <span className="flex h-10 w-14 items-center justify-center rounded border border-dashed border-[#e5e7eb] text-lien-muted"><Fa name="newspaper-o" /></span>}</td>
                  <td className={`${tdClass} min-w-[280px]`}>
                    <Link href={`/admin/posts/${encodeURIComponent(p.slug)}/`} className="font-semibold text-lien-heading hover:text-lien-blue">
                      {p.title}
                    </Link>
                    <div className="text-[12px] text-lien-muted">/{p.slug}/</div>
                  </td>
                  <td className={`${tdClass} whitespace-nowrap`}>{formatDate(p.date)}</td>
                  <td className={tdClass}>
                    <span className={cn("inline-block rounded-full px-2.5 py-0.5 text-[12px] font-semibold", p.status === "publish" ? "bg-green-100 text-green-800" : "bg-gray-200 text-gray-700")}>{p.status === "publish" ? "Đang đăng" : "Bản nháp"}</span>
                  </td>
                  <td className={`${tdClass} whitespace-nowrap text-[13px] text-lien-muted`}>{p.updatedAt ? formatDate(p.updatedAt) : "—"}</td>
                  <td className={`${tdClass} whitespace-nowrap text-right`}>
                    <div className="flex items-center justify-end gap-3">
                      <form action={setPostStatusAction}>
                        <input type="hidden" name="slug" value={p.slug} />
                        <input type="hidden" name="status" value={p.status === "publish" ? "draft" : "publish"} />
                        <button type="submit" className="text-lien-text hover:text-lien-blue hover:underline">
                          {p.status === "publish" ? "Ẩn" : "Đăng"}
                        </button>
                      </form>
                      <Link href={`/admin/posts/${encodeURIComponent(p.slug)}/`} className="text-lien-blue hover:underline">
                        Sửa
                      </Link>
                      {p.status === "publish" ? (
                        <a href={`/${p.slug}/`} target="_blank" rel="noreferrer" className="text-lien-muted hover:underline">
                          Xem
                        </a>
                      ) : null}
                      <form action={deletePostAction}>
                        <input type="hidden" name="slug" value={p.slug} />
                        <ConfirmSubmit message={`Xoá vĩnh viễn bài “${p.title}”?`} className="text-lien-heart hover:underline">
                          Xoá
                        </ConfirmSubmit>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ResizableTable>
      </Card>
    </>
  );
}
