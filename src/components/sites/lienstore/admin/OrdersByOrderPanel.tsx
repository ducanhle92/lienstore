import Image from "next/image";
import Link from "next/link";
import { addLinesToBatchAction } from "@/app/admin/purchases/batch-actions";
import { createReceiptFromLinesAction } from "@/app/admin/purchases/receipt-actions";
import { TableSelectAll } from "./TableSelectAll";
import { BulkBar } from "./BulkBar";
import type { AllocationView } from "@/lib/allocations-db";
import type { PurchaseLine } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { todayIso } from "@/lib/lots";
import { cn } from "@/lib/utils";
import type { PurchaseSource } from "@/types/shop";
import { adminInput, btnPrimary, btnSecondary, Card, tableClass, tdClass, thClass } from "./ui";

interface Props {
  lines: PurchaseLine[];
  allocations: AllocationView[];
  sources: PurchaseSource[];
  batches: Array<{ id: number; code: string; label: string }>;
  /** Current filter (kept in the URL). */
  filter: { q: string; only: "" | "need" | "ready" };
  back: string;
}

const TONE: Record<string, string> = { green: "bg-green-100 text-green-800", sky: "bg-sky-100 text-sky-800", amber: "bg-amber-100 text-amber-800", gray: "bg-gray-200 text-gray-700" };
const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d");

interface Group {
  orderId: string;
  number: number;
  customer: string;
  createdAt: string;
  paymentMethod: string;
  committed: boolean;
  lines: PurchaseLine[];
  needUnits: number;
}

/**
 * Quản lý mua hàng › Mua theo đặt hàng — one block per open order, every line with its source (same badges as the
 * order page). Lines still "Cần mua" keep the tick box for "tạo phiếu mua" / "đưa vào chuyến"; sourced lines are read-only.
 */
export function OrdersByOrderPanel({ lines, allocations, sources, batches, filter, back }: Props) {
  void sources;
  const byItem = new Map<number, AllocationView[]>();
  for (const a of allocations) byItem.set(a.orderItemId, [...(byItem.get(a.orderItemId) ?? []), a]);
  const needOf = (l: PurchaseLine) => (byItem.get(l.itemId) ?? []).filter((a) => a.sourceType === "buy").reduce((n, a) => n + a.qty, 0) || (!byItem.has(l.itemId) && l.purchaseStatus === "not_bought" ? l.quantity : 0);
  const groups = new Map<string, Group>();
  for (const l of lines) {
    const g = groups.get(l.orderId) ?? { orderId: l.orderId, number: l.orderNumber, customer: l.customerName, createdAt: l.orderCreatedAt, paymentMethod: l.paymentMethod, committed: !!l.stockCommittedAt, lines: [], needUnits: 0 };
    g.lines.push(l);
    g.needUnits += needOf(l);
    groups.set(l.orderId, g);
  }
  const q = fold(filter.q.trim());
  const all = [...groups.values()].sort((a, b) => b.number - a.number);
  const shown = all.filter((g) => {
    if (filter.only === "need" && g.needUnits <= 0) return false;
    if (filter.only === "ready" && g.needUnits > 0) return false;
    if (q && !fold(`#${g.number} ${g.customer} ${g.lines.map((l) => `${l.name} ${l.sku ?? ""} #${l.productId}`).join(" ")}`).includes(q)) return false;
    return true;
  });
  const ready = all.filter((g) => g.needUnits <= 0).length;
  const short = all.length - ready;
  const needUnits = all.reduce((n, g) => n + g.needUnits, 0);
  const chip = (v: "" | "need" | "ready", label: string) => (
    <Link key={v} href={`/admin/purchases/?${new URLSearchParams({ tab: "orders", ...(filter.q ? { q: filter.q } : {}), ...(v ? { only: v } : {}) }).toString()}`} className={cn("rounded-full border px-2.5 py-0.5 text-[12px] font-semibold no-underline", filter.only === v ? "border-lien-blue bg-lien-blue text-white" : "border-[#d1d5db] bg-white text-lien-text hover:border-lien-blue")}>
      {label}
    </Link>
  );
  return (
    <div className="space-y-4" data-testid="orders-by-order">
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-green-900">
          <div className="text-[10px] font-semibold uppercase tracking-wide opacity-70">Đơn đủ hàng</div>
          <div className="font-oswald text-[16px] leading-5">{ready}</div>
        </div>
        <div className={cn("rounded-md border px-3 py-2", short ? "border-red-200 bg-red-50 text-red-900" : "border-[#e5e7eb] bg-white text-lien-heading")}>
          <div className="text-[10px] font-semibold uppercase tracking-wide opacity-70">Đơn thiếu hàng</div>
          <div className="font-oswald text-[16px] leading-5">{short}</div>
        </div>
        <div className={cn("rounded-md border px-3 py-2", needUnits ? "border-amber-200 bg-amber-50 text-amber-900" : "border-[#e5e7eb] bg-white text-lien-heading")}>
          <div className="text-[10px] font-semibold uppercase tracking-wide opacity-70">Đơn vị cần mua</div>
          <div className="font-oswald text-[16px] leading-5">{needUnits}</div>
        </div>
      </div>

      <Card>
        <form method="get" className="mb-3 flex flex-wrap items-center gap-2 text-[13px]">
          <input type="hidden" name="tab" value="orders" />
          {filter.only ? <input type="hidden" name="only" value={filter.only} /> : null}
          <input name="q" defaultValue={filter.q} placeholder="Tìm #đơn, tên khách, sản phẩm, SKU…" className={cn(adminInput, "!mb-0 !w-[280px] !py-1")} aria-label="Tìm đơn" />
          <button type="submit" className={cn(btnSecondary, "!py-1")}>
            Tìm
          </button>
          <span className="mx-1 text-lien-muted">|</span>
          {chip("", `Tất cả (${all.length})`)}
          {chip("need", `Chỉ đơn còn dòng Cần mua (${short})`)}
          {chip("ready", `Chỉ đơn đủ hàng (${ready})`)}
        </form>

        {/* ticked "Cần mua" lines → receipt / batch (checkboxes attach with form=) */}
        <form id="bulk-need" action={createReceiptFromLinesAction}>
          <input type="hidden" name="back" value={back} />
        </form>
        <BulkBar scope="bulk-need">
          <select name="receiptSource" form="bulk-need" defaultValue="amazon" className={cn(adminInput, "!mb-0 !w-auto !py-1")} aria-label="Nguồn của phiếu">
            {sources.map((s) => (
              <option key={s.key} value={s.key}>
                {s.name}
              </option>
            ))}
          </select>
          <input name="receiptDate" form="bulk-need" defaultValue={todayIso()} className={cn(adminInput, "!mb-0 !w-[110px] !py-1")} aria-label="Ngày mua" />
          <input name="receiptRef" form="bulk-need" placeholder="mã đơn nguồn" className={cn(adminInput, "!mb-0 !w-[150px] !py-1")} aria-label="Mã đơn nguồn" />
          <button type="submit" form="bulk-need" className={cn(btnPrimary, "!py-1 disabled:opacity-50")} title="Gom các dòng đã tick thành một phiếu mua (mã PM-…)">
            Tạo phiếu mua
          </button>
          {batches.length ? (
            <>
              <span className="mx-1 text-lien-muted">|</span>
              <select name="batchId" form="bulk-need" defaultValue={batches[0].id} className={cn(adminInput, "!mb-0 !w-auto !py-1")} aria-label="Đợt mua">
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code}
                    {b.label ? ` · ${b.label}` : ""}
                  </option>
                ))}
              </select>
              <button type="submit" form="bulk-need" formAction={addLinesToBatchAction} className={cn(btnSecondary, "!py-1 disabled:opacity-50")} title="Dòng sẽ mua trong đợt này">
                Đưa vào đợt
              </button>
            </>
          ) : null}
        </BulkBar>

        {shown.length === 0 ? <p className="m-0 text-[13px] text-lien-muted">Không có đơn nào khớp.</p> : null}
        <div className="space-y-3">
          {shown.map((g) => (
            <div key={g.orderId} className="rounded-md border border-[#e5e7eb]" data-testid={`order-group-${g.number}`}>
              <div className="flex flex-wrap items-center gap-3 border-b border-[#f0f0f0] bg-[#f9fafb] px-3 py-1.5 text-[13px]">
                <Link href={`/admin/orders/${g.orderId}/`} className="font-semibold text-lien-heading hover:text-lien-blue">
                  #{g.number}
                </Link>
                <span>{g.customer}</span>
                <span className="text-lien-muted">{formatDateTime(g.createdAt)}</span>
                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", g.committed ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800")}>{g.paymentMethod === "cod" ? "Thu khi giao" : g.committed ? "Đã thanh toán" : "Chưa thanh toán"}</span>
                <span className={cn("ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold", g.needUnits ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800")}>{g.needUnits ? `cần mua ${g.needUnits} đv` : "đủ hàng"}</span>
              </div>
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th className={cn(thClass, "w-8")}>
                      <TableSelectAll name="ids" />
                    </th>
                    <th className={thClass}>Sản phẩm</th>
                    <th className={thClass}>SL</th>
                    <th className={thClass}>Nguồn hàng</th>
                  </tr>
                </thead>
                <tbody>
                  {g.lines.map((l) => {
                    const allocs = byItem.get(l.itemId) ?? [];
                    const need = needOf(l);
                    return (
                      <tr key={l.itemId} className="align-top hover:bg-[#fafafa]">
                        <td className={`${tdClass} w-8`}>{need > 0 ? <input type="checkbox" name="ids" value={l.itemId} form="bulk-need" className="h-4 w-4" aria-label={`Chọn ${l.name}`} /> : null}</td>
                        <td className={`${tdClass} min-w-[220px]`}>
                          <div className="flex items-center gap-2">
                            {l.thumb ? <Image src={l.thumb} alt="" width={32} height={32} unoptimized className="h-8 w-8 shrink-0 rounded border border-[#e5e7eb] object-cover" /> : null}
                            <span className="flex min-w-0 flex-col leading-4">
                              <Link href={`/admin/products/${l.productId}/`} className="line-clamp-2 text-[13px] font-semibold text-lien-heading hover:text-lien-blue" title={l.name}>
                                {l.name}
                              </Link>
                              <span className="text-[11px] text-lien-muted">
                                #{l.productId}
                                {l.sku ? ` · ${l.sku}` : ""}
                              </span>
                            </span>
                          </div>
                        </td>
                        <td className={`${tdClass} font-semibold`}>{l.quantity}</td>
                        <td className={`${tdClass} text-[12px]`}>
                          {allocs.length === 0 ? <span className="text-lien-muted">— theo trạng thái tay: {l.purchaseStatus}</span> : null}
                          <div className="space-y-1">
                            {allocs.map((a) => (
                              <div key={a.id} className="leading-4">
                                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", TONE[a.tone])}>{a.label}</span>
                                {l.quantity > 1 ? <span className="ml-1 font-semibold">×{a.qty}</span> : null}
                                {a.detail ? <span className="ml-1 text-lien-muted">{a.detail}</span> : null}
                                {a.codes.length ? (
                                  <Link href={`/admin/inventory/units/${a.codes[0]}/`} className="ml-1 font-mono text-[10px] text-lien-blue hover:underline" title={a.codes.join(" ")}>
                                    {a.codes.length > 1 ? `${a.codes[0]} +${a.codes.length - 1}` : a.codes[0]}
                                  </Link>
                                ) : null}
                                {l.batchId ? (
                                  <Link href={`/admin/purchases/?tab=batches#batch-${l.batchId}`} className="ml-1 rounded bg-[#ecfdf5] px-1 py-0.5 font-mono text-[10px] font-semibold text-[#065f46] no-underline hover:underline">
                                    {l.batchCode}
                                  </Link>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
