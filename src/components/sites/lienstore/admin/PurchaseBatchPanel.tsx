import Image from "next/image";
import Link from "next/link";
import { addLinesToBatchAction, addProductAction, allocateSurplusAction, createBatchAction, deleteBatchAction, removeLineFromBatchAction, removeSurplusAction, setBatchStatusAction, updateBatchAction } from "@/app/admin/purchases/batch-actions";
import type { PurchaseLine } from "@/lib/db";
import { formatAmount, formatDate, formatDateTime } from "@/lib/format";
import { todayIso } from "@/lib/lots";
import { PURCHASE_STAGES, purchaseIndex } from "@/lib/purchase";
import { BATCH_DONE, BATCH_STAGES, batchTotals, groupBatchByProduct } from "@/lib/purchase-batches";
import { purchaseSourceName } from "@/lib/purchase-sources";
import { cn } from "@/lib/utils";
import type { PurchaseBatch, PurchaseSource } from "@/types/shop";
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

const compact = "!mb-0 !w-auto !py-1 !text-[13px]";

/**
 * Quản lý mua hàng › tab "Đợt gửi": one card per Japan → shop shipment. A batch carries order lines and surplus bought
 * for stock together; one status change moves everything, and the surplus becomes lots (expiry + purchase date) at the shop.
 */
export function PurchaseBatchPanel({ batches, openLines, products, sources, includeDone }: Props) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]" data-testid="batch-panel">
      <div className="space-y-5">
        {batches.length === 0 ? (
          <Card>
            <p className="m-0 text-[13px] text-lien-muted">Chưa có đợt nào. Mở đợt ở khung bên phải, rồi thêm các sản phẩm đã mua (tìm theo tên, mỗi dòng một hạn dùng) — hệ thống tự gán cho đơn đang chờ trước, phần còn lại lưu kho.</p>
          </Card>
        ) : null}
        {batches.map((b) => (
          <BatchCard key={b.id} batch={b} openLines={openLines} products={products} sources={sources} />
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
                  Mua ở
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
              <b>Thêm sản phẩm đã mua:</b> tìm theo tên, nhập tổng SL, <b>HSD</b>, <b>ngày mua</b>, ¥. Cùng sản phẩm mà khác HSD → thêm nhiều dòng. Hệ thống tự gán cho các đơn đang chờ (ghi chú “Tự động lấy từ mua theo đợt”), phần còn lại là hàng lưu kho.
            </li>
            <li>
              <b>Nhập bill:</b> khung “Phiếu mua hàng · nhập bill” bên dưới, chọn “Đưa vào đợt” → cả bill vào đợt, cũng tự gán đơn trước.
            </li>
            <li>
              <b>Gán tay:</b> tick dòng “Chưa mua” rồi <i>Thêm vào đợt</i> (hoặc từ tab Mua theo đặt hàng → “Thêm vào đợt”).
            </li>
            <li>
              <b>Cập nhật cả đợt</b> một lần: Đã mua → tới ĐVVC Nhật → NB→VN → kho ĐVVC → về kho shop → <b>Tại kho</b>. Mọi dòng đơn và hàng dư đi theo.
            </li>
            <li>
              Tới <b>Tại kho</b>: hàng dư tự thành <b>lô</b> trong Kho hàng (HSD, ngày mua, nguồn, ¥ đi theo lô); tồn kho tăng, bán dần theo hạn gần trước.
            </li>
            <li>
              Khách đặt khi đợt còn trên đường: đơn mới <b>tự lấy</b> từ hàng lưu kho của đợt (ghi chú “Tự động lấy từ mua theo đợt”); nếu chưa gán, bấm <b>Lấy từ đợt</b> ở dòng đơn.
            </li>
          </ol>
        </Card>
      </div>
    </div>
  );
}

function BatchCard({ batch: b, openLines, products, sources }: { batch: PurchaseBatch; openLines: PurchaseLine[]; products: PickableProduct[]; sources: PurchaseSource[] }) {
  const st = PURCHASE_STAGES[purchaseIndex(b.status)];
  const stage = BATCH_STAGES.find((s) => s.key === b.status) ?? BATCH_STAGES[0];
  const totals = batchTotals(b.lines, b.stock);
  const rows = groupBatchByProduct(b.lines, b.stock);
  const done = b.status === BATCH_DONE;
  const hasLots = b.stock.some((s) => s.lotId);
  // surplus still unbooked per product → "Lấy từ hàng dư" for new lines of that product
  const surplusByProduct = new Map<number, number>();
  for (const s of b.stock) if (!s.lotId) surplusByProduct.set(s.productId, (surplusByProduct.get(s.productId) ?? 0) + s.qty);
  const addFormId = `bl-${b.id}`;
  const stockById = new Map(products.map((p) => [p.id, p.stock]));
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
                <ConfirmSubmit message={`Xoá đợt ${b.code}? Dòng đơn giữ trạng thái, dòng mua dư bị bỏ.`} className="text-[12px] text-lien-heart hover:underline">
                  Xoá đợt
                </ConfirmSubmit>
              </form>
            )}
          </span>
        }
      >
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-lien-muted">
          <span>
            Mua ở <b className="text-lien-heading">{purchaseSourceName(b.sourceKey, sources)}</b>
          </span>
          <span>· ngày mua {b.boughtAt ? formatDate(b.boughtAt) : "—"}</span>
          <span>· gửi NB→VN {b.shippedAt ? formatDate(b.shippedAt) : "—"}</span>
          {b.tracking ? <span>· tracking {b.tracking}</span> : null}
          <span className="ml-auto text-lien-heading">
            theo đặt hàng <b>{totals.orderUnits}</b> đv · lưu kho <b>{totals.stockUnits}</b> đv · tổng <b>{totals.units}</b> đv{totals.jpy !== null ? ` · ≈ ¥${formatAmount(totals.jpy)}` : ""}
          </span>
        </div>

        <form action={setBatchStatusAction} className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-[#e5e7eb] bg-[#f9fafb] px-3 py-2 text-[13px]">
          <input type="hidden" name="batchId" value={b.id} />
          <span className="font-semibold text-lien-heading">Cả đợt →</span>
          <select name="status" defaultValue={b.status} className={cn(adminInput, compact)} aria-label="Trạng thái cả đợt">
            {BATCH_STAGES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          <button type="submit" className={cn(btnPrimary, "!py-1")}>
            Cập nhật cả đợt
          </button>
          <span className="text-lien-muted">{done ? "Đợt đã về kho — hàng dư đã thành lô." : "Mọi dòng đơn và hàng dư trong đợt chuyển theo; tới “Tại kho” → hàng dư nhập kho thành lô."}</span>
        </form>

        <div className="overflow-x-auto">
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>Sản phẩm</th>
                <th className={thClass}>Theo đặt hàng</th>
                <th className={thClass}>Lưu kho (từng HSD)</th>
                <th className={thClass}>Tổng mua</th>
                <th className={thClass}>Tồn hiện tại</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className={`${tdClass} text-center text-lien-muted`}>
                    Đợt chưa có gì — thêm sản phẩm đã mua ở khung bên dưới.
                  </td>
                </tr>
              ) : null}
              {rows.map((r) => (
                <tr key={r.productId} className="align-top hover:bg-[#fafafa]">
                  <td className={`${tdClass} min-w-[220px]`}>
                    <div className="flex items-center gap-2">
                      {r.thumb ? <Image src={r.thumb} alt="" width={36} height={36} unoptimized className="h-9 w-9 shrink-0 rounded border border-[#e5e7eb] object-contain" /> : null}
                      <span className="flex min-w-0 flex-col leading-4">
                        <Link href={`/admin/inventory/lots/${r.productId}/`} className="text-[13px] font-semibold text-lien-heading hover:text-lien-blue">
                          {r.name}
                        </Link>
                        <span className="text-[12px] text-lien-muted">
                          #{r.productId}
                          {r.sku ? ` · ${r.sku}` : ""}
                        </span>
                      </span>
                    </div>
                  </td>
                  <td className={`${tdClass} text-[12px]`}>
                    {r.lines.length === 0 ? <span className="text-lien-muted">—</span> : null}
                    {r.lines.map((l) => {
                      const ls = PURCHASE_STAGES[purchaseIndex(l.purchaseStatus)];
                      return (
                        <div key={l.itemId} className="flex items-center gap-1.5 whitespace-nowrap py-0.5">
                          <Link href={`/admin/orders/${l.orderId}/`} className="font-semibold text-lien-blue hover:underline">
                            #{l.orderNumber}
                          </Link>
                          <span>×{l.quantity}</span>
                          <span className="truncate text-lien-muted" title={l.customerName}>
                            {l.customerName}
                          </span>
                          <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", ls.cls)} title={ls.label}>
                            {ls.short}
                          </span>
                          {done ? null : (
                            <form action={removeLineFromBatchAction} className="inline">
                              <input type="hidden" name="batchId" value={b.id} />
                              <input type="hidden" name="itemId" value={l.itemId} />
                              <button type="submit" className="text-lien-muted hover:text-lien-heart" title="Bỏ khỏi đợt" aria-label={`Bỏ dòng #${l.orderNumber} khỏi đợt`}>
                                ✕
                              </button>
                            </form>
                          )}
                        </div>
                      );
                    })}
                    {r.orderUnits ? <div className="mt-0.5 font-semibold text-lien-heading">= {r.orderUnits} đv</div> : null}
                  </td>
                  <td className={`${tdClass} text-[12px]`}>
                    {r.stock.length === 0 ? <span className="text-lien-muted">—</span> : null}
                    {r.stock.map((s) => (
                      <div key={s.id} className="flex items-center gap-1.5 whitespace-nowrap py-0.5">
                        <span className="font-semibold">×{s.qty}</span>
                        <span className="text-lien-muted">HSD {s.expiry ? formatDate(s.expiry) : "—"}</span>
                        <span className="text-lien-muted">· mua {s.boughtAt ? formatDate(s.boughtAt) : "—"}</span>
                        {s.unitCostJpy ? <span className="text-lien-muted">· ¥{formatAmount(s.unitCostJpy)}/đv</span> : null}
                        {s.lotId ? (
                          <Link href={`/admin/inventory/lots/${s.productId}/`} className="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-800 no-underline hover:bg-green-200">
                            lô #{s.lotId}
                          </Link>
                        ) : (
                          <form action={removeSurplusAction} className="inline">
                            <input type="hidden" name="batchId" value={b.id} />
                            <input type="hidden" name="stockPurchaseId" value={s.id} />
                            <button type="submit" className="text-lien-muted hover:text-lien-heart" title="Bỏ dòng mua dư" aria-label={`Bỏ ${s.qty} đv mua dư`}>
                              ✕
                            </button>
                          </form>
                        )}
                      </div>
                    ))}
                    {r.stockUnits ? <div className="mt-0.5 font-semibold text-lien-heading">= {r.stockUnits} đv</div> : null}
                  </td>
                  <td className={`${tdClass} font-oswald text-[16px] text-lien-heading`}>{r.orderUnits + r.stockUnits}</td>
                  <td className={`${tdClass} text-[12px] text-lien-muted`}>{stockById.get(r.productId) ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {done ? null : (
          <>
            <form action={addProductAction} className="mt-3 grid gap-2 rounded-md border border-dashed border-[#d1d5db] bg-white px-3 py-2 md:grid-cols-[minmax(260px,1fr)_80px_130px_130px_110px_1fr_auto] md:items-end" data-testid={`surplus-${b.id}`}>
              <input type="hidden" name="batchId" value={b.id} />
              <div className="md:col-span-7 -mb-1 text-[12px] text-lien-muted">
                <b className="text-lien-heading">Thêm sản phẩm đã mua vào đợt</b> — SL là tổng đã mua; tự gán cho đơn đang chờ trước, phần còn lại lưu kho. Cùng sản phẩm khác HSD → thêm từng dòng.
              </div>
              <div>
                <label className={adminLabel}>Sản phẩm (tìm theo tên)</label>
                <ProductSearchSelect products={products} placeholder="Gõ tên Việt / Nhật hoặc SKU…" />
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
              {/* the add form is empty; row checkboxes attach to it with form=… so the per-row "Lấy từ hàng dư" forms can stand alone */}
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
                      <th className={thClass}>Hàng dư trong đợt</th>
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
                                <button type="submit" className={cn(btnSecondary, "!px-2 !py-0.5 !text-[12px]")} title={`Đợt còn ${surplus} đv hàng dư — lấy ${l.quantity} đv cho đơn này`}>
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
          <summary className="cursor-pointer text-[12px] text-lien-blue">Sửa thông tin đợt (tên, nguồn, ngày mua, tracking, ghi chú)</summary>
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
                Mua ở
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
