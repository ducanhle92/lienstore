import Image from "next/image";
import Link from "next/link";
import { moveLotsAction, packLotsAction } from "@/app/admin/inventory/lot-actions";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { formatAmount, formatDate, formatPrice } from "@/lib/format";
import { daysToExpiry, expiryState } from "@/lib/lots";
import { lotTotals, type LotView, type OrderReadyToShip } from "@/lib/lots-db";
import { PURCHASE_STAGES, purchaseIndex } from "@/lib/purchase";
import { purchaseSourceName } from "@/lib/purchase-sources";
import { cn } from "@/lib/utils";
import { WAREHOUSE_LABEL } from "@/lib/warehouses";
import type { PurchaseSource } from "@/types/shop";
import { LotPicker } from "./LotPicker";
import { adminInput, btnPrimary, btnSecondary, Card, tableClass, tdClass, thClass } from "./ui";

export interface LotsFilter {
  q: string;
  src: string;
  exp: "" | "soon" | "expired";
  mode: "" | "orders" | "free";
}

interface Props {
  side: "jp" | "vn";
  lots: LotView[];
  /** Lots flying NB→VN (jp_carrier + in transit) — shown between the two tabs. */
  flying: LotView[];
  filter: LotsFilter;
  sources: PurchaseSource[];
  batches: Array<{ id: number; code: string; label: string; status: string }>;
  /** Open packing runs (Đóng hàng) ticked lots can be boxed into. */
  shipments?: Array<{ id: number; code: string; label: string }>;
  readyOrders: OrderReadyToShip[];
  backUrl: string;
}

const EXP_CLS = { expired: "bg-red-100 text-red-800", soon: "bg-amber-100 text-amber-800", ok: "", none: "" } as const;
const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d");

export function applyLotsFilter(lots: LotView[], f: LotsFilter): LotView[] {
  const q = fold(f.q.trim());
  return lots.filter((l) => {
    if (q && !fold(`${l.productName} ${l.productSku ?? ""} #${l.productId} #${l.id}`).includes(q)) return false;
    if (f.src && l.sourceKey !== f.src) return false;
    if (f.exp) {
      const st = expiryState(l.expiry);
      if (f.exp === "soon" && st !== "soon") return false;
      if (f.exp === "expired" && st !== "expired") return false;
    }
    if (f.mode === "orders" && l.reservedQty + l.heldQty <= 0) return false;
    if (f.mode === "free" && l.free <= 0) return false;
    return true;
  });
}

/**
 * Kho hàng by lot: two coloured tabs (Kho Nhật / Kho Việt Nam), each with "Tại kho shop" (actions) and "Tại kho ĐVVC"
 * (read-only), the NB→VN flight strip in between. FEFO order everywhere.
 */
/** Places a lot at Kho Nhật (shop) can be sent to. */
const MOVE_STAGES = PURCHASE_STAGES.filter((s) => purchaseIndex(s.key) > purchaseIndex("bought") && purchaseIndex(s.key) <= purchaseIndex("at_shop"));

export function LotsBoard({ side, lots, flying, filter, sources, batches, shipments = [], readyOrders, backUrl }: Props) {
  const totals = lotTotals(lots, side);
  // the "tại kho shop" tile counts the shelf only — boxed lots (Đóng hàng) are listed apart
  if (side === "jp") totals.atShop -= lots.filter((l) => l.warehouse === "jp" && l.shipmentId).reduce((n, l) => n + l.physical, 0);
  const shopWh = side === "jp" ? "jp" : "vn";
  const carrierWh = side === "jp" ? "jp_carrier" : "carrier";
  const shown = applyLotsFilter(
    lots.filter((l) => (side === "jp" ? l.warehouse === "jp" || (l.warehouse === "jp_carrier" && !l.inTransit) : l.warehouse === "vn" || l.warehouse === "carrier")),
    filter,
  );
  // Kho Nhật (shop): the shelf vs. what is already boxed for a packing run
  const atShop = shown.filter((l) => l.warehouse === shopWh && !(side === "jp" && l.shipmentId));
  const boxed = side === "jp" ? shown.filter((l) => l.warehouse === "jp" && l.shipmentId) : [];
  const atCarrier = shown.filter((l) => l.warehouse === carrierWh);
  const accent = side === "jp" ? "blue" : "red";
  void batches;
  const srcOptions = Array.from(new Set(lots.map((l) => l.sourceKey))).map((k) => ({ key: k, name: purchaseSourceName(k, sources) }));
  const formId = `lots-${side}`;
  return (
    <div className="space-y-4" data-testid={`lots-board-${side}`}>
      {/* tiles */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Tile label="Lô" value={String(totals.lots)} accent={accent} />
        <Tile label={side === "jp" ? "Tại kho shop Nhật" : "Tại kho shop VN"} value={`${totals.atShop} đv`} accent={accent} />
        <Tile label={side === "jp" ? "Tại kho ĐVVC Nhật" : "Tại kho ĐVVC VN"} value={`${totals.atCarrier} đv`} accent="gray" />
        <Tile label="Giữ cho đơn" value={`${totals.reserved} đv`} accent="amber" />
        <Tile label="Tồn tự do" value={`${totals.free} đv`} accent="green" />
        <Tile label="Vốn" value={formatPrice(totals.costVnd)} accent="gray" />
      </div>

      {/* filter */}
      <form method="get" className="flex flex-wrap items-center gap-2 text-[13px]">
        <input type="hidden" name="side" value={side} />
        <input name="q" defaultValue={filter.q} placeholder="Sản phẩm / SKU / #id / #lô" className={cn(adminInput, "!mb-0 !w-[240px] !py-1")} aria-label="Tìm lô" />
        <select name="src" defaultValue={filter.src} className={cn(adminInput, "!mb-0 !w-auto !py-1")} aria-label="Nguồn mua">
          <option value="">Mọi nguồn mua</option>
          {srcOptions.map((s) => (
            <option key={s.key} value={s.key}>
              {s.name}
            </option>
          ))}
        </select>
        <select name="exp" defaultValue={filter.exp} className={cn(adminInput, "!mb-0 !w-auto !py-1")} aria-label="Hạn dùng">
          <option value="">Mọi HSD</option>
          <option value="soon">HSD ≤ 90 ngày</option>
          <option value="expired">Đã hết hạn</option>
        </select>
        <span className="inline-flex overflow-hidden rounded-md border border-[#d1d5db]">
          {(
            [
              ["", "Tất cả"],
              ["orders", "Chỉ hàng theo đơn"],
              ["free", "Chỉ tồn tự do"],
            ] as const
          ).map(([v, label]) => (
            <label key={v} className={cn("cursor-pointer px-2.5 py-1", filter.mode === v ? (side === "jp" ? "bg-lien-blue text-white" : "bg-lien-heart text-white") : "bg-white text-lien-text")}>
              <input type="radio" name="mode" value={v} defaultChecked={filter.mode === v} className="sr-only" /> {label}
            </label>
          ))}
        </span>
        <button type="submit" className={cn(btnSecondary, "!py-1")}>
          Lọc
        </button>
        <span className="ml-auto text-[12px] text-lien-muted">Sắp xếp theo hạn dùng gần nhất trước (FEFO)</span>
      </form>

      {/* shop block */}
      <Card title={`${WAREHOUSE_LABEL[shopWh]} — tại kho shop (${atShop.length} lô · ${atShop.reduce((n, l) => n + l.physical, 0)} đv)`}>
        {side === "jp" ? (
          <>
            <form id={formId} action={moveLotsAction}>
              <input type="hidden" name="back" value={backUrl} />
            </form>
            <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-[#e5e7eb] bg-[#f9fafb] px-3 py-2 text-[13px]" data-testid="jp-bulk-bar">
              <LotPicker formId={formId} scope={`shop-${side}`} />
              <span className="mx-1 text-lien-muted">|</span>
              <span className="font-semibold text-lien-heading">Lô đã tick →</span>
              <select name="status" form={formId} defaultValue="to_carrier_jp" className={cn(adminInput, "!mb-0 !w-auto !py-1")} aria-label="Chuyển tới">
                {MOVE_STAGES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
              <button type="submit" form={formId} className={cn(btnPrimary, "!py-1")} title="Chuyển cả lô đã tick sang vị trí đã chọn (đóng một phần lô → màn Đóng hàng); đợt mua của lô giữ nguyên">
                <Fa name="truck" /> Chuyển
              </button>
              <span className="mx-1 text-lien-muted">|</span>
              {shipments.length ? (
                <>
                  <select name="shipmentId" form={formId} defaultValue={shipments[0].id} className={cn(adminInput, "!mb-0 !w-auto !py-1")} aria-label="Chuyến đóng hàng">
                    {shipments.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.code}
                        {s.label ? ` · ${s.label}` : ""}
                      </option>
                    ))}
                  </select>
                  <button type="submit" form={formId} formAction={packLotsAction} className={cn(btnSecondary, "!py-1")} title="Đóng cả lô đã tick vào chuyến (đóng theo số lượng → màn Đóng hàng); hàng rời kệ, chờ xuất ĐVVC">
                    <Fa name="cube" /> Đóng vào chuyến
                  </button>
                </>
              ) : (
                <Link href="/admin/inventory/shipments/" className="text-[12px] text-lien-blue hover:underline">
                  <Fa name="cube" /> Mở chuyến đóng hàng
                </Link>
              )}
            </div>
          </>
        ) : null}
        <LotTable lots={atShop} sources={sources} scope={`shop-${side}`} formId={side === "jp" ? formId : null} backUrl={backUrl} />
        {side === "jp" && boxed.length ? (
          <div className="mt-3 rounded-md border border-dashed border-amber-300 bg-amber-50/40 px-3 py-2" data-testid="boxed-lots">
            <p className="m-0 mb-1 flex flex-wrap items-center gap-2 text-[13px] font-semibold text-lien-heading">
              <Fa name="cube" /> Đã đóng hàng, chờ xuất ĐVVC ({boxed.length} lô · {boxed.reduce((n, l) => n + l.physical, 0)} đv)
              <Link href="/admin/inventory/shipments/" className="text-[12px] font-normal text-lien-blue hover:underline">
                Đóng hàng →
              </Link>
            </p>
            <ul className="m-0 list-none space-y-0.5 p-0 text-[12px]">
              {boxed.map((l) => (
                <li key={l.id}>
                  lô #{l.id} · {l.productName} ×{l.physical} · chuyến <b>{l.shipmentCode}</b>
                  {l.reserved.length ? ` · ${l.reserved.map((r) => `#${r.orderNumber}×${r.qty}`).join(", ")}` : ""}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {side === "vn" ? (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="rounded-md border border-[#e5e7eb] bg-[#f9fafb] px-3 py-2 text-[13px]">
              <p className="m-0 mb-1 font-semibold text-lien-heading">Đơn cần giao có hàng sẵn ({readyOrders.length})</p>
              {readyOrders.length === 0 ? <p className="m-0 text-lien-muted">Chưa có đơn nào đủ hàng tại kho shop VN.</p> : null}
              <ul className="m-0 list-none space-y-1 p-0">
                {readyOrders.map((o) => (
                  <li key={o.orderId} className="flex flex-wrap items-center gap-2">
                    <Link href={`/admin/orders/${o.orderId}/`} className="font-semibold text-lien-blue hover:underline">
                      #{o.orderNumber}
                    </Link>
                    <span>{o.customerName}</span>
                    <span className="text-lien-muted">
                      · {o.units} đv · {o.lots.map((l) => `lô #${l}`).join(", ")} · {o.paymentMethod === "cod" ? "COD" : "đã thanh toán"}
                    </span>
                    <Link href={`/admin/orders/${o.orderId}/#tracking`} className={cn(btnSecondary, "ml-auto !px-2 !py-0.5 !text-[12px]")}>
                      Đóng gói giao →
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-md border border-[#e5e7eb] bg-[#f9fafb] px-3 py-2 text-[13px]">
              <p className="m-0 mb-1 font-semibold text-lien-heading">Nhập lại / điều chỉnh</p>
              <p className="m-0 text-lien-muted">Hàng khách trả, hàng mua trực tiếp tại VN hay kiểm kê lệch: mở trang lô của sản phẩm (bấm tên sản phẩm) → “Nhập lô trực tiếp” hoặc sửa số “còn” của lô; kiểm kê cả kho ở tab “Theo sản phẩm”.</p>
            </div>
          </div>
        ) : null}
      </Card>

      {/* carrier block (read-only) */}
      <Card title={`${WAREHOUSE_LABEL[carrierWh]} — tại kho ĐVVC (${atCarrier.length} lô · ${atCarrier.reduce((n, l) => n + l.physical, 0)} đv)`}>
        <p className="m-0 mb-2 text-[12px] text-lien-muted">{side === "jp" ? "Đã giao cho Kiến Express tại Nhật, chờ bay. Chỉ xem; đổi trạng thái ở Quản lý mua hàng › Mua theo đợt (từng dòng hoặc cả đợt)." : "Đã về Hà Nội, chờ chuyển tới kho shop. Lô đang trên đường tới shop có nhãn “đang về”."}</p>
        <LotTable lots={atCarrier} sources={sources} scope={`carrier-${side}`} formId={null} backUrl={backUrl} readOnly />
      </Card>

      {side === "jp" ? (
        <div className="rounded-md border border-dashed border-sky-300 bg-sky-50/50 px-3 py-2 text-[13px]" data-testid="flying-strip">
          <p className="m-0 mb-1 font-semibold text-sky-900">
            <Fa name="plane" /> Đang bay NB→VN ({flying.length} lô · {flying.reduce((n, l) => n + l.physical, 0)} đv)
          </p>
          {flying.length ? (
            <ul className="m-0 list-none space-y-0.5 p-0 text-[12px]">
              {flying.map((l) => (
                <li key={l.id}>
                  lô #{l.id} · {l.productName} ×{l.physical}
                  {l.batchCode ? ` · đợt ${l.batchCode}` : ""}
                  {l.reserved.length ? ` · giữ cho ${l.reserved.map((r) => `#${r.orderNumber}×${r.qty}`).join(", ")}` : ""}
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 text-lien-muted">Không có lô nào đang bay.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function Tile({ label, value, accent }: { label: string; value: string; accent: "blue" | "red" | "amber" | "green" | "gray" }) {
  const cls = { blue: "border-sky-200 bg-sky-50 text-sky-900", red: "border-red-200 bg-red-50 text-red-900", amber: "border-amber-200 bg-amber-50 text-amber-900", green: "border-green-200 bg-green-50 text-green-900", gray: "border-[#e5e7eb] bg-white text-lien-heading" }[accent];
  return (
    <div className={cn("rounded-md border px-3 py-2", cls)}>
      <div className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{label}</div>
      <div className="font-oswald text-[16px] leading-5">{value}</div>
    </div>
  );
}

function LotTable({ lots, sources, scope, formId, backUrl, readOnly = false }: { lots: LotView[]; sources: PurchaseSource[]; scope: string; formId: string | null; backUrl: string; readOnly?: boolean }) {
  void backUrl;
  void readOnly;
  return (
    <div className="overflow-x-auto">
      <table className={tableClass}>
        <thead>
          <tr>
            {formId ? <th className={cn(thClass, "w-8")} /> : null}
            <th className={thClass}>Sản phẩm</th>
            <th className={thClass}>Lô #</th>
            <th className={thClass}>Ngày nhập</th>
            <th className={thClass}>Nguồn mua</th>
            <th className={thClass}>HSD</th>
            <th className={thClass}>Còn</th>
            <th className={thClass}>Giữ cho đơn</th>
            <th className={thClass}>Tự do</th>
            <th className={thClass}>¥/đv</th>
            <th className={thClass}>Đợt mua</th>
            <th className={thClass}>Ghi chú</th>
          </tr>
        </thead>
        <tbody>
          {lots.length === 0 ? (
            <tr>
              <td colSpan={12} className={`${tdClass} text-center text-lien-muted`}>
                Không có lô nào.
              </td>
            </tr>
          ) : null}
          {lots.map((l) => {
            const st = expiryState(l.expiry);
            const days = daysToExpiry(l.expiry);
            const committed = l.reserved.filter((r) => r.committed).reduce((n, r) => n + r.qty, 0);
            return (
              <tr key={l.id} className={cn("hover:bg-[#fafafa]", l.inTransit && "bg-indigo-50/40")} data-lot-scope={scope} data-committed={committed} data-left={l.qtyLeft} data-testid={`lot-${l.id}`}>
                {formId ? (
                  <td className={`${tdClass} w-8`}>
                    <input type="checkbox" name="lotIds" value={l.id} form={formId} className="h-4 w-4" aria-label={`Chọn lô #${l.id}`} />
                  </td>
                ) : null}
                <td className={`${tdClass} min-w-[200px]`}>
                  <div className="flex items-center gap-2">
                    {l.productThumb ? <Image src={l.productThumb} alt="" width={32} height={32} unoptimized className="h-8 w-8 shrink-0 rounded border border-[#e5e7eb] object-contain" /> : null}
                    <span className="flex min-w-0 flex-col leading-4">
                      <Link href={`/admin/inventory/lots/${l.productId}/`} className="line-clamp-2 text-[13px] font-semibold text-lien-heading hover:text-lien-blue" title={l.productName}>
                        {l.productName}
                      </Link>
                      <span className="text-[11px] text-lien-muted">
                        #{l.productId}
                        {l.productSku ? ` · ${l.productSku}` : ""}
                      </span>
                    </span>
                  </div>
                </td>
                <td className={`${tdClass} whitespace-nowrap text-[12px]`}>
                  #{l.id}
                  {l.parentLotId ? <span className="block text-lien-muted">tách từ #{l.parentLotId}</span> : null}
                  {l.inTransit ? <span className="block rounded bg-indigo-100 px-1 text-[10px] font-semibold text-indigo-800">đang về</span> : null}
                </td>
                <td className={`${tdClass} whitespace-nowrap text-[12px]`}>
                  {formatDate(l.receivedAt)}
                  {l.boughtAt && l.boughtAt !== l.receivedAt ? <span className="block text-lien-muted">mua {formatDate(l.boughtAt)}</span> : null}
                </td>
                <td className={`${tdClass} text-[12px]`}>{purchaseSourceName(l.sourceKey, sources)}</td>
                <td className={`${tdClass} whitespace-nowrap text-[12px]`}>
                  {l.expiry ? (
                    <span className={cn("rounded px-1.5 py-0.5", EXP_CLS[st])} title={days !== null ? `${days} ngày` : undefined}>
                      {formatDate(l.expiry)}
                    </span>
                  ) : (
                    <span className="text-lien-muted">—</span>
                  )}
                </td>
                <td className={`${tdClass} font-semibold`} title={l.heldQty ? `${l.qtyLeft} đv chưa bán + ${l.heldQty} đv khách đã thanh toán (chờ giao)` : undefined}>
                  {l.physical}
                  {l.heldQty ? <span className="block text-[11px] font-normal text-green-700">{l.heldQty} đã TT</span> : null}
                </td>
                <td className={`${tdClass} text-[12px]`}>
                  {l.reserved.length === 0 ? (
                    <span className="text-lien-muted">—</span>
                  ) : (
                    l.reserved.map((r) => (
                      <Link key={`${r.orderId}`} href={`/admin/orders/${r.orderId}/`} className={cn("mr-1 inline-block rounded px-1.5 py-0.5 font-semibold no-underline hover:underline", r.committed ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800")} title={r.committed ? "Đơn đã thanh toán / COD — hàng đi cùng lô" : "Đơn chưa thanh toán (chỉ giữ chỗ)"}>
                        #{r.orderNumber} ×{r.qty}
                      </Link>
                    ))
                  )}
                </td>
                <td className={cn(tdClass, "font-semibold", l.free ? "text-green-700" : "text-lien-muted")}>{l.free}</td>
                <td className={`${tdClass} whitespace-nowrap text-[12px] text-lien-muted`}>{l.unitCostJpy ? `¥${formatAmount(l.unitCostJpy)}` : "—"}</td>
                <td className={`${tdClass} whitespace-nowrap text-[12px]`}>
                  {l.batchCode ? (
                    <Link href={`/admin/purchases/?tab=batches#batch-${l.batchId}`} className="rounded bg-[#ecfdf5] px-1.5 py-0.5 font-mono font-semibold text-[#065f46] no-underline hover:underline">
                      {l.batchCode}
                    </Link>
                  ) : (
                    <span className="text-lien-muted">—</span>
                  )}
                  {l.batchStatus ? <span className="block text-[11px] text-lien-muted">{PURCHASE_STAGES[purchaseIndex((l.batchStatus as never) || "not_bought")]?.short}</span> : null}
                </td>
                <td className={`${tdClass} max-w-[180px] truncate text-[12px] text-lien-muted`} title={l.note}>
                  {l.note || "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
