import Image from "next/image";
import Link from "next/link";
import { bulkStockPurchaseAction, createStockPurchaseAction, deleteStockPurchaseAction, setStockPurchaseStatusAction } from "@/app/admin/purchases/stock-actions";
import { formatAmount, formatDate, formatDateTime } from "@/lib/format";
import { todayIso } from "@/lib/lots";
import { PURCHASE_STAGES, purchaseIndex } from "@/lib/purchase";
import { purchaseSourceName } from "@/lib/purchase-sources";
import { cn } from "@/lib/utils";
import type { PurchaseSource, StockPurchase } from "@/types/shop";
import { ConfirmSubmit } from "./ConfirmSubmit";
import { type PickableProduct, ProductSearchSelect } from "./ProductSearchSelect";
import { adminInput, adminLabel, btnPrimary, btnSecondary, Card, tableClass, tdClass, thClass } from "./ui";

/** Statuses that make sense for goods bought for stock (they stop at the shop warehouse). */
const STOCK_STAGES = PURCHASE_STAGES.filter((s) => purchaseIndex(s.key) <= purchaseIndex("at_shop"));

interface Props {
  purchases: StockPurchase[];
  products: PickableProduct[];
  sources: PurchaseSource[];
  includeDone: boolean;
}

/** Quản lý mua hàng › tab "Mua lưu kho": buy-for-stock slips (no order behind them) + their journey to the warehouse. */
export function StockPurchasePanel({ purchases, products, sources, includeDone }: Props) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <Card title={`Phiếu mua lưu kho (${purchases.length})`} actions={<Link href={`/admin/purchases/?tab=stock${includeDone ? "" : "&done=1"}`} className="text-[13px] text-lien-blue hover:underline">{includeDone ? "Ẩn phiếu đã nhập kho" : "Xem cả phiếu đã nhập kho"}</Link>}>
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
            <span className="text-lien-muted">Tới “Đã nhận được hàng (kho shop)” → tự tạo lô trong Kho hàng, tồn kho tăng.</span>
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
                <th className={thClass}>HSD · vị trí</th>
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
                    <td className={`${tdClass} font-semibold`}>{p.qty}</td>
                    <td className={`${tdClass} text-[13px]`}>
                      {purchaseSourceName(p.sourceKey, sources)}
                      {p.unitCostJpy ? <span className="block text-[12px] text-lien-muted">¥{p.unitCostJpy.toLocaleString("ja-JP")}/đv · ¥{formatAmount(p.unitCostJpy * p.qty)}</span> : null}
                    </td>
                    <td className={`${tdClass} text-[13px]`}>
                      {p.expiry ? formatDate(p.expiry) : <span className="text-lien-muted">—</span>}
                      {p.location ? <span className="block text-[12px] text-lien-muted">{p.location}</span> : null}
                    </td>
                    <td className={tdClass}>
                      {p.lotId ? (
                        <Link href={`/admin/inventory/lots/${p.productId}/`} className="inline-block rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-800 no-underline hover:bg-green-200">
                          Đã nhập kho · lô #{p.lotId}
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
              <label className={adminLabel} htmlFor="spa-loc">
                Vị trí kho dự kiến
              </label>
              <input id="spa-loc" name="location" placeholder="Kệ A2" className={adminInput} />
            </div>
          </div>
          <div>
            <label className={adminLabel} htmlFor="spa-status">
              Trạng thái lúc tạo
            </label>
            <select id="spa-status" name="status" defaultValue="bought" className={adminInput}>
              {STOCK_STAGES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                  {s.key === "at_shop" ? " — nhập kho ngay" : ""}
                </option>
              ))}
            </select>
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
