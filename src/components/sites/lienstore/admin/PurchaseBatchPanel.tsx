import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { setPurchaseAction } from "@/app/admin/purchases/actions";
import { addLinesToBatchAction, addProductAction, allocateSurplusAction, bulkBatchRowsAction, createBatchAction, deleteBatchAction, moveStockToBatchAction, removeLineFromBatchAction, removeSurplusAction, setBatchStatusAction, splitBatchStockAction, updateBatchAction, updateBatchStockAction } from "@/app/admin/purchases/batch-actions";
import type { PurchaseLine } from "@/lib/db";
import { formatAmount, formatDate, formatDateTime } from "@/lib/format";
import { todayIso } from "@/lib/lots";
import { PURCHASE_STAGES, purchaseIndex } from "@/lib/purchase";
import { BATCH_DONE, BATCH_STAGES, batchTotals, groupBatchByProduct } from "@/lib/purchase-batches";
import { purchaseSourceName } from "@/lib/purchase-sources";
import { cn } from "@/lib/utils";
import type { PurchaseBatch, PurchaseBatchLine, PurchaseBatchStock, PurchaseSource } from "@/types/shop";
import { ConfirmSubmit } from "./ConfirmSubmit";
import { type PickableProduct, ProductSearchSelect } from "./ProductSearchSelect";
import { adminInput, adminLabel, btnPrimary, btnSecondary, Card, tableClass, tdClass, thClass } from "./ui";

interface Props {
  batches: PurchaseBatch[];
  /** Open order lines still "Chưa mua" and not in any batch — candidates for every batch card. */
  openLines: PurchaseLine[];
  products: PickableProduct[];
  sources: PurchaseSource[];
  includeDone: boolean;
}

const cell = "!mb-0 !py-1 !text-[13px]";
const BACK = "/admin/purchases/?tab=batches";
type SrcSelect = (form: string, value: string, label: string) => ReactNode;

/**
 * Quản lý mua hàng › tab "Mua theo đợt": one card per Japan → shop shipment. Every row (order line or stock row) is
 * editable in place; stock rows can be split, and units can stay in Japan for a later batch ("giữ lại Nhật").
 */
export function PurchaseBatchPanel({ batches, openLines, products, sources, includeDone }: Props) {
  const heads = batches.filter((b) => b.status !== BATCH_DONE).map((b) => ({ id: b.id, code: b.code, label: b.label }));
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]" data-testid="batch-panel">
      <div className="space-y-5">
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

      <div className="space-y-5">
        <Card title="Mở đợt gửi mới">
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
              + Mở đợt gửi
            </button>
          </form>
        </Card>
        <Card title="Cách dùng">
          <ol className="m-0 space-y-1.5 pl-4 text-[12px] leading-5 text-lien-text">
            <li>
              <b>Thêm sản phẩm đã mua:</b> tìm theo tên, chọn <b>nơi mua</b>, nhập tổng SL, <b>HSD</b>, <b>ngày mua</b>, ¥. Tự gán cho đơn đang chờ trước (ghi chú “Tự động lấy từ mua theo đợt”), phần còn lại là hàng lưu kho.
            </li>
            <li>
              <b>Sửa từng dòng</b> ngay trong bảng (SL, nguồn, HSD, ngày mua, ¥, trạng thái, ghi chú) rồi bấm ✓; “đổi sản phẩm” nếu chọn nhầm.
            </li>
            <li>
              <b>Tách / giữ lại Nhật:</b> gõ số ở ô Tách → <i>Giữ Nhật</i> (phần đó ở lại Nhật chờ đợt sau, hiện ở nhánh “Giữ lại tại Nhật” bên dưới và trong tab Mua lưu kho) hoặc <i>Tách dòng</i> (thành dòng riêng trong đợt, ví dụ HSD khác).
            </li>
            <li>
              <b>Tick nhiều dòng</b> → Giữ Nhật / Bỏ khỏi đợt / Chuyển sang đợt khác.
            </li>
            <li>
              <b>Cập nhật cả đợt</b> một lần: Đã mua → tới ĐVVC Nhật → NB→VN → kho ĐVVC → về kho shop → <b>Tại kho</b> (hàng lưu kho thành lô: HSD, ngày mua, nguồn, ¥ đi theo lô).
            </li>
            <li>
              <b>Nhập bill:</b> khung “Phiếu mua hàng · nhập bill” bên dưới, chọn “Đưa vào đợt”.
            </li>
          </ol>
        </Card>
      </div>
    </div>
  );
}

type Row = { kind: "line"; key: string; name: string; line: PurchaseBatchLine } | { kind: "stock"; key: string; name: string; stock: PurchaseBatchStock };

function BatchCard({ batch: b, heads, openLines, products, sources }: { batch: PurchaseBatch; heads: Array<{ id: number; code: string; label: string }>; openLines: PurchaseLine[]; products: PickableProduct[]; sources: PurchaseSource[] }) {
  const st = PURCHASE_STAGES[purchaseIndex(b.status)];
  const stage = BATCH_STAGES.find((s) => s.key === b.status) ?? BATCH_STAGES[0];
  const totals = batchTotals(b.lines, b.stock);
  const grouped = groupBatchByProduct(b.lines, b.stock);
  const done = b.status === BATCH_DONE;
  const hasLots = b.stock.some((s) => s.lotId);
  const surplusByProduct = new Map<number, number>();
  for (const s of b.stock) if (!s.lotId) surplusByProduct.set(s.productId, (surplusByProduct.get(s.productId) ?? 0) + s.qty);
  const addFormId = `bl-${b.id}`;
  const bulkId = `bb-${b.id}`;
  const stockById = new Map(products.map((p) => [p.id, p.stock]));
  const waiting = b.held.filter((h) => !h.batchId);
  // one editable row per order line / stock row, grouped by product name (order lines first)
  const rows: Row[] = [...b.lines.map((l): Row => ({ kind: "line", key: `l-${l.itemId}`, name: l.productName, line: l })), ...b.stock.map((s): Row => ({ kind: "stock", key: `s-${s.id}`, name: s.productName, stock: s }))].sort((x, y) => x.name.localeCompare(y.name, "vi") || (x.kind === y.kind ? 0 : x.kind === "line" ? -1 : 1));
  const srcSelect: SrcSelect = (form, value, label) => (
    <select name="sourceKey" form={form} defaultValue={value} className={cn(adminInput, cell, "!w-[130px]")} aria-label={label}>
      {!value ? <option value="">— nguồn —</option> : null}
      {sources.map((s) => (
        <option key={s.key} value={s.key}>
          {s.name}
        </option>
      ))}
    </select>
  );
  return (
    <div id={`batch-${b.id}`} data-testid={`batch-${b.id}`}>
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

        <form action={setBatchStatusAction} className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-[#e5e7eb] bg-[#f9fafb] px-3 py-2 text-[13px]">
          <input type="hidden" name="batchId" value={b.id} />
          <span className="font-semibold text-lien-heading">Cả đợt →</span>
          <select name="status" defaultValue={b.status} className={cn(adminInput, cell, "!w-auto")} aria-label="Trạng thái cả đợt">
            {BATCH_STAGES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          <button type="submit" className={cn(btnPrimary, "!py-1")}>
            Cập nhật cả đợt
          </button>
          <span className="text-lien-muted">{done ? "Đợt đã về kho — hàng lưu kho đã thành lô." : "Mọi dòng trong đợt chuyển theo; tới “Tại kho” → hàng lưu kho nhập kho thành lô."}</span>
        </form>

        {/* bulk bar: the checkboxes in the table attach to this (empty) form */}
        <form id={bulkId} action={bulkBatchRowsAction}>
          <input type="hidden" name="batchId" value={b.id} />
        </form>
        {done ? null : (
          <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-[#e5e7eb] bg-[#f9fafb] px-3 py-2 text-[13px]">
            <span className="font-semibold text-lien-heading">Các dòng đã tick →</span>
            <button type="submit" form={bulkId} name="op" value="hold" className={cn(btnSecondary, "!py-1")} title="Hàng lưu kho ở lại Nhật chờ đợt sau; dòng đơn rời đợt (giữ trạng thái)">
              Giữ lại Nhật (chờ đợt sau)
            </button>
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

        <div className="overflow-x-auto">
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass} />
                <th className={thClass}>Sản phẩm</th>
                <th className={thClass}>Cho</th>
                <th className={thClass}>SL</th>
                <th className={thClass}>Mua ở</th>
                <th className={thClass}>HSD</th>
                <th className={thClass}>Ngày mua</th>
                <th className={thClass}>¥/đv</th>
                <th className={thClass}>Trạng thái</th>
                <th className={thClass}>Ghi chú</th>
                <th className={thClass} />
                <th className={thClass}>Tách</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={12} className={`${tdClass} text-center text-lien-muted`}>
                    Đợt chưa có gì — thêm sản phẩm đã mua ở khung bên dưới.
                  </td>
                </tr>
              ) : null}
              {rows.map((r) =>
                r.kind === "line" ? (
                  <LineRow key={r.key} b={b} l={r.line} done={done} bulkId={bulkId} srcSelect={srcSelect} />
                ) : (
                  <StockRow key={r.key} b={b} s={r.stock} done={done} bulkId={bulkId} srcSelect={srcSelect} products={products} sources={sources} stock={stockById.get(r.stock.productId) ?? null} />
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
                  <tr key={h.id} className="text-[13px]">
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
            <form action={addProductAction} className="mt-3 grid gap-2 rounded-md border border-dashed border-[#d1d5db] bg-white px-3 py-2 md:grid-cols-[minmax(240px,1fr)_150px_70px_120px_120px_100px_1fr_auto] md:items-end" data-testid={`surplus-${b.id}`}>
              <input type="hidden" name="batchId" value={b.id} />
              <div className="md:col-span-8 -mb-1 text-[12px] text-lien-muted">
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
          <form action={updateBatchAction} className="mt-2 grid gap-2 md:grid-cols-[1fr_160px_120px_160px_1fr_auto] md:items-end">
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

function ProductCell({ productId, name, sku, thumb, sub }: { productId: number; name: string; sku: string | null; thumb: string; sub?: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      {thumb ? <Image src={thumb} alt="" width={32} height={32} unoptimized className="h-8 w-8 shrink-0 rounded border border-[#e5e7eb] object-contain" /> : null}
      <span className="flex min-w-0 flex-col leading-4">
        <Link href={`/admin/inventory/lots/${productId}/`} className="text-[13px] font-semibold text-lien-heading hover:text-lien-blue">
          {name}
        </Link>
        <span className="text-[11px] text-lien-muted">
          #{productId}
          {sku ? ` · ${sku}` : ""}
        </span>
        {sub}
      </span>
    </div>
  );
}

function LineRow({ b, l, done, bulkId, srcSelect }: { b: PurchaseBatch; l: PurchaseBatchLine; done: boolean; bulkId: string; srcSelect: SrcSelect }) {
  const fid = `pl-${l.itemId}`;
  const ls = PURCHASE_STAGES[purchaseIndex(l.purchaseStatus)];
  return (
    <tr className="align-top hover:bg-[#fafafa]" data-testid={`bline-${l.itemId}`}>
      <td className={`${tdClass} w-8`}>{done ? null : <input type="checkbox" name="ids" value={l.itemId} form={bulkId} className="h-4 w-4" aria-label={`Chọn dòng đơn #${l.orderNumber}`} />}</td>
      <td className={`${tdClass} min-w-[200px]`}>
        <ProductCell productId={l.productId} name={l.productName} sku={l.productSku} thumb={l.productThumb} />
      </td>
      <td className={`${tdClass} whitespace-nowrap text-[12px]`}>
        <Link href={`/admin/orders/${l.orderId}/`} className="font-semibold text-lien-blue hover:underline">
          Đơn #{l.orderNumber}
        </Link>
        <span className="block text-lien-muted" title={l.customerName}>
          {l.customerName}
        </span>
      </td>
      <td className={`${tdClass} font-semibold`}>{l.quantity}</td>
      <td className={tdClass}>{srcSelect(fid, l.sourceKey, `Nguồn dòng đơn #${l.orderNumber}`)}</td>
      <td className={`${tdClass} text-lien-muted`}>—</td>
      <td className={`${tdClass} text-lien-muted`}>—</td>
      <td className={`${tdClass} whitespace-nowrap text-[12px] text-lien-muted`}>{l.costJpy ? `¥${formatAmount(l.costJpy)}` : "—"}</td>
      <td className={tdClass}>
        <select name="status" form={fid} defaultValue={l.purchaseStatus} className={cn(adminInput, cell, "!w-auto")} aria-label="Trạng thái dòng đơn">
          {PURCHASE_STAGES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <span className={cn("mt-1 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold", ls.cls)}>{ls.short}</span>
      </td>
      <td className={tdClass}>
        <input name="note" form={fid} defaultValue="" placeholder="ghi chú…" className={cn(adminInput, cell, "!w-[140px]")} aria-label="Ghi chú" />
      </td>
      <td className={`${tdClass} whitespace-nowrap`}>
        <button type="submit" form={fid} className={cn(btnSecondary, "!px-2 !py-1")} title="Lưu dòng này">
          ✓
        </button>
        {done ? null : (
          <form action={removeLineFromBatchAction} className="ml-1 inline">
            <input type="hidden" name="batchId" value={b.id} />
            <input type="hidden" name="itemId" value={l.itemId} />
            <button type="submit" className="text-lien-muted hover:text-lien-heart" title="Bỏ khỏi đợt (giữ trạng thái)" aria-label="Bỏ khỏi đợt">
              ✕
            </button>
          </form>
        )}
      </td>
      <td className={`${tdClass} text-[12px] text-lien-muted`}>—</td>
    </tr>
  );
}

function StockRow({ b, s, done, bulkId, srcSelect, products, sources, stock }: { b: PurchaseBatch; s: PurchaseBatchStock; done: boolean; bulkId: string; srcSelect: SrcSelect; products: PickableProduct[]; sources: PurchaseSource[]; stock: number | null }) {
  const fid = `bs-${s.id}`;
  const sid = `sp-${s.id}`;
  const ss = PURCHASE_STAGES[purchaseIndex(s.status)];
  const locked = !!s.lotId;
  return (
    <tr className={cn("align-top hover:bg-[#fafafa]", locked && "opacity-70")} data-testid={`bstock-${s.id}`}>
      <td className={`${tdClass} w-8`}>{done || locked ? null : <input type="checkbox" name="sids" value={s.id} form={bulkId} className="h-4 w-4" aria-label={`Chọn dòng lưu kho #${s.id}`} />}</td>
      <td className={`${tdClass} min-w-[200px]`}>
        <ProductCell
          productId={s.productId}
          name={s.productName}
          sku={s.productSku}
          thumb={s.productThumb}
          sub={
            locked ? null : (
              <details className="text-[11px]">
                <summary className="cursor-pointer text-lien-blue">đổi sản phẩm</summary>
                <form action={updateBatchStockAction} className="mt-1 flex w-[260px] flex-col gap-1">
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
        />
      </td>
      <td className={`${tdClass} whitespace-nowrap text-[12px]`}>
        <span className="rounded bg-[#eef2ff] px-1.5 py-0.5 font-semibold text-[#3730a3]">Lưu kho</span>
        <span className="block text-lien-muted">phiếu #{s.id}</span>
        {s.originBatchId && s.originBatchId !== b.id ? <span className="block text-lien-muted">từ đợt trước</span> : null}
        {stock !== null ? <span className="block text-lien-muted">tồn {stock}</span> : null}
      </td>
      <td className={tdClass}>{locked ? <span className="font-semibold">{s.qty}</span> : <input name="qty" form={fid} inputMode="numeric" defaultValue={s.qty} className={cn(adminInput, cell, "!w-[56px] !text-center")} aria-label="Số lượng" />}</td>
      <td className={tdClass}>{locked ? <span className="text-[12px]">{purchaseSourceName(s.sourceKey, sources)}</span> : srcSelect(fid, s.sourceKey, `Nguồn dòng #${s.id}`)}</td>
      <td className={tdClass}>{locked ? <span className="text-[12px]">{s.expiry ? formatDate(s.expiry) : "—"}</span> : <input name="expiry" form={fid} defaultValue={s.expiry ?? ""} placeholder="03/2027" className={cn(adminInput, cell, "!w-[96px]")} aria-label="Hạn dùng" />}</td>
      <td className={tdClass}>{locked ? <span className="text-[12px]">{s.boughtAt ? formatDate(s.boughtAt) : "—"}</span> : <input name="boughtAt" form={fid} defaultValue={s.boughtAt ?? ""} placeholder="2026-09-27" className={cn(adminInput, cell, "!w-[104px]")} aria-label="Ngày mua" />}</td>
      <td className={tdClass}>{locked ? <span className="text-[12px]">{s.unitCostJpy ? `¥${formatAmount(s.unitCostJpy)}` : "—"}</span> : <input name="unitCostJpy" form={fid} inputMode="numeric" defaultValue={s.unitCostJpy ?? ""} placeholder="¥" className={cn(adminInput, cell, "!w-[80px]")} aria-label="Giá ¥ mỗi đơn vị" />}</td>
      <td className={tdClass}>
        {locked ? (
          <Link href={`/admin/inventory/lots/${s.productId}/`} className="inline-block rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-800 no-underline hover:bg-green-200">
            Đã nhập kho · lô #{s.lotId}
          </Link>
        ) : (
          <>
            <select name="status" form={fid} defaultValue={s.status} className={cn(adminInput, cell, "!w-auto")} aria-label="Trạng thái dòng lưu kho">
              {BATCH_STAGES.map((x) => (
                <option key={x.key} value={x.key}>
                  {x.label}
                </option>
              ))}
            </select>
            <span className={cn("mt-1 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold", ss.cls)}>{ss.short}</span>
          </>
        )}
      </td>
      <td className={tdClass}>{locked ? <span className="text-[12px] text-lien-muted">{s.note || "—"}</span> : <input name="note" form={fid} defaultValue={s.note} className={cn(adminInput, cell, "!w-[140px]")} aria-label="Ghi chú" />}</td>
      <td className={`${tdClass} whitespace-nowrap`}>
        {locked ? null : (
          <>
            <button type="submit" form={fid} className={cn(btnSecondary, "!px-2 !py-1")} title="Lưu dòng này">
              ✓
            </button>
            <form action={removeSurplusAction} className="ml-1 inline">
              <input type="hidden" name="batchId" value={b.id} />
              <input type="hidden" name="stockPurchaseId" value={s.id} />
              <button type="submit" className="text-lien-muted hover:text-lien-heart" title="Bỏ dòng lưu kho (xoá phiếu)" aria-label="Bỏ dòng">
                ✕
              </button>
            </form>
          </>
        )}
      </td>
      <td className={`${tdClass} whitespace-nowrap`}>
        {locked || s.qty < 2 ? (
          <span className="text-[12px] text-lien-muted">—</span>
        ) : (
          <span className="inline-flex items-center gap-1">
            <input name="splitQty" form={sid} inputMode="numeric" placeholder="SL" className={cn(adminInput, cell, "!w-[48px] !text-center")} aria-label="Số đơn vị tách" />
            <button type="submit" form={sid} name="mode" value="hold" className={cn(btnSecondary, "!px-1.5 !py-1 !text-[11px]")} title="Phần này ở lại Nhật, chờ đợt sau">
              Giữ Nhật
            </button>
            <button type="submit" form={sid} name="mode" value="split" className={cn(btnSecondary, "!px-1.5 !py-1 !text-[11px]")} title="Tách thành dòng riêng trong đợt (HSD / nguồn khác)">
              Tách dòng
            </button>
          </span>
        )}
      </td>
    </tr>
  );
}
