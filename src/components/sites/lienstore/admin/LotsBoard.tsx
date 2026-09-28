import Image from "next/image";
import Link from "next/link";
import { moveUnitsAction, packUnitsAction } from "@/app/admin/inventory/lot-actions";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { formatAmount, formatDate, formatPrice } from "@/lib/format";
import { daysToExpiry, expiryState } from "@/lib/lots";
import { groupTotals, type OrderReadyToShip, type StockGroup } from "@/lib/lots-db";
import { PURCHASE_STAGES, purchaseIndex } from "@/lib/purchase";
import { purchaseSourceName } from "@/lib/purchase-sources";
import { cn } from "@/lib/utils";
import type { PurchaseSource } from "@/types/shop";
import { BulkBar } from "./BulkBar";
import { LotPicker } from "./LotPicker";
import { TableSelectAll } from "./TableSelectAll";
import { adminInput, btnPrimary, btnSecondary, Card, tableClass, tdClass, thClass } from "./ui";

export interface LotsFilter {
  q: string;
  src: string;
  exp: "" | "soon" | "expired";
  mode: "" | "orders" | "free";
}

interface Props {
  side: "jp" | "vn";
  /** Every stock group of both sides (bill line × place × packing run). */
  groups: StockGroup[];
  filter: LotsFilter;
  sources: PurchaseSource[];
  /** Open packing runs (Đóng hàng) ticked rows can be boxed into. */
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

/** A shelf row: one bill line × who holds it (an order, or nobody) — what the admin ticks to move or pack. */
interface Row {
  key: string;
  g: StockGroup;
  unitIds: number[];
  codes: string[];
  qty: number;
  holder: StockGroup["holders"][number] | null;
}
function splitByHolder(groups: StockGroup[]): Row[] {
  const out: Row[] = [];
  for (const g of groups) {
    const parts = new Map<string, typeof g.units>();
    for (const u of g.units) parts.set(u.itemId ? `i${u.itemId}` : "free", [...(parts.get(u.itemId ? `i${u.itemId}` : "free") ?? []), u]);
    for (const [k, us] of parts) out.push({ key: `${g.key}|${k}`, g, unitIds: us.map((u) => u.id), codes: us.map((u) => u.code), qty: us.length, holder: us[0].itemId ? (g.holders.find((h) => h.itemId === us[0].itemId) ?? null) : null });
  }
  return out;
}

export function applyLotsFilter(groups: StockGroup[], f: LotsFilter): StockGroup[] {
  const q = fold(f.q.trim());
  return groups.filter((g) => {
    if (q && !fold(`${g.productName} ${g.productSku ?? ""} #${g.productId} ${g.receiptCode} ${g.codes.join(" ")} ${g.holders.map((h) => `#${h.orderNumber} ${h.customer}`).join(" ")}`).includes(q)) return false;
    if (f.src && g.sourceKey !== f.src) return false;
    if (f.exp) {
      const st = expiryState(g.expiry);
      if (f.exp === "soon" && st !== "soon") return false;
      if (f.exp === "expired" && st !== "expired") return false;
    }
    if (f.mode === "orders" && g.heldQty <= 0) return false;
    if (f.mode === "free" && g.free <= 0) return false;
    return true;
  });
}

/** Places goods at Kho Nhật (shop) can be sent to. */
const MOVE_STAGES = PURCHASE_STAGES.filter((s) => purchaseIndex(s.key) > purchaseIndex("bought") && purchaseIndex(s.key) <= purchaseIndex("at_shop"));

/**
 * Tồn kho by bill line (every row expands to its unit codes): two tabs (Kho Nhật / Kho Việt Nam), each with "Tại kho
 * shop" (actions) and "Tại kho ĐVVC" (read-only), the NB→VN flight strip in between. FEFO order everywhere.
 */
export function LotsBoard({ side, groups, filter, sources, shipments = [], readyOrders, backUrl }: Props) {
  const totals = groupTotals(groups, side);
  const shopStatus = side === "jp" ? "bought" : "at_shop";
  const shown = applyLotsFilter(groups, filter);
  const shelf = shown.filter((g) => g.status === shopStatus && !(side === "jp" && g.shipmentId));
  const boxed = side === "jp" ? shown.filter((g) => g.status === "bought" && g.shipmentId) : [];
  const atCarrier = shown.filter((g) => (side === "jp" ? g.status === "to_carrier_jp" : g.status === "at_carrier_vn" || g.status === "to_shop"));
  const flying = side === "jp" ? shown.filter((g) => g.status === "shipped_jp_vn") : [];
  if (side === "jp") totals.atShop -= boxed.reduce((n, g) => n + g.qty, 0);
  const accent = side === "jp" ? "blue" : "red";
  const srcOptions = Array.from(new Set(groups.map((g) => g.sourceKey))).map((k) => ({ key: k, name: purchaseSourceName(k, sources) }));
  const formId = `lots-${side}`;
  const units = (xs: StockGroup[]) => xs.reduce((n, g) => n + g.qty, 0);
  return (
    <div className="space-y-4" data-testid={`lots-board-${side}`}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Tile label="Dòng bill" value={String(totals.groups)} accent={accent} />
        <Tile label={side === "jp" ? "Tại kho shop Nhật" : "Tại kho shop VN"} value={`${totals.atShop} cái`} accent={accent} />
        <Tile label={side === "jp" ? "ĐVVC Nhật / đang bay" : "ĐVVC VN / đang về"} value={`${totals.atCarrier} cái`} accent="gray" />
        <Tile label="Giữ cho đơn" value={`${totals.held} cái`} accent="amber" />
        <Tile label="Tồn tự do" value={`${totals.free} cái`} accent="green" />
        <Tile label="Vốn (tồn tự do)" value={formatPrice(totals.costVnd)} accent="gray" />
      </div>

      <form method="get" className="flex flex-wrap items-center gap-2 text-[13px]">
        <input type="hidden" name="side" value={side} />
        <input name="q" defaultValue={filter.q} placeholder="Sản phẩm / SKU / mã H… / mã bill / #đơn" className={cn(adminInput, "!mb-0 !w-[260px] !py-1")} aria-label="Tìm" />
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

      <Card title={`${side === "jp" ? "Kho Nhật (shop)" : "Kho Việt Nam (shop)"} — tại kho shop (${shelf.length} dòng bill · ${units(shelf)} cái)`}>
        <form id={formId} action={moveUnitsAction}>
          <input type="hidden" name="back" value={backUrl} />
        </form>
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-[#e5e7eb] bg-[#f9fafb] px-3 py-2 text-[13px]" data-testid={`${side}-bulk-bar`}>
          <LotPicker formId={formId} scope={`shop-${side}`} />
        </div>
        <BulkBar scope={formId}>
          <select name="status" form={formId} defaultValue={side === "jp" ? "to_carrier_jp" : "shipped_to_customer"} className={cn(adminInput, "!mb-0 !w-auto !py-1")} aria-label="Chuyển tới">
            {(side === "jp" ? MOVE_STAGES : PURCHASE_STAGES.filter((s) => purchaseIndex(s.key) >= purchaseIndex("bought"))).map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          <button type="submit" form={formId} className={cn(btnPrimary, "!py-1")} title="Chuyển các cái đã tick (ô SL nhỏ hơn = chỉ bấy nhiêu cái) sang trạng thái đã chọn; đơn hàng và đợt mua đổi theo">
            <Fa name="truck" /> Chuyển
          </button>
          {side === "jp" ? (
            <>
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
                  <button type="submit" form={formId} formAction={packUnitsAction} className={cn(btnSecondary, "!py-1")} title="Đóng các cái đã tick vào chuyến; hàng rời kệ, chờ xuất ĐVVC">
                    <Fa name="cube" /> Đóng vào chuyến
                  </button>
                </>
              ) : (
                <Link href="/admin/inventory/shipments/" className="text-[12px] text-lien-blue hover:underline">
                  <Fa name="cube" /> Mở chuyến đóng hàng
                </Link>
              )}
            </>
          ) : null}
        </BulkBar>
        <GroupTable rows={splitByHolder(shelf)} sources={sources} scope={`shop-${side}`} formId={formId} />
        {boxed.length ? (
          <div className="mt-3 rounded-md border border-dashed border-amber-300 bg-amber-50/40 px-3 py-2" data-testid="boxed-lots">
            <p className="m-0 mb-1 flex flex-wrap items-center gap-2 text-[13px] font-semibold text-lien-heading">
              <Fa name="cube" /> Đã đóng hàng, chờ xuất ĐVVC ({units(boxed)} cái)
              <Link href="/admin/inventory/shipments/" className="text-[12px] font-normal text-lien-blue hover:underline">
                Đóng hàng →
              </Link>
            </p>
            <ul className="m-0 list-none space-y-0.5 p-0 text-[12px]">
              {boxed.map((g) => (
                <li key={g.key}>
                  {g.productName} ×{g.qty} · chuyến <b>{g.shipmentCode}</b> · <span className="font-mono">{g.receiptCode || "chưa có bill"}</span>
                  {g.holders.length ? ` · ${g.holders.map((h) => `#${h.orderNumber}×${h.qty}`).join(", ")}` : ""}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {side === "vn" ? (
          <div className="mt-3 rounded-md border border-[#e5e7eb] bg-[#f9fafb] px-3 py-2 text-[13px]">
            <p className="m-0 mb-1 font-semibold text-lien-heading">Đơn cần giao có hàng sẵn ({readyOrders.length})</p>
            {readyOrders.length === 0 ? <p className="m-0 text-lien-muted">Chưa có đơn nào đủ hàng tại kho shop VN.</p> : null}
            <ul className="m-0 list-none space-y-1 p-0">
              {readyOrders.map((o) => (
                <li key={o.orderId} className="flex flex-wrap items-center gap-2">
                  <Link href={`/admin/orders/${o.orderId}/`} className="font-semibold text-lien-blue hover:underline">
                    #{o.orderNumber}
                  </Link>
                  <span>{o.customerName}</span>
                  <span className="font-mono text-[11px] text-lien-muted">
                    · {o.units} cái · {o.codes.slice(0, 4).join(" ")}
                    {o.codes.length > 4 ? " …" : ""} · {o.paymentMethod === "cod" ? "COD" : "đã thanh toán"}
                  </span>
                  <Link href={`/admin/orders/${o.orderId}/#tracking`} className={cn(btnSecondary, "ml-auto !px-2 !py-0.5 !text-[12px]")}>
                    Đóng gói giao →
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>

      <Card title={`${side === "jp" ? "Kho ĐVVC Nhật" : "Kho ĐVVC VN / đang về kho shop"} — tại kho ĐVVC (${atCarrier.length} dòng bill · ${units(atCarrier)} cái)`}>
        <GroupTable rows={splitByHolder(atCarrier)} sources={sources} scope={`carrier-${side}`} formId={null} />
      </Card>

      {side === "jp" ? (
        <div className="rounded-md border border-dashed border-sky-300 bg-sky-50/50 px-3 py-2 text-[13px]" data-testid="flying-strip">
          <p className="m-0 mb-1 font-semibold text-sky-900">
            <Fa name="plane" /> Đang bay NB→VN ({units(flying)} cái)
          </p>
          {flying.length ? (
            <ul className="m-0 list-none space-y-0.5 p-0 text-[12px]">
              {flying.map((g) => (
                <li key={g.key}>
                  {g.productName} ×{g.qty} · <span className="font-mono">{g.receiptCode || "chưa có bill"}</span>
                  {g.shipmentCode ? ` · chuyến ${g.shipmentCode}` : ""}
                  {g.holders.length ? ` · giữ cho ${g.holders.map((h) => `#${h.orderNumber}×${h.qty}`).join(", ")}` : ""}
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 text-lien-muted">Không có hàng nào đang bay.</p>
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

function GroupTable({ rows, sources, scope, formId }: { rows: Row[]; sources: PurchaseSource[]; scope: string; formId: string | null }) {
  return (
    <div className="overflow-x-auto">
      <table className={tableClass}>
        <thead>
          <tr>
            {formId ? (
              <th className={cn(thClass, "w-8")}>
                <TableSelectAll name="uids" />
              </th>
            ) : null}
            <th className={thClass}>Sản phẩm</th>
            <th className={thClass}>Bill · mã</th>
            <th className={thClass}>Ngày mua</th>
            <th className={thClass}>Nguồn mua</th>
            <th className={thClass}>HSD</th>
            <th className={thClass}>SL</th>
            {formId ? <th className={thClass}>SL chuyển</th> : null}
            <th className={thClass}>Cho đơn</th>
            <th className={thClass}>¥/cái</th>
            <th className={thClass}>Đợt mua</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={12} className={`${tdClass} text-center text-lien-muted`}>
                Không có hàng nào.
              </td>
            </tr>
          ) : null}
          {rows.map((r) => {
            const g = r.g;
            const st = expiryState(g.expiry);
            const days = daysToExpiry(g.expiry);
            return (
              <tr key={r.key} className={cn("align-top hover:bg-[#fafafa]", (g.status === "to_shop" || g.status === "shipped_jp_vn") && "bg-indigo-50/40")} data-lot-scope={scope} data-committed={r.holder?.committed ? r.qty : 0} data-left={r.holder ? 0 : r.qty} data-testid={`group-${r.unitIds[0]}`}>
                {formId ? (
                  <td className={`${tdClass} w-8`}>
                    <input type="checkbox" name="uids" value={r.unitIds.join(",")} form={formId} className="h-4 w-4" aria-label={`Chọn ${g.productName}`} />
                  </td>
                ) : null}
                <td className={`${tdClass} min-w-[200px]`}>
                  <div className="flex items-center gap-2">
                    {g.productThumb ? <Image src={g.productThumb} alt="" width={32} height={32} unoptimized className="h-8 w-8 shrink-0 rounded border border-[#e5e7eb] object-contain" /> : null}
                    <span className="flex min-w-0 flex-col leading-4">
                      <Link href={`/admin/inventory/lots/${g.productId}/`} className="line-clamp-2 text-[13px] font-semibold text-lien-heading hover:text-lien-blue" title={g.productName}>
                        {g.productName}
                      </Link>
                      <span className="text-[11px] text-lien-muted">
                        #{g.productId}
                        {g.productSku ? ` · ${g.productSku}` : ""}
                        {g.groupCode ? ` · ${g.groupCode}` : ""}
                      </span>
                    </span>
                  </div>
                </td>
                <td className={`${tdClass} whitespace-nowrap text-[12px]`}>
                  {g.receiptId ? (
                    <Link href={`/admin/purchases/?tab=batches&bills=${g.batchId ?? ""}#receipt-${g.receiptId}`} className="rounded border border-[#d1d5db] bg-white px-1 py-0.5 font-mono text-[11px] font-semibold text-lien-heading no-underline hover:border-lien-blue" title="Bill mua — mở trong đợt">
                      {g.receiptCode}
                    </Link>
                  ) : (
                    <span className="rounded bg-[#f3f4f6] px-1 py-0.5 text-[10px] text-lien-muted">chưa có bill</span>
                  )}
                  <details className="mt-0.5 text-[11px]">
                    <summary className="cursor-pointer font-mono text-lien-blue">{r.codes.length > 1 ? `${r.codes[0]} … ${r.codes.length} mã` : r.codes[0]}</summary>
                    <span className="flex max-w-[260px] flex-wrap gap-1 pt-1">
                      {r.codes.map((c) => (
                        <Link key={c} href={`/admin/inventory/units/${c}/`} className="rounded bg-[#f3f4f6] px-1 font-mono text-[10px] text-lien-blue no-underline hover:underline">
                          {c}
                        </Link>
                      ))}
                    </span>
                  </details>
                  {g.status === "to_shop" || g.status === "shipped_jp_vn" ? <span className="block rounded bg-indigo-100 px-1 text-[10px] font-semibold text-indigo-800">đang đi</span> : null}
                </td>
                <td className={`${tdClass} whitespace-nowrap text-[12px]`}>{g.boughtAt ? formatDate(g.boughtAt) : "—"}</td>
                <td className={`${tdClass} text-[12px]`}>
                  {purchaseSourceName(g.sourceKey, sources)}
                  {g.store ? <span className="block text-lien-muted">{g.store}</span> : null}
                </td>
                <td className={`${tdClass} whitespace-nowrap text-[12px]`}>
                  {g.expiry ? (
                    <span className={cn("rounded px-1.5 py-0.5", EXP_CLS[st])} title={days !== null ? `${days} ngày` : undefined}>
                      {formatDate(g.expiry)}
                    </span>
                  ) : (
                    <span className="text-lien-muted">—</span>
                  )}
                </td>
                <td className={`${tdClass} font-semibold`}>{r.qty}</td>
                {formId ? (
                  <td className={tdClass}>
                    {r.qty > 1 ? <input name={`qty_${r.unitIds[0]}`} form={formId} inputMode="numeric" placeholder={String(r.qty)} className={cn(adminInput, "!mb-0 !w-14 !py-1 !text-center !text-[13px]")} aria-label="Số cái (trống = cả dòng)" title="Trống = cả dòng; số nhỏ hơn = chỉ bấy nhiêu cái (hạn dùng gần nhất trước)" /> : <span className="text-[12px] text-lien-muted">1</span>}
                  </td>
                ) : null}
                <td className={`${tdClass} text-[12px]`}>
                  {r.holder ? (
                    <Link href={`/admin/orders/${r.holder.orderId}/`} className={cn("inline-block rounded px-1.5 py-0.5 font-semibold no-underline hover:underline", r.holder.committed ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800")} title={r.holder.committed ? "Đơn đã thanh toán / COD" : "Đơn chưa thanh toán (chỉ giữ chỗ)"}>
                      #{r.holder.orderNumber} {r.holder.customer}
                    </Link>
                  ) : (
                    <span className="text-green-700">tự do</span>
                  )}
                </td>
                <td className={`${tdClass} whitespace-nowrap text-[12px] text-lien-muted`}>{g.unitCostJpy ? `¥${formatAmount(g.unitCostJpy)}` : "—"}</td>
                <td className={`${tdClass} whitespace-nowrap text-[12px]`}>
                  {g.batchCode ? (
                    <Link href={`/admin/purchases/?tab=batches#batch-${g.batchId}`} className="rounded bg-[#ecfdf5] px-1.5 py-0.5 font-mono font-semibold text-[#065f46] no-underline hover:underline">
                      {g.batchCode}
                    </Link>
                  ) : (
                    <span className="text-lien-muted">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
