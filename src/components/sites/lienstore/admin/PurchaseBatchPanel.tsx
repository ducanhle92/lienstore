import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { setPurchaseAction } from "@/app/admin/purchases/actions";
import { splitLotAction } from "@/app/admin/inventory/lot-actions";
import { addLinesToBatchAction, addProductAction, allocateSurplusAction, bulkBatchRowsAction, createBatchAction, deleteBatchAction, moveStockToBatchAction, removeLineFromBatchAction, removeSurplusAction, setBatchStatusAction, splitBatchStockAction, updateBatchAction, updateBatchLotAction, updateBatchStockAction } from "@/app/admin/purchases/batch-actions";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import type { PurchaseLine } from "@/lib/db";
import type { LotView } from "@/lib/lots-db";
import { describeLocation, statusForLocation } from "@/lib/warehouses";
import { formatAmount, formatDate, formatDateTime } from "@/lib/format";
import { todayIso } from "@/lib/lots";
import { PURCHASE_STAGES, purchaseIndex } from "@/lib/purchase";
import { BATCH_DONE, BATCH_STAGES, batchTotals, groupBatchByProduct } from "@/lib/purchase-batches";
import { purchaseSourceName } from "@/lib/purchase-sources";
import { cn } from "@/lib/utils";
import type { PurchaseBatch, PurchaseBatchLine, PurchaseBatchStock, PurchaseSource } from "@/types/shop";
import { ConfirmSubmit } from "./ConfirmSubmit";
import { type PickableProduct, ProductSearchSelect } from "./ProductSearchSelect";
import { BatchFilter } from "./BatchFilter";
import { adminInput, adminLabel, btnPrimary, btnSecondary, Card, tableClass, tdClass, thClass } from "./ui";

/** The stored note starts with "Đợt DG-… · " on batch rows; the table shows only what comes after it. */
const noteBody = (note: string, code: string) => {
  const p = `Đợt ${code}`;
  if (!note.startsWith(p)) return note;
  const rest = note.slice(p.length);
  return rest.startsWith(" · ") ? rest.slice(3) : rest.trim() === "" ? "" : note;
};

interface Props {
  batches: PurchaseBatch[];
  /** Open order lines still "Chưa mua" and not in any batch — candidates for every batch card. */
  openLines: PurchaseLine[];
  products: PickableProduct[];
  sources: PurchaseSource[];
  includeDone: boolean;
  /** Batch search (name / code, bought-date range) — kept in the URL. */
  search: { q: string; from: string; to: string };
}

const cell = "!mb-0 !py-1 !text-[13px]";
const BACK = "/admin/purchases/?tab=batches";
/** Places a lot can be in (from "Tại kho Nhật (shop)" to "Tại kho VN (shop)"). */
const LOT_STAGES = PURCHASE_STAGES.filter((s) => purchaseIndex(s.key) >= purchaseIndex("bought") && purchaseIndex(s.key) <= purchaseIndex("at_shop"));
type SrcSelect = (form: string, value: string, label: string) => ReactNode;

/**
 * Quản lý mua hàng › tab "Mua theo đợt": one card per Japan → shop shipment. Every row (order line or stock row) is
 * editable in place; stock rows can be split, and units can stay in Japan for a later batch ("giữ lại Nhật").
 */
export function PurchaseBatchPanel({ batches, openLines, products, sources, includeDone, search }: Props) {
  const heads = batches.filter((b) => b.status !== BATCH_DONE).map((b) => ({ id: b.id, code: b.code, label: b.label }));
  const searching = !!(search.q || search.from || search.to);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5" data-testid="batch-panel">
      {/* top bar: search batches, open a new one, usage — collapsed so the batches get the space */}
      <div className="flex flex-wrap items-center gap-2" data-testid="batch-topbar">
        <form method="get" className="flex flex-wrap items-center gap-2 text-[13px]">
          <input type="hidden" name="tab" value="batches" />
          <input name="bq" defaultValue={search.q} placeholder="Tìm đợt: tên / mã DG-…" className={cn(adminInput, "!mb-0 !w-[220px] !py-1")} aria-label="Tìm đợt mua" />
          <span className="text-lien-muted">ngày mua từ</span>
          <input name="bfrom" defaultValue={search.from} placeholder="2026-09-01" className={cn(adminInput, "!mb-0 !w-[112px] !py-1")} aria-label="Từ ngày" />
          <span className="text-lien-muted">đến</span>
          <input name="bto" defaultValue={search.to} placeholder="2026-09-30" className={cn(adminInput, "!mb-0 !w-[112px] !py-1")} aria-label="Đến ngày" />
          <button type="submit" className={cn(btnSecondary, "!py-1")}>
            Tìm
          </button>
          {searching ? (
            <Link href={BACK} className="text-[12px] text-lien-blue hover:underline">
              Xoá tìm
            </Link>
          ) : null}
        </form>
      </div>
      <div className="space-y-5 order-2">
        {batches.length === 0 ? (
          <Card>
            <p className="m-0 text-[13px] text-lien-muted">Chưa có đợt nào. Mở đợt ở khung bên phải, rồi thêm các sản phẩm đã mua (tìm theo tên, mỗi dòng một hạn dùng / một nguồn) — hệ thống tự gán cho đơn đang chờ trước, phần còn lại lưu kho.</p>
          </Card>
        ) : null}
        {batches.map((b) => (
          <BatchCard key={b.id} batch={b} heads={heads.filter((h) => h.id !== b.id)} openLines={openLines} products={products} sources={sources} />
        ))}
        <p className="m-0 text-[12px] text-lien-muted">
          <Link href={`/admin/purchases/?tab=batches${includeDone ? "" : "&done=1"}`} className="text-lien-blue hover:underline">
            {includeDone ? "Ẩn đợt đã về kho" : "Xem cả đợt đã về kho"}
          </Link>
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <details className="min-w-0" open={batches.length === 0} data-testid="new-batch">
          <summary className={cn(btnPrimary, "inline-block cursor-pointer list-none")}>+ Mở đợt mua mới</summary>
          <div className="mt-2">
        <Card title="Mở đợt mua mới (một lần đi mua / một bill)">
          <form action={createBatchAction} className="grid gap-3" data-testid="batch-create">
            <div>
              <label className={adminLabel} htmlFor="nb-label">
                Tên đợt <span className="font-normal text-lien-muted">— tuỳ chọn</span>
              </label>
              <input id="nb-label" name="label" placeholder="VD: Kiến tuần 40 · gom đơn 10–12/10" maxLength={80} className={adminInput} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={adminLabel} htmlFor="nb-src">
                  Nguồn mặc định
                </label>
                <select id="nb-src" name="sourceKey" defaultValue="amazon" className={adminInput}>
                  {sources.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={adminLabel} htmlFor="nb-date">
                  Ngày mua (dự kiến)
                </label>
                <input id="nb-date" name="boughtAt" defaultValue={todayIso()} placeholder="2026-09-27" className={adminInput} />
              </div>
            </div>
            <div>
              <label className={adminLabel} htmlFor="nb-note">
                Ghi chú
              </label>
              <input id="nb-note" name="note" maxLength={300} className={adminInput} />
            </div>
            <button type="submit" className={`${btnPrimary} justify-self-start`}>
              + Mở đợt mua
            </button>
          </form>
        </Card>
          </div>
        </details>
        <details className="min-w-0">
          <summary className={cn(btnSecondary, "inline-block cursor-pointer list-none")}>Cách dùng</summary>
          <div className="mt-2">
        <Card title="Cách dùng">
          <ol className="m-0 space-y-1.5 pl-4 text-[12px] leading-5 text-lien-text">
            <li>
              <b>Thêm sản phẩm đã mua:</b> tìm theo tên, chọn <b>nơi mua</b>, nhập tổng SL, <b>HSD</b>, <b>ngày mua</b>, ¥. Tự gán cho đơn đang chờ trước (ghi chú “Tự động lấy từ mua theo đợt”), phần còn lại là hàng lưu kho.
            </li>
            <li>
              <b>Sửa từng dòng</b> ngay trong bảng (SL, mua ở, HSD, ngày mua, ¥, trạng thái, cửa hàng / ghi chú) rồi bấm ✓; “đổi sản phẩm” nếu chọn nhầm. Hàng đã mua là <b>lô ở Kho Nhật (shop)</b> ngay; dòng ghi “Lô #…”.
            </li>
            <li>
              <b>Tách dòng:</b> gõ số ở ô Tách → thành dòng / lô riêng trong đợt (HSD khác, gửi về đợt sau…).
            </li>
            <li>
              <b>Tick nhiều dòng</b> → Bỏ khỏi đợt / Chuyển sang đợt khác.
            </li>
            <li>
              <b>Gửi về VN:</b> đổi trạng thái từng dòng hoặc <b>cả đợt</b> một lần: Tại kho Nhật → tới ĐVVC Nhật → NB→VN → kho ĐVVC VN → <b>Tại kho VN</b>; lô đổi vị trí theo, Kho hàng hiện đúng chỗ.
            </li>
            <li>
              <b>Nhập bill:</b> khung “Phiếu mua hàng · nhập bill” bên dưới, chọn “Đưa vào đợt”.
            </li>
          </ol>
        </Card>
          </div>
        </details>
      </div>
      {searching && batches.length === 0 ? <p className="m-0 text-[13px] text-lien-muted">Không có đợt nào khớp tìm kiếm.</p> : null}
    </div>
  );
}

type Row = { kind: "line"; key: string; name: string; line: PurchaseBatchLine } | { kind: "stock"; key: string; name: string; stock: PurchaseBatchStock } | { kind: "lot"; key: string; name: string; lot: LotView };

function BatchCard({ batch: b, heads, openLines, products, sources }: { batch: PurchaseBatch; heads: Array<{ id: number; code: string; label: string }>; openLines: PurchaseLine[]; products: PickableProduct[]; sources: PurchaseSource[] }) {
  const st = PURCHASE_STAGES[purchaseIndex(b.status)];
  const stage = BATCH_STAGES.find((s) => s.key === b.status) ?? BATCH_STAGES[0];
  const totals = batchTotals(b.lines, [...b.stock, ...b.lots.map((l) => ({ qty: l.physical, unitCostJpy: l.unitCostJpy }))]);
  const grouped = groupBatchByProduct(b.lines, [...b.stock, ...b.lots.map((l) => ({ productId: l.productId, productName: l.productName, productSku: l.productSku, productThumb: l.productThumb, qty: l.physical }))]);
  const done = b.status === BATCH_DONE;
  const hasLots = b.stock.some((s) => s.lotId);
  const surplusByProduct = new Map<number, number>();
  for (const s of b.stock) if (!s.lotId) surplusByProduct.set(s.productId, (surplusByProduct.get(s.productId) ?? 0) + s.qty);
  for (const l of b.lots) surplusByProduct.set(l.productId, (surplusByProduct.get(l.productId) ?? 0) + l.free);
  const addFormId = `bl-${b.id}`;
  const bulkId = `bb-${b.id}`;
  const stockById = new Map(products.map((p) => [p.id, p.stock]));
  const jaById = new Map(products.map((p) => [p.id, p.nameJa ?? ""]));
  const searchOf = (productId: number, name: string, sku: string | null) => `${name} ${jaById.get(productId) ?? ""} ${sku ?? ""} #${productId}`;
  const waiting = b.held.filter((h) => !h.batchId);
  // chips / suggestions for the filter bar, built from what the batch actually holds
  const filterSources = Array.from(new Set([...b.lines.map((l) => l.sourceKey), ...b.stock.map((s) => s.sourceKey), ...b.held.map((h) => h.sourceKey)].filter(Boolean))).map((k) => ({ key: k, name: purchaseSourceName(k, sources) }));
  const filterStatuses = Array.from(new Set([...b.lines.map((l) => l.purchaseStatus), ...b.stock.map((s) => s.status), ...b.held.map((h) => h.status)])).map((k) => ({ key: k, label: PURCHASE_STAGES[purchaseIndex(k)].short }));
  const filterOrders = Array.from(new Map(b.lines.map((l) => [l.orderNumber, { number: l.orderNumber, customer: l.customerName }])).values()).sort((x, y) => y.number - x.number);
  // one editable row per order line / stock row, grouped by product name (order lines first)
  const rows: Row[] = [...b.lines.map((l): Row => ({ kind: "line", key: `l-${l.itemId}`, name: l.productName, line: l })), ...b.lots.map((l): Row => ({ kind: "lot", key: `lot-${l.id}`, name: l.productName, lot: l })), ...b.stock.map((s): Row => ({ kind: "stock", key: `s-${s.id}`, name: s.productName, stock: s }))].sort((x, y) => x.name.localeCompare(y.name, "vi") || (x.kind === y.kind ? 0 : x.kind === "line" ? -1 : y.kind === "line" ? 1 : x.kind === "lot" ? -1 : 1));
  const srcSelect: SrcSelect = (form, value, label) => (
    <select name="sourceKey" form={form} defaultValue={value} className={cn(adminInput, cell, "!w-[118px]")} aria-label={label}>
      {!value ? <option value="">— nguồn —</option> : null}
      {sources.map((s) => (
        <option key={s.key} value={s.key}>
          {s.name}
        </option>
      ))}
    </select>
  );
  return (
    <div id={`batch-${b.id}`} data-testid={`batch-${b.id}`} className="min-w-0">
      <Card
        title={`${b.code}${b.label ? ` · ${b.label}` : ""}`}
        actions={
          <span className="flex items-center gap-3">
            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", st.cls)} title={stage.label}>
              {stage.short}
            </span>
            {hasLots ? null : (
              <form action={deleteBatchAction}>
                <input type="hidden" name="batchId" value={b.id} />
                <ConfirmSubmit message={`Xoá đợt ${b.code}? Dòng đơn giữ trạng thái, dòng lưu kho bị bỏ.`} className="text-[12px] text-lien-heart hover:underline">
                  Xoá đợt
                </ConfirmSubmit>
              </form>
            )}
          </span>
        }
      >
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-lien-muted">
          <span>
            Nguồn mặc định <b className="text-lien-heading">{purchaseSourceName(b.sourceKey, sources)}</b> <span title="Mỗi dòng có nguồn riêng; đây chỉ là nguồn chọn sẵn">(mỗi dòng có thể khác)</span>
          </span>
          <span>· ngày mua {b.boughtAt ? formatDate(b.boughtAt) : "—"}</span>
          <span>· gửi NB→VN {b.shippedAt ? formatDate(b.shippedAt) : "—"}</span>
          {b.tracking ? <span>· tracking {b.tracking}</span> : null}
          <span className="ml-auto text-lien-heading">
            theo đặt hàng <b>{totals.orderUnits}</b> đv · lưu kho <b>{totals.stockUnits}</b> đv · tổng <b>{totals.units}</b> đv{totals.jpy !== null ? ` · ≈ ¥${formatAmount(totals.jpy)}` : ""}
            {waiting.length ? ` · giữ lại Nhật ${waiting.reduce((n, h) => n + h.qty, 0)} đv` : ""}
          </span>
        </div>

        {/* bills booked into this batch — the paper trail (photos attach on the bill) */}
        <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px]" data-testid={`bills-${b.id}`}>
          <span className="font-semibold text-lien-heading">Bill:</span>
          {b.receipts.length === 0 ? <span className="text-lien-muted">chưa có</span> : null}
          {b.receipts.map((r) => (
            <Link key={r.id} href={`${BACK}&receipts=1#receipt-${r.id}`} className="rounded border border-[#d1d5db] bg-white px-1.5 py-0.5 font-mono text-[11px] font-semibold text-lien-heading no-underline hover:border-lien-blue hover:text-lien-blue" title="Mở phiếu (đính kèm ảnh bill ở đó)">
              {r.code} · {formatDate(r.boughtAt)} · {purchaseSourceName(r.sourceKey, sources)}
              {r.files ? ` · ${r.files} ảnh` : ""}
            </Link>
          ))}
          {done ? null : (
            <Link href={`${BACK}&bill=${b.id}&receipts=1#receipts`} className={cn(btnSecondary, "!px-2 !py-0.5 !text-[12px]")} title="Dán nội dung bill vào khung Phiếu mua hàng, chọn sẵn đợt này">
              <Fa name="file-text-o" /> Nhập bill vào đợt này
            </Link>
          )}
        </div>
        {/* bulk bar: the checkboxes in the table attach to this (empty) form */}
        <form id={bulkId} action={bulkBatchRowsAction}>
          <input type="hidden" name="batchId" value={b.id} />
        </form>
        {/* one toolbar, sticky while the card scrolls: whole-batch status on the left, ticked-rows actions on the right */}
        <div className="sticky top-0 z-20 -mx-1 mb-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-[#e5e7eb] bg-[#f9fafb]/95 px-3 py-2 text-[13px] shadow-sm backdrop-blur" data-testid={`toolbar-${b.id}`}>
          <form action={setBatchStatusAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="batchId" value={b.id} />
            <span className="font-semibold text-lien-heading">Cả đợt →</span>
            <select name="status" defaultValue={b.status} className={cn(adminInput, cell, "!w-auto")} aria-label="Trạng thái cả đợt" title={done ? "Đợt đã về kho — hàng lưu kho đã thành lô." : "Mọi dòng trong đợt chuyển theo; tới “Tại kho” → hàng lưu kho nhập kho thành lô."}>
              {BATCH_STAGES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
            <button type="submit" className={cn(btnPrimary, "!py-1")}>
              Cập nhật
            </button>
          </form>
          {done ? null : (
          <div className="flex flex-wrap items-center gap-2 border-l border-[#e5e7eb] pl-3">
            <span className="font-semibold text-lien-heading">Đã tick →</span>
            <select name="bulkStatus" form={bulkId} defaultValue="bought" className={cn(adminInput, cell, "!w-auto")} aria-label="Trạng thái cho các dòng đã tick">
              {BATCH_STAGES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
            <button type="submit" form={bulkId} name="op" value="status" className={cn(btnPrimary, "!py-1")} title="Đặt trạng thái này cho mọi dòng đã tick (dòng đơn, phiếu, lô)">
              Áp dụng
            </button>
            <span className="mx-1 text-lien-muted">|</span>
            <button type="submit" form={bulkId} name="op" value="remove" className={cn(btnSecondary, "!py-1")} title="Dòng đơn rời đợt (giữ trạng thái), dòng lưu kho bị xoá">
              Bỏ khỏi đợt
            </button>
            {heads.length ? (
              <>
                <span className="mx-1 text-lien-muted">|</span>
                <select name="targetBatchId" form={bulkId} defaultValue={heads[0].id} className={cn(adminInput, cell, "!w-auto")} aria-label="Chuyển sang đợt">
                  {heads.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.code}
                      {h.label ? ` · ${h.label}` : ""}
                    </option>
                  ))}
                </select>
                <button type="submit" form={bulkId} name="op" value="move" className={cn(btnSecondary, "!py-1")}>
                  Chuyển sang đợt
                </button>
              </>
            ) : null}
          </div>
          )}
        </div>

        <BatchFilter batchId={b.id} total={rows.length + b.held.length} sources={filterSources} statuses={filterStatuses} orders={filterOrders} />
        <div className="overflow-x-auto">
          <table className={cn(tableClass, "max-lg:block")}>
            <thead className="max-lg:hidden">
              <tr>
                <th className={cn(thClass, "sticky left-0 z-10 w-8 bg-[#f9fafb]")} />
                <th className={thClass}>Sản phẩm</th>
                <th className={thClass}>SL</th>
                <th className={thClass}>Mua ở</th>
                <th className={thClass}>Mua (HSD · ngày · ¥/đv)</th>
                <th className={thClass}>Trạng thái</th>
                <th className={thClass}>Cửa hàng · ghi chú</th>
                <th className={cn(thClass, "sticky right-0 z-10 bg-[#f9fafb] shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.15)]")}>Thao tác · Tách</th>
              </tr>
            </thead>
            <tbody className="max-lg:grid max-lg:grid-cols-1 max-lg:gap-3 md:max-lg:grid-cols-2">
              {rows.length === 0 ? (
                <tr className="max-lg:block">
                  <td colSpan={8} className={`${tdClass} text-center text-lien-muted`}>
                    Đợt chưa có gì — thêm sản phẩm đã mua ở khung bên dưới.
                  </td>
                </tr>
              ) : null}
              {rows.map((r) =>
                r.kind === "line" ? (
                  <LineRow key={r.key} b={b} l={r.line} done={done} bulkId={bulkId} srcSelect={srcSelect} search={searchOf(r.line.productId, r.line.productName, r.line.productSku)} />
                ) : r.kind === "lot" ? (
                  <LotRow key={r.key} b={b} l={r.lot} done={done} bulkId={bulkId} srcSelect={srcSelect} sources={sources} search={searchOf(r.lot.productId, r.lot.productName, r.lot.productSku)} />
                ) : (
                  <StockRow key={r.key} b={b} s={r.stock} done={done} bulkId={bulkId} srcSelect={srcSelect} products={products} sources={sources} stock={stockById.get(r.stock.productId) ?? null} search={searchOf(r.stock.productId, r.stock.productName, r.stock.productSku)} />
                ),
              )}
            </tbody>
          </table>
        </div>
        {/* per-row forms live outside the table (inputs reference them with form=…) */}
        {b.lines.map((l) => (
          <form key={l.itemId} id={`pl-${l.itemId}`} action={setPurchaseAction}>
            <input type="hidden" name="itemId" value={l.itemId} />
            <input type="hidden" name="back" value={`${BACK}#batch-${b.id}`} />
          </form>
        ))}
        {b.stock.map((s) => (
          <span key={s.id}>
            <form id={`bs-${s.id}`} action={updateBatchStockAction}>
              <input type="hidden" name="batchId" value={b.id} />
              <input type="hidden" name="stockPurchaseId" value={s.id} />
            </form>
            <form id={`sp-${s.id}`} action={splitBatchStockAction}>
              <input type="hidden" name="batchId" value={b.id} />
              <input type="hidden" name="stockPurchaseId" value={s.id} />
            </form>
          </span>
        ))}

        {b.held.length ? (
          <div className="mt-3 rounded-md border border-dashed border-amber-300 bg-amber-50/50 px-3 py-2" data-testid={`held-${b.id}`}>
            <p className="m-0 mb-1 text-[13px] font-semibold text-lien-heading">
              Giữ lại tại Nhật từ đợt này <span className="font-normal text-lien-muted">({waiting.length} dòng chờ đợt sau{b.held.length - waiting.length ? ` · ${b.held.length - waiting.length} dòng đã đi đợt khác` : ""})</span>
            </p>
            <table className={tableClass}>
              <tbody>
                {b.held.map((h) => (
                  <tr key={h.id} className="text-[13px]" data-brow="1" data-kind="held" data-search={searchOf(h.productId, h.productName, h.productSku)} data-product={h.productId} data-src={h.sourceKey} data-status={h.status} data-note={noteBody(h.note, b.code) ? "1" : "0"} data-qty={h.qty} data-jpy={(h.unitCostJpy ?? 0) * h.qty}>
                    <td className={`${tdClass} min-w-[200px]`}>
                      <Link href={`/admin/inventory/lots/${h.productId}/`} className="font-semibold text-lien-heading hover:text-lien-blue">
                        {h.productName}
                      </Link>
                      <span className="block text-[12px] text-lien-muted">
                        phiếu #{h.id}
                        {h.productSku ? ` · ${h.productSku}` : ""}
                      </span>
                    </td>
                    <td className={`${tdClass} font-semibold`}>×{h.qty}</td>
                    <td className={`${tdClass} text-lien-muted`}>HSD {h.expiry ? formatDate(h.expiry) : "—"}</td>
                    <td className={`${tdClass} text-lien-muted`}>{purchaseSourceName(h.sourceKey, sources)}</td>
                    <td className={tdClass}>
                      <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", PURCHASE_STAGES[purchaseIndex(h.status)].cls)}>{PURCHASE_STAGES[purchaseIndex(h.status)].short}</span>
                    </td>
                    <td className={`${tdClass} whitespace-nowrap`}>
                      {h.batchId ? (
                        <Link href={`${BACK}#batch-${h.batchId}`} className="rounded bg-[#ecfdf5] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[#065f46] no-underline hover:underline">
                          đã vào {h.batchCode}
                        </Link>
                      ) : heads.length ? (
                        <form action={moveStockToBatchAction} className="flex items-center gap-1">
                          <input type="hidden" name="spids" value={h.id} />
                          <input type="hidden" name="fromBatchId" value={b.id} />
                          <select name="batchId" defaultValue={heads[0].id} className={cn(adminInput, cell, "!w-auto")} aria-label="Đưa vào đợt">
                            {heads.map((x) => (
                              <option key={x.id} value={x.id}>
                                {x.code}
                              </option>
                            ))}
                          </select>
                          <button type="submit" className={cn(btnSecondary, "!px-2 !py-1 !text-[12px]")}>
                            Đưa vào đợt
                          </button>
                        </form>
                      ) : (
                        <span className="text-[12px] text-lien-muted">chờ đợt sau (mở đợt mới rồi đưa vào)</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {grouped.length ? (
          <details className="mt-3">
            <summary className="cursor-pointer text-[12px] text-lien-blue">Tổng theo sản phẩm ({grouped.length})</summary>
            <table className={cn(tableClass, "mt-1")}>
              <thead>
                <tr>
                  <th className={thClass}>Sản phẩm</th>
                  <th className={thClass}>Theo đặt hàng</th>
                  <th className={thClass}>Lưu kho</th>
                  <th className={thClass}>Tổng</th>
                  <th className={thClass}>Tồn hiện tại</th>
                </tr>
              </thead>
              <tbody>
                {grouped.map((g) => (
                  <tr key={g.productId} className="text-[13px]">
                    <td className={tdClass}>{g.name}</td>
                    <td className={tdClass}>{g.orderUnits || "—"}</td>
                    <td className={tdClass}>{g.stockUnits || "—"}</td>
                    <td className={`${tdClass} font-semibold`}>{g.orderUnits + g.stockUnits}</td>
                    <td className={`${tdClass} text-lien-muted`}>{stockById.get(g.productId) ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        ) : null}

        {done ? null : (
          <>
<form action={addProductAction} className="mt-3 grid gap-2 rounded-md border border-dashed border-[#d1d5db] bg-white px-3 py-2 lg:grid-cols-[minmax(240px,1fr)_150px_70px_120px_120px_100px_1fr_auto] lg:items-end" data-testid={`surplus-${b.id}`}>
              <input type="hidden" name="batchId" value={b.id} />
              <div className="lg:col-span-8 -mb-1 text-[12px] text-lien-muted">
                <b className="text-lien-heading">Thêm sản phẩm đã mua vào đợt</b> — SL là tổng đã mua; tự gán cho đơn đang chờ trước, phần còn lại lưu kho. Cùng sản phẩm khác HSD hoặc khác nguồn → thêm từng dòng.
              </div>
              <div>
                <label className={adminLabel}>Sản phẩm (tìm theo tên)</label>
                <ProductSearchSelect products={products} placeholder="Gõ tên Việt / Nhật hoặc SKU…" />
              </div>
              <div>
                <label className={adminLabel} htmlFor={`ss-${b.id}`}>
                  Mua ở
                </label>
                <select id={`ss-${b.id}`} name="sourceKey" defaultValue={b.sourceKey} className={cn(adminInput, "!py-1.5 !text-[13px]")}>
                  {sources.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={adminLabel} htmlFor={`sq-${b.id}`}>
                  SL
                </label>
                <input id={`sq-${b.id}`} name="qty" inputMode="numeric" required className={cn(adminInput, "!py-1.5 !text-[13px]")} />
              </div>
              <div>
                <label className={adminLabel} htmlFor={`se-${b.id}`}>
                  HSD
                </label>
                <input id={`se-${b.id}`} name="expiry" placeholder="03/2027" className={cn(adminInput, "!py-1.5 !text-[13px]")} />
              </div>
              <div>
                <label className={adminLabel} htmlFor={`sb-${b.id}`}>
                  Ngày mua
                </label>
                <input id={`sb-${b.id}`} name="boughtAt" defaultValue={b.boughtAt ?? todayIso()} className={cn(adminInput, "!py-1.5 !text-[13px]")} />
              </div>
              <div>
                <label className={adminLabel} htmlFor={`sj-${b.id}`}>
                  ¥/đv
                </label>
                <input id={`sj-${b.id}`} name="unitCostJpy" inputMode="numeric" placeholder="giá vốn" className={cn(adminInput, "!py-1.5 !text-[13px]")} />
              </div>
              <div>
                <label className={adminLabel} htmlFor={`sn-${b.id}`}>
                  Ghi chú
                </label>
                <input id={`sn-${b.id}`} name="note" maxLength={200} className={cn(adminInput, "!py-1.5 !text-[13px]")} />
              </div>
              <button type="submit" className={cn(btnPrimary, "!py-1.5 !text-[13px]")}>
                + Thêm vào đợt
              </button>
            </form>

            <details className="mt-3 rounded-md border border-[#e5e7eb] bg-white">
              <summary className="cursor-pointer px-3 py-2 text-[13px] font-semibold text-lien-heading">
                Gán tay dòng đơn “Chưa mua” vào đợt <span className="font-normal text-lien-muted">({openLines.length} dòng đang chờ)</span>
              </summary>
              <form id={addFormId} action={addLinesToBatchAction}>
                <input type="hidden" name="batchId" value={b.id} />
              </form>
              <div className="max-h-[360px] overflow-auto px-3 pb-3">
                <table className={tableClass}>
                  <thead>
                    <tr>
                      <th className={thClass} />
                      <th className={thClass}>Sản phẩm</th>
                      <th className={thClass}>Đơn</th>
                      <th className={thClass}>SL</th>
                      <th className={thClass}>Hàng lưu kho trong đợt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {openLines.length === 0 ? (
                      <tr>
                        <td colSpan={5} className={`${tdClass} text-center text-lien-muted`}>
                          Không còn dòng “Chưa mua” nào ngoài đợt.
                        </td>
                      </tr>
                    ) : null}
                    {openLines.map((l) => {
                      const surplus = surplusByProduct.get(l.productId) ?? 0;
                      return (
                        <tr key={l.itemId} className="hover:bg-[#fafafa]">
                          <td className={`${tdClass} w-8`}>
                            <input type="checkbox" name="ids" value={l.itemId} form={addFormId} className="h-4 w-4" aria-label={`Chọn ${l.name}`} />
                          </td>
                          <td className={`${tdClass} text-[13px]`}>
                            <span className="font-semibold text-lien-heading">{l.name}</span>
                            <span className="block text-[12px] text-lien-muted">
                              #{l.productId}
                              {l.sku ? ` · ${l.sku}` : ""}
                            </span>
                          </td>
                          <td className={`${tdClass} whitespace-nowrap text-[13px]`}>
                            <Link href={`/admin/orders/${l.orderId}/`} className="font-semibold text-lien-blue hover:underline">
                              #{l.orderNumber}
                            </Link>
                            <span className="block text-[12px] text-lien-muted">
                              {l.customerName} · {formatDateTime(l.orderCreatedAt)}
                            </span>
                          </td>
                          <td className={`${tdClass} font-semibold`}>{l.quantity}</td>
                          <td className={`${tdClass} text-[12px]`}>
                            {surplus >= l.quantity ? (
                              <form action={allocateSurplusAction} className="inline">
                                <input type="hidden" name="batchId" value={b.id} />
                                <input type="hidden" name="itemId" value={l.itemId} />
                                <button type="submit" className={cn(btnSecondary, "!px-2 !py-0.5 !text-[12px]")} title={`Đợt còn ${surplus} đv hàng lưu kho — lấy ${l.quantity} đv cho đơn này`}>
                                  Lấy từ hàng lưu kho của đợt ({surplus})
                                </button>
                              </form>
                            ) : surplus ? (
                              <span className="text-lien-muted">còn {surplus} đv, chưa đủ</span>
                            ) : (
                              <span className="text-lien-muted">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {openLines.length ? (
                  <button type="submit" form={addFormId} className={cn(btnPrimary, "mt-2 !py-1.5 !text-[13px]")}>
                    Thêm các dòng đã tick vào đợt {b.code}
                  </button>
                ) : null}
              </div>
            </details>
          </>
        )}

        <details className="mt-3">
          <summary className="cursor-pointer text-[12px] text-lien-blue">Sửa thông tin đợt (tên, nguồn mặc định, ngày mua, tracking, ghi chú)</summary>
          <form action={updateBatchAction} className="mt-2 grid gap-2 lg:grid-cols-[1fr_160px_120px_160px_1fr_auto] lg:items-end">
            <input type="hidden" name="batchId" value={b.id} />
            <div>
              <label className={adminLabel} htmlFor={`ul-${b.id}`}>
                Tên đợt
              </label>
              <input id={`ul-${b.id}`} name="label" defaultValue={b.label} maxLength={80} className={cn(adminInput, "!py-1.5 !text-[13px]")} />
            </div>
            <div>
              <label className={adminLabel} htmlFor={`us-${b.id}`}>
                Nguồn mặc định
              </label>
              <select id={`us-${b.id}`} name="sourceKey" defaultValue={b.sourceKey} className={cn(adminInput, "!py-1.5 !text-[13px]")}>
                {sources.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={adminLabel} htmlFor={`ub-${b.id}`}>
                Ngày mua
              </label>
              <input id={`ub-${b.id}`} name="boughtAt" defaultValue={b.boughtAt ?? ""} placeholder="2026-09-27" className={cn(adminInput, "!py-1.5 !text-[13px]")} />
            </div>
            <div>
              <label className={adminLabel} htmlFor={`ut-${b.id}`}>
                Tracking
              </label>
              <input id={`ut-${b.id}`} name="tracking" defaultValue={b.tracking} maxLength={120} className={cn(adminInput, "!py-1.5 !text-[13px]")} />
            </div>
            <div>
              <label className={adminLabel} htmlFor={`un-${b.id}`}>
                Ghi chú
              </label>
              <input id={`un-${b.id}`} name="note" defaultValue={b.note} maxLength={300} className={cn(adminInput, "!py-1.5 !text-[13px]")} />
            </div>
            <button type="submit" className={cn(btnSecondary, "!py-1.5 !text-[13px]")}>
              Lưu
            </button>
          </form>
        </details>
      </Card>
    </div>
  );
}

/** Table cell (xl+) that becomes a labelled block inside the row card below xl. */
const TD = "max-lg:block max-lg:border-0 max-lg:px-0 max-lg:py-1";
const LBL = "max-lg:before:mr-1 max-lg:before:text-[11px] max-lg:before:text-lien-muted max-lg:before:content-[attr(data-label)]";
const ROW = "align-top hover:bg-[#fafafa] max-lg:block max-lg:rounded-md max-lg:border max-lg:border-[#e5e7eb] max-lg:p-3 max-lg:hover:bg-white";
const STICKY_L = "lg:sticky lg:left-0 lg:z-[5] lg:bg-white";
const STICKY_R = "lg:sticky lg:right-0 lg:z-[5] lg:bg-white lg:shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.15)]";

function ProductCell({ productId, name, sku, thumb, badge, extra }: { productId: number; name: string; sku: string | null; thumb: string; badge: ReactNode; extra?: ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      {thumb ? <Image src={thumb} alt="" width={32} height={32} unoptimized className="mt-0.5 h-8 w-8 shrink-0 rounded border border-[#e5e7eb] object-contain" /> : <span className="mt-0.5 h-8 w-8 shrink-0 rounded border border-dashed border-[#e5e7eb]" />}
      <span className="flex min-w-0 flex-col leading-4">
        <Link href={`/admin/inventory/lots/${productId}/`} className="line-clamp-2 text-[13px] font-semibold text-lien-heading hover:text-lien-blue" title={name}>
          {name}
        </Link>
        <span className="text-[11px] text-lien-muted">
          #{productId}
          {sku ? ` · ${sku}` : ""}
          {extra}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px]">{badge}</span>
      </span>
    </div>
  );
}

function LineRow({ b, l, done, bulkId, srcSelect, search }: { b: PurchaseBatch; l: PurchaseBatchLine; done: boolean; bulkId: string; srcSelect: SrcSelect; search: string }) {
  const fid = `pl-${l.itemId}`;
  const ls = PURCHASE_STAGES[purchaseIndex(l.purchaseStatus)];
  return (
    <tr className={ROW} data-testid={`bline-${l.itemId}`} data-brow="1" data-kind="line" data-search={search} data-product={l.productId} data-order={l.orderNumber} data-customer={l.customerName} data-src={l.sourceKey} data-status={l.purchaseStatus} data-note="0" data-qty={l.quantity} data-jpy={(l.costJpy ?? 0) * l.quantity}>
      <td className={cn(tdClass, TD, STICKY_L, "w-8 max-lg:float-right")}>{done ? null : <input type="checkbox" name="ids" value={l.itemId} form={bulkId} className="h-4 w-4" aria-label={`Chọn dòng đơn #${l.orderNumber}`} />}</td>
      <td className={cn(tdClass, TD, "min-w-[220px] max-w-[300px]")}>
        <ProductCell
          productId={l.productId}
          name={l.productName}
          sku={l.productSku}
          thumb={l.productThumb}
          badge={
            <>
              <Link href={`/admin/orders/${l.orderId}/`} className="rounded bg-[#eef2ff] px-1.5 py-0.5 font-semibold text-[#3730a3] no-underline hover:underline" title={l.customerName}>
                Đơn #{l.orderNumber} · {l.customerName}
              </Link>
              {l.receiptId ? (
                <Link href={`${BACK}&receipts=1#receipt-${l.receiptId}`} className="rounded border border-[#d1d5db] bg-white px-1 py-0.5 font-mono text-[10px] font-semibold text-lien-heading no-underline hover:border-lien-blue" title="Bill">
                  {l.receiptCode}
                </Link>
              ) : null}
            </>
          }
        />
      </td>
      <td className={cn(tdClass, TD, LBL, "font-semibold")} data-label="SL">
        {l.quantity}
      </td>
      <td className={cn(tdClass, TD, LBL)} data-label="Mua ở">
        {srcSelect(fid, l.sourceKey, `Nguồn dòng đơn #${l.orderNumber}`)}
      </td>
      <td className={cn(tdClass, TD, LBL, "whitespace-nowrap")} data-label="Mua">
        <div className="grid w-[92px] gap-1">
          <input name="expiry" form={fid} defaultValue={l.expiry ?? ""} placeholder="HSD 03/2027" className={cn(adminInput, cell, "!w-full")} aria-label="Hạn dùng" />
          <input name="boughtAt" form={fid} defaultValue={l.boughtAt ?? ""} placeholder="mua 2026-09-27" className={cn(adminInput, cell, "!w-full")} aria-label="Ngày mua" />
          <input name="costJpy" form={fid} inputMode="numeric" defaultValue={l.costJpy ?? ""} placeholder="¥/đv" className={cn(adminInput, cell, "!w-full")} aria-label="Giá ¥ mỗi đơn vị" />
        </div>
      </td>
      <td className={cn(tdClass, TD, LBL)} data-label="Trạng thái">
        <select name="status" form={fid} defaultValue={l.purchaseStatus} className={cn(adminInput, cell, "!w-40")} aria-label="Trạng thái dòng đơn">
          {PURCHASE_STAGES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        {l.purchaseStatus !== b.status ? (
          <span className={cn("mt-1 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold", ls.cls)} title="Khác trạng thái của đợt">
            {ls.short}
          </span>
        ) : null}
      </td>
      <td className={cn(tdClass, TD, LBL)} data-label="Ghi chú">
        <input name="note" form={fid} defaultValue="" placeholder="ghi chú…" className={cn(adminInput, cell, "!w-32 transition-[width] focus:!w-64")} aria-label="Ghi chú" />
      </td>
      <td className={cn(tdClass, TD, STICKY_R, "whitespace-nowrap")}>
        <div className="flex items-center gap-1">
          <button type="submit" form={fid} className={cn(btnSecondary, "!px-2 !py-1")} title="Lưu dòng này">
            ✓
          </button>
          {done ? null : (
            <form action={removeLineFromBatchAction} className="inline">
              <input type="hidden" name="batchId" value={b.id} />
              <input type="hidden" name="itemId" value={l.itemId} />
              <button type="submit" className={cn(btnSecondary, "!px-2 !py-1 !text-lien-heart")} title="Bỏ khỏi đợt (giữ trạng thái)" aria-label="Bỏ khỏi đợt">
                ✕
              </button>
            </form>
          )}
        </div>
      </td>
    </tr>
  );
}

function StockRow({ b, s, done, bulkId, srcSelect, products, sources, stock, search }: { b: PurchaseBatch; s: PurchaseBatchStock; done: boolean; bulkId: string; srcSelect: SrcSelect; products: PickableProduct[]; sources: PurchaseSource[]; stock: number | null; search: string }) {
  const fid = `bs-${s.id}`;
  const sid = `sp-${s.id}`;
  const ss = PURCHASE_STAGES[purchaseIndex(s.status)];
  const locked = !!s.lotId;
  const note = noteBody(s.note, b.code);
  const held = s.reserved.reduce((n, r) => n + r.qty, 0);
  return (
    <tr className={cn(ROW, locked && "opacity-70")} data-testid={`bstock-${s.id}`} data-brow="1" data-kind="stock" data-search={search} data-product={s.productId} data-src={s.sourceKey} data-status={s.status} data-note={note ? "1" : "0"} data-qty={s.qty} data-jpy={(s.unitCostJpy ?? 0) * s.qty}>
      <td className={cn(tdClass, TD, STICKY_L, "w-8 max-lg:float-right")}>{done || locked ? null : <input type="checkbox" name="sids" value={s.id} form={bulkId} className="h-4 w-4" aria-label={`Chọn dòng lưu kho #${s.id}`} />}</td>
      <td className={cn(tdClass, TD, "min-w-[220px] max-w-[300px]")}>
        <ProductCell
          productId={s.productId}
          name={s.productName}
          sku={s.productSku}
          thumb={s.productThumb}
          extra={
            locked ? null : (
              <details className="inline">
                <summary className="ml-1 inline cursor-pointer text-lien-blue">· đổi sản phẩm</summary>
                <form action={updateBatchStockAction} className="mt-1 flex w-[240px] flex-col gap-1">
                  <input type="hidden" name="batchId" value={b.id} />
                  <input type="hidden" name="stockPurchaseId" value={s.id} />
                  <ProductSearchSelect products={products} placeholder="Tìm sản phẩm đúng…" />
                  <button type="submit" className={cn(btnSecondary, "self-start !px-2 !py-0.5 !text-[11px]")}>
                    Đổi
                  </button>
                </form>
              </details>
            )
          }
          badge={
            <>
              <span className="rounded bg-[#ecfdf5] px-1.5 py-0.5 font-semibold text-[#065f46]">Lưu kho · phiếu #{s.id}</span>
              {s.reserved.map((r) => (
                <Link key={r.orderId} href={`/admin/orders/${r.orderId}/`} className="rounded bg-amber-100 px-1 py-0.5 text-[10px] font-semibold text-amber-800 no-underline hover:underline" title="Giữ cho đơn khách">
                  #{r.orderNumber} ×{r.qty}
                </Link>
              ))}
              {held ? <span className="text-lien-muted">trống {Math.max(0, s.qty - held)}</span> : null}
              {s.originBatchId && s.originBatchId !== b.id ? <span className="text-lien-muted">từ đợt trước</span> : null}
              {stock !== null ? <span className="text-lien-muted">tồn {stock}</span> : null}
            </>
          }
        />
      </td>
      <td className={cn(tdClass, TD, LBL)} data-label="SL">
        {locked ? <span className="font-semibold">{s.qty}</span> : <input name="qty" form={fid} inputMode="numeric" defaultValue={s.qty} className={cn(adminInput, cell, "!w-14 !text-center")} aria-label="Số lượng" />}
      </td>
      <td className={cn(tdClass, TD, LBL)} data-label="Mua ở">
        {locked ? <span className="text-[12px]">{purchaseSourceName(s.sourceKey, sources)}</span> : srcSelect(fid, s.sourceKey, `Nguồn dòng #${s.id}`)}
      </td>
      <td className={cn(tdClass, TD, LBL, "whitespace-nowrap")} data-label="Mua">
        {locked ? (
          <span className="text-[12px]">
            {s.expiry ? `HSD ${formatDate(s.expiry)}` : "HSD —"} · {s.boughtAt ? formatDate(s.boughtAt) : "—"} · {s.unitCostJpy ? `¥${formatAmount(s.unitCostJpy)}` : "—"}
          </span>
        ) : (
          <div className="grid w-[92px] gap-1">
            <input name="expiry" form={fid} defaultValue={s.expiry ?? ""} placeholder="HSD 03/2027" className={cn(adminInput, cell, "!w-full")} aria-label="Hạn dùng" />
            <input name="boughtAt" form={fid} defaultValue={s.boughtAt ?? ""} placeholder="mua 2026-09-27" className={cn(adminInput, cell, "!w-full")} aria-label="Ngày mua" />
            <input name="unitCostJpy" form={fid} inputMode="numeric" defaultValue={s.unitCostJpy ?? ""} placeholder="¥/đv" className={cn(adminInput, cell, "!w-full")} aria-label="Giá ¥ mỗi đơn vị" />
          </div>
        )}
      </td>
      <td className={cn(tdClass, TD, LBL)} data-label="Trạng thái">
        {locked ? (
          <Link href={`/admin/inventory/lots/${s.productId}/`} className="inline-block rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-800 no-underline hover:bg-green-200">
            Đã nhập kho · lô #{s.lotId}
          </Link>
        ) : (
          <>
            <select name="status" form={fid} defaultValue={s.status} className={cn(adminInput, cell, "!w-40")} aria-label="Trạng thái dòng lưu kho">
              {BATCH_STAGES.map((x) => (
                <option key={x.key} value={x.key}>
                  {x.label}
                </option>
              ))}
            </select>
            {s.status !== b.status ? (
              <span className={cn("mt-1 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold", ss.cls)} title="Khác trạng thái của đợt">
                {ss.short}
              </span>
            ) : null}
          </>
        )}
      </td>
      <td className={cn(tdClass, TD, LBL)} data-label="Ghi chú">
        {locked ? <span className="text-[12px] text-lien-muted">{note || "—"}</span> : <input name="note" form={fid} defaultValue={note} placeholder="nơi mua, ghi chú…" title={s.note} className={cn(adminInput, cell, "!w-32 transition-[width] focus:!w-64")} aria-label="Ghi chú" />}
      </td>
      <td className={cn(tdClass, TD, STICKY_R, "whitespace-nowrap")}>
        {locked ? null : (
          <div className="grid gap-1">
            <div className="flex items-center gap-1">
              <button type="submit" form={fid} className={cn(btnSecondary, "!px-2 !py-1")} title="Lưu dòng này">
                ✓
              </button>
              <form action={removeSurplusAction} className="inline">
                <input type="hidden" name="batchId" value={b.id} />
                <input type="hidden" name="stockPurchaseId" value={s.id} />
                <button type="submit" className={cn(btnSecondary, "!px-2 !py-1 !text-lien-heart")} title="Bỏ dòng lưu kho (xoá phiếu)" aria-label="Bỏ dòng">
                  ✕
                </button>
              </form>
            </div>
            <div className="flex items-center gap-1">
              <input name="splitQty" form={sid} inputMode="numeric" placeholder="SL" className={cn(adminInput, cell, "!w-14 !text-center")} aria-label="Số đơn vị tách" title="Số đơn vị muốn tách thành dòng riêng" />
              {s.qty >= 2 ? (
                <button type="submit" form={sid} name="mode" value="split" className={cn(btnSecondary, "!px-2 !py-1")} title="Tách dòng — thành dòng riêng trong đợt (HSD / nguồn khác)" aria-label="Tách dòng">
                  <Fa name="cubes" />
                </button>
              ) : null}
            </div>
          </div>
        )}
      </td>
    </tr>
  );
}


/** A lot bought in this batch: every field editable (SL chưa bán, mua ở, HSD, ngày mua, ¥, trạng thái = vị trí, cửa hàng / ghi chú), split into its own lot. */
function LotRow({ b, l, done, bulkId, srcSelect, sources, search }: { b: PurchaseBatch; l: LotView; done: boolean; bulkId: string; srcSelect: SrcSelect; sources: PurchaseSource[]; search: string }) {
  const fid = `bl-${l.id}`;
  const status = statusForLocation(l.warehouse, l.inTransit);
  const ss = PURCHASE_STAGES[purchaseIndex(status)];
  const back = `${BACK}#batch-${b.id}`;
  const note = noteBody(l.note, b.code);
  return (
    <tr className={ROW} data-testid={`blot-${l.id}`} data-brow="1" data-kind="stock" data-search={search} data-product={l.productId} data-src={l.sourceKey} data-status={status} data-note={note ? "1" : "0"} data-qty={l.physical} data-jpy={(l.unitCostJpy ?? 0) * l.physical}>
      <td className={cn(tdClass, TD, STICKY_L, "w-8 max-lg:float-right")}>{done ? null : <input type="checkbox" name="lotIds" value={l.id} form={bulkId} className="h-4 w-4" aria-label={`Chọn lô #${l.id}`} />}</td>
      <td className={cn(tdClass, TD, "min-w-[220px] max-w-[300px]")}>
        <ProductCell
          productId={l.productId}
          name={l.productName}
          sku={l.productSku}
          thumb={l.productThumb}
          badge={
            <>
              {l.receiptId ? (
                <Link href={`${BACK}&receipts=1#receipt-${l.receiptId}`} className="rounded border border-[#d1d5db] bg-white px-1 py-0.5 font-mono text-[10px] font-semibold text-lien-heading no-underline hover:border-lien-blue" title={`Bill · lô #${l.id}`}>
                  {l.receiptCode}
                </Link>
              ) : (
                <Link href={`/admin/inventory/lots/${l.productId}/`} className="text-[10px] text-lien-muted no-underline hover:underline" title={describeLocation(l.warehouse, l.inTransit)}>
                  lô #{l.id}
                </Link>
              )}
              {l.reserved.map((r) => (
                <Link key={r.orderId} href={`/admin/orders/${r.orderId}/`} className={cn("rounded px-1 py-0.5 text-[10px] font-semibold no-underline hover:underline", r.committed ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800")} title={r.committed ? "Đơn đã thanh toán / COD — hàng đi cùng lô" : "Đơn chưa thanh toán"}>
                  #{r.orderNumber} ×{r.qty}
                </Link>
              ))}
              {l.free ? <span className="text-lien-muted">tự do {l.free}</span> : null}
              {l.parentLotId ? <span className="text-lien-muted">tách từ #{l.parentLotId}</span> : null}
            </>
          }
        />
      </td>
      <td className={cn(tdClass, TD, LBL)} data-label="SL">
        {done ? (
          <span className="font-semibold">{l.physical}</span>
        ) : (
          <>
            <input name="qtyLeft" form={fid} inputMode="numeric" defaultValue={l.qtyLeft} className={cn(adminInput, cell, "!w-14 !text-center")} aria-label="Số đơn vị chưa bán" title={l.heldQty ? `Chưa bán; ngoài ra ${l.heldQty} đv khách đã thanh toán còn trong lô` : "Số đơn vị chưa bán trong lô"} />
            {l.heldQty ? <span className="block text-[10px] text-green-700">+{l.heldQty} đã TT</span> : null}
          </>
        )}
      </td>
      <td className={cn(tdClass, TD, LBL)} data-label="Mua ở">
        {done ? <span className="text-[12px]">{purchaseSourceName(l.sourceKey, sources)}</span> : srcSelect(fid, l.sourceKey, `Nguồn lô #${l.id}`)}
      </td>
      <td className={cn(tdClass, TD, LBL, "whitespace-nowrap")} data-label="Mua">
        {done ? (
          <span className="text-[12px]">
            {l.expiry ? `HSD ${formatDate(l.expiry)}` : "HSD —"} · {l.boughtAt ? formatDate(l.boughtAt) : formatDate(l.receivedAt)} · {l.unitCostJpy ? `¥${formatAmount(l.unitCostJpy)}` : "—"}
          </span>
        ) : (
          <div className="grid w-[92px] gap-1">
            <input name="expiry" form={fid} defaultValue={l.expiry ?? ""} placeholder="HSD 03/2027" className={cn(adminInput, cell, "!w-full")} aria-label="Hạn dùng" />
            <input name="boughtAt" form={fid} defaultValue={l.boughtAt ?? ""} placeholder="mua 2026-09-27" className={cn(adminInput, cell, "!w-full")} aria-label="Ngày mua" />
            <input name="unitCostJpy" form={fid} inputMode="numeric" defaultValue={l.unitCostJpy ?? ""} placeholder="¥/đv" className={cn(adminInput, cell, "!w-full")} aria-label="Giá ¥ mỗi đơn vị" />
          </div>
        )}
      </td>
      <td className={cn(tdClass, TD, LBL)} data-label="Trạng thái">
        {done ? (
          <span className={cn("inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold", ss.cls)}>{ss.short}</span>
        ) : (
          <>
            <select name="status" form={fid} defaultValue={status} className={cn(adminInput, cell, "!w-40")} aria-label="Trạng thái / vị trí lô">
              {LOT_STAGES.map((x) => (
                <option key={x.key} value={x.key}>
                  {x.label}
                </option>
              ))}
            </select>
            {status !== b.status ? (
              <span className={cn("mt-1 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold", ss.cls)} title="Khác trạng thái của đợt">
                {ss.short}
              </span>
            ) : null}
          </>
        )}
      </td>
      <td className={cn(tdClass, TD, LBL)} data-label="Cửa hàng">
        {done ? <span className="text-[12px] text-lien-muted">{note || "—"}</span> : <input name="note" form={fid} defaultValue={note} placeholder="cửa hàng mua, ghi chú…" title={l.note} className={cn(adminInput, cell, "!w-32 transition-[width] focus:!w-64")} aria-label="Cửa hàng mua / ghi chú" />}
      </td>
      <td className={cn(tdClass, TD, STICKY_R, "whitespace-nowrap")}>
        {done ? null : (
          <div className="grid gap-1">
            <form id={fid} action={updateBatchLotAction} className="flex items-center gap-1">
              <input type="hidden" name="batchId" value={b.id} />
              <input type="hidden" name="lotId" value={l.id} />
              <button type="submit" className={cn(btnSecondary, "!px-2 !py-1")} title="Lưu lô này">
                ✓
              </button>
            </form>
            {l.qtyLeft >= 2 ? (
              <form action={splitLotAction} className="flex items-center gap-1">
                <input type="hidden" name="lotId" value={l.id} />
                <input type="hidden" name="back" value={back} />
                <input name="qty" inputMode="numeric" placeholder="SL" className={cn(adminInput, cell, "!w-14 !text-center")} aria-label="Số đơn vị tách" title="Số đơn vị chưa bán tách thành lô riêng (cùng đợt)" />
                <button type="submit" className={cn(btnSecondary, "!px-2 !py-1")} title="Tách thành lô riêng trong đợt (HSD khác, gửi đợt sau…)" aria-label="Tách lô">
                  <Fa name="cubes" />
                </button>
              </form>
            ) : null}
          </div>
        )}
      </td>
    </tr>
  );
}
