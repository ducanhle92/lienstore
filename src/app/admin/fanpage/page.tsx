import Image from "next/image";
import Link from "next/link";
import { cancelPostAction, clearFanpageTokenAction, composeDraftAction, postNowAction, regenerateDraftAction, saveDraftAction, saveFanpageAutoAction, saveFanpageConnectionAction } from "@/app/admin/fanpage/actions";
import { ConfirmSubmit } from "@/components/sites/lienstore/admin/ConfirmSubmit";
import { InfoPopover } from "@/components/sites/lienstore/admin/InfoPopover";
import { type PickableProduct, ProductSearchSelect } from "@/components/sites/lienstore/admin/ProductSearchSelect";
import { adminInput, adminLabel, btnDanger, btnPrimary, btnSecondary, Card, Flash, PageHeader, tableClass, tdClass, thClass } from "@/components/sites/lienstore/admin/ui";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { requireAdmin } from "@/lib/auth";
import { getAllProducts } from "@/lib/db";
import { type FanpagePostStatus, getFanpageConfig, getFanpagePost, listFanpagePosts, rememberSiteOrigin, SHOP_TZ } from "@/lib/fanpage";
import { formatDateTime } from "@/lib/format";
import { siteUrl } from "@/lib/site-url";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

const STATUS: Record<FanpagePostStatus, { label: string; cls: string }> = {
  draft: { label: "Nháp", cls: "bg-gray-200 text-gray-700" },
  queued: { label: "Chờ đăng", cls: "bg-amber-100 text-amber-800" },
  posted: { label: "Đã đăng", cls: "bg-green-100 text-green-800" },
  failed: { label: "Lỗi", cls: "bg-red-100 text-red-800" },
  cancelled: { label: "Đã huỷ", cls: "bg-gray-100 text-gray-500" },
};

/** "YYYY-MM-DDTHH:MM" for a datetime-local box, in shop time, rounded up to the next quarter hour. */
function nextSlotLocal(): string {
  const d = new Date(Date.now() + 15 * 60000);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: SHOP_TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const m = String(Math.ceil(Number(g("minute")) / 15) * 15 % 60).padStart(2, "0");
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour").replace("24", "00")}:${m}`;
}

/** Tổng quan › Đăng bài fanpage: compose from a product, post now / schedule, auto-post by the clock, history. */
export default async function AdminFanpage({ searchParams }: Props) {
  await requireAdmin("fanpage");
  const sp = await searchParams;
  rememberSiteOrigin(await siteUrl());
  const cfg = getFanpageConfig();
  const [products, posts] = await Promise.all([getAllProducts(true), Promise.resolve(listFanpagePosts(80))]);
  const pickable: PickableProduct[] = products.filter((p) => p.status === "publish").map((p) => ({ id: p.id, name: p.name, sku: p.sku, thumb: p.thumb, costJpy: null, stock: p.stock }));
  const draftId = Number.parseInt(first(sp.draft), 10);
  const draft = Number.isInteger(draftId) ? getFanpagePost(draftId) : null;
  const draftProduct = draft?.productId ? products.find((p) => p.id === draft.productId) : undefined;
  const photoChoices = draftProduct ? Array.from(new Set([draftProduct.thumb, ...draftProduct.images].filter(Boolean))) : draft?.images ?? [];
  const connected = !!(cfg.pageId && cfg.token);
  const queued = posts.filter((p) => p.status === "queued").length;

  return (
    <>
      <PageHeader
        title="Đăng bài fanpage"
        subtitle={`Soạn bài từ sản phẩm (nội dung, ảnh, link đặt hàng) và đăng lên Facebook Page — đăng ngay, lên lịch hoặc tự động theo giờ. ${connected ? `Đã kết nối Page ${cfg.pageId}` : "Chưa kết nối Page"} · ${queued} bài chờ đăng${cfg.auto.enabled ? ` · tự động ${cfg.auto.times.join(", ")}` : ""}.`}
        actions={
          <a href="https://www.facebook.com/lienanh.taphoa/" target="_blank" rel="noreferrer" className={btnSecondary}>
            <Fa name="external-link" /> Mở fanpage
          </a>
        }
      />
      {first(sp.saved) ? <Flash>{first(sp.saved)}</Flash> : null}
      {first(sp.error) ? <Flash kind="error">{first(sp.error)}</Flash> : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card title="Soạn bài từ sản phẩm">
            <form action={composeDraftAction} className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
              <div>
                <label className={adminLabel}>Sản phẩm</label>
                <ProductSearchSelect products={pickable} placeholder="Gõ tên, SKU hoặc #id sản phẩm…" />
              </div>
              <button type="submit" className={btnPrimary}>
                <Fa name="pencil" /> Tạo nội dung
              </button>
            </form>
            <p className="mt-2 mb-0 flex items-center gap-1 text-[12px] text-lien-muted">Nội dung soạn tự động từ mô tả sản phẩm; sửa tuỳ ý trước khi đăng.<InfoPopover>Nội dung tự soạn từ mô tả sản phẩm (câu mở, công dụng, giá, link đặt hàng, hotline, hashtag tiếng Việt). Sửa tuỳ ý trước khi đăng; &ldquo;Tạo lại nội dung&rdquo; đổi cách viết.</InfoPopover></p>
          </Card>

          {draft ? (
            <div id="draft">
              <Card title={`Bài nháp #${draft.id}${draft.productName ? ` · ${draft.productName}` : ""}`} actions={<span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", STATUS[draft.status].cls)}>{STATUS[draft.status].label}</span>}>
                <form action={saveDraftAction} className="grid gap-4" data-testid="draft-form">
                  <input type="hidden" name="id" value={draft.id} />
                  <div>
                    <label className={adminLabel} htmlFor="fp-message">
                      Nội dung bài viết
                    </label>
                    <textarea id="fp-message" name="message" rows={16} defaultValue={draft.message} className={cn(adminInput, "text-[14px] leading-6")} />
                    <p className="m-0 mt-1 text-[12px] text-lien-muted">{draft.message.length.toLocaleString("vi-VN")} ký tự. Link đặt hàng đã có trong bài; ảnh chọn bên dưới sẽ đính kèm (tối đa 10).</p>
                  </div>
                  <div>
                    <p className={adminLabel}>Ảnh đính kèm</p>
                    {photoChoices.length ? (
                      <div className="flex flex-wrap gap-2">
                        {photoChoices.map((img) => (
                          <label key={img} className="relative cursor-pointer">
                            <input type="checkbox" name="images" value={img} defaultChecked={draft.images.includes(img)} className="absolute top-1 left-1 z-10 h-4 w-4" />
                            <Image src={img} alt="" width={96} height={96} className="h-24 w-24 rounded border border-[#e5e7eb] object-contain" unoptimized />
                          </label>
                        ))}
                      </div>
                    ) : (
                      <p className="m-0 text-[13px] text-lien-muted">Sản phẩm chưa có ảnh — bài sẽ đăng dạng link kèm nội dung.</p>
                    )}
                  </div>
                  <div>
                    <label className={adminLabel} htmlFor="fp-link">
                      Link sản phẩm
                    </label>
                    <input id="fp-link" name="link" defaultValue={draft.link} className={cn(adminInput, "font-mono text-[12px]")} />
                  </div>
                  <div className="flex flex-wrap items-center gap-2 border-t border-[#e5e7eb] pt-3">
                    <button type="submit" name="mode" value="now" className={btnPrimary} disabled={!connected} title={connected ? "Đăng lên fanpage ngay bây giờ" : "Cần kết nối Page trước"}>
                      <Fa name="facebook" /> Đăng ngay
                    </button>
                    <span className="inline-flex items-center gap-1.5">
                      <input type="datetime-local" name="scheduledAt" defaultValue={draft.scheduledAt ? new Date(new Date(draft.scheduledAt).getTime() + 7 * 3600000).toISOString().slice(0, 16) : nextSlotLocal()} className={cn(adminInput, "!mb-0 !w-auto !py-1.5")} aria-label="Thời điểm đăng" />
                      <button type="submit" name="mode" value="schedule" className={btnSecondary}>
                        <Fa name="calendar" /> Lên lịch
                      </button>
                    </span>
                    <button type="submit" name="mode" value="save" className={btnSecondary}>
                      <Fa name="check" /> Lưu nháp
                    </button>
                    <button type="submit" form={`regen-${draft.id}`} className={btnSecondary}>
                      <Fa name="refresh" /> Tạo lại nội dung
                    </button>
                    <ConfirmSubmit form={`cancel-${draft.id}`} message="Xoá bài nháp này?" className={cn(btnDanger, "ml-auto")}>
                      Xoá nháp
                    </ConfirmSubmit>
                  </div>
                </form>
                <form id={`regen-${draft.id}`} action={regenerateDraftAction}>
                  <input type="hidden" name="id" value={draft.id} />
                </form>
                <form id={`cancel-${draft.id}`} action={cancelPostAction}>
                  <input type="hidden" name="id" value={draft.id} />
                </form>
              </Card>
            </div>
          ) : null}

          <Card title={`Hàng chờ & lịch sử (${posts.length})`}>
            <div className="overflow-x-auto">
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th className={thClass}>Bài</th>
                    <th className={thClass}>Trạng thái</th>
                    <th className={thClass}>Thời gian</th>
                    <th className={thClass} />
                  </tr>
                </thead>
                <tbody>
                  {posts.map((p) => (
                    <tr key={p.id} className="align-top hover:bg-[#fafafa]">
                      <td className={`${tdClass} min-w-[280px]`}>
                        <div className="flex items-start gap-2">
                          {p.productThumb ? <Image src={p.productThumb} alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded border border-[#e5e7eb] object-contain" unoptimized /> : null}
                          <div className="min-w-0">
                            <Link href={`/admin/fanpage/?draft=${p.id}#draft`} className="text-[13px] font-semibold text-lien-heading hover:text-lien-blue">
                              #{p.id} · {p.productName || "Bài tự do"}
                            </Link>
                            <p className="m-0 line-clamp-2 text-[12px] text-lien-muted">{p.message}</p>
                            <p className="m-0 text-[11px] text-lien-muted">
                              {p.images.length} ảnh{p.auto ? " · tự động" : ""}
                              {p.error ? <span className="ml-1 text-red-700">· {p.error}</span> : null}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className={tdClass}>
                        <span className={cn("inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold", STATUS[p.status].cls)}>{STATUS[p.status].label}</span>
                        {p.fbPostId ? (
                          <a href={`https://www.facebook.com/${p.fbPostId}`} target="_blank" rel="noreferrer" className="mt-1 block text-[12px] text-lien-blue hover:underline">
                            Xem trên Facebook ↗
                          </a>
                        ) : null}
                      </td>
                      <td className={`${tdClass} whitespace-nowrap text-[12px] text-lien-muted`}>
                        {p.postedAt ? `Đăng ${formatDateTime(p.postedAt)}` : p.scheduledAt ? `Hẹn ${formatDateTime(p.scheduledAt)}` : `Tạo ${formatDateTime(p.createdAt)}`}
                      </td>
                      <td className={`${tdClass} whitespace-nowrap`}>
                        <div className="flex items-center gap-1.5">
                          {p.status !== "posted" ? (
                            <form action={postNowAction}>
                              <input type="hidden" name="id" value={p.id} />
                              <button type="submit" className={`${btnSecondary} !px-2 !py-1 !text-[12px]`} disabled={!connected} title={p.status === "failed" ? "Thử đăng lại" : "Đăng ngay"}>
                                <Fa name="facebook" /> {p.status === "failed" ? "Thử lại" : "Đăng ngay"}
                              </button>
                            </form>
                          ) : null}
                          {p.status !== "posted" ? (
                            <form action={cancelPostAction}>
                              <input type="hidden" name="id" value={p.id} />
                              <ConfirmSubmit message={p.status === "queued" ? `Huỷ lịch đăng bài #${p.id}?` : `Xoá bài #${p.id}?`} className="text-[12px] text-lien-heart hover:underline">
                                {p.status === "queued" ? "Huỷ lịch" : "Xoá"}
                              </ConfirmSubmit>
                            </form>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {posts.length === 0 ? (
                    <tr>
                      <td colSpan={4} className={`${tdClass} text-center text-lien-muted`}>
                        Chưa có bài nào — chọn sản phẩm ở trên và bấm &ldquo;Tạo nội dung&rdquo;.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Kết nối Facebook Page">
            <form action={saveFanpageConnectionAction} className="grid gap-3">
              <div>
                <label className={adminLabel} htmlFor="fb-page">
                  Page ID <span className="font-normal text-lien-muted">(dãy số của fanpage)</span>
                </label>
                <input id="fb-page" name="pageId" defaultValue={cfg.pageId} placeholder="VD: 1000123456789" className={adminInput} />
              </div>
              <div>
                <label className={adminLabel} htmlFor="fb-token">
                  Page access token <span className="font-normal text-lien-muted">{cfg.token ? "— đã lưu, để trống nếu giữ nguyên" : ""}</span>
                </label>
                <input id="fb-token" name="token" type="password" placeholder={cfg.token ? "•••••••• (đã lưu trên máy chủ)" : "Dán token dài hạn của Page"} autoComplete="off" className={adminInput} />
              </div>
              <div>
                <label className={adminLabel} htmlFor="fb-ver">
                  Phiên bản Graph API
                </label>
                <input id="fb-ver" name="graphVersion" defaultValue={cfg.graphVersion} className={cn(adminInput, "font-mono")} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="submit" className={btnPrimary}>
                  <Fa name="check" /> Lưu & kiểm tra
                </button>
                {cfg.token ? (
                  <ConfirmSubmit form="fb-clear" message="Xoá access token đã lưu?" className="text-[12px] text-lien-heart hover:underline">
                    Xoá token
                  </ConfirmSubmit>
                ) : null}
              </div>
            </form>
            <form id="fb-clear" action={clearFanpageTokenAction} />
            <details className="mt-3 text-[12px] leading-5 text-lien-muted">
              <summary className="cursor-pointer select-none font-semibold text-lien-blue">Lấy token thế nào?</summary>
              <ol className="m-0 mt-1 list-decimal space-y-1 pl-4">
                <li>Vào developers.facebook.com → tạo App (loại Business), thêm sản phẩm “Facebook Login for Business”.</li>
                <li>Graph API Explorer: chọn App, “Get Page Access Token”, chọn fanpage Tạp Hóa Liên Anh, tick quyền <code>pages_manage_posts</code>, <code>pages_read_engagement</code>, <code>pages_show_list</code>.</li>
                <li>Đổi sang token dài hạn (Access Token Debugger → “Extend Access Token”), dán vào ô trên. Token chỉ lưu trên máy chủ, không gửi ra trình duyệt.</li>
                <li>Page ID: Trang → Giới thiệu → “Xem thêm thông tin” (hoặc mở fanpage bằng Graph Explorer: <code>/me/accounts</code>).</li>
              </ol>
              <p className="m-0 mt-1">Ảnh được Facebook tải từ địa chỉ web công khai ({cfg.origin || "chưa xác định — mở trang này trên web thật một lần"}).</p>
            </details>
          </Card>

          <Card title="Tự động đăng theo lịch">
            <form action={saveFanpageAutoAction} className="grid gap-3">
              <label className="flex items-center gap-2 text-[14px]">
                <input type="checkbox" name="enabled" defaultChecked={cfg.auto.enabled} className="h-4 w-4" /> Bật tự động đăng mỗi ngày
              </label>
              <div>
                <label className={adminLabel} htmlFor="fb-times">
                  Giờ đăng <span className="font-normal text-lien-muted">(giờ Việt Nam, cách nhau dấu phẩy)</span>
                </label>
                <input id="fb-times" name="times" defaultValue={cfg.auto.times.join(", ")} placeholder="09:00, 20:00" className={adminInput} />
              </div>
              <div>
                <label className={adminLabel} htmlFor="fb-pick">
                  Chọn sản phẩm
                </label>
                <select id="fb-pick" name="pick" defaultValue={cfg.auto.pick} className={adminInput}>
                  <option value="unposted">Ưu tiên sản phẩm chưa đăng bao giờ, rồi đến bài cũ nhất</option>
                  <option value="newest">Sản phẩm mới thêm gần nhất</option>
                  <option value="random">Ngẫu nhiên</option>
                </select>
              </div>
              <div>
                <label className={adminLabel} htmlFor="fb-tags">
                  Hashtag thêm vào mọi bài
                </label>
                <input id="fb-tags" name="hashtags" defaultValue={cfg.auto.hashtags} placeholder="#taphoalienanh #hangnhat" className={adminInput} />
              </div>
              <button type="submit" className={`${btnPrimary} justify-self-start`}>
                <Fa name="check" /> Lưu lịch
              </button>
            </form>
            <p className="mt-2 mb-0 flex items-center gap-1 text-[12px] text-lien-muted">Đến giờ, hệ thống tự chọn sản phẩm, soạn bài và đăng.<InfoPopover>Đến giờ, hệ thống tự chọn sản phẩm đang bán (có ảnh, có giá), soạn bài với cách viết đổi luân phiên, đính kèm ảnh + link và đăng. Bài tự động hiện trong hàng chờ vài phút trước giờ đăng — có thể sửa hoặc huỷ. Bỏ lỡ giờ quá 90 phút (máy chủ tắt) thì bỏ qua lượt đó.</InfoPopover></p>
          </Card>
        </div>
      </div>
    </>
  );
}
