import Link from "next/link";
import { StatTile, StatTiles } from "@/components/sites/lienstore/admin/StatTiles";
import { btnPrimary, btnSecondary, Card, tableClass, tdClass, thClass } from "@/components/sites/lienstore/admin/ui";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { formatAmount, formatDateTime } from "@/lib/format";
import { LEG_STATUS_CLS, LEG_STATUS_LABEL } from "@/lib/leg-status";
import { cn } from "@/lib/utils";
import type { Order, OrderLeg } from "@/types/shop";
import { SheetTable } from "@/components/sites/lienstore/admin/SheetTable";

/**
 * ⑥ Kho VN › tab "Đơn hàng": the VN shop's view of the orders whose goods are (or are about to be) on its shelf —
 * which ones are complete and waiting to go out, which still wait for units from Japan, which are on the road.
 * Read-only overview; the hand-over buttons live on ⑦ Giao hàng VN (linked per order).
 */
export interface VnOrderUnits {
  /** Codes already at Kho VN (shop), per order line. */
  atShop: string[];
  /** Units still elsewhere (bought · JP → VN · kho ĐVVC), per order line. */
  away: number;
}
export type VnOrderBucket = "ready" | "waiting" | "delivering";

export function bucketOrders(orders: Order[], unitsByItem: Map<number, VnOrderUnits>, readyIds: Set<string>): Record<VnOrderBucket, Order[]> {
  const open = (o: Order) => o.status === "pending" || o.status === "processing";
  const hasAtShop = (o: Order) => o.items.some((it) => it.itemId && (unitsByItem.get(it.itemId)?.atShop.length ?? 0) > 0);
  const out: Record<VnOrderBucket, Order[]> = { ready: [], waiting: [], delivering: [] };
  for (const o of orders) {
    if (!open(o)) continue;
    if (o.shipStage === "delivering") out.delivering.push(o);
    else if (readyIds.has(o.id)) out.ready.push(o);
    else if (hasAtShop(o)) out.waiting.push(o);
  }
  const oldestFirst = (a: Order, b: Order) => a.createdAt.localeCompare(b.createdAt);
  out.ready.sort(oldestFirst);
  out.waiting.sort(oldestFirst);
  out.delivering.sort(oldestFirst);
  return out;
}

const BUCKETS: Array<{ key: VnOrderBucket; label: string; hint: string; accent: "green" | "amber" | "blue" }> = [
  { key: "ready", label: "Đủ hàng — chờ giao", hint: "Mọi món của đơn đã ở kho shop VN, đơn đã thanh toán hoặc COD: đóng gói và giao ở ⑦", accent: "green" },
  { key: "waiting", label: "Có hàng ở kho, còn thiếu", hint: "Một phần hàng của đơn đã về kho VN, phần còn lại đang mua / đang về — chưa giao được", accent: "amber" },
  { key: "delivering", label: "Đang giao", hint: "Đã giao cho shipper / ĐVVC nội địa, chờ khách nhận", accent: "blue" },
];

export function VnOrdersPanel({ buckets, tab, unitsByItem, legs }: { buckets: Record<VnOrderBucket, Order[]>; tab: VnOrderBucket; unitsByItem: Map<number, VnOrderUnits>; legs: Map<string, OrderLeg[]> }) {
  const rows = buckets[tab];
  return (
    <div className="space-y-4" data-testid="vn-orders">
      <StatTiles testId="vn-order-tiles">
        {BUCKETS.map((b) => (
          <StatTile key={b.key} label={b.label} value={`${buckets[b.key].length} đơn`} accent={buckets[b.key].length ? b.accent : "gray"} href={`/admin/inventory/?side=vn&t=orders&ot=${b.key}`} active={tab === b.key} title={b.hint} testId={`vn-tile-${b.key}`} />
        ))}
        <StatTile label="Giao hàng VN" value="Sang ⑦ →" accent="gray" href="/admin/inventory/delivery/" title="Màn ⑦: bấm Bắt đầu giao / Đã giao, nhập mã vận đơn" />
      </StatTiles>
      <Card>
        {rows.length === 0 ? (
          <p className="m-0 text-[13px] text-lien-muted">{tab === "ready" ? "Chưa có đơn nào đủ hàng tại kho VN để giao." : tab === "waiting" ? "Không có đơn nào đang chờ thêm hàng." : "Không có đơn nào đang giao."}</p>
        ) : (
          <div className="overflow-x-auto">
            <SheetTable id={`vn-orders-${tab}`}>
              <table className={tableClass} data-testid={`vn-orders-${tab}`} data-csv-table>
                <thead>
                  <tr>
                    <th className={thClass}>Đơn</th>
                    <th className={thClass}>Khách · địa chỉ</th>
                    <th className={thClass}>Hàng tại kho VN</th>
                    <th className={thClass}>Giao · thu</th>
                    <th className={thClass}>Chặng VN</th>
                    <th className={thClass} />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((o) => {
                    const leg = (legs.get(o.id) ?? []).find((l) => l.leg === "vn_domestic");
                    const st = leg?.status ?? "pending";
                    const pickup = o.delivery === "pickup";
                    const collect = o.paymentMethod === "cod" && !o.paidAt;
                    const c = o.customer;
                    const missing = o.items.reduce((n, it) => n + (it.itemId ? (unitsByItem.get(it.itemId)?.away ?? it.quantity) : it.quantity), 0);
                    return (
                      <tr key={o.id} className="align-top hover:bg-[#fafafa]" data-testid={`vn-order-${o.number}`}>
                        <td className={cn(tdClass, "whitespace-nowrap")}>
                          <Link href={`/admin/orders/${o.id}/`} className="font-semibold text-lien-heading hover:text-lien-blue">
                            #{o.number}
                          </Link>
                          <span className="block text-[11px] text-lien-muted">{formatDateTime(o.createdAt)}</span>
                          {tab === "waiting" ? <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">thiếu {missing} cái</span> : null}
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
                        <td className={cn(tdClass, "min-w-[240px] text-[12px]")}>
                          {o.items.map((it) => {
                            const u = it.itemId ? unitsByItem.get(it.itemId) : undefined;
                            const here = u?.atShop ?? [];
                            const away = u ? u.away : it.quantity;
                            return (
                              <span key={it.itemId ?? it.productId} className="mb-1 block leading-4">
                                <b className="text-lien-heading">{it.name}</b> ×{it.quantity}
                                {here.length ? <span className="ml-1 rounded bg-green-100 px-1 text-[10px] font-semibold text-green-800">{here.length} ở kho</span> : null}
                                {away ? <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-800">{away} đang về</span> : null}
                                {here.length ? <span className="block font-mono text-[10px] text-lien-blue">{here.join(" ")}</span> : null}
                              </span>
                            );
                          })}
                        </td>
                        <td className={cn(tdClass, "text-[12px]")}>
                          <span className="block">{pickup ? "Nhận tại kho" : o.shippingLabel || "Giao tận nhà"}</span>
                          {collect ? <span className="mt-1 block w-fit rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-900">Thu hộ {formatAmount(o.total)}đ</span> : <span className="mt-1 block w-fit rounded bg-green-100 px-1.5 py-0.5 font-semibold text-green-800">Đã thanh toán</span>}
                          {o.shipFeePayment === "on_delivery" && !pickup ? <span className="mt-1 block text-lien-muted">khách trả phí ship cho shipper</span> : null}
                        </td>
                        <td className={cn(tdClass, "text-[12px]")}>
                          <span className={cn("inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold", LEG_STATUS_CLS[st])}>{LEG_STATUS_LABEL[st]}</span>
                          {leg?.tracking ? <span className="mt-1 block font-mono text-[11px] text-lien-blue">{leg.tracking}</span> : null}
                        </td>
                        <td className={cn(tdClass, "whitespace-nowrap text-right")}>
                          {tab === "ready" ? (
                            <Link href="/admin/inventory/delivery/" className={cn(btnPrimary, "!py-1 !text-[12px] no-underline")} title="Sang ⑦ Giao hàng VN để bấm Bắt đầu giao">
                              <Fa name="truck" /> Giao ở ⑦
                            </Link>
                          ) : tab === "delivering" ? (
                            <Link href="/admin/inventory/delivery/?tab=delivering" className={cn(btnSecondary, "!py-1 !text-[12px] no-underline")}>
                              <Fa name="check" /> Đã giao ở ⑦
                            </Link>
                          ) : (
                            <Link href={`/admin/orders/${o.id}/`} className={cn(btnSecondary, "!py-1 !text-[12px] no-underline")}>
                              Xem đơn
                            </Link>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </SheetTable>
          </div>
        )}
      </Card>
    </div>
  );
}
