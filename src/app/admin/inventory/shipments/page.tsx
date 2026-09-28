import Image from "next/image";
import Link from "next/link";
import { createShipmentAction, deleteShipmentAction, packCandidatesAction, setShipmentStatusAction, unpackUnitsAction, updateShipmentAction } from "@/app/admin/inventory/shipments/actions";
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
import { SHIPMENT_STAGES, shipmentEditable, shipmentIndex, shipmentStage } from "@/lib/shipments";
import { listPackCandidates, listPackSources, listShipments, type PackCandidate, type Shipment } from "@/lib/shipments-db";
import { getDb } from "@/lib/sqlite";
import { listStockGroups } from "@/lib/lots-db";
import { PURCHASE_STAGES, purchaseIndex } from "@/lib/purchase";
import { cn } from "@/lib/utils";
import { FlowSteps } from "@/components/sites/lienstore/admin/FlowSteps";
import { flowCounts } from "@/lib/flow-db";
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
  // ③ Đóng hàng = runs still at the shop (packing / packed); ④ Vận chuyển = runs with the carrier (handed → arrived, + done on demand)
  const transit = first(sp.stage) === "transit";
  const [allShipments, sources] = await Promise.all([Promise.resolve(listShipments(transit && includeDone)), listPurchaseSources()]);
  const shipments = allShipments.filter((x) => (transit ? !shipmentEditable(x.status) : shipmentEditable(x.status)));
  const db = getDb();
  // what could still be packed: units on the shelf at Kho Nhật (shop), not boxed yet
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
  // ④: units with the carrier that are not in any run (moved by hand) — still on the way, so listed here
  const looseTransit = transit ? listStockGroups(db, { statuses: ["to_carrier_jp", "shipped_jp_vn", "at_carrier_vn", "to_shop"] }).filter((g) => !g.shipmentId) : [];
  return (
    <>
      <FlowSteps current={transit ? "transit" : "pack"} counts={flowCounts(db)} />
      <PageHeader
        title={transit ? "Vận chuyển" : "Đóng hàng"}
        subtitle={transit ? `Chuyến đã giao ĐVVC: kho Kiến Nhật → bay NB→VN → kho ĐVVC Hà Nội → về kho shop VN · ${shipments.filter((s) => s.status !== "done").length} chuyến đang đi` : `Đóng hàng từ Kho Nhật (shop) gửi ĐVVC · ${shipments.length} chuyến đang đóng · ở Kho Nhật còn ${shelfUnits} đv (${shelfProducts} sản phẩm) chưa đóng`}
        actions={
          transit ? (
            <Link href="/admin/inventory/?side=vn" className={btnSecondary}>
              <Fa name="building" /> ⑤ Tồn kho VN
            </Link>
          ) : (
            <Link href="/admin/inventory/?side=jp" className={btnSecondary}>
              <Fa name="archive" /> ② Tồn kho Nhật
            </Link>
          )
        }
      />
      {saved ? <Flash>{saved}</Flash> : null}
      {error ? <Flash kind="error">{error}</Flash> : null}
      {!transit && allCands.length && shipments.some((x) => shipmentEditable(x.status)) ? <FixedSaveBar forms={shipments.filter((x) => shipmentEditable(x.status)).map((x) => `pk-${x.id}`)} label="Thêm vào chuyến (đã tick)" resetLabel="Bỏ tick" hint="Hàng theo đơn đang ở Kho Nhật được tick sẵn; bỏ tick / sửa SL rồi bấm. Nhiều chuyến đang mở → thêm vào chuyến vừa tick." /> : null}

      <div className={cn("mb-4 grid gap-3 md:grid-cols-2", transit && "hidden")}>
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
            <p className="m-0 text-[13px] text-lien-muted">{transit ? "Chưa có chuyến nào đang vận chuyển. Chuyến ở ③ Đóng hàng chuyển sang đây khi bấm “Đã chuyển cho ĐVVC”." : "Chưa có chuyến đang đóng. Bấm “+ Chuyến hàng mới”."}</p>
          </Card>
        ) : null}
        {shipments.map((s) => (
          <ShipmentCard key={s.id} s={s} sources={sources} pick={s.id === pickFor && pickFilter ? { by, order: pickOrder, batch: Number.isInteger(pickBatch) ? pickBatch : null, q: pickQ, rows: picked } : shipmentEditable(s.status) ? { by: "", order: "", batch: null, q: "", rows: allCands } : null} pickSources={pickSources} />
        ))}
        {looseTransit.length ? (
          <Card title={`Hàng đang vận chuyển ngoài chuyến (${looseTransit.reduce((n, g) => n + g.qty, 0)} cái · ${looseTransit.length} dòng bill)`}>
            <p className="mb-2 mt-0 text-[12px] text-lien-muted">Hàng đã được chuyển vị trí (ở Tồn kho, đợt mua hoặc đơn hàng) mà không qua chuyến đóng hàng. Đổi trạng thái khi hàng tới nơi.</p>
            <div className="overflow-x-auto">
              <table className={tableClass} data-testid="loose-transit">
                <thead>
                  <tr>
                    <th className={thClass}>Sản phẩm</th>
                    <th className={thClass}>Bill · mã</th>
                    <th className={thClass}>Đang ở</th>
                    <th className={thClass}>SL</th>
                    <th className={thClass}>Giữ cho đơn</th>
                  </tr>
                </thead>
                <tbody>
                  {looseTransit.map((g) => (
                    <tr key={g.key}>
                      <td className={tdClass}>
                        <Link href={`/admin/inventory/lots/${g.productId}/`} className="font-semibold text-lien-heading no-underline hover:underline">
                          {g.productName}
                        </Link>
                      </td>
                      <td className={cn(tdClass, "font-mono text-[12px]")}>
                        {g.receiptCode || "chưa có bill"} <CodeList codes={g.codes} />
                      </td>
                      <td className={cn(tdClass, "text-[13px]")}>{PURCHASE_STAGES[purchaseIndex(g.status)].label}</td>
                      <td className={cn(tdClass, "font-semibold")}>{g.qty}</td>
                      <td className={cn(tdClass, "text-[12px]")}>{g.holders.length ? g.holders.map((h) => `#${h.orderNumber} ×${h.qty}`).join(", ") : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ) : null}
        {transit ? (
          <p className="m-0 text-[12px] text-lien-muted">
            <Link href={`/admin/inventory/shipments/?stage=transit${includeDone ? "" : "&done=1"}`} className="text-lien-blue hover:underline">
              {includeDone ? "Ẩn chuyến đã về kho VN" : "Xem cả chuyến đã về kho VN"}
            </Link>
          </p>
        ) : null}
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
  const next = SHIPMENT_STAGES[shipmentIndex(s.status) + 1] ?? null;
  const pkId = `pk-${s.id}`;
  return (
    <div id={`shipment-${s.id}`} data-testid={`shipment-${s.id}`}>
      <Card
        title={`${s.code}${s.label ? ` · ${s.label}` : ""}`}
        actions={
          <span className="flex items-center gap-3">
            <span className="text-[12px] text-lien-muted">
              <b className="text-lien-heading">{s.units}</b> cái · {s.groups.length} dòng bill{s.heldUnits ? ` · ${s.heldUnits} cái cho đơn khách` : ""}
              {s.jpy !== null ? ` · ≈ ¥${formatAmount(s.jpy)}` : ""}
            </span>
            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", stage.cls)}>{stage.short}</span>
            {editable ? (
              <form action={deleteShipmentAction}>
                <input type="hidden" name="shipmentId" value={s.id} />
                <ConfirmSubmit message={`Xoá chuyến ${s.code}? ${s.units} cái trở lại kệ Kho Nhật.`} className="text-[12px] text-lien-heart hover:underline">
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
            <button type="submit" className={cn(btnSecondary, "!py-1")}>
              Cập nhật
            </button>
          </form>
          {next ? (
            <form action={setShipmentStatusAction}>
              <input type="hidden" name="shipmentId" value={s.id} />
              <input type="hidden" name="status" value={next.key} />
              <button type="submit" className={cn(btnPrimary, "!py-1")} data-testid={`ship-next-${s.id}`} title="Chuyển chuyến sang bước tiếp theo; mọi cái trong chuyến đổi vị trí theo, đơn hàng / đợt mua / Tồn kho cập nhật">
                <Fa name="angle-right" /> {next.label}
              </button>
            </form>
          ) : null}
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
                <th className={thClass}>Bill · mã</th>
                <th className={thClass}>HSD</th>
                <th className={thClass}>Cho đơn</th>
                <th className={thClass}>Mua ở · ¥/đv</th>
                <th className={thClass}>Vị trí</th>
                {editable ? <th className={thClass} /> : null}
              </tr>
            </thead>
            <tbody>
              {s.groups.length === 0 ? (
                <tr>
                  <td colSpan={8} className={`${tdClass} text-center text-lien-muted`}>
                    Chưa đóng gì — tick hàng ở khối “Chọn hàng đóng vào chuyến” bên dưới rồi bấm Thêm vào chuyến.
                  </td>
                </tr>
              ) : null}
              {s.groups.map((g) => {
                const st = expiryState(g.expiry);
                const days = daysToExpiry(g.expiry);
                return (
                  <tr key={g.key} className="align-top hover:bg-[#fafafa]" data-testid={`shipment-group-${g.unitIds[0]}`}>
                    <td className={`${tdClass} min-w-[220px]`}>
                      <div className="flex items-center gap-2">
                        {g.productThumb ? <Image src={g.productThumb} alt="" width={32} height={32} unoptimized className="h-8 w-8 shrink-0 rounded border border-[#e5e7eb] object-contain" /> : null}
                        <span className="flex min-w-0 flex-col leading-4">
                          <Link href={`/admin/inventory/lots/${g.productId}/`} className="line-clamp-2 text-[13px] font-semibold text-lien-heading hover:text-lien-blue">
                            {g.productName}
                          </Link>
                          <span className="text-[11px] text-lien-muted">
                            #{g.productId}
                            {g.productSku ? ` · ${g.productSku}` : ""}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td className={`${tdClass} font-semibold`}>
                      {g.qty}
                      {g.committedQty ? <span className="block text-[11px] font-normal text-green-700">{g.committedQty} đã TT</span> : null}
                    </td>
                    <td className={`${tdClass} text-[12px]`}>
                      {g.receiptCode ? <span className="font-mono text-[11px] font-semibold text-lien-heading">{g.receiptCode}</span> : <span className="text-lien-muted">chưa có bill</span>}
                      <CodeList codes={g.codes} />
                      {g.batchCode ? <span className="block text-lien-muted">đợt {g.batchCode}</span> : null}
                    </td>
                    <td className={`${tdClass} whitespace-nowrap text-[12px]`}>{g.expiry ? <span className={cn("rounded px-1.5 py-0.5", EXP_CLS[st])} title={days !== null ? `${days} ngày` : undefined}>{formatDate(g.expiry)}</span> : <span className="text-lien-muted">—</span>}</td>
                    <td className={`${tdClass} text-[12px]`}>
                      {g.holders.length === 0 ? <span className="text-lien-muted">— lưu kho</span> : null}
                      {g.holders.map((h) => (
                        <Link key={h.itemId} href={`/admin/orders/${h.orderId}/`} className={cn("mr-1 inline-block rounded px-1.5 py-0.5 font-semibold no-underline hover:underline", h.committed ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800")} title={h.committed ? "Đơn đã thanh toán / COD" : "Đơn chưa thanh toán (chỉ giữ chỗ)"}>
                          #{h.orderNumber} ×{h.qty}
                        </Link>
                      ))}
                    </td>
                    <td className={`${tdClass} text-[12px]`}>
                      {purchaseSourceName(g.sourceKey, sources)}
                      {g.unitCostJpy ? ` · ¥${formatAmount(g.unitCostJpy)}` : ""}
                    </td>
                    <td className={`${tdClass} text-[12px]`}>{editable ? "Kho Nhật (shop) · đã đóng" : PURCHASE_STAGES[purchaseIndex(g.status)].label}</td>
                    {editable ? (
                      <td className={`${tdClass} whitespace-nowrap`}>
                        <form action={unpackUnitsAction} className="inline">
                          <input type="hidden" name="shipmentId" value={s.id} />
                          <input type="hidden" name="uids" value={g.unitIds.join(",")} />
                          <button type="submit" className={cn(btnSecondary, "!px-2 !py-1 !text-[12px] !text-lien-heart")} title="Rút cả dòng khỏi chuyến — trở lại kệ Kho Nhật">
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

function CandTable({ rows, pkId, sources, checked, empty }: { rows: PackCandidate[]; pkId: string; pick: Pick; sources: PurchaseSource[]; checked: boolean; empty: string }) {
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
            <tr key={c.key} className="hover:bg-[#fafafa]" data-testid={`cand-${c.unitIds[0]}`}>
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
                      {c.receiptCode ? ` · ${c.receiptCode}` : ""}
                    </span>
                    <CodeList codes={c.codes} />
                  </span>
                </div>
              </td>
              <td className={`${tdClass} font-semibold`}>
                {c.qty}
                {c.heldQty ? <span className="block text-[11px] font-normal text-green-700">{c.heldQty} đã TT</span> : null}
              </td>
              <td className={tdClass}>
                {c.qty > 1 ? <input name={`qty_${c.unitIds[0]}`} form={pkId} inputMode="numeric" defaultValue="" placeholder={String(c.qty)} className={cn(adminInput, "!mb-0 !w-14 !py-1 !text-center !text-[13px]")} aria-label="Số cái đóng (trống = cả dòng)" title="Trống = cả dòng; số nhỏ hơn = chỉ đóng bấy nhiêu cái (hàng khách đã thanh toán đi trước)" /> : <span className="text-[12px] text-lien-muted">1 cái</span>}
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

/** Unit codes of a row, collapsed: the first one + "…n mã" that opens the full list. */
function CodeList({ codes }: { codes: string[] }) {
  if (!codes.length) return null;
  if (codes.length === 1)
    return (
      <Link href={`/admin/inventory/units/${codes[0]}/`} className="block font-mono text-[11px] text-lien-blue no-underline hover:underline">
        {codes[0]}
      </Link>
    );
  return (
    <details className="text-[11px]">
      <summary className="cursor-pointer font-mono text-lien-blue">
        {codes[0]} … {codes.length} mã
      </summary>
      <span className="flex flex-wrap gap-1 pt-1">
        {codes.map((c) => (
          <Link key={c} href={`/admin/inventory/units/${c}/`} className="rounded bg-[#f3f4f6] px-1 font-mono text-[10px] text-lien-blue no-underline hover:underline">
            {c}
          </Link>
        ))}
      </span>
    </details>
  );
}
