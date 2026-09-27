import Image from "next/image";
import Link from "next/link";
import { moveStockToBatchAction } from "@/app/admin/purchases/batch-actions";
import { bulkStockPurchaseAction, createStockPurchaseAction, deleteStockPurchaseAction, setStockPurchaseStatusAction } from "@/app/admin/purchases/stock-actions";
import { formatAmount, formatDate, formatDateTime } from "@/lib/format";
import { todayIso } from "@/lib/lots";
import { PURCHASE_STAGES, purchaseIndex } from "@/lib/purchase";
import { purchaseSourceName } from "@/lib/purchase-sources";
import { cn } from "@/lib/utils";
import type { PurchaseSource, StockPurchase } from "@/types/shop";
import type { LotView } from "@/lib/lots-db";
import { describeLocation } from "@/lib/warehouses";

import { ConfirmSubmit } from "./ConfirmSubmit";
import { type PickableProduct, ProductSearchSelect } from "./ProductSearchSelect";
import { adminInput, adminLabel, btnPrimary, btnSecondary, Card, tableClass, tdClass, thClass } from "./ui";

/** Statuses a slip can have before it is a lot (from "Tại kho Nhật" on the lot itself is managed in Kho hàng). */
const STOCK_STAGES = PURCHASE_STAGES.filter((s) => purchaseIndex(s.key) <= purchaseIndex("bought"));

interface Props {
  purchases: StockPurchase[];
  products: PickableProduct[];
  sources: PurchaseSource[];
  includeDone: boolean;
  /** Open shipment batches — ticked slips can be sent into one. */
  batches?: Array<{ id: number; code: string; label: string }>;
  /** Reservations per slip id (orders holding units of a slip that is not a lot yet). */
  reserved?: Map<number, Array<{ orderId: string; orderNumber: number; qty: number }>>;
  /** Lots with free units (bought in a batch, not sold yet): what is on its way / in stock. */
  lots?: LotView[];
}

/** Quản lý mua hàng › tab "Mua lưu kho": buy-for-stock slips (no order behind them) + their journey to the warehouse. */
export function StockPurchasePanel({ purchases, products, sources, includeDone, batches = [], reserved = new Map(), lots = [] }: Props) {
  const freeUnits = lots.reduce((n, l) => n + l.free, 0);
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0 space-y-6">
      <Card title={`Hàng lưu kho từ các đợt mua (${lots.length} lô · ${freeUnits} đv chưa bán)`} actions={<Link href="/admin/inventory/?side=jp" className="text-[13px] text-lien-blue hover:underline">Tồn kho →</Link>}>
        <p className="m-0 mb-2 text-[12px] text-lien-muted">Mua ở tab “Mua theo đợt” mà chưa gắn đơn nào = hàng lưu kho, đang ở vị trí bên dưới (Kho Nhật → ĐVVC → Kho VN). Sửa lô ở tab Mua theo đợt hoặc trang lô của sản phẩm.</p>
        {lots.length === 0 ? <p className="m-0 text-[13px] text-lien-muted">Chưa có lô nào còn hàng chưa bán.</p> : null}
        {lots.length ? (
          <div className="overflow-x-auto">
            <table className={tableClass}>
              <thead>
                <tr>
                  <th className={thClass}>Sản phẩm</th>
                  <th className={thClass}>Lô #</th>
                  <th className={thClass}>Vị trí</th>
                  <th className={thClass}>Đợt</th>
                  <th className={thClass}>HSD</th>
                  <th className={thClass}>Chưa bán / còn</th>
                  <th className={thClass}>Mua ở · ¥</th>
                </tr>
              </thead>
              <tbody>
                {lots.map((l) => (
                  <tr key={l.id} className="hover:bg-[#fafafa]" data-testid={`stock-lot-${l.id}`}>
                    <td className={`${tdClass} min-w-[200px]`}>
                      <Link href={`/admin/inventory/lots/${l.productId}/`} className="text-[13px] font-semibold text-lien-heading hover:text-lien-blue">
                        {l.productName}
                      </Link>
                      <span className="block text-[11px] text-lien-muted">
                        #{l.productId}
                        {l.productSku ? ` · ${l.productSku}` : ""}
                      </span>
                    </td>
                    <td className={`${tdClass} text-[12px]`}>#{l.id}</td>
                    <td className={`${tdClass} text-[12px]`}>{describeLocation(l.warehouse, l.inTransit)}</td>
                    <td className={`${tdClass} text-[12px]`}>
                      {l.batchId ? (
                        <Link href={`/admin/purchases/?tab=batches#batch-${l.batchId}`} className="font-mono text-[11px] text-lien-blue hover:underline">
                          {l.batchCode}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className={`${tdClass} text-[12px]`}>{l.expiry ? formatDate(l.expiry) : "—"}</td>
                    <td className={`${tdClass} text-[12px]`}>
                      <b>{l.free}</b> / {l.physical}
                    </td>
                    <td className={`${tdClass} text-[12px]`}>
                      {purchaseSourceName(l.sourceKey, sources)}
                      {l.unitCostJpy ? ` · ¥${formatAmount(l.unitCostJpy)}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>
      <Card title={`Phiếu chưa thành lô (${purchases.filter((p) => !p.lotId).length})`} actions={<Link href={`/admin/purchases/?tab=stock${includeDone ? "" : "&done=1"}`} className="text-[13px] text-lien-blue hover:underline">{includeDone ? "Ẩn phiếu đã thành lô" : "Xem cả phiếu đã thành lô"}</Link>}>
        <form action={bulkStockPurchaseAction} id="bulk-stock">
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-[#e5e7eb] bg-[#f9fafb] px-3 py-2 text-[13px]">
            <span className="font-semibold text-lien-heading">Các phiếu đã tick →</span>
            <select name="status" defaultValue="" className={cn(adminInput, "!mb-0 !w-auto !py-1")}>
              <option value="">chọn trạng thái…</option>
              {STOCK_STAGES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
            <button type="submit" className={cn(btnPrimary, "!py-1")}>
              Áp dụng
            </button>
            {batches.length ? (
              <>
                <span className="mx-1 text-lien-muted">|</span>
                <span className="font-semibold text-lien-heading">hoặc đưa vào đợt:</span>
                <input type="hidden" name="back" value="/admin/purchases/?tab=stock" />
                <select name="batchId" defaultValue={batches[0].id} className={cn(adminInput, "!mb-0 !w-auto !py-1")} aria-label="Đợt gửi">
                  {batches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.code}
                      {b.label ? ` · ${b.label}` : ""}
                    </option>
                  ))}
                </select>
                <button type="submit" formAction={moveStockToBatchAction} className={cn(btnSecondary, "!py-1")} title="Các phiếu đã tick đi chung chuyến với đợt này (hàng giữ lại Nhật từ đợt trước cũng ở đây)">
                  Đưa vào đợt
                </button>
              </>
            ) : null}
            <span className="text-lien-muted">Tới “Tại kho Nhật (shop)” → phiếu thành lô ở Tồn kho › Kho Nhật; từ đó chọn gửi về ở Tồn kho hoặc đổi trạng thái ở Mua theo đợt.</span>
          </div>
        </form>
        <div className="overflow-x-auto">
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass} />
                <th className={thClass}>Sản phẩm</th>
                <th className={thClass}>SL</th>
                <th className={thClass}>Nguồn · ¥</th>
                <th className={thClass}>HSD · ngày mua</th>
                <th className={thClass}>Trạng thái</th>
                <th className={thClass}>Ghi chú</th>
                <th className={thClass} />
              </tr>
            </thead>
            <tbody>
              {purchases.map((p) => {
                const fid = `sp-${p.id}`;
                const st = PURCHASE_STAGES[purchaseIndex(p.status)];
                return (
                  <tr key={p.id} className={cn("hover:bg-[#fafafa]", p.lotId && "opacity-70")} data-testid={`sp-${p.id}`}>
                    <td className={`${tdClass} w-8`}>{p.lotId ? null : <input type="checkbox" name="spids" value={p.id} form="bulk-stock" className="h-4 w-4" aria-label={`Chọn phiếu ${p.id}`} />}</td>
                    <td className={`${tdClass} min-w-[240px]`}>
                      <form id={fid} action={setStockPurchaseStatusAction}>
                        <input type="hidden" name="purchaseId" value={p.id} />
                      </form>
                      <div className="flex items-center gap-2">
                        {p.productThumb ? <Image src={p.productThumb} alt="" width={36} height={36} className="h-9 w-9 shrink-0 rounded border border-[#e5e7eb] object-contain" /> : null}
                        <span className="flex min-w-0 flex-col leading-4">
                          <Link href={`/admin/inventory/lots/${p.productId}/`} className="text-[13px] font-semibold text-lien-heading hover:text-lien-blue">
                            {p.productName}
                          </Link>
                          <span className="text-[12px] text-lien-muted">
                            phiếu #{p.id}
                            {p.productSku ? ` · ${p.productSku}` : ""} · {formatDateTime(p.createdAt)}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td className={`${tdClass} font-semibold`}>
                      {p.qty}
                      {reserved.get(p.id)?.length ? <span className="block text-[11px] font-normal text-lien-muted">giữ cho {reserved.get(p.id)!.map((r) => `#${r.orderNumber}×${r.qty}`).join(", ")}</span> : null}
                    </td>
                    <td className={`${tdClass} text-[13px]`}>
                      {purchaseSourceName(p.sourceKey, sources)}
                      {p.unitCostJpy ? <span className="block text-[12px] text-lien-muted">¥{p.unitCostJpy.toLocaleString("ja-JP")}/đv · ¥{formatAmount(p.unitCostJpy * p.qty)}</span> : null}
                    </td>
                    <td className={`${tdClass} text-[13px]`}>
                      {p.expiry ? formatDate(p.expiry) : <span className="text-lien-muted">—</span>}
                      {p.boughtAt ? <span className="block text-[12px] text-lien-muted">mua {formatDate(p.boughtAt)}</span> : null}
                      {p.location ? <span className="block text-[12px] text-lien-muted">{p.location}</span> : null}
                    </td>
                    <td className={tdClass}>
                      {p.lotId ? (
                        <Link href={`/admin/inventory/lots/${p.productId}/`} className="inline-block rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-800 no-underline hover:bg-green-200">
                          Xem lô đã nhập · #{p.lotId}
                        </Link>
                      ) : (
                        <div className="flex items-center gap-1">
                          <select name="status" form={fid} defaultValue={p.status} className={cn(adminInput, "!mb-0 !w-auto !py-1 !text-[13px]")} aria-label="Trạng thái">
                            {STOCK_STAGES.map((s) => (
                              <option key={s.key} value={s.key}>
                                {s.label}
                              </option>
                            ))}
                          </select>
                          <button type="submit" form={fid} className={cn(btnSecondary, "!px-2 !py-1")} title="Lưu">
                            ✓
                          </button>
                        </div>
                      )}
                      <span className={cn("mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold", st.cls)}>{st.short}</span>
                      <span className="ml-1 text-[11px] text-lien-muted">{formatDateTime(p.updatedAt)}</span>
                    </td>
                    <td className={tdClass}>{p.lotId ? <span className="text-[13px] text-lien-muted">{p.note || "—"}</span> : <input name="note" form={fid} defaultValue={p.note} placeholder="mã đơn, tracking…" className={cn(adminInput, "!mb-0 !w-[170px] !py-1 !text-[13px]")} aria-label="Ghi chú" />}</td>
                    <td className={`${tdClass} whitespace-nowrap`}>
                      {p.lotId ? null : (
                        <form action={deleteStockPurchaseAction}>
                          <input type="hidden" name="purchaseId" value={p.id} />
                          <ConfirmSubmit message={`Xoá phiếu mua lưu kho #${p.id}?`} className="text-[12px] text-lien-heart hover:underline">
                            Xoá
                          </ConfirmSubmit>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
              {purchases.length === 0 ? (
                <tr>
                  <td colSpan={8} className={`${tdClass} text-center text-lien-muted`}>
                    Chưa có phiếu nào. Thấy giá hời muốn mua về để kho VN bán dần → tạo phiếu ở khung bên phải.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      </div>
      <Card title="Mua lưu kho (không theo đơn)">
        <form action={createStockPurchaseAction} className="grid gap-3" data-testid="stock-purchase-add">
          <div>
            <label className={adminLabel}>Sản phẩm</label>
            <ProductSearchSelect products={products} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={adminLabel} htmlFor="spa-qty">
                Số lượng
              </label>
              <input id="spa-qty" name="qty" inputMode="numeric" required className={adminInput} />
            </div>
            <div>
              <label className={adminLabel} htmlFor="spa-jpy">
                Giá mua ¥/đv
              </label>
              <input id="spa-jpy" name="unitCostJpy" inputMode="numeric" placeholder="trống = giá vốn hiện tại" className={adminInput} />
            </div>
          </div>
          <div>
            <label className={adminLabel} htmlFor="spa-src">
              Nguồn nhập
            </label>
            <select id="spa-src" name="sourceKey" defaultValue="unknown" className={adminInput}>
              {sources.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={adminLabel} htmlFor="spa-exp">
                Hạn dùng
              </label>
              <input id="spa-exp" name="expiry" placeholder="2027-03-31 · 03/2027" className={adminInput} />
            </div>
            <div>
              <label className={adminLabel} htmlFor="spa-bought">
                Ngày mua tại Nhật
              </label>
              <input id="spa-bought" name="boughtAt" defaultValue={todayIso()} placeholder="2026-09-27" className={adminInput} />
            </div>
          </div>
          <div>
            <label className={adminLabel} htmlFor="spa-loc">
              Vị trí trong kho
            </label>
            <input id="spa-loc" name="location" placeholder="Kệ A2" className={adminInput} />
          </div>
          <div>
            <span className={adminLabel}>Tình trạng</span>
            <div className="grid gap-1.5 text-[13px]">
              <label className="inline-flex items-center gap-2">
                <input type="radio" name="status" value="ordered" className="h-4 w-4" /> Đã đặt mua online (Amazon, Rakuten…) — chờ nhận, chưa thành lô
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="radio" name="status" value="bought" defaultChecked className="h-4 w-4" /> Đã cầm hàng (tại quầy) — thành lô ở Kho Nhật (shop) ngay
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="radio" name="status" value="not_bought" className="h-4 w-4" /> Chưa mua — chỉ ghi kế hoạch
              </label>
            </div>
          </div>
          <div>
            <label className={adminLabel} htmlFor="spa-note">
              Ghi chú
            </label>
            <input id="spa-note" name="note" placeholder={`Mua ${todayIso()} vì giá hời…`} className={adminInput} />
          </div>
          <button type="submit" className={`${btnPrimary} justify-self-start`}>
            + Tạo phiếu mua lưu kho
          </button>
        </form>
        <p className="mt-3 mb-0 text-[12px] leading-5 text-lien-muted">Phiếu đi cùng chuỗi trạng thái với dòng đơn (đã mua → tới ĐVVC Nhật → NB→VN → kho ĐVVC → về kho shop). Số đang về được tính vào “Đang trên đường về” ở Kho hàng; khi nhận hàng, lô được tạo với ngày nhập, nguồn, ¥, HSD, vị trí.</p>
      </Card>
    </div>
  );
}
