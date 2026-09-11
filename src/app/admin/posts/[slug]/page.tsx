import { notFound } from "next/navigation";
import { deletePostAction } from "@/app/admin/posts/actions";
import { ConfirmSubmit } from "@/components/sites/lienstore/admin/ConfirmSubmit";
import { PostForm } from "@/components/sites/lienstore/admin/PostForm";
import { btnDanger, Flash, PageHeader } from "@/components/sites/lienstore/admin/ui";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { requireAdmin } from "@/lib/auth";
import { getPostBySlugAdmin } from "@/lib/db";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function EditPost({ params, searchParams }: Props) {
  await requireAdmin("posts");
  const { slug } = await params;
  const sp = await searchParams;
  const post = await getPostBySlugAdmin(decodeURIComponent(slug));
  if (!post) notFound();
  return (
    <>
      <PageHeader
        title={post.title}
        subtitle={`/${post.slug}/ · ${post.status === "publish" ? "đang đăng" : "bản nháp"}${post.updatedAt ? ` · sửa lần cuối ${formatDateTime(post.updatedAt)}` : ""}`}
        back={{ href: "/admin/posts/", label: "Góc chia sẻ" }}
        actions={
          post.status === "publish" ? (
            <a href={`/${post.slug}/`} target="_blank" rel="noreferrer" className="text-[14px] text-lien-blue hover:underline">
              Xem trên cửa hàng ↗
            </a>
          ) : null
        }
      />
      {first(sp.saved) ? <Flash>{first(sp.saved)}</Flash> : null}
      {first(sp.error) ? <Flash kind="error">{first(sp.error)}</Flash> : null}
      <PostForm post={post} />
      <form action={deletePostAction} className="mt-8 border-t border-[#e5e7eb] pt-6">
        <input type="hidden" name="slug" value={post.slug} />
        <ConfirmSubmit message={`Xoá vĩnh viễn bài “${post.title}”? Không thể hoàn tác.`} className={btnDanger}>
          <Fa name="trash" /> Xoá bài viết
        </ConfirmSubmit>
        <p className="mt-2 text-[12px] text-lien-muted">Muốn tạm giấu bài thì chọn &quot;Ẩn — bản nháp&quot; ở khung Đăng bài và lưu, thay vì xoá.</p>
      </form>
    </>
  );
}
