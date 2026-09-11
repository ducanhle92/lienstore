import Image from "next/image";
import Link from "next/link";
import { savePostAction } from "@/app/admin/posts/actions";
import type { BlogPost } from "@/types/shop";
import { FilePicker } from "./FilePicker";
import { PostEditor } from "./PostEditor";
import { adminInput, adminLabel, btnPrimary, btnSecondary, Card } from "./ui";

/** Create / edit form of a blog post (server component; the editor itself is a client island). */
export function PostForm({ post }: { post?: BlogPost }) {
  const day = (post?.date ?? new Date().toISOString()).slice(0, 10);
  return (
    <form action={savePostAction} className="grid gap-6 lg:grid-cols-[1fr_320px]">
      {post ? <input type="hidden" name="original_slug" value={post.slug} /> : null}
      <div className="space-y-6">
        <Card>
          <div className="grid gap-4">
            <div>
              <label className={adminLabel} htmlFor="title">
                Tiêu đề *
              </label>
              <input id="title" name="title" defaultValue={post?.title} required className={`${adminInput} !text-[17px] font-semibold`} placeholder="VD: Cách chọn kem chống nắng Nhật cho da dầu" />
            </div>
            <div>
              <label className={adminLabel} htmlFor="slug">
                Đường dẫn <span className="font-normal text-lien-muted">(để trống = tự tạo từ tiêu đề)</span>
              </label>
              <input id="slug" name="slug" defaultValue={post?.slug} pattern="[a-z0-9-]*" className={`${adminInput} font-mono !text-[13px]`} placeholder="cach-chon-kem-chong-nang" />
            </div>
            <div>
              <label className={adminLabel}>Nội dung</label>
              <PostEditor initial={post?.content ?? ""} />
            </div>
            <div>
              <label className={adminLabel} htmlFor="excerpt">
                Tóm tắt <span className="font-normal text-lien-muted">(hiện ở danh sách bài; để trống = lấy đoạn đầu)</span>
              </label>
              <textarea id="excerpt" name="excerpt" rows={3} defaultValue={post?.excerpt} className={adminInput} />
            </div>
          </div>
        </Card>
      </div>
      <div className="space-y-6">
        <Card title="Đăng bài">
          <div className="grid gap-4">
            <div>
              <label className={adminLabel} htmlFor="status">
                Trạng thái
              </label>
              <select id="status" name="status" defaultValue={post?.status ?? "publish"} className={adminInput}>
                <option value="publish">Đăng — khách nhìn thấy</option>
                <option value="draft">Ẩn — bản nháp</option>
              </select>
            </div>
            <div>
              <label className={adminLabel} htmlFor="date">
                Ngày đăng
              </label>
              <input id="date" name="date" type="date" defaultValue={day} className={adminInput} />
            </div>
            <button type="submit" className={btnPrimary}>
              {post ? "Lưu bài viết" : "Tạo bài viết"}
            </button>
            <Link href="/admin/posts/" className={`${btnSecondary} text-center`}>
              Huỷ
            </Link>
          </div>
        </Card>
        <Card title="Ảnh đại diện">
          {post?.image ? <Image src={post.image} alt="" width={280} height={160} unoptimized className="mb-3 h-auto w-full rounded border border-[#e5e7eb] object-cover" /> : null}
          <FilePicker name="imageFile" accept="image/*" label="Chọn ảnh" />
          <input name="image" defaultValue={post?.image ?? ""} placeholder="hoặc dán đường dẫn ảnh" className={`${adminInput} mt-2 font-mono !text-[12px]`} />
          <p className="mt-2 text-[12px] text-lien-muted">Hiện ở đầu bài và trong danh sách Góc chia sẻ. Ảnh trong nội dung chèn bằng nút &quot;Ảnh&quot; trên thanh soạn thảo.</p>
        </Card>
      </div>
    </form>
  );
}
