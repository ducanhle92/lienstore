import Link from "next/link";
import { ResizableTable } from "@/components/sites/lienstore/admin/ResizableTable";
import { ADMIN_STATUS_LABELS, ADMIN_STATUSES, adminInput, btnPrimary, btnSecondary, Card, PageHeader, StatusBadge, tableClass, tdClass, thClass } from "@/components/sites/lienstore/admin/ui";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { requireAdmin } from "@/lib/auth";
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

  return (
    <>
      <PageHeader title="Đơn hàng" subtitle={`${items.length} / ${all.length} đơn · doanh thu bộ lọc ${formatPrice(total)}`} />
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
          <ResizableTable id="orders">
            <table className={tableClass}>
              <thead>
                <tr>
                  <th className={thClass}>Mã</th>
                  <th className={thClass}>Ngày</th>
                  <th className={thClass}>Khách hàng</th>
                  <th className={thClass}>Sản phẩm</th>
                  <th className={thClass}>Thanh toán</th>
                  <th className={thClass}>Tổng</th>
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
                      <td className={tdClass}>
                        {o.status === "cancelled" ? <StatusBadge status="cancelled" /> : <span className={cn("inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-semibold", STAGE_CLS[s.key])}>{s.label}</span>}
                      </td>
                      <td className={tdClass}>
                        <StatusBadge status={o.status} />
                      </td>
                      <td className={`${tdClass} text-right`}>
                        <Link href={`/admin/orders/${o.id}/`} className="text-lien-blue hover:underline">
                          Chi tiết
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ResizableTable>
        )}
      </Card>
    </>
  );
}
