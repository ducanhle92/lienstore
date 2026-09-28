import Link from "next/link";
import { bulkStockUnitsAction, createStockUnitsAction } from "@/app/admin/purchases/stock-actions";
import { formatAmount, formatDate } from "@/lib/format";
import type { StockGroup } from "@/lib/lots-db";
import { todayIso } from "@/lib/lots";
import { PURCHASE_STAGES, purchaseIndex } from "@/lib/purchase";
import { purchaseSourceName } from "@/lib/purchase-sources";
import { cn } from "@/lib/utils";
import type { PurchaseSource } from "@/types/shop";
import { TableSelectAll } from "./TableSelectAll";
import { BulkBar } from "./BulkBar";
import { type PickableProduct, ProductSearchSelect } from "./ProductSearchSelect";
import { adminInput, adminLabel, btnPrimary, btnSecondary, Card, tableClass, tdClass, thClass } from "./ui";

/** Where stock bought without an order can be (dự định mua → đặt online → … → Kho VN). */
const STOCK_STAGES = PURCHASE_STAGES.filter((s) => purchaseIndex(s.key) <= purchaseIndex("at_shop"));

interface Props {
  /** Units no order holds, as bill lines × place (planned, ordered online, in Japan, on the way, in Vietnam). */
  groups: StockGroup[];
  products: PickableProduct[];
  sources: PurchaseSource[];
  batches?: Array<{ id: number; code: string; label: string }>;
}

/** Quản lý mua hàng › tab "Hàng lưu kho": every unit without a customer, and the form to buy for stock outside a trip. */
export function StockPurchasePanel({ groups, products, sources, batches = [] }: Props) {
  const units = groups.reduce((n, g) => n + g.qty, 0);
  const formId = "stock-bulk";
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0">
        <Card title={`Hàng lưu kho — chưa có khách (${units} cái · ${groups.length} dòng bill)`} actions={<Link href="/admin/inventory/?side=jp" className="text-[13px] text-lien-blue hover:underline">Tồn kho →</Link>}>
          <form id={formId} action={bulkStockUnitsAction} />
          <BulkBar scope={formId}>
            <select name="status" form={formId} defaultValue="bought" className={cn(adminInput, "!mb-0 !w-auto !py-1 !text-[13px] disabled:opacity-50")} aria-label="Trạng thái">
              {STOCK_STAGES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
            <button type="submit" form={formId} name="op" value="status" className={cn(btnPrimary, "!py-1 disabled:opacity-50")}>
              Cập nhật
            </button>
            {batches.length ? (
              <>
                <span className="text-lien-muted">|</span>
                <select name="batchId" form={formId} className={cn(adminInput, "!mb-0 !w-auto !py-1 !text-[13px] disabled:opacity-50")} aria-label="Đợt">
                  {batches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.code}
                      {b.label ? ` · ${b.label}` : ""}
                    </option>
                  ))}
                </select>
                <button type="submit" form={formId} name="op" value="batch" className={cn(btnSecondary, "!py-1 disabled:opacity-50")}>
                  Đưa vào đợt
                </button>
              </>
            ) : null}
          </BulkBar>
          {groups.length === 0 ? <p className="m-0 text-[13px] text-lien-muted">Không có hàng lưu kho.</p> : null}
          {groups.length ? (
            <div className="overflow-x-auto" data-select-scope={formId}>
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th className={cn(thClass, "w-8")}>
                      <TableSelectAll name="uids" />
                    </th>
                    <th className={thClass}>Sản phẩm · mã</th>
                    <th className={thClass}>SL</th>
                    <th className={thClass}>Trạng thái</th>
                    <th className={thClass}>Bill · đợt</th>
                    <th className={thClass}>HSD</th>
                    <th className={thClass}>Mua ở · ¥</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => {
                    const st = PURCHASE_STAGES[purchaseIndex(g.status)];
                    return (
                      <tr key={g.key} className="align-top hover:bg-[#fafafa]" data-testid={`stock-group-${g.unitIds[0]}`}>
                        <td className={`${tdClass} w-8`}>
                          <input type="checkbox" name="uids" value={g.unitIds.join(",")} form={formId} className="h-4 w-4" aria-label={`Chọn ${g.productName}`} />
                        </td>
                        <td className={`${tdClass} min-w-[220px]`}>
                          <Link href={`/admin/inventory/lots/${g.productId}/`} className="text-[13px] font-semibold text-lien-heading hover:text-lien-blue">
                            {g.productName}
                          </Link>
                          <span className="block font-mono text-[11px] text-lien-muted" title={g.codes.join(" ")}>
                            {g.codes.length > 1 ? `${g.codes[0]} … ${g.codes[g.codes.length - 1]}` : g.codes[0]}
                          </span>
                        </td>
                        <td className={`${tdClass} font-semibold`}>{g.qty}</td>
                        <td className={tdClass}>
                          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", st.cls)}>{st.short}</span>
                          {g.shipmentCode ? <span className="ml-1 text-[11px] text-lien-muted">chuyến {g.shipmentCode}</span> : null}
                        </td>
                        <td className={`${tdClass} text-[12px]`}>
                          <span className="font-mono">{g.receiptCode || "chưa có bill"}</span>
                          {g.batchId ? (
                            <Link href={`/admin/purchases/?tab=batches#batch-${g.batchId}`} className="block font-mono text-[11px] text-lien-blue hover:underline">
                              {g.batchCode}
                            </Link>
                          ) : null}
                        </td>
                        <td className={`${tdClass} whitespace-nowrap text-[12px]`}>{g.expiry ? formatDate(g.expiry) : "—"}</td>
                        <td className={`${tdClass} text-[12px]`}>
                          {purchaseSourceName(g.sourceKey, sources)}
                          {g.store ? ` · ${g.store}` : ""}
                          {g.unitCostJpy ? ` · ¥${formatAmount(g.unitCostJpy)}` : ""}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </Card>
      </div>
      <div>
        <Card title="Mua lưu kho (không theo đợt)">
          <form action={createStockUnitsAction} className="grid gap-3" data-testid="stock-create">
            <div>
              <label className={adminLabel}>Sản phẩm</label>
              <ProductSearchSelect products={products} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={adminLabel} htmlFor="sc-qty">
                  Số lượng
                </label>
                <input id="sc-qty" name="qty" inputMode="numeric" required className={adminInput} />
              </div>
              <div>
                <label className={adminLabel} htmlFor="sc-st">
                  Trạng thái
                </label>
                <select id="sc-st" name="status" defaultValue="bought" className={adminInput}>
                  {STOCK_STAGES.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={adminLabel} htmlFor="sc-src">
                  Mua ở
                </label>
                <select id="sc-src" name="sourceKey" defaultValue="amazon" className={adminInput}>
                  {sources.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={adminLabel} htmlFor="sc-store">
                  Cửa hàng
                </label>
                <input id="sc-store" name="store" maxLength={80} placeholder="chi nhánh…" className={adminInput} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className={adminLabel} htmlFor="sc-exp">
                  HSD
                </label>
                <input id="sc-exp" name="expiry" placeholder="03/2027" className={adminInput} />
              </div>
              <div>
                <label className={adminLabel} htmlFor="sc-date">
                  Ngày mua
                </label>
                <input id="sc-date" name="boughtAt" defaultValue={todayIso()} className={adminInput} />
              </div>
              <div>
                <label className={adminLabel} htmlFor="sc-jpy">
                  ¥/cái
                </label>
                <input id="sc-jpy" name="unitCostJpy" inputMode="numeric" className={adminInput} />
              </div>
            </div>
            <div>
              <label className={adminLabel} htmlFor="sc-bill">
                Mã bill <span className="font-normal text-lien-muted">— trống = tạo PM-… mới</span>
              </label>
              <input id="sc-bill" name="billCode" maxLength={60} placeholder="BILL_260927_1454" className={cn(adminInput, "font-mono")} />
            </div>
            <button type="submit" className={`${btnPrimary} justify-self-start`}>
              + Nhập hàng lưu kho
            </button>
          </form>
        </Card>
      </div>
    </div>
  );
}
