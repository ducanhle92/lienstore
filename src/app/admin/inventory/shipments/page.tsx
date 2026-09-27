import Image from "next/image";
import Link from "next/link";
import { createShipmentAction, deleteShipmentAction, packCandidatesAction, setShipmentStatusAction, unpackLotAction, updateShipmentAction } from "@/app/admin/inventory/shipments/actions";
import { FixedSaveBar } from "@/components/sites/lienstore/admin/FixedSaveBar";
import { SelectAll } from "@/components/sites/lienstore/admin/SelectAll";
import { ConfirmSubmit } from "@/components/sites/lienstore/admin/ConfirmSubmit";
import { adminInput, adminLabel, btnPrimary, btnSecondary, Card, Flash, PageHeader, tableClass, tdClass, thClass } from "@/components/sites/lienstore/admin/ui";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { requireAdmin } from "@/lib/auth";
import { listPurchaseSources } from "@/lib/db";
import { formatAmount, formatDate } from "@/lib/format";
import { daysToExpiry, expiryState } from "@/lib/lots";
import { purchaseSourceName } from "@/lib/purchase-sources";
import { SHIPMENT_STAGES, shipmentEditable, shipmentStage } from "@/lib/shipments";
import { listPackCandidates, listPackSources, listShipments, type PackCandidate, type Shipment } from "@/lib/shipments-db";
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
  const [shipments, sources] = await Promise.all([Promise.resolve(listShipments(includeDone)), listPurchaseSources()]);
  const db = getDb();
  // what could still be packed: lots on the shelf at Kho Nhật (shop) + bought order lines without a lot yet
  const allCands = listPackCandidates(db);
  const shelfUnits = allCands.reduce((n, c) => n + c.qty, 0);
  const shelfProducts = new Set(allCands.map((c) => c.productId)).size;
  const pickSources = listPackSources(db);
  // the picker of one run: ?pick=<shipmentId>&by=order|batch|q&order=…&batch=…&q=…
  const pickFor = Number.parseInt(first(sp.pick), 10);
  const by = first(sp.by) === "order" ? "order" : first(sp.by) === "batch" ? "batch" : first(sp.by) === "q" ? "q" : "";
  const pickOrder = first(sp.order);
  const pickBatch = Number.parseInt(first(sp.batch), 10);
  const pickQ = first(sp.q).trim();
  const pickFilter = by === "order" && pickOrder ? { orderId: pickOrder } : by === "batch" && Number.isInteger(pickBatch) ? { batchId: pickBatch } : by === "q" ? { q: pickQ } : null;
  const picked = Number.isInteger(pickFor) && pickFilter ? listPackCandidates(db, pickFilter) : [];
  const saved = first(sp.saved);
  const error = first(sp.error);
  return (
    <>
      <PageHeader
        title="Đóng hàng"
        subtitle={`Đóng hàng từ Kho Nhật (shop) gửi ĐVVC · ${shipments.filter((s) => s.status !== "done").length} chuyến đang mở · ở Kho Nhật còn ${shelfUnits} đv (${shelfProducts} sản phẩm) chưa đóng`}
        actions={
          <Link href="/admin/inventory/?side=jp" className={btnSecondary}>
            <Fa name="archive" /> Tồn kho › Kho Nhật
          </Link>
        }
      />
      {saved ? <Flash>{saved}</Flash> : null}
      {error ? <Flash kind="error">{error}</Flash> : null}
      {allCands.length && shipments.some((x) => shipmentEditable(x.status)) ? <FixedSaveBar forms={shipments.filter((x) => shipmentEditable(x.status)).map((x) => `pk-${x.id}`)} label="Thêm vào chuyến (đã tick)" resetLabel="Bỏ tick" hint="Hàng theo đơn đang ở Kho Nhật được tick sẵn; bỏ tick / sửa SL rồi bấm. Nhiều chuyến đang mở → thêm vào chuyến vừa tick." /> : null}

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
                  <b>Mở chuyến</b> (một thùng / một lần gửi), rồi trong chuyến <b>chọn hàng đóng</b>: theo <b>đơn</b> (mọi sản phẩm của đơn), theo <b>đợt mua</b> (mọi hàng của đợt còn ở Kho Nhật) hoặc <b>tìm</b> sản phẩm / đơn. Tick dòng (hoặc chọn tất cả), sửa SL nếu chỉ đóng một phần, bấm <b>Thêm vào chuyến</b> → hàng rời kệ Kho Nhật ngay.
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
          <ShipmentCard key={s.id} s={s} sources={sources} pick={s.id === pickFor && pickFilter ? { by, order: pickOrder, batch: Number.isInteger(pickBatch) ? pickBatch : null, q: pickQ, rows: picked } : shipmentEditable(s.status) ? { by: "", order: "", batch: null, q: "", rows: allCands } : null} pickSources={pickSources} />
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

interface Pick {
  by: "" | "order" | "batch" | "q";
  order: string;
  batch: number | null;
  q: string;
  rows: PackCandidate[];
}
type PickSources = ReturnType<typeof listPackSources>;

function ShipmentCard({ s, sources, pick, pickSources }: { s: Shipment; sources: PurchaseSource[]; pick: Pick | null; pickSources: PickSources }) {
  const stage = shipmentStage(s.status);
  const editable = shipmentEditable(s.status);
  const pkId = `pk-${s.id}`;
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
                    Chưa đóng gì — tick hàng ở khối “Chọn hàng đóng vào chuyến” bên dưới rồi bấm Thêm vào chuyến.
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
          <details className="mt-3 rounded-md border border-dashed border-[#d1d5db] bg-white" open={!!pick} data-testid={`pick-${s.id}`}>
            <summary className="cursor-pointer px-3 py-2 text-[13px] font-semibold text-lien-heading">
              Chọn hàng đóng vào chuyến <span className="font-normal text-lien-muted">— hàng theo đơn đang ở Kho Nhật hiện trước và tick sẵn; thu hẹp theo đơn / đợt mua / tìm nếu cần</span>
            </summary>
            <div className="px-3 pb-3">
              {/* three ways to list candidates; each is a GET so the list renders server-side */}
              <div className="grid gap-2 lg:grid-cols-3">
                <form method="get" className="flex items-end gap-1" data-testid={`pick-order-${s.id}`}>
                  <input type="hidden" name="pick" value={s.id} />
                  <input type="hidden" name="by" value="order" />
                  <div className="min-w-0 flex-1">
                    <label className={adminLabel} htmlFor={`po-${s.id}`}>
                      Theo đơn <span className="font-normal text-lien-muted">({pickSources.orders.length} đơn có hàng ở Kho Nhật)</span>
                    </label>
                    <select id={`po-${s.id}`} name="order" defaultValue={pick?.by === "order" ? pick.order : ""} className={cn(adminInput, "!mb-0 !py-1 !text-[13px]")}>
                      <option value="">— chọn đơn —</option>
                      {pickSources.orders.map((o) => (
                        <option key={o.orderId} value={o.orderId}>
                          #{o.orderNumber} · {o.customer} · {o.units} đv
                        </option>
                      ))}
                    </select>
                  </div>
                  <button type="submit" className={cn(btnSecondary, "!py-1")}>
                    Xem
                  </button>
                </form>
                <form method="get" className="flex items-end gap-1" data-testid={`pick-batch-${s.id}`}>
                  <input type="hidden" name="pick" value={s.id} />
                  <input type="hidden" name="by" value="batch" />
                  <div className="min-w-0 flex-1">
                    <label className={adminLabel} htmlFor={`pb-${s.id}`}>
                      Theo đợt mua <span className="font-normal text-lien-muted">(hàng của đợt còn ở Kho Nhật)</span>
                    </label>
                    <select id={`pb-${s.id}`} name="batch" defaultValue={pick?.by === "batch" && pick.batch ? String(pick.batch) : ""} className={cn(adminInput, "!mb-0 !py-1 !text-[13px]")}>
                      <option value="">— chọn đợt —</option>
                      {pickSources.batches.map((b) => (
                        <option key={b.batchId} value={b.batchId}>
                          {b.code} · {b.units} đv
                        </option>
                      ))}
                    </select>
                  </div>
                  <button type="submit" className={cn(btnSecondary, "!py-1")}>
                    Xem
                  </button>
                </form>
                <form method="get" className="flex items-end gap-1" data-testid={`pick-q-${s.id}`}>
                  <input type="hidden" name="pick" value={s.id} />
                  <input type="hidden" name="by" value="q" />
                  <div className="min-w-0 flex-1">
                    <label className={adminLabel} htmlFor={`pq-${s.id}`}>
                      Tìm sản phẩm / đơn <span className="font-normal text-lien-muted">(trống = tất cả)</span>
                    </label>
                    <input id={`pq-${s.id}`} name="q" defaultValue={pick?.by === "q" ? pick.q : ""} placeholder="tên, SKU, #đơn, tên khách…" className={cn(adminInput, "!mb-0 !py-1 !text-[13px]")} />
                  </div>
                  <button type="submit" className={cn(btnSecondary, "!py-1")}>
                    Tìm
                  </button>
                </form>
              </div>

              {pick ? (
                <>
                  <form id={pkId} action={packCandidatesAction}>
                    <input type="hidden" name="shipmentId" value={s.id} />
                  </form>
                  {(() => {
                    // ① what customers are waiting for (ticked by default) · ② stock with no order behind it
                    const orderRows = pick.rows.filter((c) => c.orders.length).sort((x, y) => Math.min(...x.orders.map((o) => o.orderNumber)) - Math.min(...y.orders.map((o) => o.orderNumber)));
                    const stockRows = pick.rows.filter((c) => !c.orders.length);
                    const units = (rows: PackCandidate[]) => rows.reduce((n, c) => n + c.qty, 0);
                    return (
                      <div data-select-scope={pkId}>
                        <div className="mt-3 flex flex-wrap items-center gap-3 text-[12px]">
                          <SelectAll scope={pkId} />
                          <span className="text-lien-muted">
                            {pick.rows.length} dòng · {units(pick.rows)} đv
                            {pick.by === "order" ? " của đơn đã chọn" : pick.by === "batch" ? " của đợt đã chọn" : pick.q ? ` khớp “${pick.q}”` : " đang ở Kho Nhật (shop)"}
                          </span>
                          <button type="submit" form={pkId} className={cn(btnPrimary, "ml-auto !py-1 !text-[13px]")}>
                            + Thêm vào chuyến (đã tick)
                          </button>
                        </div>
                        <p className="mt-3 mb-1 text-[13px] font-semibold text-lien-heading" data-testid={`pick-orders-${s.id}`}>
                          ① Hàng theo đơn đang ở Kho Nhật <span className="font-normal text-lien-muted">({orderRows.length} dòng · {units(orderRows)} đv — tick sẵn, đóng trước để hàng tới tay khách)</span>
                        </p>
                        <CandTable rows={orderRows} pkId={pkId} pick={pick} sources={sources} checked empty="Không có hàng theo đơn nào đang ở Kho Nhật (shop)." />
                        {stockRows.length ? (
                          <details className="mt-3" open={pick.by !== ""} data-testid={`pick-stock-${s.id}`}>
                            <summary className="cursor-pointer text-[13px] font-semibold text-lien-heading">
                              ② Hàng tồn kho không theo đơn <span className="font-normal text-lien-muted">({stockRows.length} dòng · {units(stockRows)} đv — bấm để mở)</span>
                            </summary>
                            <CandTable rows={stockRows} pkId={pkId} pick={pick} sources={sources} checked={false} empty="" />
                          </details>
                        ) : null}
                      </div>
                    );
                  })()}
                </>
              ) : null}
            </div>
          </details>
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

function CandTable({ rows, pkId, pick, sources, checked, empty }: { rows: PackCandidate[]; pkId: string; pick: Pick; sources: PurchaseSource[]; checked: boolean; empty: string }) {
  return (
    <div className="overflow-x-auto">
      <table className={tableClass}>
        <thead>
          <tr>
            <th className={cn(thClass, "w-8")} />
            <th className={thClass}>Sản phẩm</th>
            <th className={thClass}>Ở Kho Nhật</th>
            <th className={thClass}>SL đóng</th>
            <th className={thClass}>Đơn</th>
            <th className={thClass}>Đợt mua</th>
            <th className={thClass}>HSD</th>
            <th className={thClass}>Mua ở · ¥</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={8} className={`${tdClass} text-center text-lien-muted`}>
                {empty || "—"}
              </td>
            </tr>
          ) : null}
          {rows.map((c) => (
            <tr key={c.key} className="hover:bg-[#fafafa]" data-testid={`cand-${c.key.replace(":", "-")}`}>
              <td className={`${tdClass} w-8`}>
                <input type="checkbox" name="keys" value={c.key} form={pkId} defaultChecked={checked} className="h-4 w-4" aria-label={`Chọn ${c.productName}`} />
              </td>
              <td className={`${tdClass} min-w-[220px]`}>
                <div className="flex items-center gap-2">
                  {c.productThumb ? <Image src={c.productThumb} alt="" width={32} height={32} unoptimized className="h-8 w-8 shrink-0 rounded border border-[#e5e7eb] object-contain" /> : null}
                  <span className="flex min-w-0 flex-col leading-4">
                    <span className="line-clamp-2 text-[13px] font-semibold text-lien-heading">{c.productName}</span>
                    <span className="text-[11px] text-lien-muted">
                      #{c.productId}
                      {c.productSku ? ` · ${c.productSku}` : ""}
                      {c.kind === "lot" ? ` · lô #${c.lotId}` : " · hàng theo đơn (chưa có lô)"}
                    </span>
                  </span>
                </div>
              </td>
              <td className={`${tdClass} font-semibold`}>
                {c.qty}
                {c.heldQty ? <span className="block text-[11px] font-normal text-green-700">{c.heldQty} đã TT</span> : null}
              </td>
              <td className={tdClass}>
                {c.kind === "lot" && c.qty - c.heldQty >= 1 ? (
                  (() => {
                    // prefill with what the customers on this row need (paid units travel by themselves); "theo đơn" narrows to that order
                    const mine = pick.by === "order" ? c.orders.filter((o) => o.orderId === pick.order) : c.orders;
                    const unpaid = mine.filter((o) => !o.committed).reduce((n, o) => n + o.qty, 0);
                    const def = mine.length ? Math.min(unpaid, c.qty - c.heldQty) : undefined;
                    return <input name={`qty_${c.key.replace(":", "_")}`} form={pkId} inputMode="numeric" defaultValue={def === undefined ? "" : String(def)} placeholder={String(c.qty - c.heldQty)} className={cn(adminInput, "!mb-0 !w-14 !py-1 !text-center !text-[13px]")} aria-label="Số đơn vị chưa bán đóng (trống = cả dòng)" title="Trống = cả dòng; số nhỏ hơn = chỉ đóng bấy nhiêu đơn vị chưa bán (hàng khách đã thanh toán luôn đi cùng); 0 = chỉ hàng đã thanh toán" />;
                  })()
                ) : (
                  <span className="text-[12px] text-lien-muted">cả dòng</span>
                )}
              </td>
              <td className={`${tdClass} text-[12px]`}>
                {c.orders.length === 0 ? <span className="text-lien-muted">— lưu kho</span> : null}
                {c.orders.map((o) => (
                  <Link key={o.orderId} href={`/admin/orders/${o.orderId}/`} className={cn("mr-1 inline-block rounded px-1.5 py-0.5 font-semibold no-underline hover:underline", o.committed ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800")} title={o.customer}>
                    #{o.orderNumber} ×{o.qty}
                  </Link>
                ))}
              </td>
              <td className={`${tdClass} text-[12px]`}>{c.batchCode || "—"}</td>
              <td className={`${tdClass} whitespace-nowrap text-[12px]`}>{c.expiry ? formatDate(c.expiry) : "—"}</td>
              <td className={`${tdClass} text-[12px]`}>
                {purchaseSourceName(c.sourceKey, sources)}
                {c.unitCostJpy ? ` · ¥${formatAmount(c.unitCostJpy)}` : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
