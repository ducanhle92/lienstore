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
import { TableSelectAll } from "./TableSelectAll";
import { adminInput, btnPrimary, btnSecondary, Card, tableClass, tdClass, thClass } from "./ui";
import { SheetTable } from "./SheetTable";
import { LiveTotals } from "./LiveTotals";

export interface LotsFilter {
  q: string;
  src: string;
  exp: "" | "soon" | "expired";
  /** "" = everything at the shop; shelf = not boxed; boxed = parcels only; orders / free = held / free units only. */
  mode: "" | "orders" | "free" | "shelf" | "boxed";
}

interface Props {
  side: "jp" | "vn";
  /** Every stock group of both sides (bill line × place × packing run). */
  groups: StockGroup[];
  filter: LotsFilter;
  sources: PurchaseSource[];
  /** Open packing runs (Đóng hàng): ticked rows can be boxed into them; their boxes are the parcels still at Kho Nhật. */
  shipments?: Array<{ id: number; code: string; label: string; status?: string }>;
  readyOrders: OrderReadyToShip[];
  /** Extra query the tile links keep (⑥ Kho VN sheet, e.g. "&t=stock"). */
  tabQuery?: string;
  /** see_cost: the "Vốn" tile and the ¥/cái column. */
  showCost?: boolean;
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
export function LotsBoard({ side, groups, filter, sources, shipments = [], readyOrders, backUrl, tabQuery = "", showCost = true }: Props) {
  // Tồn kho = what is physically at the shop; goods with the carrier / in the air are under ⑤ Vận chuyển
  const shopStatus = side === "jp" ? "bought" : "at_shop";
  const atShop = groups.filter((g) => g.status === shopStatus);
  const totals = groupTotals(atShop, side);
  const shown = applyLotsFilter(atShop, filter);
  const shelf = filter.mode === "boxed" ? [] : shown.filter((g) => !(side === "jp" && g.shipmentId));
  const boxed = side === "jp" && filter.mode !== "shelf" ? shown.filter((g) => g.shipmentId) : [];
  const tileHref = (mode: LotsFilter["mode"]) => `/admin/inventory/?side=${side}${tabQuery}${mode ? `&mode=${mode}` : ""}`;
  const boxedAll = side === "jp" ? atShop.filter((g) => g.shipmentId) : [];
  // parcels = packing runs whose boxes are still on the shop floor (one run = one parcel id CH-…)
  const parcels = [...new Map(boxed.map((g) => [g.shipmentId!, { id: g.shipmentId!, code: g.shipmentCode ?? `#${g.shipmentId}`, groups: [] as StockGroup[] }])).values()];
  for (const g of boxed) parcels.find((x) => x.id === g.shipmentId)?.groups.push(g);
  const accent = side === "jp" ? "blue" : "red";
  const units = (xs: StockGroup[]) => xs.reduce((n, g) => n + g.qty, 0);
  const formId = `lots-${side}`;
  return (
    <div className="space-y-4" data-testid={`lots-board-${side}`}>
      {/* the figures are the filter: click a tile → the table below shows just that part */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7" data-testid={`lots-tiles-${side}`}>
        <Tile label={`${side === "jp" ? "Kho Nhật (shop)" : "Kho Việt Nam (shop)"} · ${totals.groups} dòng bill`} value={`${totals.atShop} cái`} accent={accent} href={tileHref("")} active={filter.mode === ""} title="Tất cả hàng đang ở kho shop" />
        <Tile label={side === "jp" ? "Trên kệ Kho Nhật" : "Tại kho shop VN"} value={`${totals.atShop - units(boxedAll)} cái`} accent={accent} href={side === "jp" ? tileHref("shelf") : undefined} active={filter.mode === "shelf"} title={side === "jp" ? "Chỉ hàng còn trên kệ, chưa đóng kiện" : undefined} />
        {side === "jp" ? (
          <Tile label="Đã đóng kiện, chờ xuất" value={`${new Set(boxedAll.map((g) => g.shipmentId)).size} kiện · ${units(boxedAll)} cái`} accent="gray" href={tileHref("boxed")} active={filter.mode === "boxed"} title="Chỉ các kiện đã đóng, chờ xuất ĐVVC" />
        ) : (
          <Tile label="Đơn đủ hàng để giao" value={`${readyOrders.length} đơn`} accent="gray" href="/admin/inventory/delivery/" title="Sang ⑦ Giao hàng VN" />
        )}
        <Tile label="Giữ cho đơn" value={`${totals.held} cái`} accent="amber" href={tileHref("orders")} active={filter.mode === "orders"} title="Chỉ dòng có hàng giữ cho đơn khách" />
        <Tile label="Tồn tự do" value={`${totals.free} cái`} accent="green" href={tileHref("free")} active={filter.mode === "free"} title="Chỉ dòng còn hàng tự do (chưa ai đặt)" />
        {showCost ? <Tile label="Vốn (tồn tự do)" value={formatPrice(totals.costVnd)} accent="gray" /> : null}
        {side === "jp" ? <Tile label="Cân nặng (trên kệ)" value={kg(weightOf(atShop.filter((g) => !g.shipmentId)).g)} accent="gray" title="Tổng cân nặng hàng trên kệ theo cân nặng sản phẩm (chưa gồm thùng, lót)" /> : null}
      </div>

      <Card
        title={
          filter.mode === "boxed"
            ? `Kiện đã đóng (${parcels.length} kiện · ${units(boxed)} cái)`
            : filter.mode
              ? `Tồn kho — ${MODE_LABEL[filter.mode]}`
              : "Tồn kho"
        }
      >
        <form id={formId} action={moveUnitsAction}>
          <input type="hidden" name="back" value={backUrl} />
        </form>
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
        {filter.mode === "boxed" ? null : <LiveTotals target={`[data-sheet="lots-shop-${side}"] table`} />}
        {filter.mode === "boxed" ? null : <GroupTable showCost={showCost} rows={splitByHolder(shelf).filter((r) => (filter.mode === "free" ? !r.holder : filter.mode === "orders" ? !!r.holder : true))} sources={sources} scope={`shop-${side}`} formId={formId} />}
        {parcels.length ? (
          <div className="mt-3 space-y-2" data-testid="boxed-lots">
            <p className="m-0 text-[13px] font-semibold text-lien-heading">
              <Fa name="cube" /> Đã đóng kiện, chờ xuất ĐVVC ({parcels.length} kiện · {units(boxed)} cái)
            </p>
            {parcels.map((pc) => {
              const run = shipments.find((x) => x.id === pc.id);
              const held = pc.groups.reduce((n, g) => n + g.heldQty, 0);
              const jpy = pc.groups.reduce((n, g) => n + (g.unitCostJpy ?? 0) * g.qty, 0);
              const w = weightOf(pc.groups);
              return (
                <details key={pc.id} className="rounded-md border border-amber-300 bg-amber-50/40 px-3 py-2" data-testid={`parcel-${pc.id}`}>
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 text-[13px]">
                    <span className="text-lien-muted">▸</span>
                    <b className="font-mono text-lien-heading">Kiện {pc.code}</b>
                    {run?.label ? <span className="text-lien-muted">{run.label}</span> : null}
                    <span className="text-lien-text">
                      {units(pc.groups)} cái · {pc.groups.length} dòng bill{held ? ` · ${held} cái cho đơn khách` : ""}
                      {jpy && showCost ? ` · ≈ ¥${formatAmount(jpy)}` : ""}
                    </span>
                    <span className="rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 text-[12px] text-sky-900" title={`Cân nặng ước lượng để báo ĐVVC: cộng cân nặng sản phẩm × số cái, chưa gồm thùng, lót, băng keo${w.missing ? ` — ${w.missing} cái chưa có cân nặng sản phẩm nên còn thiếu` : ""}`} data-testid={`parcel-weight-${pc.id}`}>
                      <Fa name="balance-scale" /> ≈ {kg(w.g)} hàng{w.missing ? <span className="text-amber-700"> · {w.missing} cái chưa rõ cân</span> : null}
                    </span>
                    {run?.status ? <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", run.status === "packed" ? "bg-amber-100 text-amber-800" : "bg-gray-200 text-gray-700")}>{run.status === "packed" ? "Đã đóng xong" : "Đang đóng"}</span> : null}
                    <Link href={`/admin/inventory/shipments/#shipment-${pc.id}`} className="ml-auto text-[12px] text-lien-blue hover:underline">
                      Đóng hàng →
                    </Link>
                  </summary>
                  <ul className="m-0 mt-2 list-none space-y-0.5 border-t border-amber-200 p-0 pt-2 text-[12px]">
                    {pc.groups.map((g) => (
                      <li key={g.key}>
                        {g.productName} ×{g.qty} · <span className="font-mono">{g.receiptCode || "chưa có bill"}</span>
                        {g.holders.length ? ` · ${g.holders.map((h) => `#${h.orderNumber}×${h.qty}`).join(", ")}` : ""}
                      </li>
                    ))}
                  </ul>
                </details>
              );
            })}
          </div>
        ) : null}
      </Card>

    </div>
  );
}

const MODE_LABEL: Record<LotsFilter["mode"], string> = { "": "tại kho shop", shelf: "trên kệ, chưa đóng kiện", boxed: "các kiện đã đóng", orders: "hàng giữ cho đơn", free: "tồn tự do" };
/** Net weight of the goods (product weight × pieces); `missing` = pieces whose product has no weight yet. */
function weightOf(groups: StockGroup[]): { g: number; missing: number } {
  let g = 0;
  let missing = 0;
  for (const x of groups) {
    if (x.productWeightG && x.productWeightG > 0) g += x.productWeightG * x.qty;
    else missing += x.qty;
  }
  return { g, missing };
}
const kg = (g: number) => (g >= 1000 ? `${(g / 1000).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} kg` : `${Math.round(g)} g`);

function Tile({ label, value, accent, href, active = false, title }: { label: string; value: string; accent: "blue" | "red" | "amber" | "green" | "gray"; href?: string; active?: boolean; title?: string }) {
  const cls = { blue: "border-sky-200 bg-sky-50 text-sky-900", red: "border-red-200 bg-red-50 text-red-900", amber: "border-amber-200 bg-amber-50 text-amber-900", green: "border-green-200 bg-green-50 text-green-900", gray: "border-[#e5e7eb] bg-white text-lien-heading" }[accent];
  const box = cn("block rounded-md border px-3 py-2 no-underline", cls, href && "hover:brightness-95", active && "ring-2 ring-lien-heading/60 ring-offset-1");
  const body = (
    <>
      <div className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{label}</div>
      <div className="font-oswald text-[16px] leading-5">{value}</div>
    </>
  );
  return href ? (
    <Link href={href} className={box} title={title} aria-current={active ? "page" : undefined}>
      {body}
    </Link>
  ) : (
    <div className={box} title={title}>
      {body}
    </div>
  );
}

function GroupTable({ rows, sources, scope, formId, showCost = true }: { rows: Row[]; sources: PurchaseSource[]; scope: string; formId: string | null; showCost?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <SheetTable id={`lots-${scope}`}>
      <table className={tableClass} data-csv-table>
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
            <th className={thClass}>Cho đơn</th>
            {showCost ? <th className={thClass}>¥/cái</th> : null}
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
              <tr key={r.key} className={cn("align-top hover:bg-[#fafafa]", (g.status === "to_shop" || g.status === "shipped_jp_vn") && "bg-indigo-50/40")} data-qty={r.qty} data-jpy={g.unitCostJpy !== null ? g.unitCostJpy * r.qty : ""} data-g={g.productWeightG ? g.productWeightG * r.qty : ""} data-held={r.holder ? r.qty : 0} data-lot-scope={scope} data-committed={r.holder?.committed ? r.qty : 0} data-left={r.holder ? 0 : r.qty} data-testid={`group-${r.unitIds[0]}`}>
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
                <td className={`${tdClass} text-[12px]`}>
                  {r.holder ? (
                    <Link href={`/admin/orders/${r.holder.orderId}/`} className={cn("inline-block rounded px-1.5 py-0.5 font-semibold no-underline hover:underline", r.holder.committed ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800")} title={r.holder.committed ? "Đơn đã thanh toán / COD" : "Đơn chưa thanh toán (chỉ giữ chỗ)"}>
                      #{r.holder.orderNumber} {r.holder.customer}
                    </Link>
                  ) : (
                    <span className="text-green-700">tự do</span>
                  )}
                </td>
                {showCost ? <td className={`${tdClass} whitespace-nowrap text-[12px] text-lien-muted`}>{g.unitCostJpy ? `¥${formatAmount(g.unitCostJpy)}` : "—"}</td> : null}
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
      </SheetTable>
    </div>
  );
}
