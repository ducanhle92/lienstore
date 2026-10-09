import Link from "next/link";
import { deleteOrdersAction } from "@/app/admin/orders/actions";
import { BULK_FORM_ID, BulkDeleteButton, SelectAllOrders } from "@/components/sites/lienstore/admin/OrdersBulk";
import { BarTools, BulkBar } from "@/components/sites/lienstore/admin/BulkBar";
import { OpenDetailsButton } from "@/components/sites/lienstore/admin/AddRowButton";
import { NewOrderPanel } from "@/components/sites/lienstore/admin/NewOrderPanel";
import type { PickableProduct } from "@/components/sites/lienstore/admin/ProductSearchSelect";
import { ResizableTable } from "@/components/sites/lienstore/admin/ResizableTable";
import { ADMIN_STATUSES, adminInput, btnPrimary, Card, Flash, PageHeader, StatusBadge, tableClass, tdClass, thClass } from "@/components/sites/lienstore/admin/ui";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { requireAdmin } from "@/lib/auth";
import { accountingRowsFor } from "@/lib/accounting";
import { customerPickList, getAllProducts, getOrders, getPurchaseLines, getUnreadMessageCounts, listRegularSets } from "@/lib/db";
import { listAllocationViews } from "@/lib/allocations-db";
import { OrdersStockPanel } from "@/components/sites/lienstore/admin/OrdersStockPanel";
import { isRegularBy } from "@/lib/regular-customers";
import { formatDateTime, formatPrice } from "@/lib/format";
import { isShipStage, SHIP_STAGES, type ShipStage, stageIndex } from "@/lib/shipping";
import { cn } from "@/lib/utils";
import type { OrderStatus } from "@/types/shop";
import { FlowSteps } from "@/components/sites/lienstore/admin/FlowSteps";
import { flowCounts } from "@/lib/flow-db";
import { getDb } from "@/lib/sqlite";
import { SheetTable } from "@/components/sites/lienstore/admin/SheetTable";
import { OrdersTotals } from "@/components/sites/lienstore/admin/OrdersTotals";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const bulkBtn = "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-lien-sale-text/60 bg-white px-3 py-1.5 text-[13px] font-semibold text-lien-sale-text transition-colors hover:bg-red-50";

const PAYMENT: Record<string, string> = { bacs: "Chuyển khoản", cod: "COD" };
const filterLabel = "flex shrink-0 flex-col gap-0.5 text-[12px] font-semibold text-[#374151]";
const filterInput = cn(adminInput, "!mb-0 !h-[34px] !py-1 !text-[13px]");
const STAGE_CLS: Record<ShipStage, string> = {
  ordered: "bg-amber-100 text-amber-800",
  sent: "bg-sky-100 text-sky-800",
  in_transit: "bg-indigo-100 text-indigo-800",
  vn_warehouse: "bg-violet-100 text-violet-800",
  delivering: "bg-lime-100 text-lime-800",
  delivered: "bg-emerald-100 text-emerald-800",
};

/** Admin › Đơn hàng: filters by day, payment method and logistics stage (the 6 customer-facing statuses). */
export default async function AdminOrders({ searchParams }: Props) {
  const session = await requireAdmin("orders");
  // money on this list follows the account: see_prices → order totals; see_cost (+ prices) → lãi/lỗ and the totals chips
  const seePrices = session.permissions.includes("see_prices");
  const seeCost = session.permissions.includes("see_cost");
  const isOwner = session.role === "owner"; // only the owner may delete orders (selection column + button)
  const sp = await searchParams;
  const raw = first(sp.status);
  // "Trạng thái" select (?stage=): a logistics stage (cancelled orders excluded), "live" = every order not cancelled,
  // "cancelled" = only cancelled ones; ?status= (dashboard links) still works on its own
  const stageRaw = first(sp.stage);
  const status = stageRaw === "cancelled" ? "cancelled" : ADMIN_STATUSES.includes(raw as OrderStatus) ? (raw as OrderStatus) : undefined;
  const stage = isShipStage(stageRaw) ? (stageRaw as ShipStage) : undefined;
  const liveOnly = stageRaw === "live";
  const stageSel = stage ?? (stageRaw === "live" || stageRaw === "cancelled" ? stageRaw : "");
  // "unpaid" = not paid yet (transfer not received / COD not collected), any method, not cancelled
  const payment = ["bacs", "cod", "unpaid"].includes(first(sp.payment)) ? first(sp.payment) : "";
  const from = /^\d{4}-\d{2}-\d{2}$/.test(first(sp.from)) ? first(sp.from) : "";
  const to = /^\d{4}-\d{2}-\d{2}$/.test(first(sp.to)) ? first(sp.to) : "";
  const q = first(sp.q).trim().toLowerCase();
  const [all, unread, regular] = await Promise.all([getOrders(), getUnreadMessageCounts("admin"), listRegularSets()]);
  const isReg = (o: (typeof all)[number]) => isRegularBy({ accountRegular: !!o.customerId && regular.customerIds.has(o.customerId), phone: o.customer.phone, regularPhones: regular.phones });
  // order dates are stored in UTC; compare on the shop's local day
  const localDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
  const items = all
    .filter((o) => !status || o.status === status)
    .filter((o) => !stage || (o.shipStage === stage && o.status !== "cancelled"))
    .filter((o) => !liveOnly || o.status !== "cancelled")
    .filter((o) => !payment || (payment === "unpaid" ? !o.paidAt && o.status !== "cancelled" : o.paymentMethod === payment))
    .filter((o) => !from || localDay(o.createdAt) >= from)
    .filter((o) => !to || localDay(o.createdAt) <= to)
    .filter((o) => !q || `#${o.number} ${o.customer.lastName} ${o.customer.firstName} ${o.customer.phone} ${o.customer.email}`.toLowerCase().includes(q));
  const total = items.reduce((s, o) => s + (o.status === "cancelled" ? 0 : o.total), 0);
  // second view: every open order's lines with where their goods are (what a salesperson still has to buy)
  const view: "pnl" | "stock" = first(sp.view) === "stock" ? "stock" : "pnl";
  const stockLines = view === "stock" ? await getPurchaseLines(false) : [];
  // "Tạo đơn mới": the product picker of the new-order panel (published products only — createOrder skips drafts)
  const pickable: PickableProduct[] = (await getAllProducts(false)).map((p) => ({ id: p.id, name: p.name, nameJa: p.nameJa, sku: p.sku, thumb: p.thumb, costJpy: null, stock: p.stock }));
  const stockAllocs = stockLines.length ? listAllocationViews(getDb(), stockLines.map((l) => l.itemId)) : [];
  const stageByOrder = new Map<string, string>();
  for (const o of all) stageByOrder.set(o.id, o.shipStage);
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
      <FlowSteps current="orders" counts={flowCounts(getDb())} />
      <PageHeader
        title="Đơn hàng"
        summary={<span className="text-green-700">{view === "stock" ? `${new Set(stockLines.map((l) => l.orderId)).size} đơn đang xử lý` : `${items.length} / ${all.length} đơn · doanh thu ${formatPrice(total)}`}</span>}
        actions={
          <span className="inline-flex overflow-hidden rounded-md border border-[#d1d5db]" role="tablist" aria-label="Cách hiển thị" data-testid="orders-view">
            <Link href="/admin/orders/" role="tab" aria-selected={view === "pnl"} className={cn("px-3 py-1.5 text-[13px] font-semibold no-underline", view === "pnl" ? "bg-lien-blue text-white" : "bg-white text-lien-text hover:bg-[#f3f4f6]")}>
              <Fa name="money" /> Lãi / lỗ
            </Link>
            <Link href="/admin/orders/?view=stock" role="tab" aria-selected={view === "stock"} className={cn("border-l border-[#d1d5db] px-3 py-1.5 text-[13px] font-semibold no-underline", view === "stock" ? "bg-lien-blue text-white" : "bg-white text-lien-text hover:bg-[#f3f4f6]")}>
              <Fa name="archive" /> Theo kho hàng
            </Link>
          </span>
        }
      />
      {first(sp.deleted) ? <Flash>{first(sp.deleted)}</Flash> : null}
      {first(sp.saved) ? <Flash>{first(sp.saved)}</Flash> : null}
      {first(sp.error) ? <Flash kind="error">{first(sp.error)}</Flash> : null}
      {view === "stock" ? <OrdersStockPanel lines={stockLines} allocations={stockAllocs} stageByOrder={stageByOrder} /> : null}
      <BarTools>
        <OpenDetailsButton target="new-order" label="+ Tạo đơn mới" className={cn(btnPrimary, "!py-1 !text-[13px]")} />
      </BarTools>
      <NewOrderPanel products={pickable} customers={await customerPickList()} />
      {/* one compact row (wraps only on narrow screens) so the table below gets the height */}
      <Card className={cn("mb-3 [&>.admin-card-body]:!px-3 [&>.admin-card-body]:!py-2", view === "stock" && "hidden")}>
        <form method="get" className="flex flex-wrap items-end gap-2 lg:flex-nowrap" data-testid="orders-filter">
          <label className={filterLabel + " min-w-[180px] flex-1"}>
            Tìm
            <input name="q" defaultValue={first(sp.q)} placeholder="#đơn, tên khách, điện thoại, email…" className={filterInput} />
          </label>
          <label className={filterLabel}>
            Từ ngày
            <input type="date" name="from" defaultValue={from} className={cn(filterInput, "!w-[138px]")} />
          </label>
          <label className={filterLabel}>
            Đến ngày
            <input type="date" name="to" defaultValue={to} className={cn(filterInput, "!w-[138px]")} />
          </label>
          <label className={filterLabel}>
            Thanh toán
            <select name="payment" defaultValue={payment} className={cn(filterInput, "!w-[140px]")}>
              <option value="">Tất cả</option>
              <option value="bacs">Chuyển khoản</option>
              <option value="cod">COD</option>
              <option value="unpaid">Chưa thanh toán</option>
            </select>
          </label>
          <label className={filterLabel}>
            Trạng thái
            <select name="stage" defaultValue={stageSel} className={cn(filterInput, "!w-[190px]")} data-testid="orders-filter-stage">
              <option value="">Tất cả</option>
              <option value="live">Tất cả trừ đơn huỷ</option>
              {SHIP_STAGES.map((st) => (
                <option key={st.key} value={st.key}>
                  {st.label}
                </option>
              ))}
              <option value="cancelled">Đã huỷ</option>
            </select>
          </label>
          <button type="submit" className={cn(btnPrimary, "!h-[34px] shrink-0 !py-1 !text-[13px]")}>
            <Fa name="check" /> Lọc
          </button>
          {q || from || to || payment || stageSel || status ? (
            <Link href="/admin/orders/" className="shrink-0 self-center whitespace-nowrap text-[12px] text-lien-blue hover:underline" data-testid="orders-filter-clear">
              ✕ Xoá lọc
            </Link>
          ) : null}
        </form>
      </Card>
      <Card className={cn(view === "stock" && "hidden")}>
        {items.length === 0 ? (
          <p className="text-[14px] text-lien-muted">Không có đơn hàng phù hợp.</p>
        ) : (
          <>
          {/* every account can tick orders to print invoices; only the owner also gets "Xóa đơn hàng" */}
          <form id={BULK_FORM_ID} action={deleteOrdersAction} data-testid="orders-bulk-bar" />
          <BulkBar scope={BULK_FORM_ID} label="đơn">
            {/* two paper sizes: A5 (one page per A5 sheet) or A4 landscape with two A5 invoices side by side, cut in half */}
            <button type="submit" form={BULK_FORM_ID} formAction="/print/orders/" formMethod="get" formTarget="_blank" name="paper" value="a5" className={cn(btnPrimary, "!py-1.5 !text-[13px]")} data-testid="bulk-print" title="Mỗi trang hoá đơn một tờ A5">
              <Fa name="print" /> In hoá đơn A5
            </button>
            <button type="submit" form={BULK_FORM_ID} formAction="/print/orders/" formMethod="get" formTarget="_blank" name="paper" value="a4" className={cn(btnPrimary, "!py-1.5 !text-[13px]")} data-testid="bulk-print-a4" title="Tờ A4 ngang, 2 hoá đơn A5 cạnh nhau — in xong cắt đôi">
              <Fa name="print" /> In A4 (2 đơn/tờ)
            </button>
            {isOwner ? <BulkDeleteButton className={bulkBtn} /> : null}
          </BulkBar>
          {seePrices && seeCost ? <OrdersTotals target="[data-sheet='orders'] table" initial={{ orders: pnl.size, revenue: sum.revenue, cogs: sum.cogs, ship: sum.ship, voucher: sum.voucher, promo: sum.promo, profit: sum.profit, missing: sum.missing }} /> : null}
          <ResizableTable id="orders">
            <SheetTable id="orders">
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
                  <th className={thClass} title={seePrices ? undefined : "Số tiền còn phải thu của khách (đơn chưa thanh toán)"}>{seePrices ? "Tổng" : "Cần thu"}</th>
                  {seePrices && seeCost ? <th className={thClass} title="Doanh thu + ship khách trả − giá vốn − phí 3 chặng nhập − phí giao nội địa (cùng cách tính với Kế toán)">Lãi / lỗ</th> : null}
                  <th className={thClass}>Trạng thái đơn</th>
                  <th className={thClass}>Xử lý</th>
                </tr>
              </thead>
              <tbody>
                {items.map((o) => {
                  const s = SHIP_STAGES[stageIndex(o.shipStage)];
                  const pr = pnl.get(o.id);
                  // per-row figures for the live "Tổng theo bộ lọc" (cancelled orders have no P&L row → not counted)
                  const fig = pr && seePrices && seeCost ? { "data-rev": pr.revenue + pr.shipCollected, "data-cogs": pr.cogs, "data-ship": pr.importFees + pr.vnCarrierFee, "data-voucher": pr.voucher, "data-promo": pr.promoDiscount, "data-profit": pr.profit, "data-missing": pr.missingCost } : {};
                  return (
                    <tr key={o.id} className="hover:bg-[#fafafa]" {...fig}>
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
                        {isReg(o) ? (
                          <span className="ml-1.5 rounded-full bg-lien-blue-soft px-1.5 py-0.5 text-[10px] font-semibold text-lien-blue" title="Khách quen">
                            <Fa name="star" /> quen
                          </span>
                        ) : null}
                        <div className="text-[12px] text-lien-muted">{o.customer.phone}</div>
                      </td>
                      <td className={tdClass}>{o.items.reduce((n, it) => n + it.quantity, 0)}</td>
                      <td className={`${tdClass} whitespace-nowrap`}>
                        {o.paymentMethod === "cod" ? (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800" title={o.stockCommittedAt ? `Thu khi giao · tồn kho đã trừ lúc ${formatDateTime(o.stockCommittedAt)}` : "Thu khi giao"}>
                            COD
                          </span>
                        ) : (
                          PAYMENT[o.paymentMethod]
                        )}
                      </td>
                      <td className={`${tdClass} whitespace-nowrap`}>{seePrices ? formatPrice(o.total, o.currency) : o.paidAt || o.status === "cancelled" ? <span className="text-[12px] text-green-700">đã thanh toán</span> : formatPrice(o.total, o.currency)}</td>
                      {seePrices && seeCost ? (
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
                      ) : null}
                      <td className={tdClass}>
                        {o.status === "cancelled" ? <StatusBadge status="cancelled" /> : <span className={cn("inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-semibold", STAGE_CLS[s.key])}>{s.label}</span>}
                      </td>
                      <td className={tdClass}>
                        <StatusBadge status={o.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </SheetTable>
          </ResizableTable>
          </>
        )}
      </Card>
    </>
  );
}
