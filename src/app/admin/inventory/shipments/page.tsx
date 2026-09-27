import Image from "next/image";
import Link from "next/link";
import { createShipmentAction, deleteShipmentAction, packProductAction, setShipmentStatusAction, unpackLotAction, updateShipmentAction } from "@/app/admin/inventory/shipments/actions";
import { ConfirmSubmit } from "@/components/sites/lienstore/admin/ConfirmSubmit";
import { type PickableProduct, ProductSearchSelect } from "@/components/sites/lienstore/admin/ProductSearchSelect";
import { adminInput, adminLabel, btnPrimary, btnSecondary, Card, Flash, PageHeader, tableClass, tdClass, thClass } from "@/components/sites/lienstore/admin/ui";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { requireAdmin } from "@/lib/auth";
import { getAllProducts, listPurchaseSources } from "@/lib/db";
import { formatAmount, formatDate } from "@/lib/format";
import { listLotViews } from "@/lib/lots-db";
import { daysToExpiry, expiryState } from "@/lib/lots";
import { purchaseSourceName } from "@/lib/purchase-sources";
import { SHIPMENT_STAGES, shipmentEditable, shipmentStage } from "@/lib/shipments";
import { listShipments, type Shipment } from "@/lib/shipments-db";
import { getDb } from "@/lib/sqlite";
import { cn } from "@/lib/utils";
import type { PurchaseSource } from "@/types/shop";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const EXP_CLS = { expired: "bg-red-100 text-red-800", soon: "bg-amber-100 text-amber-800", ok: "", none: "" } as const;

/**
 * Kho hàng › Đóng hàng: packing runs from Kho Nhật (shop) to the carrier. Search a product, type how many go into the
 * box — units leave the shelf (FEFO, paid orders first); the run then walks Đã đóng xong → Đã giao ĐVVC → NB→VN → …
 */
export default async function ShipmentsPage({ searchParams }: Props) {
  await requireAdmin("inventory");
  const sp = await searchParams;
  const includeDone = first(sp.done) === "1";
  const [shipments, allProducts, sources] = await Promise.all([Promise.resolve(listShipments(includeDone)), getAllProducts(true), listPurchaseSources()]);
  const db = getDb();
  // what could still be packed: units on the shelf at Kho Nhật (shop) per product
  const shelf = listLotViews(db, { side: "jp" }).filter((l) => l.warehouse === "jp" && !l.inTransit && l.shipmentId === null);
  const shelfByProduct = new Map<number, number>();
  for (const l of shelf) shelfByProduct.set(l.productId, (shelfByProduct.get(l.productId) ?? 0) + l.physical);
  const pickable: PickableProduct[] = allProducts.filter((p) => shelfByProduct.has(p.id)).map((p) => ({ id: p.id, name: p.name, nameJa: p.nameJa, sku: p.sku, thumb: p.thumb, costJpy: p.costJpy, stock: shelfByProduct.get(p.id) ?? 0 }));
  const shelfUnits = shelf.reduce((n, l) => n + l.physical, 0);
  const saved = first(sp.saved);
  const error = first(sp.error);
  return (
    <>
      <PageHeader
        title="Đóng hàng"
        subtitle={`Đóng hàng từ Kho Nhật (shop) gửi ĐVVC · ${shipments.filter((s) => s.status !== "done").length} chuyến đang mở · trên kệ Kho Nhật còn ${shelfUnits} đv (${shelfByProduct.size} sản phẩm) chưa đóng`}
        actions={
          <Link href="/admin/inventory/?side=jp" className={btnSecondary}>
            <Fa name="archive" /> Tồn kho › Kho Nhật
          </Link>
        }
      />
      {saved ? <Flash>{saved}</Flash> : null}
      {error ? <Flash kind="error">{error}</Flash> : null}

      <div className="mb-4 grid gap-3 md:grid-cols-2">
        <details className="min-w-0" open={shipments.length === 0} data-testid="new-shipment">
          <summary className={cn(btnPrimary, "inline-block cursor-pointer list-none")}>+ Chuyến hàng mới</summary>
          <div className="mt-2">
            <Card title="Mở chuyến đóng hàng mới">
              <form action={createShipmentAction} className="grid gap-3 sm:grid-cols-[1fr_150px] sm:items-end" data-testid="shipment-create">
                <div>
                  <label className={adminLabel} htmlFor="ns-label">
                    Tên chuyến <span className="font-normal text-lien-muted">— tuỳ chọn</span>
                  </label>
                  <input id="ns-label" name="label" placeholder="VD: Kiến tuần 40 · thùng 1" maxLength={80} className={adminInput} />
                </div>
                <div>
                  <label className={adminLabel} htmlFor="ns-date">
                    Ngày dự kiến gửi
                  </label>
                  <input id="ns-date" name="plannedAt" placeholder="2026-10-02" className={adminInput} />
                </div>
                <div className="sm:col-span-2">
                  <label className={adminLabel} htmlFor="ns-note">
                    Ghi chú
                  </label>
                  <input id="ns-note" name="note" maxLength={300} className={adminInput} />
                </div>
                <button type="submit" className={`${btnPrimary} justify-self-start`}>
                  + Mở chuyến
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
                  <b>Mở chuyến</b> (một thùng / một lần gửi), rồi trong chuyến <b>tìm sản phẩm</b> và nhập <b>số lượng đóng</b> → hàng rời kệ Kho Nhật ngay (lấy lô hạn gần trước, hàng khách đã thanh toán đi trước).
                </li>
                <li>
                  Hàng đã đóng nằm ở nhánh <b>“Đã đóng hàng, chờ xuất ĐVVC”</b> trong Tồn kho › Kho Nhật; số “tại kho shop” giảm tương ứng. Rút lại được khi chuyến chưa xuất.
                </li>
                <li>
                  <b>Trạng thái chuyến:</b> Đang đóng → Đã đóng xong → <b>Đã chuyển cho ĐVVC</b> → NB→VN → Kho ĐVVC VN → Về kho shop VN. Từ “Đã chuyển cho ĐVVC” mọi lô trong chuyến đổi vị trí theo, dòng đơn khách cập nhật theo.
                </li>
                <li>Ở Tồn kho › Kho Nhật cũng có thể tick lô → “Đóng vào chuyến”.</li>
              </ol>
            </Card>
          </div>
        </details>
      </div>

      <div className="space-y-5">
        {shipments.length === 0 ? (
          <Card>
            <p className="m-0 text-[13px] text-lien-muted">Chưa có chuyến nào. Bấm “+ Chuyến hàng mới”.</p>
          </Card>
        ) : null}
        {shipments.map((s) => (
          <ShipmentCard key={s.id} s={s} products={pickable} sources={sources} />
        ))}
        <p className="m-0 text-[12px] text-lien-muted">
          <Link href={`/admin/inventory/shipments/${includeDone ? "" : "?done=1"}`} className="text-lien-blue hover:underline">
            {includeDone ? "Ẩn chuyến đã về kho VN" : "Xem cả chuyến đã về kho VN"}
          </Link>
        </p>
      </div>
    </>
  );
}

function ShipmentCard({ s, products, sources }: { s: Shipment; products: PickableProduct[]; sources: PurchaseSource[] }) {
  const stage = shipmentStage(s.status);
  const editable = shipmentEditable(s.status);
  return (
    <div id={`shipment-${s.id}`} data-testid={`shipment-${s.id}`}>
      <Card
        title={`${s.code}${s.label ? ` · ${s.label}` : ""}`}
        actions={
          <span className="flex items-center gap-3">
            <span className="text-[12px] text-lien-muted">
              <b className="text-lien-heading">{s.units}</b> đv · {s.lots.length} lô{s.heldUnits ? ` · ${s.heldUnits} đv đã có khách` : ""}
              {s.jpy !== null ? ` · ≈ ¥${formatAmount(s.jpy)}` : ""}
            </span>
            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", stage.cls)}>{stage.short}</span>
            {editable ? (
              <form action={deleteShipmentAction}>
                <input type="hidden" name="shipmentId" value={s.id} />
                <ConfirmSubmit message={`Xoá chuyến ${s.code}? ${s.lots.length} lô trở lại kệ Kho Nhật.`} className="text-[12px] text-lien-heart hover:underline">
                  Xoá chuyến
                </ConfirmSubmit>
              </form>
            ) : null}
          </span>
        }
      >
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-[#e5e7eb] bg-[#f9fafb] px-3 py-2 text-[13px]">
          <form action={setShipmentStatusAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="shipmentId" value={s.id} />
            <span className="font-semibold text-lien-heading">Trạng thái →</span>
            <select name="status" defaultValue={s.status} className={cn(adminInput, "!mb-0 !w-auto !py-1")} aria-label="Trạng thái chuyến">
              {SHIPMENT_STAGES.map((x) => (
                <option key={x.key} value={x.key}>
                  {x.label}
                </option>
              ))}
            </select>
            <button type="submit" className={cn(btnPrimary, "!py-1")}>
              Cập nhật
            </button>
          </form>
          <span className="text-[12px] text-lien-muted">
            dự kiến gửi {s.plannedAt ? formatDate(s.plannedAt) : "—"} · đã gửi {s.shippedAt ? formatDate(s.shippedAt) : "—"}
            {s.tracking ? ` · ${s.tracking}` : ""}
            {s.note ? ` · ${s.note}` : ""}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>Sản phẩm</th>
                <th className={thClass}>SL đóng</th>
                <th className={thClass}>Lô #</th>
                <th className={thClass}>HSD</th>
                <th className={thClass}>Cho đơn</th>
                <th className={thClass}>Mua ở · ¥/đv</th>
                <th className={thClass}>Vị trí</th>
                {editable ? <th className={thClass} /> : null}
              </tr>
            </thead>
            <tbody>
              {s.lots.length === 0 ? (
                <tr>
                  <td colSpan={8} className={`${tdClass} text-center text-lien-muted`}>
                    Chưa đóng gì — tìm sản phẩm bên dưới và nhập số lượng.
                  </td>
                </tr>
              ) : null}
              {s.lots.map((l) => {
                const st = expiryState(l.expiry);
                const days = daysToExpiry(l.expiry);
                return (
                  <tr key={l.id} className="hover:bg-[#fafafa]" data-testid={`shipment-lot-${l.id}`}>
                    <td className={`${tdClass} min-w-[220px]`}>
                      <div className="flex items-center gap-2">
                        {l.productThumb ? <Image src={l.productThumb} alt="" width={32} height={32} unoptimized className="h-8 w-8 shrink-0 rounded border border-[#e5e7eb] object-contain" /> : null}
                        <span className="flex min-w-0 flex-col leading-4">
                          <Link href={`/admin/inventory/lots/${l.productId}/`} className="line-clamp-2 text-[13px] font-semibold text-lien-heading hover:text-lien-blue">
                            {l.productName}
                          </Link>
                          <span className="text-[11px] text-lien-muted">
                            #{l.productId}
                            {l.productSku ? ` · ${l.productSku}` : ""}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td className={`${tdClass} font-semibold`}>
                      {l.physical}
                      {l.heldQty ? <span className="block text-[11px] font-normal text-green-700">{l.heldQty} đã TT</span> : null}
                    </td>
                    <td className={`${tdClass} text-[12px]`}>
                      #{l.id}
                      {l.parentLotId ? <span className="block text-lien-muted">tách từ #{l.parentLotId}</span> : null}
                      {l.batchCode ? <span className="block text-lien-muted">đợt {l.batchCode}</span> : null}
                    </td>
                    <td className={`${tdClass} whitespace-nowrap text-[12px]`}>{l.expiry ? <span className={cn("rounded px-1.5 py-0.5", EXP_CLS[st])} title={days !== null ? `${days} ngày` : undefined}>{formatDate(l.expiry)}</span> : <span className="text-lien-muted">—</span>}</td>
                    <td className={`${tdClass} text-[12px]`}>
                      {l.reserved.length === 0 ? <span className="text-lien-muted">—</span> : null}
                      {l.reserved.map((r) => (
                        <Link key={r.orderId} href={`/admin/orders/${r.orderId}/`} className={cn("mr-1 inline-block rounded px-1.5 py-0.5 font-semibold no-underline hover:underline", r.committed ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800")} title={r.committed ? "Đơn đã thanh toán / COD" : "Đơn chưa thanh toán (chỉ giữ chỗ)"}>
                          #{r.orderNumber} ×{r.qty}
                        </Link>
                      ))}
                    </td>
                    <td className={`${tdClass} text-[12px]`}>
                      {purchaseSourceName(l.sourceKey, sources)}
                      {l.unitCostJpy ? ` · ¥${formatAmount(l.unitCostJpy)}` : ""}
                    </td>
                    <td className={`${tdClass} text-[12px]`}>{editable ? "Kho Nhật (shop) · đã đóng" : l.inTransit ? "đang bay / đang về" : l.warehouse === "jp_carrier" ? "Kho ĐVVC Nhật" : l.warehouse === "carrier" ? "Kho ĐVVC VN" : l.warehouse === "vn" ? "Kho Việt Nam (shop)" : "Kho Nhật (shop)"}</td>
                    {editable ? (
                      <td className={`${tdClass} whitespace-nowrap`}>
                        <form action={unpackLotAction} className="inline">
                          <input type="hidden" name="shipmentId" value={s.id} />
                          <input type="hidden" name="lotId" value={l.id} />
                          <button type="submit" className={cn(btnSecondary, "!px-2 !py-1 !text-[12px] !text-lien-heart")} title="Rút khỏi chuyến — trở lại kệ Kho Nhật">
                            ✕ rút
                          </button>
                        </form>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {editable ? (
          <form action={packProductAction} className="mt-3 grid gap-2 rounded-md border border-dashed border-[#d1d5db] bg-white px-3 py-2 lg:grid-cols-[minmax(260px,1fr)_110px_auto] lg:items-end" data-testid={`pack-${s.id}`}>
            <input type="hidden" name="shipmentId" value={s.id} />
            <div>
              <label className={adminLabel}>
                Thêm vào chuyến <span className="font-normal text-lien-muted">— chỉ sản phẩm đang có trên kệ Kho Nhật (số trong ngoặc = còn trên kệ)</span>
              </label>
              <ProductSearchSelect products={products} placeholder="Gõ tên Việt / Nhật hoặc SKU…" />
            </div>
            <div>
              <label className={adminLabel} htmlFor={`pq-${s.id}`}>
                Số lượng đóng
              </label>
              <input id={`pq-${s.id}`} name="qty" inputMode="numeric" required className={cn(adminInput, "!py-1.5 !text-[13px]")} />
            </div>
            <button type="submit" className={cn(btnPrimary, "!py-1.5 !text-[13px]")}>
              + Thêm
            </button>
          </form>
        ) : null}

        <details className="mt-3">
          <summary className="cursor-pointer text-[12px] text-lien-blue">Sửa thông tin chuyến (tên, ngày dự kiến gửi, ngày gửi, mã vận đơn, ghi chú)</summary>
          <form action={updateShipmentAction} className="mt-2 grid gap-2 lg:grid-cols-[1fr_130px_130px_160px_1fr_auto] lg:items-end">
            <input type="hidden" name="shipmentId" value={s.id} />
            <div>
              <label className={adminLabel} htmlFor={`ul-${s.id}`}>
                Tên chuyến
              </label>
              <input id={`ul-${s.id}`} name="label" defaultValue={s.label} maxLength={80} className={cn(adminInput, "!py-1.5 !text-[13px]")} />
            </div>
            <div>
              <label className={adminLabel} htmlFor={`up-${s.id}`}>
                Dự kiến gửi
              </label>
              <input id={`up-${s.id}`} name="plannedAt" defaultValue={s.plannedAt ?? ""} placeholder="2026-10-02" className={cn(adminInput, "!py-1.5 !text-[13px]")} />
            </div>
            <div>
              <label className={adminLabel} htmlFor={`ud-${s.id}`}>
                Ngày gửi
              </label>
              <input id={`ud-${s.id}`} name="shippedAt" defaultValue={s.shippedAt ?? ""} placeholder="2026-10-02" className={cn(adminInput, "!py-1.5 !text-[13px]")} />
            </div>
            <div>
              <label className={adminLabel} htmlFor={`ut-${s.id}`}>
                Mã vận đơn
              </label>
              <input id={`ut-${s.id}`} name="tracking" defaultValue={s.tracking} maxLength={120} className={cn(adminInput, "!py-1.5 !text-[13px]")} />
            </div>
            <div>
              <label className={adminLabel} htmlFor={`un-${s.id}`}>
                Ghi chú
              </label>
              <input id={`un-${s.id}`} name="note" defaultValue={s.note} maxLength={300} className={cn(adminInput, "!py-1.5 !text-[13px]")} />
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
