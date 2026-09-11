import Image from "next/image";
import { deleteBannerAction, moveBannerAction, saveBannerAction } from "@/app/admin/banners/actions";
import { adminInput, adminLabel, btnDanger, btnPrimary, btnSecondary, Card, Flash, PageHeader } from "@/components/sites/lienstore/admin/ui";
import { ConfirmSubmit } from "@/components/sites/lienstore/admin/ConfirmSubmit";
import { FilePicker } from "@/components/sites/lienstore/admin/FilePicker";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { requireAdmin } from "@/lib/auth";
import { getBanners } from "@/lib/db";
import type { Banner } from "@/types/shop";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

function BannerForm({ b }: { b?: Banner }) {
  return (
    <form action={saveBannerAction} encType="multipart/form-data" className="grid gap-3 md:grid-cols-[1fr_1fr_120px_auto] md:items-end">
      {b ? <input type="hidden" name="id" value={b.id} /> : null}
      <input type="hidden" name="position" value={b?.position ?? 999} />
      <div className="md:col-span-2">
        <label className={adminLabel}>Ảnh banner {b ? "(chọn file mới để thay)" : "*"}</label>
        <FilePicker name="file" accept="image/*" label={b ? "Chọn ảnh mới từ máy" : "Chọn ảnh từ máy"} />
        <input name="image" defaultValue={b?.image ?? ""} placeholder="…hoặc dán đường dẫn ảnh (/sites/... hoặc https://…)" className={`${adminInput} mt-1 font-mono text-[12px]`} />
        <p className="m-0 mt-1 text-[12px] text-lien-muted">Kích thước khuyến nghị 1920×520 px, JPG/WebP dưới 500 KB để tải nhanh; PNG cũng được.</p>
      </div>
      <div className="md:col-span-2">
        <label className={adminLabel}>Link khi bấm vào banner</label>
        <input name="href" defaultValue={b?.href ?? ""} placeholder="/product/ten-san-pham/ hoặc /product-category/my-pham/ hoặc https://…" className={adminInput} />
      </div>
      <div className="md:col-span-2">
        <label className={adminLabel}>Mô tả ảnh (alt, tuỳ chọn)</label>
        <input name="alt" defaultValue={b?.alt ?? ""} placeholder="VD: Kem chống nắng Skin Aqua giảm 10%" className={adminInput} />
      </div>
      <label className="inline-flex items-center gap-2 pb-2.5 text-[14px]">
        <input type="checkbox" name="active" defaultChecked={b ? b.active : true} className="h-4 w-4" /> Hiển thị
      </label>
      <button type="submit" className={b ? btnSecondary : btnPrimary}>
        <Fa name={b ? "check" : "plus"} /> {b ? "Lưu" : "Thêm banner"}
      </button>
    </form>
  );
}

/** Sales › Banner trang chủ: the pictures rotating at the top of the home page, each with its link. */
export default async function AdminBanners({ searchParams }: Props) {
  await requireAdmin("banners");
  const sp = await searchParams;
  const banners = await getBanners(false);
  return (
    <>
      <PageHeader title="Banner trang chủ" subtitle={`${banners.length} banner · chạy tự động 5 giây/ảnh trên trang chủ; bấm vào banner mở link đã gắn`} />
      {first(sp.saved) ? <Flash>{first(sp.saved)}</Flash> : null}
      {first(sp.error) ? <Flash kind="error">{first(sp.error)}</Flash> : null}

      <details className="group mb-6 rounded-lg border border-dashed border-[#d1d5db] bg-white" open={banners.length === 0}>
        <summary className="flex cursor-pointer items-center gap-2 px-5 py-3 text-[14px] font-semibold text-lien-blue select-none">
          <Fa name="plus" /> Thêm banner mới
        </summary>
        <div className="border-t border-[#e5e7eb] p-5">
          <BannerForm />
        </div>
      </details>

      <div className="space-y-4">
        {banners.map((b, i) => (
          <Card key={b.id} className={b.active ? "" : "opacity-70"}>
            <div id={`banner-${b.id}`} className="grid gap-4 lg:grid-cols-[360px_1fr]">
              <div>
                <div className="relative aspect-[1280/520] overflow-hidden rounded-md border border-[#e5e7eb] bg-[#f3f4f6]">
                  <Image src={b.image} alt={b.alt} fill sizes="360px" className="object-contain" unoptimized />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-lien-muted">
                  <span className="rounded bg-lien-heading px-2 py-0.5 font-semibold text-white">#{i + 1}</span>
                  {b.active ? <span className="rounded-full bg-green-100 px-2 py-0.5 font-semibold text-green-800">Đang hiện</span> : <span className="rounded-full bg-gray-200 px-2 py-0.5 font-semibold text-gray-700">Đang ẩn</span>}
                  {b.href ? (
                    <a href={b.href} target="_blank" rel="noreferrer" className="truncate text-lien-blue hover:underline">
                      {b.href}
                    </a>
                  ) : (
                    <span>không gắn link</span>
                  )}
                  <span className="ml-auto flex gap-1">
                    <form action={moveBannerAction}>
                      <input type="hidden" name="id" value={b.id} />
                      <input type="hidden" name="dir" value="up" />
                      <button type="submit" disabled={i === 0} className={`${btnSecondary} !px-2 !py-1 !text-[12px] disabled:opacity-40`} title="Lên">
                        <Fa name="angle-up" />
                      </button>
                    </form>
                    <form action={moveBannerAction}>
                      <input type="hidden" name="id" value={b.id} />
                      <input type="hidden" name="dir" value="down" />
                      <button type="submit" disabled={i === banners.length - 1} className={`${btnSecondary} !px-2 !py-1 !text-[12px] disabled:opacity-40`} title="Xuống">
                        <Fa name="angle-down" />
                      </button>
                    </form>
                    <form action={deleteBannerAction}>
                      <input type="hidden" name="id" value={b.id} />
                      <ConfirmSubmit message="Xoá banner này?" className={`${btnDanger} !px-2 !py-1 !text-[12px]`}>
                        <Fa name="trash" />
                      </ConfirmSubmit>
                    </form>
                  </span>
                </div>
              </div>
              <BannerForm b={b} />
            </div>
          </Card>
        ))}
        {banners.length === 0 ? <p className="text-[14px] text-lien-muted">Chưa có banner nào — trang chủ sẽ không hiện dải ảnh cho tới khi bạn thêm.</p> : null}
      </div>
    </>
  );
}
