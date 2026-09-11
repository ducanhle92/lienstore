import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { adminSendMessageAction, setStageAction, updateOrderStatusAction } from "@/app/admin/orders/actions";
import { OrderChat } from "@/components/sites/lienstore/shop/cart/OrderChat";
import { OrderTracker } from "@/components/sites/lienstore/shop/cart/OrderTracker";
import { SHIP_STAGES, stageIndex } from "@/lib/shipping";
import { deleteOrderFileAction, saveAdminNoteAction, uploadOrderFilesAction } from "@/app/admin/orders/files-actions";
import { ConfirmSubmit } from "@/components/sites/lienstore/admin/ConfirmSubmit";
import { ADMIN_STATUS_LABELS, ADMIN_STATUSES, adminInput, adminLabel, btnPrimary, btnSecondary, Card, Flash, PageHeader, StatusBadge, tableClass, tdClass, thClass } from "@/components/sites/lienstore/admin/ui";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { requireAdmin } from "@/lib/auth";
import { getCustomerOverview, getImportQuoteConfig, getOrderById, getOrderChargeableWeightG, getOrderFiles, getOrderLegs, getOrderMessages, getShippingMethods, markOrderMessagesRead } from "@/lib/db";
import { setPurchaseAction } from "@/app/admin/purchases/actions";
import { PURCHASE_STAGES } from "@/lib/purchase";
import { OrderLegsEditor } from "@/components/sites/lienstore/admin/OrderLegsEditor";
import { formatDateTime, formatPrice } from "@/lib/format";
import { FILES_URL_PREFIX, formatBytes, orderFileToken } from "@/lib/uploads";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const PAYMENT: Record<string, string> = { bacs: "Chuyển khoản ngân hàng", cod: "Thanh toán khi nhận hàng" };
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function AdminOrderDetail({ params, searchParams }: Props) {
  await requireAdmin("orders");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const [order, files, overview, legMap, shippingMethods, messages, orderWeightG, importQuote] = await Promise.all([getOrderById(id), getOrderFiles(id), getCustomerOverview(), getOrderLegs([id]), getShippingMethods(false), getOrderMessages(id), getOrderChargeableWeightG(id), getImportQuoteConfig()]);
  if (!order) notFound();
  await markOrderMessagesRead(order.id, "admin");
  const curStage = stageIndex(order.shipStage);
  const nextStage = SHIP_STAGES[curStage + 1];
  const c = order.customer;
  const customerKey =
    overview.find((x) => (order.customerId && x.customerId === order.customerId) || (x.email && x.email.toLowerCase() === c.email.trim().toLowerCase()))?.key ??
    `g:${c.email.trim().toLowerCase() || c.phone.replace(/\D/g, "")}`;
  const token = orderFileToken(order.id);
  const publicReceiptUrl = (path: string) => `${FILES_URL_PREFIX}${path}?t=${token}`;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const totalJpy = files.reduce((s, f) => s + (f.amountJpy ?? 0), 0);

  return (
    <>
      <PageHeader
        title={`Đơn hàng #${order.number}`}
        subtitle={`Đặt lúc ${formatDateTime(order.createdAt)} · cập nhật ${formatDateTime(order.updatedAt)}`}
        back={{ href: "/admin/orders/", label: "Đơn hàng" }}
        actions={<StatusBadge status={order.status} />}
      />
      {sp.updated ? <Flash>Đã cập nhật trạng thái đơn hàng.</Flash> : null}
      {sp.files ? <Flash>Đã đính kèm {first(sp.files)} file vào đơn hàng.</Flash> : null}
      {sp.fileDeleted ? <Flash>Đã xoá file.</Flash> : null}
      {sp.noted ? <Flash>Đã lưu ghi chú nội bộ.</Flash> : null}
      {sp.staged ? <Flash>Đã cập nhật tiến độ vận chuyển; khách thấy ngay trong trang đơn hàng.</Flash> : null}
      {sp.fileError ? <Flash kind="warning">{first(sp.fileError)}</Flash> : null}
      {sp.saved ? <Flash>{first(sp.saved)}</Flash> : null}
      {sp.error ? <Flash kind="error">{first(sp.error)}</Flash> : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Sản phẩm">
            <table className={tableClass}>
              <thead>
                <tr>
                  <th className={thClass} />
                  <th className={thClass}>Sản phẩm</th>
                  <th className={thClass}>Đơn giá</th>
                  <th className={thClass}>SL</th>
                  <th className={thClass}>Mua hàng</th>
                  <th className={`${thClass} text-right`}>Thành tiền</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((it) => (
                  <tr key={it.productId}>
                    <td className={`${tdClass} w-14`}>
                      {it.image ? <Image src={it.image} alt="" width={40} height={40} className="h-10 w-10 rounded border border-[#e5e7eb] object-cover" unoptimized /> : null}
                    </td>
                    <td className={tdClass}>
                      <Link href={`/product/${it.slug}/`} target="_blank" className="text-lien-heading hover:text-lien-blue">
                        {it.name}
                      </Link>
                      <div className="text-[12px] text-lien-muted">
                        #{it.productId} ·{" "}
                        <Link href={`/admin/products/${it.productId}/`} className="hover:text-lien-blue">
                          sửa sản phẩm
                        </Link>
                      </div>
                    </td>
                    <td className={`${tdClass} whitespace-nowrap`}>{formatPrice(it.price, order.currency)}</td>
                    <td className={tdClass}>{it.quantity}</td>
                    <td className={tdClass}>
                      {it.itemId ? (
                        <form action={setPurchaseAction} className="flex items-center gap-1">
                          <input type="hidden" name="itemId" value={it.itemId} />
                          <input type="hidden" name="back" value={`/admin/orders/${order.id}/`} />
                          <select name="status" defaultValue={it.purchaseStatus ?? "not_bought"} className="rounded-md border border-[#d1d5db] bg-white px-2 py-1 text-[12px]" aria-label="Trạng thái mua hàng">
                            {PURCHASE_STAGES.map((s) => (
                              <option key={s.key} value={s.key}>
                                {s.label}
                              </option>
                            ))}
                          </select>
                          <button type="submit" className="rounded-md border border-[#d1d5db] bg-white px-2 py-1 text-[12px] hover:border-lien-blue" title="Lưu">
                            <Fa name="check-circle" />
                          </button>
                        </form>
                      ) : null}
                    </td>
                    <td className={`${tdClass} whitespace-nowrap text-right`}>{formatPrice(it.price * it.quantity, order.currency)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5} className={`${tdClass} text-right font-semibold`}>
                    Tạm tính
                  </td>
                  <td className={`${tdClass} text-right`}>{formatPrice(order.subtotal, order.currency)}</td>
                </tr>
                {order.discount > 0 ? (
                  <tr>
                    <td colSpan={5} className={`${tdClass} text-right font-semibold`}>
                      Giảm giá {order.voucherCode ? <span className="font-normal text-lien-muted">({order.voucherCode})</span> : null}
                    </td>
                    <td className={`${tdClass} text-right text-lien-success`}>−{formatPrice(order.discount, order.currency)}</td>
                  </tr>
                ) : null}
                <tr>
                  <td colSpan={5} className={`${tdClass} text-right font-semibold`}>
                    Giao hàng {order.shippingLabel ? <span className="font-normal text-lien-muted">({order.shippingLabel})</span> : null}
                    {order.shipFeePayment === "on_delivery" ? <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">khách trả phí ship cho shipper · không nằm trong Tổng</span> : null}
                  </td>
                  <td className={`${tdClass} text-right`}>{order.shippingFee > 0 ? `${order.shipFeePayment === "on_delivery" ? "≈ " : ""}${formatPrice(order.shippingFee, order.currency)}` : "Miễn phí"}</td>
                </tr>
                <tr>
                  <td colSpan={5} className={`${tdClass} text-right font-semibold`}>
                    Tổng
                  </td>
                  <td className={`${tdClass} text-right text-[16px] font-bold`}>{formatPrice(order.total, order.currency)}</td>
                </tr>
              </tfoot>
            </table>
          </Card>

        <Card title="Vận chuyển đơn này (3 chặng)">
          <OrderLegsEditor order={order} legs={legMap.get(order.id) ?? []} methods={shippingMethods} back={`/admin/orders/${order.id}/`} weightG={orderWeightG} quote={importQuote} />
          <p className="mt-3 text-[12px] text-lien-muted">Chọn phương thức · cột cho từng chặng; để trống phí thì tự tính theo cột và khối lượng đơn. Chặng nội địa Việt Nam có thể áp lại phí vào tổng tiền khách trả.</p>
        </Card>

          <Card title={`Trao đổi với khách${messages.length ? ` (${messages.length})` : ""}`}>
            <OrderChat
              orderId={order.id}
              messages={messages}
              me="admin"
              action={adminSendMessageAction}
              quickReplies={[
                "LienStore đã nhận đơn, sẽ xác nhận và đặt mua tại Nhật trong hôm nay.",
                "Đã mua hàng tại Nhật, bill đính kèm trong đơn. Hàng về kho Nhật trong 2–4 ngày.",
                "Kiện hàng đã lên đường về Việt Nam, dự kiến 5–7 ngày nữa tới kho.",
                "Hàng đã về kho Thanh Hóa, LienStore giao cho đơn vị vận chuyển hôm nay.",
              ]}
            />
          </Card>

          <Card title="Ghi chú nội bộ">
            <form action={saveAdminNoteAction} className="grid gap-3">
              <input type="hidden" name="orderId" value={order.id} />
              <textarea name="adminNote" rows={3} defaultValue={order.adminNote} placeholder="Chỉ admin thấy: mã vận đơn, đã mua ở đâu, còn thiếu gì…" className={adminInput} />
              <div>
                <button type="submit" className={btnSecondary}>
                  Lưu ghi chú
                </button>
              </div>
            </form>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Tiến độ vận chuyển">
            <div id="tracking" className="mb-4">
              <OrderTracker order={order} compact />
            </div>
            <p className="mb-3 text-[13px] leading-5 text-lien-text">
              Hiện tại: <strong className="text-lien-heart">{SHIP_STAGES[curStage].label}</strong>
              <span className="block text-[12px] text-lien-muted">{SHIP_STAGES[curStage].hint}</span>
            </p>
            <form action={setStageAction} className="grid gap-2">
              <input type="hidden" name="id" value={order.id} />
              <input name="note" placeholder="Ghi chú cho khách (tuỳ chọn), vd: mã vận đơn, ngày dự kiến" className={adminInput} />
              {nextStage ? (
                <button type="submit" name="stage" value={nextStage.key} className={btnPrimary}>
                  <Fa name="check" /> Chuyển sang: {nextStage.label}
                </button>
              ) : (
                <p className="m-0 rounded-md bg-green-50 px-3 py-2 text-[13px] font-semibold text-green-800">Đơn đã hoàn tất giao hàng.</p>
              )}
              <details className="text-[12px] text-lien-muted">
                <summary className="cursor-pointer select-none">Chọn bước khác / quay lại bước trước</summary>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {SHIP_STAGES.map((st, i) => (
                    <button key={st.key} type="submit" name="stage" value={st.key} className={`${btnSecondary} !px-2 !py-1 !text-[12px] ${i === curStage ? "!bg-lien-blue !text-white" : ""}`}>
                      {st.short}
                    </button>
                  ))}
                </div>
              </details>
            </form>
          </Card>
          <Card title="Trạng thái">
            <form action={updateOrderStatusAction} className="grid gap-3">
              <input type="hidden" name="id" value={order.id} />
              <select name="status" defaultValue={order.status} className={adminInput}>
                {ADMIN_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {ADMIN_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
              <button type="submit" className={btnPrimary}>
                Cập nhật
              </button>
            </form>
          </Card>
          <Card
            title="Khách hàng"
            actions={
              <Link href={`/admin/customers/${encodeURIComponent(customerKey)}/`} className="text-[13px] text-lien-blue hover:underline">
                Lịch sử mua →
              </Link>
            }
          >
            <dl className="grid gap-2 text-[14px] leading-5">
              <div>
                <dt className="text-[12px] font-semibold uppercase text-[#6b7280]">Họ tên</dt>
                <dd>
                  {c.lastName} {c.firstName}
                </dd>
              </div>
              <div>
                <dt className="text-[12px] font-semibold uppercase text-[#6b7280]">Điện thoại</dt>
                <dd>
                  <a href={`tel:${c.phone}`} className="text-lien-blue hover:underline">
                    {c.phone}
                  </a>
                </dd>
              </div>
              <div>
                <dt className="text-[12px] font-semibold uppercase text-[#6b7280]">Email</dt>
                <dd>
                  <a href={`mailto:${c.email}`} className="text-lien-blue hover:underline">
                    {c.email}
                  </a>
                </dd>
              </div>
              <div>
                <dt className="text-[12px] font-semibold uppercase text-[#6b7280]">Địa chỉ</dt>
                <dd>{c.address}</dd>
              </div>
              <div>
                <dt className="text-[12px] font-semibold uppercase text-[#6b7280]">Thanh toán</dt>
                <dd>
                  {PAYMENT[order.paymentMethod]}
                  {order.prepaidRequired ? <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Hàng order · cần thanh toán trước 100%</span> : null}
                  <span className="block text-[12px] text-lien-muted">Nội dung CK: LIENSTORE {order.number}</span>
                </dd>
              </div>
              {c.note ? (
                <div>
                  <dt className="text-[12px] font-semibold uppercase text-[#6b7280]">Ghi chú của khách</dt>
                  <dd className="whitespace-pre-wrap">{c.note}</dd>
                </div>
              ) : null}
            </dl>
          </Card>
          <div id="bill">
            <Card
              title="Bill mua hàng tại Nhật"
              actions={files.length ? <span className="text-[13px] text-lien-muted">{files.length} file{totalJpy ? ` · ¥${totalJpy.toLocaleString("ja-JP")}` : ""}</span> : null}
            >
              <p className="mb-4 text-[13px] leading-5 text-lien-muted">
                Đính kèm hoá đơn/ảnh chụp đơn mua bên Nhật. Khách xem được các file này trong trang <em>Đơn hàng đã nhận</em>, mục <em>Đơn hàng</em> của tài khoản và khi tra cứu đơn.
              </p>
              {files.length ? (
                <ul className="mb-5 grid list-none gap-2 p-0">
                  {files.map((f) => (
                    <li key={f.id} className="flex flex-wrap items-center gap-3 rounded-md border border-[#e5e7eb] px-3 py-2">
                      <Fa name={f.mime === "application/pdf" ? "file-pdf-o" : "file-image-o"} className="text-[18px] text-lien-blue" />
                      <div className="min-w-0 flex-1">
                        <a href={publicReceiptUrl(f.path)} target="_blank" rel="noreferrer" className="font-semibold text-lien-heading hover:text-lien-blue">
                          {f.fileName}
                        </a>
                        <div className="text-[12px] text-lien-muted">
                          {formatBytes(f.size)} · {formatDateTime(f.createdAt)}
                          {f.amountJpy ? ` · ¥${f.amountJpy.toLocaleString("ja-JP")}` : ""}
                          {f.note ? ` · ${f.note}` : ""}
                        </div>
                      </div>
                      <form action={deleteOrderFileAction}>
                        <input type="hidden" name="fileId" value={f.id} />
                        <input type="hidden" name="orderId" value={order.id} />
                        <ConfirmSubmit message={`Xoá file “${f.fileName}”?`} className="text-[13px] text-lien-heart hover:underline">
                          Xoá
                        </ConfirmSubmit>
                      </form>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mb-5 rounded-md border border-dashed border-[#d1d5db] p-3 text-center text-[13px] text-lien-muted">Chưa có bill nào cho đơn này.</p>
              )}
              <form action={uploadOrderFilesAction} className="grid gap-3">
                <input type="hidden" name="orderId" value={order.id} />
                <div>
                  <label className={adminLabel} htmlFor="files">
                    File (ảnh hoặc PDF, nhiều file)
                  </label>
                  <input id="files" name="files" type="file" accept="image/*,application/pdf" multiple required className={adminInput} />
                </div>
                <div>
                  <label className={adminLabel} htmlFor="amountJpy">
                    Số tiền (JPY)
                  </label>
                  <input id="amountJpy" name="amountJpy" inputMode="numeric" placeholder="vd 2280" className={adminInput} />
                </div>
                <div>
                  <label className={adminLabel} htmlFor="note">
                    Ghi chú cho khách
                  </label>
                  <input id="note" name="note" placeholder="vd Amazon JP 08/09, 2 món" className={adminInput} />
                </div>
                <div className="flex items-end">
                  <button type="submit" className={btnPrimary}>
                    <Fa name="upload" /> Đính kèm
                  </button>
                </div>
              </form>
              {files.length ? (
                <p className="mt-4 text-[12px] leading-5 text-lien-muted">
                  Link gửi khách (không cần đăng nhập):{" "}
                  <code className="rounded bg-[#f3f4f6] px-1.5 py-0.5">
                    {siteUrl}/checkout/order-received/{order.id}/
                  </code>
                </p>
              ) : null}
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
