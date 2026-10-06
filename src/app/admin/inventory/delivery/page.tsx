import Link from "next/link";
import { redirect } from "next/navigation";
import { markCodCollectedAction } from "@/app/admin/orders/actions";
import { bulkOrderLegStatusAction, setOrderLegStatusAction } from "@/app/admin/shipping/order-actions";
import { BulkBar } from "@/components/sites/lienstore/admin/BulkBar";
import { FlowSteps } from "@/components/sites/lienstore/admin/FlowSteps";
import { TableSelectAll } from "@/components/sites/lienstore/admin/TableSelectAll";
import { adminInput, btnPrimary, btnSecondary, Card, Flash, PageHeader, tableClass, tdClass, thClass } from "@/components/sites/lienstore/admin/ui";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { can } from "@/lib/auth";
import { getOrderLegs, getOrders, getShippingMethods } from "@/lib/db";
import type { ShippingMethod } from "@/types/shop";
import { flowCounts } from "@/lib/flow-db";
import { formatAmount, formatDateTime } from "@/lib/format";
import { LEG_STATUS_CLS, LEG_STATUS_LABEL } from "@/lib/leg-status";
import { listOrdersReadyToShip } from "@/lib/lots-db";
import { getDb } from "@/lib/sqlite";
import { listUnits } from "@/lib/units-db";
import { cn } from "@/lib/utils";
import type { Order, OrderLeg } from "@/types/shop";
import { SheetTable } from "@/components/sites/lienstore/admin/SheetTable";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const TABS = [
  { key: "ready", label: "Chờ giao", icon: "archive" },
  { key: "delivering", label: "Đang giao", icon: "truck" },
  { key: "done", label: "Đã giao (30 ngày)", icon: "check" },
] as const;
type Tab = (typeof TABS)[number]["key"];
/** ISO time `days` ago — the "Đã giao" tab keeps the last 30 days. */
function sinceIso(days: number): string {
  return new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
}

/**
 * Kho hàng › ⑦ Giao hàng VN — the VN shop's work list: paid / COD orders whose goods are all at Kho Việt Nam (shop),
 * orders out for delivery, and what was delivered lately. Every button moves the order's leg ④ (nội địa Việt Nam),
 * so units, order progress and the customer's page follow on their own.
 */
export default async function DeliveryPage({ searchParams }: Props) {
  if (!(await can("delivery"))) redirect("/admin/?denied=delivery");
  const sp = await searchParams;
  const tabRaw = first(sp.tab);
  const tab: Tab = tabRaw === "delivering" || tabRaw === "done" ? tabRaw : "ready";
  const db = getDb();
  const all = await getOrders();
  const readyIds = new Set(listOrdersReadyToShip(db).map((o) => o.orderId));
  const since = sinceIso(30);
  const open = (o: Order) => o.status === "pending" || o.status === "processing";
  const lists: Record<Tab, Order[]> = {
    ready: all.filter((o) => readyIds.has(o.id)),
    delivering: all.filter((o) => open(o) && o.shipStage === "delivering"),
    done: all.filter((o) => o.status !== "cancelled" && o.shipStage === "delivered" && o.updatedAt >= since),
  };
  // oldest first while waiting / on the road; newest first once delivered
  const rows = [...lists[tab]].sort((a, b) => (tab === "done" ? b.updatedAt.localeCompare(a.updatedAt) : a.createdAt.localeCompare(b.createdAt)));
  const legMap = await getOrderLegs(rows.map((o) => o.id));
  // ĐVVC nội địa the shop can hand an order to (Vận chuyển › chặng ④); the row select and the bulk select list them
  const methods = (await getShippingMethods(true)).filter((m) => m.leg === "vn_domestic");
  const itemIds = rows.flatMap((o) => o.items.map((it) => it.itemId).filter((x): x is number => typeof x === "number"));
  const codesByItem = new Map<number, string[]>();
  for (const u of listUnits(db, { itemIds, withDelivered: true })) if (u.itemId) codesByItem.set(u.itemId, [...(codesByItem.get(u.itemId) ?? []), u.code]);
  const back = `/admin/inventory/delivery/?tab=${tab}`;
  const bulkId = "dl-bulk";
  const saved = first(sp.saved);
  const error = first(sp.error);

  return (
    <>
      <FlowSteps current="deliver" counts={flowCounts(db)} />
      <PageHeader title="Giao hàng VN" subtitle={`Giao đơn cho khách từ Kho Việt Nam (shop) · ${lists.ready.length} đơn chờ giao · ${lists.delivering.length} đang giao`} />
      {saved ? <Flash>{saved}</Flash> : null}
      {error ? <Flash kind="error">{error}</Flash> : null}

      <nav className="mb-4 flex flex-wrap gap-2" aria-label="Giao hàng" data-testid="delivery-tabs">
        {TABS.map((t) => (
          <Link key={t.key} href={`/admin/inventory/delivery/?tab=${t.key}`} className={cn("rounded-md border px-3 py-1.5 text-[13px] font-semibold no-underline", tab === t.key ? "border-lien-blue bg-lien-blue text-white" : "border-[#d1d5db] bg-white text-lien-text hover:border-lien-blue")} data-testid={`delivery-tab-${t.key}`}>
            <Fa name={t.icon} /> {t.label} ({lists[t.key].length})
          </Link>
        ))}
      </nav>

      <form id={bulkId} action={bulkOrderLegStatusAction}>
        <input type="hidden" name="leg" value="vn_domestic" />
        <input type="hidden" name="back" value={back} />
      </form>
      {tab !== "done" ? (
        <BulkBar scope={bulkId}>
          <select name="method" form={bulkId} defaultValue="" className={cn(adminInput, "!mb-0 !w-[220px] !py-1 !text-[13px]")} aria-label="Đơn vị vận chuyển cho các đơn đã tick" data-testid="bulk-method">
            <option value="">ĐVVC: giữ nguyên</option>
            {methods.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {m.carrierName && !m.name.includes(m.carrierName) ? ` (${m.carrierName})` : ""}
              </option>
            ))}
            <option value="pickup">Khách tới kho lấy</option>
          </select>
          {tab === "ready" ? (
            <button type="submit" form={bulkId} name="status" value="sent" className={cn(btnPrimary, "!py-1")} data-testid="bulk-start">
              <Fa name="truck" /> Bắt đầu giao
            </button>
          ) : null}
          <button type="submit" form={bulkId} name="status" value="arrived" className={cn(btnSecondary, "!py-1")} data-testid="bulk-delivered">
            <Fa name="check" /> Đã giao
          </button>
        </BulkBar>
      ) : null}

      <Card>
        {rows.length === 0 ? (
          <p className="m-0 text-[13px] text-lien-muted">{tab === "ready" ? "Chưa có đơn nào đủ hàng tại Kho VN để giao (đơn cần đã thanh toán hoặc COD)." : tab === "delivering" ? "Không có đơn nào đang giao." : "Chưa giao đơn nào trong 30 ngày qua."}</p>
        ) : (
          <div className="overflow-x-auto">
            <SheetTable id={`delivery-${tab}`}>
            <table className={tableClass} data-testid={`delivery-${tab}`}>
              <thead>
                <tr>
                  {tab !== "done" ? (
                    <th className={cn(thClass, "w-8")}>
                      <TableSelectAll name="orderIds" />
                    </th>
                  ) : null}
                  <th className={thClass}>Đơn</th>
                  <th className={thClass}>Khách · địa chỉ</th>
                  <th className={thClass}>Hàng</th>
                  <th className={thClass}>Giao · thu</th>
                  <th className={thClass}>ĐVVC · mã vận đơn · ghi chú cho khách</th>
                  <th className={thClass} />
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <DeliveryRow key={o.id} o={o} leg={(legMap.get(o.id) ?? []).find((l) => l.leg === "vn_domestic")} codesByItem={codesByItem} tab={tab} back={back} bulkId={bulkId} methods={methods} />
                ))}
              </tbody>
            </table>
            </SheetTable>
          </div>
        )}
      </Card>
    </>
  );
}

function DeliveryRow({ o, leg, codesByItem, tab, back, bulkId, methods }: { o: Order; leg: OrderLeg | undefined; codesByItem: Map<number, string[]>; tab: Tab; back: string; bulkId: string; methods: ShippingMethod[] }) {
  const fid = `dl-${o.id}`;
  const st = leg?.status ?? "pending";
  const pickup = o.delivery === "pickup";
  const collect = o.paymentMethod === "cod" && !o.paidAt;
  const c = o.customer;
  return (
    <tr className="align-top hover:bg-[#fafafa]" data-testid={`delivery-row-${o.number}`}>
      {tab !== "done" ? (
        <td className={cn(tdClass, "w-8")}>
          <input type="checkbox" name="orderIds" value={o.id} form={bulkId} className="h-4 w-4" aria-label={`Chọn đơn #${o.number}`} />
        </td>
      ) : null}
      <td className={cn(tdClass, "whitespace-nowrap")}>
        <form id={fid} action={setOrderLegStatusAction}>
          <input type="hidden" name="orderId" value={o.id} />
          <input type="hidden" name="leg" value="vn_domestic" />
          <input type="hidden" name="status" value={st} />
          <input type="hidden" name="back" value={back} />
        </form>
        <Link href={`/admin/orders/${o.id}/`} className="font-semibold text-lien-heading hover:text-lien-blue">
          #{o.number}
        </Link>
        <span className="block text-[11px] text-lien-muted">{formatDateTime(o.createdAt)}</span>
        <span className={cn("mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold", LEG_STATUS_CLS[st])}>{LEG_STATUS_LABEL[st]}</span>
      </td>
      <td className={cn(tdClass, "min-w-[220px] text-[13px]")}>
        <span className="block font-semibold text-lien-heading">
          {c.lastName} {c.firstName}
        </span>
        <a href={`tel:${c.phone}`} className="text-lien-blue hover:underline">
          {c.phone}
        </a>
        <span className="block text-[12px] text-lien-muted">{pickup ? "Khách tới kho lấy" : c.address}</span>
        {c.note ? <span className="block text-[12px] text-amber-800">Khách ghi: {c.note}</span> : null}
      </td>
      <td className={cn(tdClass, "min-w-[220px] text-[12px]")}>
        {o.items.map((it) => {
          const codes = it.itemId ? (codesByItem.get(it.itemId) ?? []) : [];
          return (
            <span key={it.itemId ?? it.productId} className="mb-1 block leading-4">
              <b className="text-lien-heading">{it.name}</b> ×{it.quantity}
              {codes.length ? <span className="block font-mono text-[10px] text-lien-blue">{codes.join(" ")}</span> : null}
            </span>
          );
        })}
      </td>
      <td className={cn(tdClass, "text-[12px]")}>
        <span className="block">{pickup ? "Nhận tại kho" : o.shippingLabel || "Giao tận nhà"}</span>
        {collect ? (
          <span className="mt-1 block w-fit rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-900">Thu hộ {formatAmount(o.total)}đ</span>
        ) : (
          <span className="mt-1 block w-fit rounded bg-green-100 px-1.5 py-0.5 font-semibold text-green-800">Đã thanh toán</span>
        )}
        {o.shipFeePayment === "on_delivery" && !pickup ? <span className="mt-1 block text-lien-muted">khách trả phí ship cho shipper</span> : null}
      </td>
      <td className={tdClass}>
        {/* ĐVVC + mã vận đơn of this order: typed here, saved by the bottom bar ("Lưu thay đổi") or with Bắt đầu giao;
            the same leg ④ shows on Vận hành › Đơn hàng › chi tiết đơn */}
        {tab !== "done" ? (
          <select name="method" form={fid} defaultValue={leg?.methodId ? String(leg.methodId) : pickup || leg?.label === "Khách tự tới kho lấy" ? "pickup" : ""} className={cn(adminInput, "!mb-1 !w-[170px] !py-1 !text-[12px]")} aria-label="Đơn vị vận chuyển" data-testid={`method-${o.number}`}>
            <option value="">— ĐVVC —</option>
            {methods.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {m.carrierName && !m.name.includes(m.carrierName) ? ` (${m.carrierName})` : ""}
              </option>
            ))}
            <option value="pickup">Khách tới kho lấy</option>
          </select>
        ) : (
          <span className="block text-[12px] text-lien-muted">{leg?.label || (pickup ? "Khách tới kho lấy" : "—")}</span>
        )}
        {tab === "done" ? (
          <span className="block font-mono text-[12px] text-lien-blue">{leg?.tracking || "—"}</span>
        ) : (
          <input name="tracking" form={fid} defaultValue={leg?.tracking ?? ""} placeholder="Mã vận đơn" className={cn(adminInput, "!mb-1 !w-[170px] !py-1 !text-[12px]")} aria-label="Mã vận đơn" data-testid={`tracking-${o.number}`} />
        )}
        <input name="note" form={fid} defaultValue="" placeholder="Ghi chú cho khách" className={cn(adminInput, "!mb-0 !w-[170px] !py-1 !text-[12px]")} aria-label="Ghi chú cho khách" />
      </td>
      <td className={cn(tdClass, "whitespace-nowrap")}>
        <div className="flex flex-col gap-1">
          {tab === "ready" && !pickup ? (
            <button type="submit" form={fid} name="to" value="sent" className={cn(btnPrimary, "!py-1 !text-[12px]")} data-testid={`start-${o.number}`}>
              <Fa name="truck" /> Bắt đầu giao
            </button>
          ) : null}
          {tab !== "done" ? (
            <button type="submit" form={fid} name="to" value="arrived" className={cn(tab === "ready" && !pickup ? btnSecondary : btnPrimary, "!py-1 !text-[12px]")} data-testid={`delivered-${o.number}`}>
              <Fa name="check" /> {pickup ? "Khách đã nhận" : "Đã giao"}
            </button>
          ) : null}
          {tab === "done" && collect ? (
            <form action={markCodCollectedAction}>
              <input type="hidden" name="id" value={o.id} />
              <input type="hidden" name="back" value={back} />
              <button type="submit" className={cn(btnPrimary, "!py-1 !text-[12px]")} data-testid={`collected-${o.number}`}>
                <Fa name="money" /> Đã thu tiền
              </button>
            </form>
          ) : null}
          {tab === "done" ? <span className="text-[11px] text-lien-muted">{leg?.arrivedAt ? `giao ${formatDateTime(leg.arrivedAt)}` : ""}</span> : null}
        </div>
      </td>
    </tr>
  );
}
