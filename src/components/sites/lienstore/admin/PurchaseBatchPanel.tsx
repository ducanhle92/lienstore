import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { addLinesToBatchAction, addProductAction, allocateSurplusAction, bulkBatchRowsAction, createBatchAction, createBillAction, deleteBatchAction, saveBatchRowsAction, setBatchStatusAction, updateBatchAction, updateBatchStockAction } from "@/app/admin/purchases/batch-actions";
import { deleteReceiptFileAction, parseBillAction, uploadReceiptFilesAction } from "@/app/admin/purchases/receipt-actions";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import type { PurchaseLine } from "@/lib/db";
import type { LotView } from "@/lib/lots-db";
import { formatAmount, formatDate, formatDateTime } from "@/lib/format";
import { todayIso } from "@/lib/lots";
import { PURCHASE_STAGES, purchaseIndex } from "@/lib/purchase";
import { BATCH_DONE, BATCH_STAGES, batchTotals } from "@/lib/purchase-batches";
import { purchaseSourceName } from "@/lib/purchase-sources";
import { cn } from "@/lib/utils";
import { describeLocation, statusForLocation } from "@/lib/warehouses";
import type { PurchaseBatch, PurchaseBatchBill, PurchaseBatchLine, PurchaseBatchStock, PurchaseSource } from "@/types/shop";
import { BatchFilter } from "./BatchFilter";
import { ConfirmSubmit } from "./ConfirmSubmit";
import { type PickableProduct, ProductSearchSelect } from "./ProductSearchSelect";
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
  /** Batch whose Bill block starts open (after creating a bill / attaching a photo). */
  openBillsFor?: number | null;
}

const cell = "!mb-0 !py-1 !text-[13px]";
const BACK = "/admin/purchases/?tab=batches";
/** Places a lot can be in (from "Tại kho Nhật (shop)" to "Tại kho VN (shop)"). */
const LOT_STAGES = PURCHASE_STAGES.filter((s) => purchaseIndex(s.key) >= purchaseIndex("bought") && purchaseIndex(s.key) <= purchaseIndex("at_shop"));

/**
 * Quản lý mua hàng › tab "Mua theo đợt": one card per purchase trip (đợt mua = một lần đi mua / một bill). Every row
 * (order line, slip, lot) is a set of inputs bound to ONE save form per batch — the red "Lưu thay đổi" bar sticks to the
 * bottom of the screen while the card is in view. Bills (phiếu mua, PM-…) are the paper trail: each row says which bill
 * it came from; photos attach on the bill inside the card.
 */
export function PurchaseBatchPanel({ batches, openLines, products, sources, includeDone, search, openBillsFor = null }: Props) {
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
                      Ngày mua
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
                  <b>Bill:</b> mỗi lần thanh toán là một bill (PM-…). Mở khối “Bill” trong đợt → dán nội dung bill (tự tách sản phẩm) hoặc tạo bill trống rồi <b>đính kèm ảnh chụp bill</b>. Mỗi dòng sản phẩm ghi mã bill của nó.
                </li>
                <li>
                  <b>Thêm sản phẩm đã mua:</b> bấm “+ Thêm sản phẩm đã mua” → tìm theo tên, chọn bill, nơi mua, SL, HSD, ngày mua, ¥. Hàng thành lô ở Kho Nhật (shop) ngay, tự gán cho đơn đang chờ trước, phần còn lại lưu kho.
                </li>
                <li>
                  <b>Sửa trong bảng</b> (SL, mua ở, HSD, ngày mua, ¥, trạng thái, cửa hàng / ghi chú) rồi bấm <b>Lưu thay đổi</b> ở thanh đỏ cuối màn — một lần cho cả đợt.
                </li>
                <li>
                  <b>Tick nhiều dòng</b> → đặt trạng thái / gắn bill / Bỏ khỏi đợt / Chuyển sang đợt khác.
                </li>
                <li>
                  <b>Gửi về VN:</b> đổi trạng thái từng dòng hoặc <b>cả đợt</b>: Tại kho Nhật → tới ĐVVC Nhật → NB→VN → kho ĐVVC VN → <b>Tại kho VN</b>; lô đổi vị trí theo, Tồn kho hiện đúng chỗ.
                </li>
              </ol>
            </Card>
          </div>
        </details>
      </div>
      {searching && batches.length === 0 ? <p className="m-0 text-[13px] text-lien-muted">Không có đợt nào khớp tìm kiếm.</p> : null}

      <div className="space-y-5">
        {batches.length === 0 && !searching ? (
          <Card>
            <p className="m-0 text-[13px] text-lien-muted">Chưa có đợt nào. Bấm “+ Mở đợt mua mới”, rồi nhập bill / thêm các sản phẩm đã mua — hệ thống tự gán cho đơn đang chờ trước, phần còn lại lưu kho.</p>
          </Card>
        ) : null}
        {batches.map((b) => (
          <BatchCard key={b.id} batch={b} heads={heads.filter((h) => h.id !== b.id)} openLines={openLines} products={products} sources={sources} billsOpen={openBillsFor === b.id} />
        ))}
        <p className="m-0 text-[12px] text-lien-muted">
          <Link href={`/admin/purchases/?tab=batches${includeDone ? "" : "&done=1"}`} className="text-lien-blue hover:underline">
            {includeDone ? "Ẩn đợt đã về kho" : "Xem cả đợt đã về kho"}
          </Link>
        </p>
      </div>
    </div>
  );
}

type Row = { kind: "line"; key: string; name: string; line: PurchaseBatchLine } | { kind: "stock"; key: string; name: string; stock: PurchaseBatchStock } | { kind: "lot"; key: string; name: string; lot: LotView };

function BatchCard({ batch: b, heads, openLines, products, sources, billsOpen }: { batch: PurchaseBatch; heads: Array<{ id: number; code: string; label: string }>; openLines: PurchaseLine[]; products: PickableProduct[]; sources: PurchaseSource[]; billsOpen: boolean }) {
  const st = PURCHASE_STAGES[purchaseIndex(b.status)];
  const stage = BATCH_STAGES.find((s) => s.key === b.status) ?? BATCH_STAGES[0];
  const totals = batchTotals(b.lines, [...b.stock, ...b.lots.map((l) => ({ qty: l.physical, unitCostJpy: l.unitCostJpy }))]);
  const done = b.status === BATCH_DONE;
  const hasLots = b.lots.length > 0 || b.stock.some((s) => s.lotId);
  const surplusByProduct = new Map<number, number>();
  for (const s of b.stock) if (!s.lotId) surplusByProduct.set(s.productId, (surplusByProduct.get(s.productId) ?? 0) + s.qty);
  for (const l of b.lots) surplusByProduct.set(l.productId, (surplusByProduct.get(l.productId) ?? 0) + l.free);
  const addFormId = `bl-${b.id}`;
  const bulkId = `bb-${b.id}`;
  const saveId = `bsave-${b.id}`;
  const jaById = new Map(products.map((p) => [p.id, p.nameJa ?? ""]));
  const searchOf = (productId: number, name: string, sku: string | null) => `${name} ${jaById.get(productId) ?? ""} ${sku ?? ""} #${productId}`;
  // chips / suggestions for the filter bar, built from what the batch actually holds
  const filterSources = Array.from(new Set([...b.lines.map((l) => l.sourceKey), ...b.stock.map((s) => s.sourceKey), ...b.lots.map((l) => l.sourceKey)].filter(Boolean))).map((k) => ({ key: k, name: purchaseSourceName(k, sources) }));
  const filterStatuses = Array.from(new Set([...b.lines.map((l) => l.purchaseStatus), ...b.stock.map((s) => s.status), ...b.lots.map((l) => statusForLocation(l.warehouse, l.inTransit))])).map((k) => ({ key: k, label: PURCHASE_STAGES[purchaseIndex(k)].short }));
  const filterOrders = Array.from(new Map(b.lines.map((l) => [l.orderNumber, { number: l.orderNumber, customer: l.customerName }])).values()).sort((x, y) => y.number - x.number);
  // one row per order line / lot / slip, grouped by product name (order lines first)
  const rows: Row[] = [...b.lines.map((l): Row => ({ kind: "line", key: `l-${l.itemId}`, name: l.productName, line: l })), ...b.lots.map((l): Row => ({ kind: "lot", key: `lot-${l.id}`, name: l.productName, lot: l })), ...b.stock.map((s): Row => ({ kind: "stock", key: `s-${s.id}`, name: s.productName, stock: s }))].sort((x, y) => x.name.localeCompare(y.name, "vi") || (x.kind === y.kind ? 0 : x.kind === "line" ? -1 : y.kind === "line" ? 1 : x.kind === "lot" ? -1 : 1));
  const srcSelect = (name: string, value: string, label: string) => (
    <select name={name} form={saveId} defaultValue={value} className={cn(adminInput, cell, "!w-[118px]")} aria-label={label}>
      {!value ? <option value="">— nguồn —</option> : null}
      {sources.map((s) => (
        <option key={s.key} value={s.key}>
          {s.name}
        </option>
      ))}
    </select>
  );
  const billBadge = (receiptId: number | null, code: string, fallback: string) =>
    receiptId ? (
      <a href={`#receipt-${receiptId}`} className="rounded border border-[#d1d5db] bg-white px-1 py-0.5 font-mono text-[10px] font-semibold text-lien-heading no-underline hover:border-lien-blue" title="Bill — mở khối Bill của đợt để xem / đính kèm ảnh">
        {code}
      </a>
    ) : (
      <span className="rounded bg-[#f3f4f6] px-1 py-0.5 text-[10px] text-lien-muted" title={`${fallback} · chưa gắn bill (tick dòng → Gắn bill)`}>
        chưa có bill
      </span>
    );
  const ctx = { b, done, bulkId, saveId, srcSelect, billBadge, sources, products, searchOf };
  return (
    <div id={`batch-${b.id}`} data-testid={`batch-${b.id}`} className="min-w-0">
      <Card
        title={`${b.code}${b.label ? ` · ${b.label}` : ""}`}
        actions={
          <span className="flex items-center gap-3">
            <span className="text-[12px] text-lien-muted">
              đặt hàng <b className="text-lien-heading">{totals.orderUnits}</b> · lưu kho <b className="text-lien-heading">{totals.stockUnits}</b> · tổng <b className="text-lien-heading">{totals.units}</b> đv{totals.jpy !== null ? ` · ≈ ¥${formatAmount(totals.jpy)}` : ""}
            </span>
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
        {/* every input in the table belongs to this one form; the red bar at the bottom submits it */}
        <form id={saveId} action={saveBatchRowsAction}>
          <input type="hidden" name="batchId" value={b.id} />
        </form>
        {/* bulk bar: the checkboxes in the table attach to this (empty) form */}
        <form id={bulkId} action={bulkBatchRowsAction}>
          <input type="hidden" name="batchId" value={b.id} />
        </form>

        <BillsBlock b={b} sources={sources} done={done} open={billsOpen} />

        {/* one toolbar, sticky while the card scrolls: whole-batch status on the left, ticked-rows actions on the right */}
        <div className="sticky top-0 z-20 -mx-1 mb-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-[#e5e7eb] bg-[#f9fafb]/95 px-3 py-2 text-[13px] shadow-sm backdrop-blur" data-testid={`toolbar-${b.id}`}>
          <form action={setBatchStatusAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="batchId" value={b.id} />
            <span className="font-semibold text-lien-heading">Cả đợt →</span>
            <select name="status" defaultValue={b.status} className={cn(adminInput, cell, "!w-auto")} aria-label="Trạng thái cả đợt" title={done ? "Đợt đã về kho." : "Mọi dòng trong đợt chuyển theo; lô đổi vị trí theo."}>
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
              {b.receipts.length ? (
                <>
                  <span className="mx-1 text-lien-muted">|</span>
                  <select name="billId" form={bulkId} defaultValue={b.receipts[0].id} className={cn(adminInput, cell, "!w-auto")} aria-label="Bill để gắn">
                    {b.receipts.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.code} · {formatDate(r.boughtAt)}
                      </option>
                    ))}
                  </select>
                  <button type="submit" form={bulkId} name="op" value="bill" className={cn(btnSecondary, "!py-1")} title="Các dòng đã tick thuộc bill này">
                    Gắn bill
                  </button>
                </>
              ) : null}
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

        <BatchFilter batchId={b.id} total={rows.length} sources={filterSources} statuses={filterStatuses} orders={filterOrders} />
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
              </tr>
            </thead>
            <tbody className="max-lg:grid max-lg:grid-cols-1 max-lg:gap-3 md:max-lg:grid-cols-2">
              {rows.length === 0 ? (
                <tr className="max-lg:block">
                  <td colSpan={7} className={`${tdClass} text-center text-lien-muted`}>
                    Đợt chưa có gì — nhập bill hoặc “+ Thêm sản phẩm đã mua” bên dưới.
                  </td>
                </tr>
              ) : null}
              {rows.map((r) => (r.kind === "line" ? <LineRow key={r.key} l={r.line} {...ctx} /> : r.kind === "lot" ? <LotRow key={r.key} l={r.lot} {...ctx} /> : <StockRow key={r.key} s={r.stock} {...ctx} />))}
            </tbody>
          </table>
        </div>

        {/* the save bar sticks to the bottom of the screen while the card is in view */}
        {done || rows.length === 0 ? null : (
          <div className="sticky bottom-0 z-20 -mx-1 mt-2 flex flex-wrap items-center gap-3 rounded-md border border-[#e5e7eb] bg-white/95 px-3 py-2 shadow-[0_-6px_12px_-8px_rgba(0,0,0,0.25)] backdrop-blur" data-testid={`savebar-${b.id}`}>
            <button type="submit" form={saveId} className={cn(btnPrimary, "!px-5 !py-2 !text-[14px]")} title="Lưu mọi ô đã sửa trong bảng của đợt này">
              <Fa name="check" /> Lưu thay đổi
            </button>
            <span className="text-[12px] text-lien-muted">
              {rows.length} dòng · sửa nhiều ô rồi lưu một lần; trạng thái đổi → lô đổi vị trí theo.
            </span>
          </div>
        )}

        {done ? null : (
          <>
            <details className="mt-3 rounded-md border border-dashed border-[#d1d5db] bg-white" data-testid={`surplus-${b.id}`}>
              <summary className="cursor-pointer px-3 py-2 text-[13px] font-semibold text-lien-heading">
                + Thêm sản phẩm đã mua <span className="font-normal text-lien-muted">— SL là tổng đã mua; tự gán cho đơn đang chờ trước, phần còn lại lưu kho</span>
              </summary>
              <form action={addProductAction} className="grid gap-2 px-3 pb-3 lg:grid-cols-[minmax(240px,1fr)_150px_150px_70px_120px_120px_100px_1fr_auto] lg:items-end">
                <input type="hidden" name="batchId" value={b.id} />
                <div>
                  <label className={adminLabel}>Sản phẩm (tìm theo tên)</label>
                  <ProductSearchSelect products={products} placeholder="Gõ tên Việt / Nhật hoặc SKU…" />
                </div>
                <div>
                  <label className={adminLabel} htmlFor={`sbill-${b.id}`}>
                    Bill
                  </label>
                  <select id={`sbill-${b.id}`} name="billId" defaultValue={b.receipts[0]?.id ?? "new"} className={cn(adminInput, "!py-1.5 !text-[13px]")} title="Bill nào đã trả tiền món này; “bill mới” tự tạo PM-… theo nơi mua / ngày mua bên cạnh">
                    {b.receipts.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.code} · {formatDate(r.boughtAt)}
                      </option>
                    ))}
                    <option value="new">+ bill mới</option>
                    <option value="">không gắn bill</option>
                  </select>
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
                    Cửa hàng · ghi chú
                  </label>
                  <input id={`sn-${b.id}`} name="note" maxLength={200} placeholder="OS Drug 船橋…" className={cn(adminInput, "!py-1.5 !text-[13px]")} />
                </div>
                <button type="submit" className={cn(btnPrimary, "!py-1.5 !text-[13px]")}>
                  + Thêm vào đợt
                </button>
              </form>
            </details>

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

/** Bills of the batch: the numbered paper trail — photos attach here; new bills by pasting text or as an empty bill for photos. */
function BillsBlock({ b, sources, done, open }: { b: PurchaseBatch; sources: PurchaseSource[]; done: boolean; open: boolean }) {
  const tabField = <input type="hidden" name="fromTab" value="batches" />;
  const summary = b.receipts.length ? b.receipts.map((r) => `${r.code} · ${formatDate(r.boughtAt)}${r.files.length ? ` · ${r.files.length} ảnh` : ""}`).join("  ·  ") : "chưa có bill";
  return (
    <details className="mb-2 rounded-md border border-[#e5e7eb] bg-white" data-testid={`bills-${b.id}`} open={open || b.receipts.some((r) => r.status === "draft")}>
      <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2 text-[13px]">
        <span className="font-semibold text-lien-heading">
          <Fa name="file-text-o" /> Bill ({b.receipts.length})
        </span>
        <span className="min-w-0 truncate font-mono text-[11px] text-lien-muted">{summary}</span>
        {done ? null : <span className="ml-auto text-[12px] text-lien-blue">+ nhập bill / đính kèm ảnh</span>}
      </summary>
      <div className="grid gap-3 border-t border-[#f0f0f0] px-3 py-3 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-2">
          {b.receipts.length === 0 ? <p className="m-0 text-[12px] text-lien-muted">Đợt chưa có bill. Dán nội dung bill (email Amazon / Rakuten, hoặc mỗi dòng: tên · SL · giá) ở khung bên phải, hoặc tạo bill trống rồi đính ảnh chụp.</p> : null}
          {b.receipts.map((r) => (
            <BillRow key={r.id} r={r} b={b} sources={sources} tabField={tabField} />
          ))}
        </div>
        {done ? null : (
          <div className="space-y-3">
            <form action={parseBillAction} className="grid gap-2 rounded-md border border-dashed border-[#d1d5db] p-2" data-testid={`bill-paste-${b.id}`}>
              {tabField}
              <input type="hidden" name="batchId" value={b.id} />
              <label className={adminLabel} htmlFor={`bt-${b.id}`}>
                Nhập bill mới <span className="font-normal text-lien-muted">— dán nội dung, tự tách sản phẩm · SL · ¥</span>
              </label>
              <textarea id={`bt-${b.id}`} name="bill" rows={5} placeholder={"注文番号: 249-1234567-8901234\nロート製薬 メンソレータム アクネス 14g\n数量: 2  ¥1,320\n\nhoặc: 3 x Sữa rửa mặt Hatomugi 800ml 690円"} className={cn(adminInput, "!mb-0 font-mono !text-[12px]")} />
              <div className="grid grid-cols-2 gap-2">
                <select name="sourceKey" defaultValue={b.sourceKey} className={cn(adminInput, "!mb-0 !py-1 !text-[13px]")} aria-label="Mua ở">
                  {sources.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <input name="boughtAt" defaultValue={b.boughtAt ?? todayIso()} placeholder="ngày mua" className={cn(adminInput, "!mb-0 !py-1 !text-[13px]")} aria-label="Ngày mua" />
              </div>
              <input name="orderRef" placeholder="mã đơn nguồn (trống = tự đọc)" className={cn(adminInput, "!mb-0 !py-1 !text-[13px]")} aria-label="Mã đơn nguồn" />
              <button type="submit" className={cn(btnPrimary, "justify-self-start !py-1 !text-[13px]")}>
                Đọc bill → phiếu nháp
              </button>
            </form>
            <form action={createBillAction} className="grid gap-2 rounded-md border border-dashed border-[#d1d5db] p-2" data-testid={`bill-new-${b.id}`}>
              <input type="hidden" name="batchId" value={b.id} />
              <span className={adminLabel}>
                Bill trống <span className="font-normal text-lien-muted">— chỉ để đính ảnh chụp, gắn sản phẩm sau</span>
              </span>
              <div className="grid grid-cols-2 gap-2">
                <select name="sourceKey" defaultValue={b.sourceKey} className={cn(adminInput, "!mb-0 !py-1 !text-[13px]")} aria-label="Mua ở">
                  {sources.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <input name="boughtAt" defaultValue={b.boughtAt ?? todayIso()} placeholder="ngày mua" className={cn(adminInput, "!mb-0 !py-1 !text-[13px]")} aria-label="Ngày mua" />
              </div>
              <input name="orderRef" placeholder="mã đơn / số bill (tuỳ chọn)" className={cn(adminInput, "!mb-0 !py-1 !text-[13px]")} aria-label="Mã đơn nguồn" />
              <button type="submit" className={cn(btnSecondary, "justify-self-start !py-1 !text-[13px]")}>
                + Tạo bill trống
              </button>
            </form>
          </div>
        )}
      </div>
    </details>
  );
}

function BillRow({ r, b, sources, tabField }: { r: PurchaseBatchBill; b: PurchaseBatch; sources: PurchaseSource[]; tabField: ReactNode }) {
  const rowsOnBill = b.lines.filter((l) => l.receiptId === r.id).length + b.lots.filter((l) => l.receiptId === r.id).length + b.stock.filter((s) => s.receiptId === r.id).length;
  return (
    <div id={`receipt-${r.id}`} className="rounded-md border border-[#e5e7eb] bg-[#f9fafb] px-3 py-2 text-[12px]" data-testid={`bill-${r.id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[12px] font-semibold text-lien-heading">{r.code}</span>
        <span>{formatDate(r.boughtAt)}</span>
        <span>· {purchaseSourceName(r.sourceKey, sources)}</span>
        {r.orderRef ? <span className="text-lien-muted">· {r.orderRef}</span> : null}
        {r.totalJpy ? <span className="text-lien-muted">· ¥{formatAmount(r.totalJpy)}</span> : null}
        <span className="text-lien-muted">
          · {r.items} sp trên bill · {rowsOnBill} dòng trong đợt
        </span>
        {r.status === "draft" ? (
          <Link href={`${BACK}&receipts=1&draft=${r.id}#receipt-${r.id}`} className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 no-underline hover:underline">
            nháp — xác nhận sản phẩm →
          </Link>
        ) : null}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        {r.files.map((f) => (
          <span key={f.path} className="inline-flex items-center gap-1 rounded border border-[#e5e7eb] bg-white p-1">
            <a href={f.url} target="_blank" rel="noreferrer" title={f.name} className="no-underline">
              {f.mime.startsWith("image/") ? <Image src={f.url} alt={f.name} width={56} height={56} unoptimized className="h-14 w-14 rounded object-cover" /> : <span className="inline-block max-w-[140px] truncate px-1 text-lien-blue">📄 {f.name || "PDF"}</span>}
            </a>
            <form action={deleteReceiptFileAction}>
              {tabField}
              <input type="hidden" name="id" value={r.id} />
              <input type="hidden" name="path" value={f.path} />
              <input type="hidden" name="back" value={`${BACK}&bills=${b.id}#receipt-${r.id}`} />
              <ConfirmSubmit message="Gỡ ảnh này khỏi bill?" className="px-1 text-[11px] text-lien-heart hover:underline">
                gỡ
              </ConfirmSubmit>
            </form>
          </span>
        ))}
        <form action={uploadReceiptFilesAction} className="inline-flex flex-wrap items-center gap-1">
          {tabField}
          <input type="hidden" name="id" value={r.id} />
          <input type="hidden" name="back" value={`${BACK}&bills=${b.id}#receipt-${r.id}`} />
          <input type="file" name="files" accept="image/*,application/pdf" multiple className="max-w-[220px] text-[12px]" aria-label="Ảnh bill" />
          <button type="submit" className={cn(btnSecondary, "!px-2 !py-0.5 !text-[12px]")} title="Đính kèm ảnh chụp bill / PDF (≤ 10 MB mỗi tệp)">
            <Fa name="paperclip" /> Thêm ảnh bill
          </button>
        </form>
      </div>
    </div>
  );
}

/** Table cell (lg+) that becomes a labelled block inside the row card below lg. */
const TD = "max-lg:block max-lg:border-0 max-lg:px-0 max-lg:py-1";
const LBL = "max-lg:before:mr-1 max-lg:before:text-[11px] max-lg:before:text-lien-muted max-lg:before:content-[attr(data-label)]";
const ROW = "align-top hover:bg-[#fafafa] max-lg:block max-lg:rounded-md max-lg:border max-lg:border-[#e5e7eb] max-lg:p-3 max-lg:hover:bg-white";
const STICKY_L = "lg:sticky lg:left-0 lg:z-[5] lg:bg-white";

interface RowCtx {
  b: PurchaseBatch;
  done: boolean;
  bulkId: string;
  saveId: string;
  srcSelect: (name: string, value: string, label: string) => ReactNode;
  billBadge: (receiptId: number | null, code: string, fallback: string) => ReactNode;
  sources: PurchaseSource[];
  products: PickableProduct[];
  searchOf: (productId: number, name: string, sku: string | null) => string;
}

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

/** Three stacked inputs: HSD · bought date · ¥ per unit. */
function BuyFacts({ p, saveId, expiry, boughtAt, jpy, jpyName }: { p: string; saveId: string; expiry: string | null; boughtAt: string | null; jpy: number | null; jpyName: string }) {
  return (
    <div className="grid w-[92px] gap-1">
      <input name={`${p}expiry`} form={saveId} defaultValue={expiry ?? ""} placeholder="HSD 03/2027" className={cn(adminInput, cell, "!w-full")} aria-label="Hạn dùng" />
      <input name={`${p}boughtAt`} form={saveId} defaultValue={boughtAt ?? ""} placeholder="mua 2026-09-27" className={cn(adminInput, cell, "!w-full")} aria-label="Ngày mua" />
      <input name={`${p}${jpyName}`} form={saveId} inputMode="numeric" defaultValue={jpy ?? ""} placeholder="¥/đv" className={cn(adminInput, cell, "!w-full")} aria-label="Giá ¥ mỗi đơn vị" />
    </div>
  );
}

function StatusSelect({ name, saveId, value, options, batchStatus }: { name: string; saveId: string; value: string; options: typeof PURCHASE_STAGES; batchStatus: string }) {
  const ss = PURCHASE_STAGES[purchaseIndex(value as never)];
  return (
    <>
      <select name={name} form={saveId} defaultValue={value} className={cn(adminInput, cell, "!w-40")} aria-label="Trạng thái">
        {options.map((x) => (
          <option key={x.key} value={x.key}>
            {x.label}
          </option>
        ))}
      </select>
      {value !== batchStatus ? (
        <span className={cn("mt-1 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold", ss.cls)} title="Khác trạng thái của đợt">
          {ss.short}
        </span>
      ) : null}
    </>
  );
}

/** A customer's order line bought in this batch: source, HSD / date / ¥ (profit per order), status, note. */
function LineRow({ l, b, done, bulkId, saveId, srcSelect, billBadge, searchOf }: { l: PurchaseBatchLine } & RowCtx) {
  const p = `l_${l.itemId}_`;
  return (
    <tr className={ROW} data-testid={`bline-${l.itemId}`} data-brow="1" data-kind="line" data-search={searchOf(l.productId, l.productName, l.productSku)} data-product={l.productId} data-order={l.orderNumber} data-customer={l.customerName} data-src={l.sourceKey} data-status={l.purchaseStatus} data-note="0" data-qty={l.quantity} data-jpy={(l.costJpy ?? 0) * l.quantity}>
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
              {billBadge(l.receiptId, l.receiptCode, `dòng đơn #${l.orderNumber}`)}
            </>
          }
        />
      </td>
      <td className={cn(tdClass, TD, LBL, "font-semibold")} data-label="SL">
        {l.quantity}
      </td>
      <td className={cn(tdClass, TD, LBL)} data-label="Mua ở">
        {done ? <span className="text-[12px]">{purchaseSourceName(l.sourceKey, [])}</span> : srcSelect(`${p}sourceKey`, l.sourceKey, `Nguồn dòng đơn #${l.orderNumber}`)}
      </td>
      <td className={cn(tdClass, TD, LBL, "whitespace-nowrap")} data-label="Mua">
        {done ? (
          <span className="text-[12px]">
            {l.expiry ? `HSD ${formatDate(l.expiry)}` : "HSD —"} · {l.boughtAt ? formatDate(l.boughtAt) : "—"} · {l.costJpy ? `¥${formatAmount(l.costJpy)}` : "—"}
          </span>
        ) : (
          <BuyFacts p={p} saveId={saveId} expiry={l.expiry} boughtAt={l.boughtAt} jpy={l.costJpy} jpyName="costJpy" />
        )}
      </td>
      <td className={cn(tdClass, TD, LBL)} data-label="Trạng thái">
        {done ? <span className={cn("inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold", PURCHASE_STAGES[purchaseIndex(l.purchaseStatus)].cls)}>{PURCHASE_STAGES[purchaseIndex(l.purchaseStatus)].short}</span> : <StatusSelect name={`${p}status`} saveId={saveId} value={l.purchaseStatus} options={PURCHASE_STAGES} batchStatus={b.status} />}
      </td>
      <td className={cn(tdClass, TD, LBL)} data-label="Ghi chú">
        {done ? <span className="text-[12px] text-lien-muted">—</span> : <input name={`${p}note`} form={saveId} defaultValue="" placeholder="cửa hàng, ghi chú…" className={cn(adminInput, cell, "!w-32 transition-[width] focus:!w-64")} aria-label="Ghi chú" />}
      </td>
    </tr>
  );
}

/** A slip not yet a lot (Chưa mua / Đã đặt mua): everything editable; "đổi sản phẩm" has its own small form. */
function StockRow({ s, b, done, bulkId, saveId, srcSelect, billBadge, products, sources, searchOf }: { s: PurchaseBatchStock } & RowCtx) {
  const p = `s_${s.id}_`;
  const locked = !!s.lotId;
  const note = noteBody(s.note, b.code);
  const held = s.reserved.reduce((n, r) => n + r.qty, 0);
  const ro = done || locked;
  return (
    <tr className={cn(ROW, locked && "opacity-70")} data-testid={`bstock-${s.id}`} data-brow="1" data-kind="stock" data-search={searchOf(s.productId, s.productName, s.productSku)} data-product={s.productId} data-src={s.sourceKey} data-status={s.status} data-note={note ? "1" : "0"} data-qty={s.qty} data-jpy={(s.unitCostJpy ?? 0) * s.qty}>
      <td className={cn(tdClass, TD, STICKY_L, "w-8 max-lg:float-right")}>{ro ? null : <input type="checkbox" name="sids" value={s.id} form={bulkId} className="h-4 w-4" aria-label={`Chọn dòng lưu kho #${s.id}`} />}</td>
      <td className={cn(tdClass, TD, "min-w-[220px] max-w-[300px]")}>
        <ProductCell
          productId={s.productId}
          name={s.productName}
          sku={s.productSku}
          thumb={s.productThumb}
          extra={
            ro ? null : (
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
              <span className="rounded bg-[#ecfdf5] px-1.5 py-0.5 font-semibold text-[#065f46]">Lưu kho · chưa nhận</span>
              {billBadge(s.receiptId, s.receiptCode, `phiếu #${s.id}`)}
              {s.reserved.map((r) => (
                <Link key={r.orderId} href={`/admin/orders/${r.orderId}/`} className="rounded bg-amber-100 px-1 py-0.5 text-[10px] font-semibold text-amber-800 no-underline hover:underline" title="Giữ cho đơn khách">
                  #{r.orderNumber} ×{r.qty}
                </Link>
              ))}
              {held ? <span className="text-lien-muted">trống {Math.max(0, s.qty - held)}</span> : null}
            </>
          }
        />
      </td>
      <td className={cn(tdClass, TD, LBL)} data-label="SL">
        {ro ? <span className="font-semibold">{s.qty}</span> : <input name={`${p}qty`} form={saveId} inputMode="numeric" defaultValue={s.qty} className={cn(adminInput, cell, "!w-14 !text-center")} aria-label="Số lượng" />}
      </td>
      <td className={cn(tdClass, TD, LBL)} data-label="Mua ở">
        {ro ? <span className="text-[12px]">{purchaseSourceName(s.sourceKey, sources)}</span> : srcSelect(`${p}sourceKey`, s.sourceKey, `Nguồn dòng #${s.id}`)}
      </td>
      <td className={cn(tdClass, TD, LBL, "whitespace-nowrap")} data-label="Mua">
        {ro ? (
          <span className="text-[12px]">
            {s.expiry ? `HSD ${formatDate(s.expiry)}` : "HSD —"} · {s.boughtAt ? formatDate(s.boughtAt) : "—"} · {s.unitCostJpy ? `¥${formatAmount(s.unitCostJpy)}` : "—"}
          </span>
        ) : (
          <BuyFacts p={p} saveId={saveId} expiry={s.expiry} boughtAt={s.boughtAt} jpy={s.unitCostJpy} jpyName="unitCostJpy" />
        )}
      </td>
      <td className={cn(tdClass, TD, LBL)} data-label="Trạng thái">
        {ro ? <span className={cn("inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold", PURCHASE_STAGES[purchaseIndex(s.status)].cls)}>{PURCHASE_STAGES[purchaseIndex(s.status)].short}</span> : <StatusSelect name={`${p}status`} saveId={saveId} value={s.status} options={BATCH_STAGES} batchStatus={b.status} />}
      </td>
      <td className={cn(tdClass, TD, LBL)} data-label="Ghi chú">
        {ro ? <span className="text-[12px] text-lien-muted">{note || "—"}</span> : <input name={`${p}note`} form={saveId} defaultValue={note} placeholder="cửa hàng, ghi chú…" title={s.note} className={cn(adminInput, cell, "!w-32 transition-[width] focus:!w-64")} aria-label="Ghi chú" />}
      </td>
    </tr>
  );
}

/** A lot bought in this batch: unsold qty (+ paid units held), source, HSD / date / ¥, status (= place), store note. */
function LotRow({ l, b, done, bulkId, saveId, srcSelect, billBadge, sources, searchOf }: { l: LotView } & RowCtx) {
  const p = `lot_${l.id}_`;
  const status = statusForLocation(l.warehouse, l.inTransit);
  const note = noteBody(l.note, b.code);
  return (
    <tr className={ROW} data-testid={`blot-${l.id}`} data-brow="1" data-kind="stock" data-search={searchOf(l.productId, l.productName, l.productSku)} data-product={l.productId} data-src={l.sourceKey} data-status={status} data-note={note ? "1" : "0"} data-qty={l.physical} data-jpy={(l.unitCostJpy ?? 0) * l.physical}>
      <td className={cn(tdClass, TD, STICKY_L, "w-8 max-lg:float-right")}>{done ? null : <input type="checkbox" name="lotIds" value={l.id} form={bulkId} className="h-4 w-4" aria-label={`Chọn lô #${l.id}`} />}</td>
      <td className={cn(tdClass, TD, "min-w-[220px] max-w-[300px]")}>
        <ProductCell
          productId={l.productId}
          name={l.productName}
          sku={l.productSku}
          thumb={l.productThumb}
          badge={
            <>
              {billBadge(l.receiptId, l.receiptCode, `lô #${l.id}`)}
              {l.reserved.map((r) => (
                <Link key={r.orderId} href={`/admin/orders/${r.orderId}/`} className={cn("rounded px-1 py-0.5 text-[10px] font-semibold no-underline hover:underline", r.committed ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800")} title={r.committed ? "Đơn đã thanh toán / COD — hàng đi cùng lô" : "Đơn chưa thanh toán"}>
                  #{r.orderNumber} ×{r.qty}
                </Link>
              ))}
              {l.free ? <span className="text-lien-muted">tự do {l.free}</span> : null}
              <span className="text-lien-muted" title={describeLocation(l.warehouse, l.inTransit)}>
                lô #{l.id}
                {l.parentLotId ? ` · tách từ #${l.parentLotId}` : ""}
              </span>
            </>
          }
        />
      </td>
      <td className={cn(tdClass, TD, LBL)} data-label="SL">
        {done ? (
          <span className="font-semibold">{l.physical}</span>
        ) : (
          <>
            <input name={`${p}qtyLeft`} form={saveId} inputMode="numeric" defaultValue={l.qtyLeft} className={cn(adminInput, cell, "!w-14 !text-center")} aria-label="Số đơn vị chưa bán" title={l.heldQty ? `Chưa bán; ngoài ra ${l.heldQty} đv khách đã thanh toán còn trong lô` : "Số đơn vị chưa bán trong lô"} />
            {l.heldQty ? <span className="block text-[10px] text-green-700">+{l.heldQty} đã TT</span> : null}
          </>
        )}
      </td>
      <td className={cn(tdClass, TD, LBL)} data-label="Mua ở">
        {done ? <span className="text-[12px]">{purchaseSourceName(l.sourceKey, sources)}</span> : srcSelect(`${p}sourceKey`, l.sourceKey, `Nguồn lô #${l.id}`)}
      </td>
      <td className={cn(tdClass, TD, LBL, "whitespace-nowrap")} data-label="Mua">
        {done ? (
          <span className="text-[12px]">
            {l.expiry ? `HSD ${formatDate(l.expiry)}` : "HSD —"} · {l.boughtAt ? formatDate(l.boughtAt) : formatDate(l.receivedAt)} · {l.unitCostJpy ? `¥${formatAmount(l.unitCostJpy)}` : "—"}
          </span>
        ) : (
          <BuyFacts p={p} saveId={saveId} expiry={l.expiry} boughtAt={l.boughtAt} jpy={l.unitCostJpy} jpyName="unitCostJpy" />
        )}
      </td>
      <td className={cn(tdClass, TD, LBL)} data-label="Trạng thái">
        {done ? <span className={cn("inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold", PURCHASE_STAGES[purchaseIndex(status)].cls)}>{PURCHASE_STAGES[purchaseIndex(status)].short}</span> : <StatusSelect name={`${p}status`} saveId={saveId} value={status} options={LOT_STAGES} batchStatus={b.status} />}
      </td>
      <td className={cn(tdClass, TD, LBL)} data-label="Cửa hàng">
        {done ? <span className="text-[12px] text-lien-muted">{note || "—"}</span> : <input name={`${p}note`} form={saveId} defaultValue={note} placeholder="cửa hàng mua, ghi chú…" title={l.note} className={cn(adminInput, cell, "!w-32 transition-[width] focus:!w-64")} aria-label="Cửa hàng mua / ghi chú" />}
      </td>
    </tr>
  );
}
