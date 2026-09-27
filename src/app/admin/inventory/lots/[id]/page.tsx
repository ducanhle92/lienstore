import React from "react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { addLotAction, saveLotsAction, updateLotAction } from "@/app/admin/inventory/lots/actions";
import { ConfirmSubmit } from "@/components/sites/lienstore/admin/ConfirmSubmit";
import { FixedSaveBar } from "@/components/sites/lienstore/admin/FixedSaveBar";
import { adminInput, adminLabel, btnPrimary, btnSecondary, Card, Flash, PageHeader, tableClass, tdClass, thClass } from "@/components/sites/lienstore/admin/ui";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { requireAdmin } from "@/lib/auth";
import { listReservationsForProduct } from "@/lib/allocations-db";
import { getProductById, listPurchaseSources, listStockLots, listStockPurchases } from "@/lib/db";
import { getDb } from "@/lib/sqlite";
import { listLotViews } from "@/lib/lots-db";
import { uploadReceiptFilesAction } from "@/app/admin/purchases/receipt-actions";
import { parseReceiptFiles } from "@/lib/receipts-db";
import { formatAmount, formatDate } from "@/lib/format";
import { daysToExpiry, EXPIRY_LABEL, expiryState, todayIso } from "@/lib/lots";
import { PURCHASE_STAGES, purchaseIndex } from "@/lib/purchase";
import { purchaseSourceName } from "@/lib/purchase-sources";
import { cn } from "@/lib/utils";
import { describeLocation, WAREHOUSE_HINT, WAREHOUSE_LABEL, WAREHOUSE_SIDE, WAREHOUSES } from "@/lib/warehouses";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const EXP_CLS = { expired: "bg-red-100 text-red-800", soon: "bg-amber-100 text-amber-800", ok: "bg-green-100 text-green-800", none: "bg-gray-100 text-gray-600" } as const;

/** Kho hàng › Lô hàng của một sản phẩm: mỗi lần nhập là một dòng — ngày nhập, số lượng, nguồn, hạn dùng, vị trí. */
export default async function ProductLotsPage({ params, searchParams }: Props) {
  await requireAdmin("inventory");
  const { id } = await params;
  const pid = Number.parseInt(id, 10);
  if (!Number.isInteger(pid)) notFound();
  const [product, lots, sources, purchases, sp] = await Promise.all([getProductById(pid), listStockLots(pid, false), listPurchaseSources(), listStockPurchases(false), searchParams]);
  if (!product) notFound();
  const open = purchases.filter((p) => p.productId === pid);
  const reservations = listReservationsForProduct(getDb(), pid);
  // bill (phiếu mua) behind each lot — the paper trail to check against
  const billOf = new Map(listLotViews(getDb(), { productId: pid, includeEmpty: true }).map((v) => [v.id, v]));
  // bills a lot of this product can point at: those of the lots' purchase batches, plus any already referenced
  const batchIds = Array.from(new Set(Array.from(billOf.values()).map((v) => v.batchId).filter((x): x is number => x !== null)));
  const receiptIds = Array.from(new Set(Array.from(billOf.values()).map((v) => v.receiptId).filter((x): x is number => x !== null)));
  const bills = (batchIds.length || receiptIds.length
    ? (getDb()
        .prepare(`SELECT id, code, bought_at, files FROM purchase_receipts WHERE ${[batchIds.length ? `batch_id IN (${batchIds.map(() => "?").join(",")})` : "", receiptIds.length ? `id IN (${receiptIds.map(() => "?").join(",")})` : ""].filter(Boolean).join(" OR ")} ORDER BY bought_at DESC, id DESC`)
        .all(...batchIds, ...receiptIds) as Array<{ id: number; code: string; bought_at: string; files: string | null }>)
    : []
  ).map((r) => ({ id: r.id, code: r.code, boughtAt: r.bought_at, files: parseReceiptFiles(r.files) }));
  // one line per order line of this product: its parts (lot / slip / batch / buy)
  const orderLines = Array.from(
    reservations.reduce((acc, r) => {
      const g = acc.get(r.itemId) ?? { itemId: r.itemId, orderId: r.orderId, orderNumber: r.orderNumber, qty: 0, parts: [] as typeof reservations };
      g.qty += r.qty;
      g.parts.push(r);
      acc.set(r.itemId, g);
      return acc;
    }, new Map<number, { itemId: number; orderId: string; orderNumber: number; qty: number; parts: typeof reservations }>()).values(),
  ).filter((g) => g.parts.some((p) => !p.consumed));
  const left = lots.reduce((s, l) => s + l.qtyLeft, 0);
  const whField = (value: string, id: string, cls = "!mb-0 !w-[130px] !py-1 !text-[13px]", name = "warehouse") => (
    <select id={id} name={name} form={name === "warehouse" ? undefined : "lots-save"} defaultValue={value} className={`${adminInput} ${cls}`} aria-label="Kho">
      {WAREHOUSES.map((w) => (
        <option key={w} value={w} title={WAREHOUSE_HINT[w]}>
          {WAREHOUSE_LABEL[w]}
        </option>
      ))}
    </select>
  );
  const srcField = (name: string, value: string, id: string, form?: string) => (
    <select id={id} name={name} form={form} defaultValue={value} className={`${adminInput} !mb-0 !w-[170px] !py-1 !text-[13px]`} aria-label="Nguồn nhập">
      {sources.map((s) => (
        <option key={s.key} value={s.key}>
          {s.name}
        </option>
      ))}
    </select>
  );
  return (
    <>
      <PageHeader
        title={product.name}
        subtitle={`Lô hàng · tồn ${product.stock ?? 0} đơn vị trong ${lots.filter((l) => l.qtyLeft > 0).length} lô${open.length ? ` · ${open.reduce((s, p) => s + p.qty, 0)} đv đang mua lưu kho` : ""}`}
        back={{ href: "/admin/inventory/", label: "Tồn kho" }}
        actions={
          <Link href={`/admin/products/${product.id}/`} className="text-[14px] text-lien-blue hover:underline">
            Sửa sản phẩm →
          </Link>
        }
      />
      {first(sp.saved) ? <Flash>{first(sp.saved)}</Flash> : null}
      {first(sp.error) ? <Flash kind="error">{first(sp.error)}</Flash> : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card title={`Các lô đang có (${left} đơn vị)`}>
            {/* every input below belongs to this one form; the red bar saves all rows at once */}
            <form id="lots-save" action={saveLotsAction}>
              <input type="hidden" name="productId" value={pid} />
            </form>
            <div className="overflow-x-auto">
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th className={thClass}>Ngày nhập · bill</th>
                    <th className={thClass}>Còn / nhập</th>
                    <th className={thClass}>Đã giữ cho đơn</th>
                    <th className={thClass}>Nguồn nhập</th>
                    <th className={thClass}>Giá vốn ¥/đv</th>
                    <th className={thClass}>Hạn dùng</th>
                    <th className={thClass}>Kho</th>
                    <th className={thClass}>Bill</th>
                    <th className={thClass}>Ghi chú</th>
                    <th className={thClass} />
                  </tr>
                </thead>
                <tbody>
                  {[...lots]
                    .sort((a, b) => WAREHOUSES.indexOf(a.warehouse) - WAREHOUSES.indexOf(b.warehouse))
                    .map((l, i, arr) => {
                      const p = `lot_${l.id}_`;
                      const v = billOf.get(l.id);
                      const sideHeader =
                        i === 0 || WAREHOUSE_SIDE[arr[i - 1].warehouse] !== WAREHOUSE_SIDE[l.warehouse] ? (
                          <tr key={`side-${l.warehouse}`} className={WAREHOUSE_SIDE[l.warehouse] === "jp" ? "bg-sky-50" : "bg-red-50"}>
                            <td colSpan={10} className="px-4 py-1 text-[12px] font-semibold uppercase tracking-wide">
                              {WAREHOUSE_SIDE[l.warehouse] === "jp" ? "Kho Nhật (shop · ĐVVC Nhật)" : "Kho Việt Nam (ĐVVC VN · shop)"}
                            </td>
                          </tr>
                        ) : null;
                      const st = expiryState(l.expiry);
                      const days = daysToExpiry(l.expiry);
                      const held = reservations.filter((r) => r.sourceType === "lot" && r.sourceId === l.id && !r.consumed);
                      const free = l.qtyLeft - held.reduce((n, r) => n + r.qty, 0);
                      const bill = v?.receiptId ? bills.find((b) => b.id === v.receiptId) : undefined;
                      return (
                        <React.Fragment key={l.id}>
                          {sideHeader}
                          <tr className={cn(l.qtyLeft === 0 && "opacity-50")} data-testid={`lot-${l.id}`}>
                            <td className={tdClass}>
                              <input form="lots-save" name={`${p}receivedAt`} defaultValue={l.receivedAt} className={`${adminInput} !mb-0 !w-[118px] !py-1 !text-[13px]`} aria-label="Ngày nhập" />
                              {l.boughtAt ? <span className="block text-[11px] text-lien-muted">mua tại Nhật {formatDate(l.boughtAt)}</span> : null}
                              {bill ? (
                                <span className="mt-1 flex flex-wrap items-center gap-1 text-[11px]">
                                  <Link href={`/admin/purchases/?tab=batches&bills=${v?.batchId ?? ""}#receipt-${bill.id}`} className="rounded border border-[#d1d5db] bg-white px-1 py-0.5 font-mono font-semibold text-lien-heading no-underline hover:border-lien-blue" title="Mở bill trong đợt mua">
                                    {bill.code}
                                  </Link>
                                  {bill.files.map((f) => (
                                    <a key={f.path} href={f.url} target="_blank" rel="noreferrer" title={f.name} className="no-underline">
                                      {f.mime.startsWith("image/") ? <Image src={f.url} alt={f.name} width={36} height={36} unoptimized className="h-9 w-9 rounded border border-[#e5e7eb] object-cover" /> : <span className="text-lien-blue">📄</span>}
                                    </a>
                                  ))}
                                  <form action={uploadReceiptFilesAction} className="inline-flex items-center gap-1">
                                    <input type="hidden" name="id" value={bill.id} />
                                    <input type="hidden" name="back" value={`/admin/inventory/lots/${pid}/`} />
                                    <input type="file" name="files" accept="image/*,application/pdf" multiple className="w-[120px] text-[11px]" aria-label="Ảnh bill" />
                                    <button type="submit" className={`${btnSecondary} !px-1.5 !py-0.5 !text-[11px]`} title="Đính kèm ảnh chụp bill">
                                      <Fa name="paperclip" />
                                    </button>
                                  </form>
                                </span>
                              ) : null}
                            </td>
                            <td className={`${tdClass} whitespace-nowrap`}>
                              <input form="lots-save" name={`${p}qtyLeft`} inputMode="numeric" defaultValue={l.qtyLeft} className={`${adminInput} !mb-0 inline-block !w-[64px] !py-1 text-center !text-[13px]`} aria-label="Số lượng còn" />
                              <span className="ml-1 text-[12px] text-lien-muted">/ {l.qtyIn}</span>
                              {v?.heldQty ? <span className="block text-[11px] text-green-700">+{v.heldQty} đã thanh toán</span> : null}
                            </td>
                            <td className={`${tdClass} text-[12px]`}>
                              {held.length ? (
                                <>
                                  {held.map((r) => (
                                    <Link key={`${r.itemId}`} href={`/admin/orders/${r.orderId}/`} className="mr-1 inline-block rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800 no-underline hover:underline" title="Giữ chỗ cho đơn (chưa trừ)">
                                      #{r.orderNumber} ×{r.qty}
                                    </Link>
                                  ))}
                                  <span className="block text-lien-muted">trống {Math.max(0, free)}</span>
                                </>
                              ) : (
                                <span className="text-lien-muted">—</span>
                              )}
                            </td>
                            <td className={tdClass}>{srcField(`${p}sourceKey`, l.sourceKey, `lot-${l.id}-src`, "lots-save")}</td>
                            <td className={tdClass}>
                              <input form="lots-save" name={`${p}unitCostJpy`} inputMode="numeric" defaultValue={l.unitCostJpy ?? ""} placeholder="¥" className={`${adminInput} !mb-0 !w-[84px] !py-1 !text-[13px]`} aria-label="Giá vốn ¥" />
                              {l.unitCostVnd ? <span className="block text-[11px] text-lien-muted">≈ {formatAmount(l.unitCostVnd)}đ</span> : null}
                            </td>
                            <td className={tdClass}>
                              <input form="lots-save" name={`${p}expiry`} defaultValue={l.expiry ?? ""} placeholder="2027-03-31" className={`${adminInput} !mb-0 !w-[118px] !py-1 !text-[13px]`} aria-label="Hạn dùng" />
                              <span className={cn("mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold", EXP_CLS[st])}>
                                {EXPIRY_LABEL[st]}
                                {days !== null ? ` · ${days < 0 ? `${-days} ngày trước` : `${days} ngày`}` : ""}
                              </span>
                            </td>
                            <td className={tdClass}>
                              {whField(l.warehouse, `lot-${l.id}-wh`, undefined, `${p}warehouse`)}
                              {l.inTransit ? <span className="block text-[11px] text-indigo-700">{describeLocation(l.warehouse, true)}</span> : null}
                              {v?.batchCode ? <span className="block text-[11px] text-lien-muted">đợt {v.batchCode}</span> : null}
                              {v?.shipmentCode ? <span className="block text-[11px] text-amber-800">chuyến {v.shipmentCode}</span> : null}
                            </td>
                            <td className={tdClass}>
                              <select form="lots-save" name={`${p}billId`} defaultValue={v?.receiptId ?? ""} className={`${adminInput} !mb-0 !w-[150px] !py-1 !text-[12px]`} aria-label="Bill">
                                <option value="">— chưa gắn bill —</option>
                                {bills.map((b) => (
                                  <option key={b.id} value={b.id}>
                                    {b.code} · {formatDate(b.boughtAt)}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className={tdClass}>
                              <input form="lots-save" name={`${p}note`} defaultValue={l.note} className={`${adminInput} !mb-0 !w-[180px] !py-1 !text-[13px]`} aria-label="Ghi chú" />
                            </td>
                            <td className={`${tdClass} whitespace-nowrap`}>
                              <form action={updateLotAction} className="inline">
                                <input type="hidden" name="productId" value={pid} />
                                <input type="hidden" name="lotId" value={l.id} />
                                <input type="hidden" name="remove" value="1" />
                                <ConfirmSubmit message={`Xoá lô #${l.id} (${l.qtyLeft} đv)? Tồn kho tính lại.`} className={`${btnSecondary} !px-2 !py-1 !text-[12px] !text-lien-heart`}>
                                  <Fa name="trash" />
                                </ConfirmSubmit>
                              </form>
                            </td>
                          </tr>
                        </React.Fragment>
                      );
                    })}
                  {lots.length === 0 ? (
                    <tr>
                      <td colSpan={10} className={`${tdClass} text-center text-lien-muted`}>
                        Chưa có lô nào — nhập lô ở khung bên phải, hoặc thêm vào đợt ở Quản lý mua hàng › Mua theo đợt.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            {lots.length ? <FixedSaveBar forms={["lots-save"]} hint="Sửa nhiều ô rồi lưu một lần; đổi “Kho” = chuyển lô sang vị trí khác." /> : null}
            <p className="mt-3 mb-0 text-[12px] leading-5 text-lien-muted">Khi khách đặt hàng, đơn giữ chỗ trên lô có hạn dùng gần nhất trước (FEFO, kể cả lô đang ở Nhật); số “còn” chỉ trừ thật khi đơn được xác nhận thanh toán hoặc thu khi giao. Tồn kho ngoài web = tổng “còn” của các lô ở cả bốn vị trí trừ phần đã giữ.</p>
          </Card>

          {orderLines.length ? (
            <Card title={`Đang mua theo đơn (${orderLines.length} dòng)`}>
              <ul className="m-0 list-none space-y-1 p-0 text-[13px]" data-testid="product-order-lines">
                {orderLines.map((g) => (
                  <li key={g.itemId} className="flex flex-wrap items-center gap-2">
                    <Link href={`/admin/orders/${g.orderId}/`} className="font-semibold text-lien-blue hover:underline">
                      #{g.orderNumber}
                    </Link>
                    <span className="font-semibold">×{g.qty}</span>
                    {g.parts.map((p, i) => (
                      <span key={i} className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", p.sourceType === "buy" ? "bg-gray-200 text-gray-700" : p.consumed ? "bg-green-100 text-green-800" : p.sourceType === "lot" ? "bg-green-100 text-green-800" : "bg-sky-100 text-sky-800")}>
                        {p.sourceType === "buy" ? "Cần mua" : p.sourceType === "lot" ? (p.consumed ? "đã trừ" : "giữ") + ` lô #${p.sourceId ?? "?"}` : p.sourceType === "stock_purchase" ? `phiếu #${p.sourceId}` : `đợt #${p.sourceId}`}
                        {g.parts.length > 1 ? ` ×${p.qty}` : ""}
                      </span>
                    ))}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {open.length ? (
            <Card title="Đang mua lưu kho (chưa về)">
              <ul className="m-0 list-none space-y-1 p-0 text-[13px]">
                {open.map((p) => {
                  const st = PURCHASE_STAGES[purchaseIndex(p.status)];
                  return (
                    <li key={p.id} className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{p.qty} đv</span>
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", st.cls)}>{st.short}</span>
                      <span className="text-lien-muted">
                        {purchaseSourceName(p.sourceKey, sources)}
                        {p.unitCostJpy ? ` · ¥${p.unitCostJpy.toLocaleString("ja-JP")}` : ""}
                        {p.expiry ? ` · HSD ${formatDate(p.expiry)}` : ""} · tạo {formatDate(p.createdAt)}
                      </span>
                      {reservations
                        .filter((r) => r.sourceType === "stock_purchase" && r.sourceId === p.id)
                        .map((r) => (
                          <Link key={r.itemId} href={`/admin/orders/${r.orderId}/`} className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800 no-underline hover:underline" title="Giữ cho đơn">
                            #{r.orderNumber} ×{r.qty}
                          </Link>
                        ))}
                      <Link href="/admin/purchases/?tab=stock" className="text-lien-blue hover:underline">
                        cập nhật →
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ) : null}
        </div>

        <Card title="Nhập lô trực tiếp">
          <div className="mb-3 flex items-center gap-2">
            {product.thumb ? <Image src={product.thumb} alt="" width={44} height={44} className="h-11 w-11 rounded border border-[#e5e7eb] object-contain" /> : null}
            <span className="text-[12px] text-lien-muted">
              #{product.id}
              {product.sku ? ` · ${product.sku}` : ""} · giá vốn hiện tại {product.costJpy ? `¥${product.costJpy.toLocaleString("ja-JP")}` : "—"}
            </span>
          </div>
          <form action={addLotAction} className="grid gap-3" data-testid="add-lot">
            <input type="hidden" name="productId" value={pid} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={adminLabel} htmlFor="al-qty">
                  Số lượng
                </label>
                <input id="al-qty" name="qty" inputMode="numeric" required className={adminInput} />
              </div>
              <div>
                <label className={adminLabel} htmlFor="al-date">
                  Ngày nhập
                </label>
                <input id="al-date" name="receivedAt" defaultValue={todayIso()} className={adminInput} />
              </div>
            </div>
            <div>
              <label className={adminLabel} htmlFor="al-src">
                Nguồn nhập
              </label>
              {srcField("sourceKey", product.costSource || "unknown", "al-src")}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={adminLabel} htmlFor="al-jpy">
                  Giá vốn ¥/đv <span className="font-normal text-lien-muted">(trống = giá vốn hiện tại)</span>
                </label>
                <input id="al-jpy" name="unitCostJpy" inputMode="numeric" defaultValue={product.costJpy ?? ""} className={adminInput} />
              </div>
              <div>
                <label className={adminLabel} htmlFor="al-exp">
                  Hạn dùng
                </label>
                <input id="al-exp" name="expiry" placeholder="2027-03-31 · 03/2027" className={adminInput} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={adminLabel} htmlFor="al-wh">
                  Kho
                </label>
                {whField("vn", "al-wh", "")}
              </div>
              
            </div>
            <div>
              <label className={adminLabel} htmlFor="al-note">
                Ghi chú
              </label>
              <input id="al-note" name="note" placeholder="Mua tại Don Quijote khi về Nhật 9/2026…" className={adminInput} />
            </div>
            <button type="submit" className={`${btnPrimary} justify-self-start`}>
              <Fa name="plus" /> Nhập lô
            </button>
          </form>
          <p className="mt-3 mb-0 text-[12px] leading-5 text-lien-muted">Hàng mua trước rồi mới về (theo dõi đường đi) thì tạo phiếu “Mua lưu kho” ở Quản lý mua hàng; khi chuyển trạng thái “Đã nhận được hàng (kho shop)” lô sẽ tự được tạo ở đây.</p>
        </Card>
      </div>
    </>
  );
}
