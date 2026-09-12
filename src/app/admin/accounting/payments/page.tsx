import Link from "next/link";
import { assignPaymentAction, saveSepayKeyAction, simulatePaymentAction } from "@/app/admin/accounting/payments/actions";
import { adminInput, adminLabel, btnPrimary, btnSecondary, Card, Flash, PageHeader, tableClass, tdClass, thClass } from "@/components/sites/lienstore/admin/ui";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { requireAdmin } from "@/lib/auth";
import { getDefaultBankAccount, getPayPrefix } from "@/lib/bank-config";
import { formatAmount, formatDateTime } from "@/lib/format";
import { listPaymentEvents, sepayApiKey } from "@/lib/payments";
import { cn } from "@/lib/utils";
import type { PaymentEvent } from "@/types/shop";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

const STATUS: Record<PaymentEvent["status"], { label: string; cls: string }> = {
  matched: { label: "Đã khớp · đơn đã thanh toán", cls: "bg-green-100 text-green-800" },
  matched_manual: { label: "Khớp tay · đã thanh toán", cls: "bg-green-100 text-green-800" },
  already_paid: { label: "Đơn đã thanh toán trước", cls: "bg-sky-100 text-sky-800" },
  amount_mismatch: { label: "Thiếu tiền — chờ xử lý", cls: "bg-amber-100 text-amber-800" },
  unmatched: { label: "Không nhận ra mã đơn", cls: "bg-red-100 text-red-800" },
  unknown_account: { label: "Sai tài khoản nhận", cls: "bg-red-100 text-red-800" },
  order_cancelled: { label: "Đơn đã huỷ", cls: "bg-gray-200 text-gray-700" },
  ignored: { label: "Tiền ra — bỏ qua", cls: "bg-gray-200 text-gray-700" },
  duplicate: { label: "Trùng (đã xử lý)", cls: "bg-gray-200 text-gray-700" },
};

/** Kế toán › Thanh toán tự động: SePay webhook config, event log, manual reconciliation, dry run. */
export default async function AdminPayments({ searchParams }: Props) {
  await requireAdmin("accounting");
  const sp = await searchParams;
  const [events, account, prefix] = await Promise.all([listPaymentEvents(60), getDefaultBankAccount(), getPayPrefix()]);
  const key = sepayApiKey();
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://linconnn.io.vn").replace(/\/$/, "");
  const webhookUrl = `${site}/api/webhooks/sepay/`;
  const step = "rounded-md border border-[#e5e7eb] bg-white px-3 py-2 text-[13px] leading-5";
  return (
    <>
      <PageHeader title="Thanh toán tự động (SePay)" subtitle="Khách chuyển khoản → BIDV ghi nhận → SePay gửi webhook → hệ thống kiểm tra mã đơn + số tiền + chứng thực → đơn chuyển sang “Đã xác nhận thanh toán”." back={{ href: "/admin/accounting/", label: "Kế toán" }} />
      {first(sp.saved) ? <Flash>{first(sp.saved)}</Flash> : null}
      {first(sp.error) ? <Flash kind="error">{first(sp.error)}</Flash> : null}

      <div className="mb-6 grid gap-6 lg:grid-cols-[1fr_420px]">
        <Card title="Kết nối SePay">
          <ol className="m-0 grid gap-2 pl-0 sm:grid-cols-2" style={{ listStyle: "none" }}>
            <li className={step}>
              <strong>1.</strong> Tạo tài khoản tại sepay.vn, kết nối tài khoản <strong>{account.bank} {account.accountNumber}</strong> (BIDV có ưu đãi riêng cho SePay).
            </li>
            <li className={step}>
              <strong>2.</strong> SePay › Webhooks › Thêm: sự kiện <em>Có tiền vào</em>, URL bên dưới, chứng thực <em>API Key</em> — dán cùng chuỗi vào ô API key ở đây.
            </li>
            <li className={step}>
              <strong>3.</strong> Trong SePay đặt <em>tiền tố mã thanh toán</em> = <code className="rounded bg-lien-cream px-1 font-bold">{prefix}</code> để SePay tách mã (ví dụ {prefix}1034K7Q) khỏi nội dung CK.
            </li>
            <li className={step}>
              <strong>4.</strong> Bấm “Giả lập giao dịch” bên phải để xem toàn bộ luồng chạy trước khi có tiền thật.
            </li>
          </ol>
          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <div>
              <label className={adminLabel}>URL webhook (dán vào SePay)</label>
              <code className="block rounded-md border border-[#e5e7eb] bg-[#fafafa] px-3 py-2 text-[13px]" data-testid="webhook-url">
                {webhookUrl}
              </code>
            </div>
            <form action={saveSepayKeyAction} className="flex items-end gap-2">
              <div>
                <label className={adminLabel} htmlFor="apiKey">
                  API key webhook {key ? <span className="ml-1 rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700">đã đặt ••••{key.slice(-4)}</span> : <span className="ml-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">chưa có — webhook đang tắt</span>}
                </label>
                <input id="apiKey" name="apiKey" type="password" autoComplete="off" placeholder={key ? "Để trống = giữ" : "Chuỗi bí mật do bạn tự đặt trong SePay"} className={`${adminInput} !mb-0 !w-[260px]`} />
              </div>
              <button type="submit" className={btnPrimary}>
                <Fa name="check" /> Lưu
              </button>
              {key ? (
                <button type="submit" name="clear" value="1" className={btnSecondary}>
                  Gỡ
                </button>
              ) : null}
            </form>
          </div>
          <p className="mt-3 text-[12px] leading-5 text-lien-muted">
            Backend chỉ chấp nhận request có header <code>Authorization: Apikey &lt;key&gt;</code> đúng, lưu mọi thông báo vào bảng đối soát (chống trùng theo id giao dịch), đánh dấu “Đã thanh toán” khi <strong>mã đơn khớp và số tiền ≥ tổng đơn</strong>; thiếu tiền hoặc không nhận ra mã thì giữ lại để đối soát tay bên dưới. Luôn trả {"{"}&quot;success&quot;: true{"}"} để SePay không gửi lặp.
          </p>
          <p className="mt-2 text-[12px] leading-5 text-lien-muted">
            <strong>Phí SePay (bảng giá 09/2026):</strong> gói FREE 0đ/tháng cho <strong>50 giao dịch tiền vào/tháng</strong>, vượt thì tính phí phần vượt theo đơn giá gói; gói STARTUP từ 120.000đ/tháng (nhiều nấc giao dịch); gói SHOP 99.000đ/tháng (70.000đ/cửa hàng nếu trả năm) không giới hạn giao dịch nhưng không có API/webhook. Chỉ đếm giao dịch <em>tiền vào</em>. Nguồn: sepay.vn/bang-gia.html.
          </p>
        </Card>

        <Card title="Giả lập giao dịch (thử luồng)">
          <form action={simulatePaymentAction} className="grid gap-3">
            <div>
              <label className={adminLabel} htmlFor="sim-order">
                Số đơn
              </label>
              <input id="sim-order" name="orderNumber" inputMode="numeric" placeholder="VD: 1034" className={adminInput} required />
            </div>
            <div>
              <label className={adminLabel} htmlFor="sim-amount">
                Số tiền chuyển <span className="font-normal text-lien-muted">(để trống = đúng tổng đơn)</span>
              </label>
              <input id="sim-amount" name="amount" inputMode="numeric" placeholder="VD: 974850" className={adminInput} />
            </div>
            <button type="submit" className={btnPrimary}>
              <Fa name="bolt" /> Giả lập tiền vào
            </button>
            <p className="m-0 text-[12px] leading-5 text-lien-muted">Tạo một thông báo “tiền vào” với mã thanh toán của đơn, chạy qua đúng bộ kiểm tra như webhook SePay. Nhập số tiền nhỏ hơn tổng để xem trường hợp thiếu tiền.</p>
          </form>
        </Card>
      </div>

      <Card title={`Giao dịch đã nhận (${events.length} gần nhất)`}>
        <div className="overflow-x-auto">
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>Lúc</th>
                <th className={thClass}>Nguồn · id</th>
                <th className={thClass}>Ngân hàng · TK nhận</th>
                <th className={`${thClass} text-right`}>Số tiền</th>
                <th className={thClass}>Nội dung</th>
                <th className={thClass}>Mã đơn</th>
                <th className={thClass}>Kết quả</th>
                <th className={thClass}>Đơn</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} data-testid={`pay-event-${e.id}`} data-status={e.status}>
                  <td className={`${tdClass} whitespace-nowrap text-[12px]`}>{formatDateTime(e.createdAt)}</td>
                  <td className={`${tdClass} whitespace-nowrap text-[12px]`}>
                    {e.provider} · {e.externalId}
                    {e.reference && e.reference !== "SIMULATED" ? <span className="block text-lien-muted">ref {e.reference}</span> : null}
                  </td>
                  <td className={`${tdClass} whitespace-nowrap text-[12px]`}>
                    {e.gateway} {e.accountNumber}
                  </td>
                  <td className={`${tdClass} text-right whitespace-nowrap font-semibold`}>{formatAmount(e.amount)}đ</td>
                  <td className={`${tdClass} max-w-[260px] truncate text-[12px]`} title={e.content}>
                    {e.content || "—"}
                  </td>
                  <td className={`${tdClass} font-mono text-[12px]`}>{e.payCode || "—"}</td>
                  <td className={tdClass}>
                    <span className={cn("inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold", STATUS[e.status]?.cls ?? "bg-gray-100")}>{STATUS[e.status]?.label ?? e.status}</span>
                  </td>
                  <td className={`${tdClass} whitespace-nowrap`}>
                    {e.orderId ? (
                      <Link href={`/admin/orders/${e.orderId}/`} className="font-semibold text-lien-blue hover:underline">
                        #{e.orderNumber}
                      </Link>
                    ) : null}
                    {e.status === "unmatched" || e.status === "amount_mismatch" || e.status === "unknown_account" ? (
                      <form action={assignPaymentAction} className="mt-1 flex items-center gap-1">
                        <input type="hidden" name="eventId" value={e.id} />
                        <input name="orderNumber" inputMode="numeric" placeholder="#đơn" defaultValue={e.orderNumber ?? ""} className={`${adminInput} !mb-0 !w-[90px] !px-2 !py-1 !text-[12px]`} aria-label="Gán vào đơn" />
                        <button type="submit" className={`${btnSecondary} !px-2 !py-1 !text-[12px]`} title="Gán giao dịch này vào đơn và xác nhận thanh toán">
                          <Fa name="check" /> Gán
                        </button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))}
              {events.length === 0 ? (
                <tr>
                  <td colSpan={8} className={`${tdClass} text-center text-lien-muted`}>
                    Chưa có giao dịch nào. Dùng “Giả lập giao dịch” để thử.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
