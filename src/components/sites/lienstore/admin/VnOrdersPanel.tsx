import Link from "next/link";
import { StatTile, StatTiles } from "@/components/sites/lienstore/admin/StatTiles";
import { btnPrimary, btnSecondary, Card, tableClass, tdClass, thClass } from "@/components/sites/lienstore/admin/ui";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { formatAmount, formatDateTime } from "@/lib/format";
import { LEG_STATUS_CLS, LEG_STATUS_LABEL } from "@/lib/leg-status";
import { PURCHASE_STAGES, purchaseIndex, type PurchaseStatus } from "@/lib/purchase";
import { cn } from "@/lib/utils";
import type { Order, OrderLeg } from "@/types/shop";
import { SheetTable } from "@/components/sites/lienstore/admin/SheetTable";
import { BulkBar } from "@/components/sites/lienstore/admin/BulkBar";
import { TableSelectAll } from "@/components/sites/lienstore/admin/TableSelectAll";

/**
 * ⑥ Kho VN › sheet "Đơn hàng": every open order from Vận hành › Đơn hàng seen from the VN shop — complete and waiting to
 * go out, partly here, not here yet (so staff can tell the customer where each item is), on the road. Per line the
 * units' places (chưa mua · kho Nhật · JP→VN · kho ĐVVC · tại kho VN) as chips; "Chi tiết" opens the per-product list.
 * Read-only; the hand-over buttons live on ⑦ Giao hàng VN.
 */
export interface VnOrderUnits {
  /** Codes already at Kho VN (shop). */
  atShop: string[];
  /** Units elsewhere, by purchase status (bought · to_carrier_jp · shipped_jp_vn · at_carrier_vn · to_shop · …). */
  away: Partial<Record<PurchaseStatus, number>>;
}
export type VnOrderBucket = "ready" | "waiting" | "none" | "delivering";

const open = (o: Order) => o.status === "pending" || o.status === "processing";

/** Where the units of one order line are: at shop, elsewhere by status, and the rest not even bought yet. */
export function lineStatus(it: Order["items"][number], unitsByItem: Map<number, VnOrderUnits>): Array<{ status: PurchaseStatus; n: number }> {
  const u = it.itemId ? unitsByItem.get(it.itemId) : undefined;
  const out: Array<{ status: PurchaseStatus; n: number }> = [];
  if (u?.atShop.length) out.push({ status: "at_shop", n: u.atShop.length });
  for (const [k, v] of Object.entries(u?.away ?? {})) if (v) out.push({ status: k as PurchaseStatus, n: v });
  const have = out.reduce((n, x) => n + x.n, 0);
  if (it.quantity > have) out.push({ status: it.purchaseStatus === "ordered" ? "ordered" : "not_bought", n: it.quantity - have });
  return out.sort((a, b) => purchaseIndex(b.status) - purchaseIndex(a.status));
}

export function bucketOrders(orders: Order[], unitsByItem: Map<number, VnOrderUnits>, readyIds: Set<string>): Record<VnOrderBucket, Order[]> {
  const hasAtShop = (o: Order) => o.items.some((it) => it.itemId && (unitsByItem.get(it.itemId)?.atShop.length ?? 0) > 0);
  const out: Record<VnOrderBucket, Order[]> = { ready: [], waiting: [], none: [], delivering: [] };
  for (const o of orders) {
    if (!open(o)) continue;
    if (o.shipStage === "delivering") out.delivering.push(o);
    else if (readyIds.has(o.id)) out.ready.push(o);
    else if (hasAtShop(o)) out.waiting.push(o);
    else out.none.push(o);
  }
  const oldestFirst = (a: Order, b: Order) => a.createdAt.localeCompare(b.createdAt);
  for (const k of Object.keys(out) as VnOrderBucket[]) out[k].sort(oldestFirst);
  return out;
}

const BUCKETS: Array<{ key: VnOrderBucket; label: string; hint: string; accent: "green" | "amber" | "red" | "blue" }> = [
  { key: "ready", label: "Đủ hàng — chờ giao", hint: "Mọi món của đơn đã ở kho shop VN, đơn đã thanh toán hoặc COD: đóng gói và giao ở ⑦", accent: "green" },
  { key: "waiting", label: "Có hàng ở kho, còn thiếu", hint: "Một phần hàng của đơn đã về kho VN, phần còn lại đang mua / đang về — chưa giao được", accent: "amber" },
  { key: "none", label: "Chưa có hàng ở kho", hint: "Đơn đang xử lý mà chưa món nào về kho VN — xem từng món đang ở đâu để báo khách", accent: "red" },
  { key: "delivering", label: "Đang giao", hint: "Đã giao cho shipper / ĐVVC nội địa, chờ khách nhận", accent: "blue" },
];

function StatusChip({ status, n }: { status: PurchaseStatus; n: number }) {
  const st = PURCHASE_STAGES.find((s) => s.key === status);
  return (
    <span className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold", st?.cls ?? "bg-gray-200 text-gray-700")} title={st?.label}>
      {n} {st?.short ?? status}
    </span>
  );
}

export function VnOrdersPanel({ buckets, tab, unitsByItem, legs }: { buckets: Record<VnOrderBucket, Order[]>; tab: VnOrderBucket; unitsByItem: Map<number, VnOrderUnits>; legs: Map<string, OrderLeg[]> }) {
  const rows = buckets[tab];
  const empty = { ready: "Chưa có đơn nào đủ hàng tại kho VN để giao.", waiting: "Không có đơn nào đang chờ thêm hàng.", none: "Mọi đơn đang xử lý đều đã có hàng ở kho VN.", delivering: "Không có đơn nào đang giao." }[tab];
  return (
    <div className="space-y-4" data-testid="vn-orders">
      <StatTiles testId="vn-order-tiles">
        {BUCKETS.map((b) => (
          <StatTile key={b.key} label={b.label} value={`${buckets[b.key].length} đơn`} accent={buckets[b.key].length ? b.accent : "gray"} href={`/admin/inventory/?side=vn&t=orders&ot=${b.key}`} active={tab === b.key} title={b.hint} testId={`vn-tile-${b.key}`} />
        ))}
        <StatTile label="Giao hàng VN" value="Sang ⑦ →" accent="gray" href="/admin/inventory/delivery/" title="Màn ⑦: chọn ĐVVC, nhập mã vận đơn, bấm Bắt đầu giao / Đã giao" />
      </StatTiles>
      {/* ticked orders → "In hoá đơn" in the bottom bar: one A5 sheet per order in a new tab (/print/orders/) */}
      <form id="vn-print" method="get" action="/print/orders/" target="_blank" />
      <BulkBar scope="vn-print" label="đơn">
        <button type="submit" form="vn-print" className={cn(btnPrimary, "!py-1")} data-testid="bulk-print">
          <Fa name="print" /> In hoá đơn
        </button>
      </BulkBar>
      <Card>
        {rows.length === 0 ? (
          <p className="m-0 text-[13px] text-lien-muted">{empty}</p>
        ) : (
          <div className="overflow-x-auto">
            <SheetTable id={`vn-orders-${tab}`}>
              <table className={tableClass} data-testid={`vn-orders-${tab}`} data-csv-table>
                <thead>
                  <tr>
                    <th className={cn(thClass, "w-8")}>
                      <TableSelectAll name="ids" />
                    </th>
                    <th className={thClass}>Đơn</th>
                    <th className={thClass}>Khách · địa chỉ</th>
                    <th className={thClass}>Hàng của đơn đang ở đâu</th>
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
                    const lines = o.items.map((it) => ({ it, parts: lineStatus(it, unitsByItem) }));
                    // order-level summary: units per place across every line
                    const summary = new Map<PurchaseStatus, number>();
                    for (const l of lines) for (const p of l.parts) summary.set(p.status, (summary.get(p.status) ?? 0) + p.n);
                    const total = o.items.reduce((n, it) => n + it.quantity, 0);
                    const here = summary.get("at_shop") ?? 0;
                    return (
                      <tr key={o.id} className="align-top hover:bg-[#fafafa]" data-testid={`vn-order-${o.number}`}>
                        <td className={cn(tdClass, "w-8")}>
                          <input type="checkbox" name="ids" value={o.id} form="vn-print" className="h-4 w-4" aria-label={`Chọn đơn #${o.number}`} />
                        </td>
                        <td className={cn(tdClass, "whitespace-nowrap")}>
                          <Link href={`/admin/orders/${o.id}/`} className="font-semibold text-lien-heading hover:text-lien-blue">
                            #{o.number}
                          </Link>
                          <span className="block text-[11px] text-lien-muted">{formatDateTime(o.createdAt)}</span>
                          {tab === "waiting" || tab === "none" ? <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">{here}/{total} cái ở kho</span> : null}
                        </td>
                        <td className={cn(tdClass, "min-w-[200px] text-[13px]")}>
                          <span className="block font-semibold text-lien-heading">
                            {c.lastName} {c.firstName}
                          </span>
                          <a href={`tel:${c.phone}`} className="text-lien-blue hover:underline">
                            {c.phone}
                          </a>
                          <span className="block text-[12px] text-lien-muted">{pickup ? "Khách tới kho lấy" : c.address}</span>
                          {c.note ? <span className="block text-[12px] text-amber-800">Khách ghi: {c.note}</span> : null}
                        </td>
                        <td className={cn(tdClass, "min-w-[260px] text-[12px]")}>
                          <div className="flex flex-wrap items-center gap-1" data-testid={`vn-summary-${o.number}`}>
                            <span className="text-lien-muted">{o.items.length} món · {total} cái:</span>
                            {[...summary.entries()].sort((a, b) => purchaseIndex(b[0]) - purchaseIndex(a[0])).map(([status, n]) => (
                              <StatusChip key={status} status={status} n={n} />
                            ))}
                          </div>
                          <details className="mt-1" data-testid={`vn-detail-${o.number}`}>
                            <summary className="cursor-pointer text-[12px] text-lien-blue">Chi tiết từng sản phẩm</summary>
                            <ul className="m-0 mt-1 list-none space-y-1 p-0">
                              {lines.map(({ it, parts }) => {
                                const u = it.itemId ? unitsByItem.get(it.itemId) : undefined;
                                return (
                                  <li key={it.itemId ?? it.productId} className="leading-4">
                                    <b className="text-lien-heading">{it.name}</b> ×{it.quantity}
                                    <span className="ml-1 inline-flex flex-wrap gap-1 align-middle">
                                      {parts.map((p) => (
                                        <StatusChip key={p.status} status={p.status} n={p.n} />
                                      ))}
                                    </span>
                                    {u?.atShop.length ? <span className="block font-mono text-[10px] text-lien-blue">{u.atShop.join(" ")}</span> : null}
                                  </li>
                                );
                              })}
                            </ul>
                          </details>
                        </td>
                        <td className={cn(tdClass, "text-[12px]")}>
                          <span className="block">{pickup ? "Nhận tại kho" : o.shippingLabel || "Giao tận nhà"}</span>
                          {collect ? <span className="mt-1 block w-fit rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-900">Thu hộ {formatAmount(o.total)}đ</span> : <span className="mt-1 block w-fit rounded bg-green-100 px-1.5 py-0.5 font-semibold text-green-800">Đã thanh toán</span>}
                          {o.shipFeePayment === "on_delivery" && !pickup ? <span className="mt-1 block text-lien-muted">khách trả phí ship cho shipper</span> : null}
                        </td>
                        <td className={cn(tdClass, "text-[12px]")}>
                          <span className={cn("inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold", LEG_STATUS_CLS[st])}>{LEG_STATUS_LABEL[st]}</span>
                          {leg?.label ? <span className="mt-1 block text-[11px] text-lien-muted">{leg.label}</span> : null}
                          {leg?.tracking ? <span className="mt-1 block font-mono text-[11px] text-lien-blue">{leg.tracking}</span> : null}
                        </td>
                        <td className={cn(tdClass, "whitespace-nowrap text-right")}>
                          {tab === "ready" ? (
                            <Link href="/admin/inventory/delivery/" className={cn(btnPrimary, "!py-1 !text-[12px] no-underline")} title="Sang ⑦ Giao hàng VN để chọn ĐVVC và bấm Bắt đầu giao">
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
