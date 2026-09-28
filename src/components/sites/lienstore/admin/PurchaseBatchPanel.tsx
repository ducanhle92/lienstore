import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { addProductAction, bulkBatchRowsAction, createBatchAction, createBillAction, deleteBatchAction, importBillsAction, renameBillAction, resetPurchasingAction, saveBatchRowsAction, syncBatchOrdersAction, updateBatchAction, updateBatchStockAction } from "@/app/admin/purchases/batch-actions";
import { deleteReceiptFileAction, parseBillAction, uploadReceiptFilesAction } from "@/app/admin/purchases/receipt-actions";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import type { PurchaseLine } from "@/lib/db";
import type { LotView } from "@/lib/lots-db";
import { formatAmount, formatDate } from "@/lib/format";
import { todayIso } from "@/lib/lots";
import { PURCHASE_STAGES, purchaseIndex } from "@/lib/purchase";
import { BATCH_DONE, BATCH_STAGES } from "@/lib/purchase-batches";
import { purchaseSourceName } from "@/lib/purchase-sources";
import { cn } from "@/lib/utils";
import { describeLocation, statusForLocation } from "@/lib/warehouses";
import type { PurchaseBatch, PurchaseBatchBill, PurchaseBatchLine, PurchaseBatchStock, PurchaseSource } from "@/types/shop";
import { BatchFilter } from "./BatchFilter";
import { SelectAll } from "./SelectAll";
import { SortHeader } from "./SortHeader";
import { TickGate } from "./TickGate";
import { FixedSaveBar } from "./FixedSaveBar";
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
  /** Batch search (name / code, bought-date range, open / done) — kept in the URL. */
  search: { q: string; from: string; to: string; status: "" | "done" | "all" };
  /** Batch whose Bill block starts open (after creating a bill / attaching a photo). */
  openBillsFor?: number | null;
  /** The signed-in account owns the shop (may wipe purchasing data). */
  isOwner?: boolean;
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
export function PurchaseBatchPanel({ batches, openLines, products, sources, includeDone, search, openBillsFor = null, isOwner = false }: Props) {
  void includeDone;
  const searching = !!(search.q || search.from || search.to || search.status);
  void openLines;
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
          <select name="bstatus" defaultValue={search.status} className={cn(adminInput, "!mb-0 !w-auto !py-1")} aria-label="Trạng thái đợt">
            <option value="">Đợt đang mở</option>
            <option value="done">Đợt đã về kho VN</option>
            <option value="all">Tất cả</option>
          </select>
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
      {batches.some((b) => b.status !== BATCH_DONE) ? <FixedSaveBar forms={batches.filter((b) => b.status !== BATCH_DONE).map((b) => `bsave-${b.id}`)} hint="Sửa các ô trong bảng của đợt rồi lưu một lần; trạng thái đổi → lô đổi vị trí theo." addLabel="+ Thêm sản phẩm" /> : null}

      <div className="space-y-5">
        {batches.length === 0 && !searching ? (
          <Card>
            <p className="m-0 text-[13px] text-lien-muted">Chưa có đợt nào. Bấm “+ Mở đợt mua mới”, rồi nhập bill / thêm các sản phẩm đã mua — hệ thống tự gán cho đơn đang chờ trước, phần còn lại lưu kho.</p>
          </Card>
        ) : null}
        {batches.map((b) => (
          <BatchCard key={b.id} batch={b} products={products} sources={sources} billsOpen={openBillsFor === b.id} />
        ))}
        {isOwner ? (
          <details className="rounded-md border border-dashed border-red-300 bg-red-50/40 px-3 py-2" data-testid="purchasing-reset">
            <summary className="cursor-pointer text-[12px] font-semibold text-lien-heart">Làm lại từ đầu — xoá toàn bộ dữ liệu mua hàng (chủ shop)</summary>
            <form action={resetPurchasingAction} className="mt-2 flex flex-wrap items-center gap-2 text-[13px]">
              <span className="text-lien-text">Xoá mọi đợt mua, phiếu, bill (kèm ảnh), lô hàng, chuyến đóng hàng; dòng của đơn đang xử lý trở về “Cần mua”; tồn web của sản phẩm chỉ có lô trở về hàng order. Không hoàn tác được.</span>
              <input name="confirm" placeholder="gõ XOA" className={cn(adminInput, "!mb-0 !w-[110px] !py-1")} aria-label="Xác nhận" autoComplete="off" />
              <ConfirmSubmit message="Xoá TOÀN BỘ dữ liệu mua hàng và làm lại từ đầu?" confirmLabel="Xoá hết" className={cn(btnSecondary, "!border-red-300 !py-1 !text-lien-heart")}>
                Xoá toàn bộ dữ liệu mua hàng
              </ConfirmSubmit>
            </form>
          </details>
        ) : null}
      </div>
    </div>
  );
}

type Row = { kind: "line"; key: string; name: string; line: PurchaseBatchLine } | { kind: "stock"; key: string; name: string; stock: PurchaseBatchStock } | { kind: "lot"; key: string; name: string; lot: LotView };

function BatchCard({ batch: b, products, sources, billsOpen }: { batch: PurchaseBatch; products: PickableProduct[]; sources: PurchaseSource[]; billsOpen: boolean }) {
  const st = PURCHASE_STAGES[purchaseIndex(b.status)];
  const stage = BATCH_STAGES.find((s) => s.key === b.status) ?? BATCH_STAGES[0];
  const done = b.status === BATCH_DONE;
  const hasLots = b.lots.length > 0 || b.stock.some((s) => s.lotId);
  const addId = `badd-${b.id}`;
  const bulkId = `bb-${b.id}`;
  const saveId = `bsave-${b.id}`;
  const jaById = new Map(products.map((p) => [p.id, p.nameJa ?? ""]));
  const searchOf = (productId: number, name: string, sku: string | null) => `${name} ${jaById.get(productId) ?? ""} ${sku ?? ""} #${productId}`;
  // chips / suggestions for the filter bar, built from what the batch actually holds
  const filterSources = Array.from(new Set([...b.lines.map((l) => l.sourceKey), ...b.stock.map((s) => s.sourceKey), ...b.lots.map((l) => l.sourceKey)].filter(Boolean))).map((k) => ({ key: k, name: purchaseSourceName(k, sources) }));
  // one row per order line / lot / slip, grouped by product name (order lines first)
  // an order line whose units are held by lots of this batch shows on the lot row ("hàng cho đơn #…"), not as a row of its own
  const customerByOrder = new Map(b.lines.map((l) => [l.orderId, l.customerName]));
  // held by a lot or by a not-yet-received slip of this batch — both are the goods bought for that order
  const servedByLots = (l: PurchaseBatchLine) => [...b.lots, ...b.stock].filter((x) => x.productId === l.productId).reduce((n, x) => n + x.reserved.filter((r) => r.orderId === l.orderId).reduce((m, r) => m + r.qty, 0), 0) >= l.quantity;
  const visibleLines = b.lines.filter((l) => !servedByLots(l));
  const lotUnits = b.lots.reduce((n, l) => n + l.physical, 0);
  const slipUnits = b.stock.reduce((n, x) => n + x.qty, 0);
  const lineUnits = visibleLines.reduce((n, l) => n + l.quantity, 0);
  const sumUnits = lotUnits + slipUnits + lineUnits;
  const sumJpyRaw = b.lots.reduce((n, l) => n + (l.unitCostJpy ?? 0) * l.physical, 0) + b.stock.reduce((n, x) => n + (x.unitCostJpy ?? 0) * x.qty, 0) + visibleLines.reduce((n, l) => n + (l.costJpy ?? 0) * l.quantity, 0);
  const sumJpy = sumJpyRaw > 0 ? sumJpyRaw : null;
  const filterStatuses = Array.from(new Set([...visibleLines.map((l) => l.purchaseStatus), ...b.stock.map((x) => x.status), ...b.lots.map((l) => statusForLocation(l.warehouse, l.inTransit))])).map((k) => ({ key: k, label: PURCHASE_STAGES[purchaseIndex(k)].short }));
  const rows: Row[] = [...visibleLines.map((l): Row => ({ kind: "line", key: `l-${l.itemId}`, name: l.productName, line: l })), ...b.lots.map((l): Row => ({ kind: "lot", key: `lot-${l.id}`, name: l.productName, lot: l })), ...b.stock.map((s): Row => ({ kind: "stock", key: `s-${s.id}`, name: s.productName, stock: s }))].sort((x, y) => x.name.localeCompare(y.name, "vi") || (x.kind === y.kind ? 0 : x.kind === "line" ? -1 : y.kind === "line" ? 1 : x.kind === "lot" ? -1 : 1));
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
  const billCell = (name: string, code: string, receiptId: number | null) =>
    done ? (
      <span className="font-mono text-[12px]">{code || "—"}</span>
    ) : (
      <>
        <input name={name} form={saveId} defaultValue={code} list={`bills-${b.id}`} placeholder="mã bill…" className={cn(adminInput, cell, "!w-[150px] font-mono !text-[12px]")} aria-label="Mã bill" title="Gõ mã bill của cửa hàng (vd BILL_260927_1454): mã mới → tạo bill trong đợt, mã có sẵn → gắn vào bill đó, xoá trống → bỏ gắn" />
        {receiptId ? (
          <a href={`#receipt-${receiptId}`} className="block text-[11px] text-lien-blue no-underline hover:underline">
            mở bill →
          </a>
        ) : null}
      </>
    );
  const ctx = { b, done, bulkId, saveId, srcSelect, billCell, sources, products, searchOf, customerByOrder };
  const tableId = `btable-${b.id}`;
  return (
    <div id={`batch-${b.id}`} data-testid={`batch-${b.id}`} className="min-w-0">
      <Card
        title={`${b.code}${b.label ? ` · ${b.label}` : ""}`}
        actions={
          <span className="flex items-center gap-3">
            <span className="text-[12px] text-lien-muted" title="Hàng đã mua = lô (kể cả phần đang giữ cho đơn); dòng đơn chưa có lô = mua theo đơn nhưng chưa nhập bill / lô">
              hàng đã mua <b className="text-lien-heading">{lotUnits}</b>
              {slipUnits ? <> · phiếu <b className="text-lien-heading">{slipUnits}</b></> : null}
              {lineUnits ? <> · dòng đơn chưa có lô <b className="text-lien-heading">{lineUnits}</b></> : null} · tổng <b className="text-lien-heading">{sumUnits}</b> đv{sumJpy !== null ? ` · ≈ ¥${formatAmount(sumJpy)}` : ""}
            </span>
            <details className="relative" data-testid={`edit-batch-${b.id}`}>
              <summary className={cn(btnSecondary, "inline-flex cursor-pointer list-none !px-2 !py-0.5 !text-[12px]")} title="Sửa tên, nguồn mặc định, ngày mua, tracking, ghi chú của đợt">
                <Fa name="cog" /> Sửa
              </summary>
              <div className="absolute right-0 z-30 mt-1 w-[min(92vw,720px)] rounded-md border border-[#e5e7eb] bg-white p-3 shadow-lg">
                <form action={updateBatchAction} className="grid gap-2 lg:grid-cols-[1fr_160px_120px_160px_1fr_auto] lg:items-end">
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
              </div>
            </details>
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
        <datalist id={`bills-${b.id}`}>
          {b.receipts.map((r) => (
            <option key={r.id} value={r.code} />
          ))}
        </datalist>
        {/* bulk bar: the checkboxes in the table attach to this (empty) form */}
        <form id={bulkId} action={bulkBatchRowsAction}>
          <input type="hidden" name="batchId" value={b.id} />
        </form>
        <form id={addId} action={addProductAction}>
          <input type="hidden" name="batchId" value={b.id} />
        </form>

        <BillsBlock b={b} sources={sources} done={done} open={billsOpen} />

        {/* actions on ticked rows only (the header checkbox ticks every shown row); disabled until something is ticked */}
        {done ? null : (
          <div className="sticky top-0 z-20 -mx-1 mb-2 flex flex-wrap items-center gap-2 rounded-md border border-[#e5e7eb] bg-[#f9fafb]/95 px-3 py-2 text-[13px] shadow-sm backdrop-blur" data-testid={`toolbar-${b.id}`}>
            <TickGate scope={bulkId} />
            <span className="font-semibold text-lien-heading">Dòng đã tick →</span>
            <select name="bulkStatus" form={bulkId} defaultValue="bought" className={cn(adminInput, cell, "!w-auto disabled:opacity-50")} aria-label="Trạng thái cho các dòng đã tick">
              {BATCH_STAGES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
            <button type="submit" form={bulkId} name="op" value="status" className={cn(btnPrimary, "!py-1 disabled:opacity-50")} title="Đặt trạng thái này cho mọi dòng đã tick (dòng đơn, phiếu, lô); tick tất cả = cả đợt">
              Cập nhật trạng thái
            </button>
            <ConfirmSubmit form={bulkId} name="op" value="delete" message="Xoá dữ liệu mua của các dòng đã tick? Dòng đơn về “Cần mua” và rời đợt; phiếu và lô bị xoá hẳn." confirmLabel="Xoá" className={cn(btnSecondary, "!border-red-300 !py-1 !text-lien-heart disabled:opacity-50")}>
              Xoá dòng đã tick
            </ConfirmSubmit>
            <span className="mx-1 text-lien-muted">|</span>
            <form action={syncBatchOrdersAction} className="inline-flex items-center gap-2">
              <input type="hidden" name="batchId" value={b.id} />
              <button type="submit" className={cn(btnSecondary, "!py-1")} title="Đơn huỷ → trả chỗ giữ về tồn; đơn đang chờ được ghép lại theo quy tắc hiện tại (vị trí → hạn dùng → bill); phần đã trừ tồn giữ nguyên">
                <Fa name="refresh" /> Cập nhật theo đơn hàng
              </button>
            </form>
          </div>
        )}

        <BatchFilter batchId={b.id} total={rows.length} sources={filterSources} statuses={filterStatuses} bills={b.receipts.map((r) => ({ id: r.id, code: r.code }))} />
        <div className="overflow-x-auto" id={tableId} data-select-scope={bulkId}>
          <table className={cn(tableClass, "max-lg:block")}>
            <thead className="max-lg:hidden">
              <tr>
                <th className={cn(thClass, "sticky left-0 z-10 w-8 bg-[#f9fafb]")}>{done ? null : <SelectAll scope={bulkId} label="" className="inline-flex" />}</th>
                <th className={thClass}>
                  <SortHeader table={tableId} attr="name" label="Sản phẩm" />
                </th>
                <th className={thClass}>
                  <SortHeader table={tableId} attr="qty" label="SL" numeric />
                </th>
                <th className={thClass}>
                  <SortHeader table={tableId} attr="srcname" label="Mua ở / cửa hàng" />
                </th>
                <th className={thClass}>
                  <SortHeader table={tableId} attr="expiry" label="HSD" />
                </th>
                <th className={thClass}>
                  <SortHeader table={tableId} attr="bought" label="Ngày mua" />
                </th>
                <th className={thClass}>
                  <SortHeader table={tableId} attr="unit" label="¥/đv" numeric />
                </th>
                <th className={thClass}>
                  <SortHeader table={tableId} attr="statusidx" label="Trạng thái" numeric />
                </th>
                <th className={thClass}>
                  <SortHeader table={tableId} attr="bill" label="Bill" />
                </th>
              </tr>
            </thead>
            <tbody className="max-lg:grid max-lg:grid-cols-1 max-lg:gap-3 md:max-lg:grid-cols-2">
              {rows.length === 0 ? (
                <tr className="max-lg:block">
                  <td colSpan={9} className={`${tdClass} text-center text-lien-muted`}>
                    Đợt chưa có gì — nhập bill hoặc bấm “+ Thêm sản phẩm” ở thanh dưới.
                  </td>
                </tr>
              ) : null}
              {rows.map((r) => (r.kind === "line" ? <LineRow key={r.key} l={r.line} {...ctx} /> : r.kind === "lot" ? <LotRow key={r.key} l={r.lot} {...ctx} /> : <StockRow key={r.key} s={r.stock} {...ctx} />))}
              {done ? null : (
                <tr className="hidden bg-[#fffbeb] align-top [&:not(.hidden)]:max-lg:block" data-add-row={b.id} data-testid={`add-row-${b.id}`}>
                  <td className={cn(tdClass, TD, STICKY_L, "w-8 !bg-[#fffbeb]")} />
                  <td className={cn(tdClass, TD, "min-w-[220px]")}>
                    <span className="mb-1 block text-[11px] font-semibold uppercase text-lien-muted">Sản phẩm đã mua</span>
                    <ProductSearchSelect products={products} form={addId} placeholder="Gõ tên Việt / Nhật hoặc SKU…" />
                  </td>
                  <td className={cn(tdClass, TD, LBL)} data-label="SL">
                    <input name="qty" form={addId} inputMode="numeric" required placeholder="SL" className={cn(adminInput, cell, "!w-14 !text-center")} aria-label="Số lượng mua" />
                  </td>
                  <td className={cn(tdClass, TD, LBL)} data-label="Mua ở">
                    <div className="grid w-[150px] gap-1">
                      <select name="sourceKey" form={addId} defaultValue={b.sourceKey} className={cn(adminInput, cell, "!w-full")} aria-label="Mua ở">
                        {sources.map((x) => (
                          <option key={x.key} value={x.key}>
                            {x.name}
                          </option>
                        ))}
                      </select>
                      <input name="note" form={addId} maxLength={200} placeholder="cửa hàng / chi nhánh…" className={cn(adminInput, cell, "!w-full !text-[12px]")} aria-label="Cửa hàng" />
                    </div>
                  </td>
                  <td className={cn(tdClass, TD, LBL)} data-label="HSD">
                    <input name="expiry" form={addId} placeholder="03/2027" className={cn(adminInput, cell, "!w-[112px]")} aria-label="Hạn dùng" />
                  </td>
                  <td className={cn(tdClass, TD, LBL)} data-label="Ngày mua">
                    <input name="boughtAt" form={addId} defaultValue={b.boughtAt ?? todayIso()} className={cn(adminInput, cell, "!w-[112px]")} aria-label="Ngày mua" />
                  </td>
                  <td className={cn(tdClass, TD, LBL)} data-label="¥/đv">
                    <input name="unitCostJpy" form={addId} inputMode="numeric" placeholder="¥/đv" className={cn(adminInput, cell, "!w-[84px]")} aria-label="Giá ¥ mỗi đơn vị" />
                  </td>
                  <td className={cn(tdClass, TD, LBL, "text-[12px] text-lien-muted")} data-label="Trạng thái">
                    {BATCH_STAGES.find((x) => x.key === b.status)?.label ?? "theo trạng thái đợt"}
                  </td>
                  <td className={cn(tdClass, TD, LBL)} data-label="Bill">
                    <div className="grid w-[170px] gap-1">
                      <select name="billId" form={addId} defaultValue={b.receipts[0]?.id ?? "new"} className={cn(adminInput, cell, "!w-full font-mono !text-[12px]")} aria-label="Bill" title="Bill đã trả tiền món này; “+ bill mới” tự tạo theo nơi mua / ngày mua">
                        {b.receipts.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.code}
                          </option>
                        ))}
                        <option value="new">+ bill mới</option>
                        <option value="">không gắn bill</option>
                      </select>
                      <button type="submit" form={addId} className={cn(btnPrimary, "!py-1 !text-[13px]")}>
                        + Thêm vào đợt
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
            {rows.length ? (
              <tfoot className="max-lg:hidden">
                <tr className="bg-[#f9fafb] text-[13px] font-semibold text-lien-heading" data-testid={`totals-${b.id}`}>
                  <td className={tdClass} />
                  <td className={tdClass}>
                    Tổng cộng <span className="font-normal text-lien-muted">(theo dòng đang hiện)</span> · <span data-total="rows">{rows.length}</span> dòng
                  </td>
                  <td className={tdClass}>
                    <span data-total="units">{sumUnits}</span>
                  </td>
                  <td className={tdClass} colSpan={3} />
                  <td className={tdClass}>
                    <span data-total="jpy">{sumJpy !== null ? `¥${formatAmount(sumJpy)}` : "—"}</span>
                  </td>
                  <td className={tdClass} colSpan={2} />
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>


      </Card>
    </div>
  );
}

/** Bills of the batch: the numbered paper trail — photos attach here; new bills by pasting text or as an empty bill for photos. */
function BillsBlock({ b, sources, done, open }: { b: PurchaseBatch; sources: PurchaseSource[]; done: boolean; open: boolean }) {
  const tabField = <input type="hidden" name="fromTab" value="batches" />;
  return (
    <details className="mb-2" data-testid={`bills-${b.id}`} open={open || b.receipts.some((r) => r.status === "draft")}>
      <summary className={cn(btnSecondary, "ml-auto flex w-fit cursor-pointer list-none !py-1 !text-[13px]")} title="Danh sách bill của đợt, nhập bill mới, đính kèm ảnh">
        <Fa name="file-text-o" /> Bill ({b.receipts.length})
        {done ? null : <span className="text-lien-muted">· nhập bill / ảnh</span>}
      </summary>
      <div className="mt-2 grid gap-3 rounded-md border border-[#e5e7eb] bg-white px-3 py-3 lg:grid-cols-[minmax(0,1fr)_360px]">
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
            <details className="rounded-md border border-dashed border-[#d1d5db] p-2" data-testid={`bill-import-${b.id}`}>
              <summary className="cursor-pointer text-[12px] font-semibold text-lien-heading">
                Nhập nhanh nhiều bill <span className="font-normal text-lien-muted">— dán danh sách, mỗi dòng một bill</span>
              </summary>
              <form action={importBillsAction} className="mt-2 grid gap-2">
                <input type="hidden" name="batchId" value={b.id} />
                <textarea name="bills" rows={7} placeholder={"@ OS Drug Store\nBILL-260927-1113 | 船橋店 | パブロンゴールドA錠 | ¥1,518 PayPay\n@ Sugi drug store\nBILL-260927-1530 | 船橋駅南店 | サンデーケア ×2 + ... | ¥10,919"} className={cn(adminInput, "!mb-0 font-mono !text-[12px]")} aria-label="Danh sách bill" />
                <p className="m-0 text-[11px] leading-4 text-lien-muted">Dòng “@ Tên nguồn” đặt nơi mua cho các dòng dưới (nguồn chưa có sẽ được tạo). Mỗi bill: mã | cửa hàng | nội dung | tổng (tab hoặc | ngăn cách; ngày lấy từ mã BILL-yymmdd-…). Mã đã có thì bỏ qua.</p>
                <button type="submit" className={cn(btnSecondary, "justify-self-start !py-1 !text-[13px]")}>
                  Tạo các bill trong danh sách
                </button>
              </form>
            </details>
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
        <form action={renameBillAction} className="inline-flex items-center gap-1" data-testid={`bill-rename-${r.id}`}>
          <input type="hidden" name="batchId" value={b.id} />
          <input type="hidden" name="receiptId" value={r.id} />
          <input name="code" defaultValue={r.code} maxLength={60} className={cn(adminInput, "!mb-0 !w-[190px] !py-0.5 font-mono !text-[12px] font-semibold")} aria-label="Mã bill" title="Mã bill của cửa hàng (vd BILL_260927_1454 giống tên ảnh)" />
          <button type="submit" className={cn(btnSecondary, "!px-2 !py-0.5 !text-[11px]")} title="Đổi mã bill">
            Đổi mã
          </button>
        </form>
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
  billCell: (name: string, code: string, receiptId: number | null) => ReactNode;
  sources: PurchaseSource[];
  products: PickableProduct[];
  searchOf: (productId: number, name: string, sku: string | null) => string;
  /** Customer name per order id (order lines of this batch). */
  customerByOrder: Map<string, string>;
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

/** "Mua ở" cell: source select with the store / note line under it (both saved by the red bar). */
function SourceCell({ p, saveId, sourceKey, note, label, srcSelect, ro, sources }: { p: string; saveId: string; sourceKey: string; note: string; label: string; srcSelect: RowCtx["srcSelect"]; ro: boolean; sources: PurchaseSource[] }) {
  if (ro)
    return (
      <span className="text-[12px]">
        {purchaseSourceName(sourceKey, sources)}
        {note ? <span className="block text-lien-muted">{note}</span> : null}
      </span>
    );
  return (
    <div className="grid w-[150px] gap-1">
      {srcSelect(`${p}sourceKey`, sourceKey, label)}
      <input name={`${p}note`} form={saveId} defaultValue={note} placeholder="cửa hàng / chi nhánh…" className={cn(adminInput, cell, "!w-full !text-[12px]")} aria-label="Cửa hàng" title="Cửa hàng / chi nhánh đã mua (ghi chú của dòng)" />
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

const dateCell = (name: string, saveId: string, value: string | null, placeholder: string, label: string, ro: boolean) =>
  ro ? <span className="text-[12px]">{value ? formatDate(value) : "—"}</span> : <input name={name} form={saveId} defaultValue={value ?? ""} placeholder={placeholder} className={cn(adminInput, cell, "!w-[112px]")} aria-label={label} />;
const jpyCell = (name: string, saveId: string, value: number | null, ro: boolean) =>
  ro ? <span className="text-[12px]">{value ? `¥${formatAmount(value)}` : "—"}</span> : <input name={name} form={saveId} inputMode="numeric" defaultValue={value ?? ""} placeholder="¥/đv" className={cn(adminInput, cell, "!w-[84px]")} aria-label="Giá ¥ mỗi đơn vị" />;

/** A customer's order line bought in this batch: source, HSD / date / ¥ (profit per order), status, bill. */
function LineRow({ l, b, done, bulkId, saveId, srcSelect, billCell, sources, searchOf }: { l: PurchaseBatchLine } & RowCtx) {
  const p = `l_${l.itemId}_`;
  return (
    <tr className={ROW} data-testid={`bline-${l.itemId}`} data-brow="1" data-kind="line" data-search={searchOf(l.productId, l.productName, l.productSku)} data-name={l.productName} data-product={l.productId} data-order={l.orderNumber} data-customer={l.customerName} data-src={l.sourceKey} data-srcname={purchaseSourceName(l.sourceKey, sources)} data-status={l.purchaseStatus} data-statusidx={purchaseIndex(l.purchaseStatus)} data-expiry={l.expiry ?? ""} data-bought={l.boughtAt ?? ""} data-unit={l.costJpy ?? ""} data-bill={l.receiptCode || "—"} data-qty={l.quantity} data-jpy={(l.costJpy ?? 0) * l.quantity}>
      <td className={cn(tdClass, TD, STICKY_L, "w-8 max-lg:float-right")}>{done ? null : <input type="checkbox" name="ids" value={l.itemId} form={bulkId} className="h-4 w-4" aria-label={`Chọn dòng đơn #${l.orderNumber}`} />}</td>
      <td className={cn(tdClass, TD, "min-w-[220px] max-w-[300px]")}>
        <ProductCell
          productId={l.productId}
          name={l.productName}
          sku={l.productSku}
          thumb={l.productThumb}
          badge={
            <Link href={`/admin/orders/${l.orderId}/`} className="rounded bg-[#eef2ff] px-1.5 py-0.5 font-semibold text-[#3730a3] no-underline hover:underline" title={l.customerName}>
              Đơn #{l.orderNumber} · {l.customerName}
            </Link>
          }
        />
      </td>
      <td className={cn(tdClass, TD, LBL, "font-semibold")} data-label="SL">
        {l.quantity}
      </td>
      <td className={cn(tdClass, TD, LBL)} data-label="Mua ở">
        <SourceCell p={p} saveId={saveId} sourceKey={l.sourceKey} note="" label={`Nguồn dòng đơn #${l.orderNumber}`} srcSelect={srcSelect} ro={done} sources={sources} />
      </td>
      <td className={cn(tdClass, TD, LBL)} data-label="HSD">
        {dateCell(`${p}expiry`, saveId, l.expiry, "03/2027", "Hạn dùng", done)}
      </td>
      <td className={cn(tdClass, TD, LBL)} data-label="Ngày mua">
        {dateCell(`${p}boughtAt`, saveId, l.boughtAt, "2026-09-27", "Ngày mua", done)}
      </td>
      <td className={cn(tdClass, TD, LBL)} data-label="¥/đv">
        {jpyCell(`${p}costJpy`, saveId, l.costJpy, done)}
      </td>
      <td className={cn(tdClass, TD, LBL)} data-label="Trạng thái">
        {done ? <span className={cn("inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold", PURCHASE_STAGES[purchaseIndex(l.purchaseStatus)].cls)}>{PURCHASE_STAGES[purchaseIndex(l.purchaseStatus)].short}</span> : <StatusSelect name={`${p}status`} saveId={saveId} value={l.purchaseStatus} options={PURCHASE_STAGES} batchStatus={b.status} />}
      </td>
      <td className={cn(tdClass, TD, LBL)} data-label="Bill">
        {billCell(`${p}billCode`, l.receiptCode, l.receiptId)}
      </td>
    </tr>
  );
}

/** A slip not yet a lot (Chưa mua / Đã đặt mua): everything editable; "đổi sản phẩm" has its own small form. */
function StockRow({ s, b, done, bulkId, saveId, srcSelect, billCell, products, sources, searchOf, customerByOrder }: { s: PurchaseBatchStock } & RowCtx) {
  const p = `s_${s.id}_`;
  const locked = !!s.lotId;
  const note = noteBody(s.note, b.code);
  const held = s.reserved.reduce((n, r) => n + r.qty, 0);
  const ro = done || locked;
  return (
    <tr className={cn(ROW, locked && "opacity-70")} data-testid={`bstock-${s.id}`} data-brow="1" data-kind="stock" data-search={searchOf(s.productId, s.productName, s.productSku)} data-order={s.reserved.map((r) => r.orderNumber).join(" ")} data-customer={s.reserved.map((r) => customerByOrder.get(r.orderId) ?? "").join(" ")} data-name={s.productName} data-product={s.productId} data-src={s.sourceKey} data-srcname={purchaseSourceName(s.sourceKey, sources)} data-status={s.status} data-statusidx={purchaseIndex(s.status)} data-expiry={s.expiry ?? ""} data-bought={s.boughtAt ?? ""} data-unit={s.unitCostJpy ?? ""} data-bill={s.receiptCode || "—"} data-qty={s.qty} data-jpy={(s.unitCostJpy ?? 0) * s.qty}>
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
              {s.reserved.map((r) => (
                <Link key={r.orderId} href={`/admin/orders/${r.orderId}/`} className="rounded bg-[#eef2ff] px-1.5 py-0.5 text-[10px] font-semibold text-[#3730a3] no-underline hover:underline" title="Hàng mua cho đơn khách (chưa nhập kho)">
                  Hàng cho đơn #{r.orderNumber}
                  {customerByOrder.get(r.orderId) ? ` · ${customerByOrder.get(r.orderId)}` : ""} ×{r.qty}
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
        <SourceCell p={p} saveId={saveId} sourceKey={s.sourceKey} note={note} label={`Nguồn dòng #${s.id}`} srcSelect={srcSelect} ro={ro} sources={sources} />
      </td>
      <td className={cn(tdClass, TD, LBL)} data-label="HSD">
        {dateCell(`${p}expiry`, saveId, s.expiry, "03/2027", "Hạn dùng", ro)}
      </td>
      <td className={cn(tdClass, TD, LBL)} data-label="Ngày mua">
        {dateCell(`${p}boughtAt`, saveId, s.boughtAt, "2026-09-27", "Ngày mua", ro)}
      </td>
      <td className={cn(tdClass, TD, LBL)} data-label="¥/đv">
        {jpyCell(`${p}unitCostJpy`, saveId, s.unitCostJpy, ro)}
      </td>
      <td className={cn(tdClass, TD, LBL)} data-label="Trạng thái">
        {ro ? <span className={cn("inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold", PURCHASE_STAGES[purchaseIndex(s.status)].cls)}>{PURCHASE_STAGES[purchaseIndex(s.status)].short}</span> : <StatusSelect name={`${p}status`} saveId={saveId} value={s.status} options={BATCH_STAGES} batchStatus={b.status} />}
      </td>
      <td className={cn(tdClass, TD, LBL)} data-label="Bill">
        {ro ? <span className="font-mono text-[12px]">{s.receiptCode || "—"}</span> : billCell(`${p}billCode`, s.receiptCode, s.receiptId)}
      </td>
    </tr>
  );
}

/** A lot bought in this batch: unsold qty (+ paid units held), source / store, HSD, date, ¥, status (= place), bill. */
function LotRow({ l, b, done, bulkId, saveId, srcSelect, billCell, sources, searchOf, customerByOrder }: { l: LotView } & RowCtx) {
  const p = `lot_${l.id}_`;
  const status = statusForLocation(l.warehouse, l.inTransit);
  const note = noteBody(l.note, b.code);
  return (
    <tr className={ROW} data-testid={`blot-${l.id}`} data-brow="1" data-kind={l.reserved.length ? "line" : "stock"} data-search={searchOf(l.productId, l.productName, l.productSku)} data-name={l.productName} data-product={l.productId} data-order={l.reserved.map((r) => r.orderNumber).join(" ")} data-customer={l.reserved.map((r) => customerByOrder.get(r.orderId) ?? "").join(" ")} data-src={l.sourceKey} data-srcname={purchaseSourceName(l.sourceKey, sources)} data-status={status} data-statusidx={purchaseIndex(status)} data-expiry={l.expiry ?? ""} data-bought={l.boughtAt ?? l.receivedAt} data-unit={l.unitCostJpy ?? ""} data-bill={l.receiptCode || "—"} data-qty={l.physical} data-jpy={(l.unitCostJpy ?? 0) * l.physical}>
      <td className={cn(tdClass, TD, STICKY_L, "w-8 max-lg:float-right")}>{done ? null : <input type="checkbox" name="lotIds" value={l.id} form={bulkId} className="h-4 w-4" aria-label={`Chọn lô #${l.id}`} />}</td>
      <td className={cn(tdClass, TD, "min-w-[220px] max-w-[300px]")}>
        <ProductCell
          productId={l.productId}
          name={l.productName}
          sku={l.productSku}
          thumb={l.productThumb}
          badge={
            <>
              {l.reserved.map((r) => (
                <Link key={r.orderId} href={`/admin/orders/${r.orderId}/`} className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold no-underline hover:underline", r.committed ? "bg-green-100 text-green-800" : "bg-[#eef2ff] text-[#3730a3]")} title={r.committed ? "Hàng cho đơn đã thanh toán / COD — đi cùng lô" : "Hàng cho đơn (khách chưa thanh toán)"}>
                  Hàng cho đơn #{r.orderNumber}
                  {customerByOrder.get(r.orderId) ? ` · ${customerByOrder.get(r.orderId)}` : ""} ×{r.qty}
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
        <SourceCell p={p} saveId={saveId} sourceKey={l.sourceKey} note={note} label={`Nguồn lô #${l.id}`} srcSelect={srcSelect} ro={done} sources={sources} />
      </td>
      <td className={cn(tdClass, TD, LBL)} data-label="HSD">
        {dateCell(`${p}expiry`, saveId, l.expiry, "03/2027", "Hạn dùng", done)}
      </td>
      <td className={cn(tdClass, TD, LBL)} data-label="Ngày mua">
        {dateCell(`${p}boughtAt`, saveId, l.boughtAt, "2026-09-27", "Ngày mua", done)}
      </td>
      <td className={cn(tdClass, TD, LBL)} data-label="¥/đv">
        {jpyCell(`${p}unitCostJpy`, saveId, l.unitCostJpy, done)}
      </td>
      <td className={cn(tdClass, TD, LBL)} data-label="Trạng thái">
        {done ? <span className={cn("inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold", PURCHASE_STAGES[purchaseIndex(status)].cls)}>{PURCHASE_STAGES[purchaseIndex(status)].short}</span> : <StatusSelect name={`${p}status`} saveId={saveId} value={status} options={LOT_STAGES} batchStatus={b.status} />}
      </td>
      <td className={cn(tdClass, TD, LBL)} data-label="Bill">
        {billCell(`${p}billCode`, l.receiptCode, l.receiptId)}
      </td>
    </tr>
  );
}
