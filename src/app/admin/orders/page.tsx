import Link from "next/link";
import { deleteOrderAction, deleteOrdersAction } from "@/app/admin/orders/actions";
import { ConfirmSubmit } from "@/components/sites/lienstore/admin/ConfirmSubmit";
import { BULK_FORM_ID, BulkDeleteButton, SelectAllOrders } from "@/components/sites/lienstore/admin/OrdersBulk";
import { ResizableTable } from "@/components/sites/lienstore/admin/ResizableTable";
import { ADMIN_STATUS_LABELS, ADMIN_STATUSES, adminInput, btnPrimary, btnSecondary, Card, Flash, PageHeader, StatusBadge, tableClass, tdClass, thClass } from "@/components/sites/lienstore/admin/ui";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { requireAdmin } from "@/lib/auth";
import { accountingRowsFor } from "@/lib/accounting";
import { getOrders, getUnreadMessageCounts } from "@/lib/db";
import { formatDateTime, formatPrice } from "@/lib/format";
import { isShipStage, SHIP_STAGES, type ShipStage, stageIndex } from "@/lib/shipping";
import { cn } from "@/lib/utils";
import type { OrderStatus } from "@/types/shop";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
/** Framed row actions (Chi tiết / Xóa) and the bulk delete button share one shape. */
const rowBtn = "inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2.5 py-1 text-[12px] font-semibold no-underline transition-colors";
const rowBtnBlue = `${rowBtn} border-lien-blue/60 text-lien-blue hover:bg-lien-blue-soft`;
const rowBtnRed = `${rowBtn} border-lien-sale-text/60 text-lien-sale-text hover:bg-red-50`;

const PAYMENT: Record<string, string> = { bacs: "Chuyển khoản", cod: "COD" };
const STAGE_CLS: Record<ShipStage, string> = {
  ordered: "bg-amber-100 text-amber-800",
  paid: "bg-sky-100 text-sky-800",
  in_transit: "bg-indigo-100 text-indigo-800",
  vn_warehouse: "bg-violet-100 text-violet-800",
  delivering: "bg-lime-100 text-lime-800",
  delivered: "bg-emerald-100 text-emerald-800",
};

/** Admin › Đơn hàng: filters by day, payment method and logistics stage (the 6 customer-facing statuses). */
export default async function AdminOrders({ searchParams }: Props) {
  await requireAdmin("orders");
  const sp = await searchParams;
  const raw = first(sp.status);
  const status = ADMIN_STATUSES.includes(raw as OrderStatus) ? (raw as OrderStatus) : undefined;
  const stage = isShipStage(first(sp.stage)) ? (first(sp.stage) as ShipStage) : undefined;
  const payment = first(sp.payment) === "bacs" || first(sp.payment) === "cod" ? first(sp.payment) : "";
  const from = /^\d{4}-\d{2}-\d{2}$/.test(first(sp.from)) ? first(sp.from) : "";
  const to = /^\d{4}-\d{2}-\d{2}$/.test(first(sp.to)) ? first(sp.to) : "";
  const q = first(sp.q).trim().toLowerCase();
  const [all, unread] = await Promise.all([getOrders(), getUnreadMessageCounts("admin")]);
  // order dates are stored in UTC; compare on the shop's local day
  const localDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
  const items = all
    .filter((o) => !status || o.status === status)
    .filter((o) => !stage || (o.shipStage === stage && o.status !== "cancelled"))
    .filter((o) => !payment || o.paymentMethod === payment)
    .filter((o) => !from || localDay(o.createdAt) >= from)
    .filter((o) => !to || localDay(o.createdAt) <= to)
    .filter((o) => !q || `#${o.number} ${o.customer.lastName} ${o.customer.firstName} ${o.customer.phone} ${o.customer.email}`.toLowerCase().includes(q));
  const counts = Object.fromEntries(ADMIN_STATUSES.map((s) => [s, all.filter((o) => o.status === s).length])) as Record<OrderStatus, number>;
  const stageCount = (k: ShipStage) => all.filter((o) => o.shipStage === k && o.status !== "cancelled").length;
  const keep = (over: Record<string, string | undefined>) => {
    const qs = new URLSearchParams();
    const cur: Record<string, string> = { status: status ?? "", stage: stage ?? "", payment, from, to, q, ...over } as Record<string, string>;
    for (const [k, v] of Object.entries(cur)) if (v) qs.set(k, v);
    const s = qs.toString();
    return `/admin/orders/${s ? `?${s}` : ""}`;
  };
  const tab = (href: string, label: string, active: boolean) => (
    <Link key={href} href={href} className={cn("rounded-md px-3 py-1.5 text-[13px] leading-5 no-underline", active ? "bg-lien-blue text-white" : "border border-[#e5e7eb] bg-white text-lien-text hover:bg-[#f3f4f6]")}>
      {label}
    </Link>
  );
  const total = items.reduce((s, o) => s + (o.status === "cancelled" ? 0 : o.total), 0);
  // P&L per order (same maths as Kế toán) + totals of what is on screen
  const pnl = await accountingRowsFor(items);
  const sum = [...pnl.values()].reduce((t, r) => ({ revenue: t.revenue + r.revenue + r.shipCollected, cogs: t.cogs + r.cogs, ship: t.ship + r.importFees + r.vnCarrierFee, profit: t.profit + r.profit, voucher: t.voucher + r.voucher, promo: t.promo + r.promoDiscount, missing: t.missing + r.missingCost }), { revenue: 0, cogs: 0, ship: 0, profit: 0, voucher: 0, promo: 0, missing: 0 });
  const signed = (n: number) => (
    <span className={n >= 0 ? "text-green-700" : "text-red-600"}>
      {n < 0 ? "−" : ""}
      {formatPrice(Math.abs(n))}
    </span>
  );

  return (
    <>
      <PageHeader title="Đơn hàng" subtitle={`${items.length} / ${all.length} đơn · doanh thu bộ lọc ${formatPrice(total)}`} />
      {first(sp.deleted) ? <Flash>{first(sp.deleted)}</Flash> : null}
      {first(sp.error) ? <Flash kind="error">{first(sp.error)}</Flash> : null}
      <Card className="mb-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="w-[130px] text-[13px] font-semibold text-lien-heading">Trạng thái đơn:</span>
          {tab(keep({ stage: "" }), `Tất cả (${all.filter((o) => o.status !== "cancelled").length})`, !stage && !status)}
          {SHIP_STAGES.map((s) => tab(keep({ stage: s.key, status: "" }), `${s.label} (${stageCount(s.key)})`, stage === s.key))}
          {tab(keep({ status: "cancelled", stage: "" }), `${ADMIN_STATUS_LABELS.cancelled} (${counts.cancelled})`, status === "cancelled")}
        </div>
        <form method="get" className="grid gap-3 md:grid-cols-[1fr_170px_170px_170px_auto_auto] md:items-end">
          {stage ? <input type="hidden" name="stage" value={stage} /> : null}
          {status ? <input type="hidden" name="status" value={status} /> : null}
          <label className="text-[12px] font-semibold text-[#374151]">
            Tìm
            <input name="q" defaultValue={first(sp.q)} placeholder="#đơn, tên khách, điện thoại, email…" className={cn(adminInput, "mt-1")} />
          </label>
          <label className="text-[12px] font-semibold text-[#374151]">
            Từ ngày
            <input type="date" name="from" defaultValue={from} className={cn(adminInput, "mt-1")} />
          </label>
          <label className="text-[12px] font-semibold text-[#374151]">
            Đến ngày
            <input type="date" name="to" defaultValue={to} className={cn(adminInput, "mt-1")} />
          </label>
          <label className="text-[12px] font-semibold text-[#374151]">
            Hình thức thanh toán
            <select name="payment" defaultValue={payment} className={cn(adminInput, "mt-1")}>
              <option value="">Tất cả</option>
              <option value="bacs">Chuyển khoản</option>
              <option value="cod">COD</option>
            </select>
          </label>
          <button type="submit" className={btnPrimary}>
            <Fa name="check" /> Lọc
          </button>
          <Link href="/admin/orders/" className={btnSecondary}>
            Xoá lọc
          </Link>
        </form>
      </Card>
      <Card>
        {items.length === 0 ? (
          <p className="text-[14px] text-lien-muted">Không có đơn hàng phù hợp.</p>
        ) : (
          <>
          <form id={BULK_FORM_ID} action={deleteOrdersAction} className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#f0f0f0] bg-[#fafafa] px-3 py-2 text-[12px] text-lien-muted" data-testid="orders-bulk-bar">
            <span>Tích ô đầu dòng để chọn nhiều đơn; chọn một dòng thì chỉ xóa dòng đó.</span>
            <BulkDeleteButton className={rowBtnRed} />
          </form>
          <ResizableTable id="orders">
            <table className={tableClass}>
              <thead>
                <tr>
                  <th className={`${thClass} w-8`}>
                    <SelectAllOrders />
                  </th>
                  <th className={thClass}>Mã</th>
                  <th className={thClass}>Ngày</th>
                  <th className={thClass}>Khách hàng</th>
                  <th className={thClass}>Sản phẩm</th>
                  <th className={thClass}>Thanh toán</th>
                  <th className={thClass}>Tổng</th>
                  <th className={thClass} title="Doanh thu + ship khách trả − giá vốn − phí 3 chặng nhập − phí giao nội địa (cùng cách tính với Kế toán)">Lãi / lỗ</th>
                  <th className={thClass}>Trạng thái đơn</th>
                  <th className={thClass}>Xử lý</th>
                  <th className={thClass} />
                </tr>
              </thead>
              <tbody>
                {items.map((o) => {
                  const s = SHIP_STAGES[stageIndex(o.shipStage)];
                  return (
                    <tr key={o.id} className="hover:bg-[#fafafa]">
                      <td className={tdClass}>
                        <input type="checkbox" name="ids" value={o.id} form={BULK_FORM_ID} data-number={o.number} aria-label={`Chọn đơn #${o.number}`} className="h-4 w-4" />
                      </td>
                      <td className={`${tdClass} font-semibold`}>
                        <Link href={`/admin/orders/${o.id}/`} className="text-lien-heading hover:text-lien-blue">
                          #{o.number}
                        </Link>
                        {unread.get(o.id) ? (
                          <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-lien-heart px-1.5 py-0.5 text-[11px] font-bold text-white" title="Tin nhắn mới từ khách">
                            <Fa name="comments-o" /> {unread.get(o.id)}
                          </span>
                        ) : null}
                      </td>
                      <td className={`${tdClass} whitespace-nowrap`}>{formatDateTime(o.createdAt)}</td>
                      <td className={tdClass}>
                        {o.customer.lastName} {o.customer.firstName}
                        <div className="text-[12px] text-lien-muted">{o.customer.phone}</div>
                      </td>
                      <td className={tdClass}>{o.items.reduce((n, it) => n + it.quantity, 0)}</td>
                      <td className={`${tdClass} whitespace-nowrap`}>{PAYMENT[o.paymentMethod]}</td>
                      <td className={`${tdClass} whitespace-nowrap`}>{formatPrice(o.total, o.currency)}</td>
                      <td className={`${tdClass} whitespace-nowrap font-semibold`}>
                        {(() => {
                          const r = pnl.get(o.id);
                          if (!r) return <span className="text-lien-muted">—</span>;
                          return (
                            <span title={`Doanh thu ${formatPrice(r.revenue + r.shipCollected)} · vốn ${formatPrice(r.cogs)} · ship ${formatPrice(r.importFees + r.vnCarrierFee)}${r.voucher ? ` · voucher ${formatPrice(r.voucher)}` : ""}${r.promoDiscount ? ` · giảm giá SP ${formatPrice(r.promoDiscount)}` : ""}${r.missingCost ? ` · ${r.missingCost} dòng chưa có giá vốn` : ""}`}>
                              {signed(r.profit)}
                              {r.missingCost ? <span className="ml-1 text-[11px] font-normal text-amber-700">*</span> : null}
                            </span>
                          );
                        })()}
                      </td>
                      <td className={tdClass}>
                        {o.status === "cancelled" ? <StatusBadge status="cancelled" /> : <span className={cn("inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-semibold", STAGE_CLS[s.key])}>{s.label}</span>}
                      </td>
                      <td className={tdClass}>
                        <StatusBadge status={o.status} />
                      </td>
                      <td className={`${tdClass} text-right`}>
                        <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                          <Link href={`/admin/orders/${o.id}/`} className={rowBtnBlue}>
                            <Fa name="eye" /> Chi tiết
                          </Link>
                          <form action={deleteOrderAction} className="inline">
                            <input type="hidden" name="id" value={o.id} />
                            <ConfirmSubmit message={`Xóa hẳn đơn #${o.number} của ${`${o.customer.lastName} ${o.customer.firstName}`.trim()}? Không khôi phục được. Nếu chỉ muốn dừng đơn, mở chi tiết và chọn “Đã hủy”.`} className={rowBtnRed}>
                              <Fa name="trash" /> Xóa
                            </ConfirmSubmit>
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-[#f9fafb] text-[13px] font-semibold" data-testid="orders-totals">
                  <td className={tdClass} colSpan={6}>
                    Tổng theo bộ lọc ({pnl.size} đơn, trừ đã huỷ)
                    <span className="ml-2 font-normal text-lien-muted">
                      doanh thu {formatPrice(sum.revenue)} · giá vốn {formatPrice(sum.cogs)} · vận chuyển {formatPrice(sum.ship)}
                      {sum.voucher ? ` · voucher ${formatPrice(sum.voucher)}` : ""}
                      {sum.promo ? ` · giảm giá SP ${formatPrice(sum.promo)}` : ""}
                      {sum.missing ? ` · * ${sum.missing} dòng chưa có giá vốn` : ""}
                    </span>
                  </td>
                  <td className={`${tdClass} whitespace-nowrap`}>{formatPrice(total)}</td>
                  <td className={`${tdClass} whitespace-nowrap`}>{signed(sum.profit)}</td>
                  <td className={tdClass} colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </ResizableTable>
          </>
        )}
      </Card>
    </>
  );
}
