import Image from "next/image";
import Link from "next/link";
import { createShipmentAction, deleteShipmentAction, packCandidatesAction, setShipmentStatusAction, unpackUnitsAction, updateShipmentAction } from "@/app/admin/inventory/shipments/actions";
import { TableSelectAll } from "@/components/sites/lienstore/admin/TableSelectAll";
import { BarTools, BulkBar } from "@/components/sites/lienstore/admin/BulkBar";
import { TickGate } from "@/components/sites/lienstore/admin/TickGate";
import { OpenDetailsButton } from "@/components/sites/lienstore/admin/AddRowButton";
import { BatchBody, BatchToggle } from "@/components/sites/lienstore/admin/BatchCollapse";
import { ConfirmSubmit } from "@/components/sites/lienstore/admin/ConfirmSubmit";
import { adminInput, adminLabel, btnPrimary, btnSecondary, Card, Flash, PageHeader, tableClass, tdClass, thClass } from "@/components/sites/lienstore/admin/ui";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { requireAdmin } from "@/lib/auth";
import { listPurchaseSources } from "@/lib/db";
import { formatAmount, formatDate, formatDateTime } from "@/lib/format";
import { daysToExpiry, expiryState } from "@/lib/lots";
import { purchaseSourceName } from "@/lib/purchase-sources";
import { CARRIER_STEPS, carrierStepIndex, SHIPMENT_STAGES, shipmentEditable, shipmentIndex, shipmentOpen } from "@/lib/shipments";
import { listPackCandidates, listPackSources, listShipments, type PackCandidate, type Shipment } from "@/lib/shipments-db";
import { getDb } from "@/lib/sqlite";
import { listStockGroups } from "@/lib/lots-db";
import { listUnits } from "@/lib/units-db";
import { PURCHASE_STAGES, purchaseIndex } from "@/lib/purchase";
import { cn } from "@/lib/utils";
import { FlowSteps } from "@/components/sites/lienstore/admin/FlowSteps";
import { flowCounts } from "@/lib/flow-db";
import type { PurchaseSource } from "@/types/shop";
import { SheetTable } from "@/components/sites/lienstore/admin/SheetTable";
import { InfoPopover } from "@/components/sites/lienstore/admin/InfoPopover";
import { LiveTotals } from "@/components/sites/lienstore/admin/LiveTotals";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const EXP_CLS = { expired: "bg-red-100 text-red-800", soon: "bg-amber-100 text-amber-800", ok: "", none: "" } as const;
/** ⑤ Vận chuyển: where goods with the carrier are — each place is a tab (units there + the runs at that stage). */
const TRANSIT_AT = [
  { key: "jp_carrier", label: "Kho ĐVVC Nhật", icon: "building", status: "to_carrier_jp", run: "handed" },
  { key: "flying", label: "Đang bay NB→VN", icon: "plane", status: "shipped_jp_vn", run: "flying" },
  { key: "vn_carrier", label: "Kho ĐVVC VN", icon: "building", status: "at_carrier_vn", run: "arrived" },
  { key: "to_shop", label: "Đang về kho shop", icon: "truck", status: "to_shop", run: null },
] as const;

/**
 * Kho hàng › Đóng hàng: packing runs from Kho Nhật (shop) to the carrier. Search a product, type how many go into the
 * box — units leave the shelf (FEFO, paid orders first); the run then walks Đã đóng xong → Đã giao ĐVVC → NB→VN → …
 */
export default async function ShipmentsPage({ searchParams }: Props) {
  await requireAdmin("inventory");
  const sp = await searchParams;
  const includeDone = first(sp.done) === "1";
  // ④ Đóng hàng = runs still at the shop (packing / packed); ⑤ Vận chuyển = runs with the carrier (handed → arrived, + done on demand)
  const transit = first(sp.stage) === "transit";
  const [allShipments, sources] = await Promise.all([Promise.resolve(listShipments(transit && includeDone)), listPurchaseSources()]);
  const shipments = allShipments.filter((x) => (transit ? !shipmentEditable(x.status) : shipmentEditable(x.status)));
  const db = getDb();
  // what could still be packed: units on the shelf at Kho Nhật (shop), not boxed yet
  const allCands = listPackCandidates(db);
  const shelfUnits = allCands.reduce((n, c) => n + c.qty, 0);
  const shelfProducts = new Set(allCands.map((c) => c.productId)).size;
  const pickSources = listPackSources(db);
  // the picker of one run: ?pick=<shipmentId>&order=<id|none>&batch=<id|none>&q=… — the three combine
  const firstOpen = shipments.find((x) => shipmentEditable(x.status))?.id ?? Number.NaN;
  const pickFor = Number.parseInt(first(sp.pick), 10) || firstOpen;
  const pickOrder = first(sp.order);
  const pickBatchRaw = first(sp.batch);
  const pickBatch: number | "none" | null = pickBatchRaw === "none" ? "none" : Number.isInteger(Number.parseInt(pickBatchRaw, 10)) ? Number.parseInt(pickBatchRaw, 10) : null;
  const pickQ = first(sp.q).trim();
  const pickActive = !!pickOrder || pickBatch !== null || !!pickQ;
  const pickFilter = pickActive ? { orderId: pickOrder || undefined, batchId: pickBatch ?? undefined, q: pickQ || undefined } : null;
  const picked = Number.isInteger(pickFor) && pickFilter ? listPackCandidates(db, pickFilter) : [];
  // a purchase trip: where all its units are, so a count below the trip's total is explained
  const tripUnits = typeof pickBatch === "number" ? listUnits(db, { batchId: pickBatch, withDelivered: true }) : [];
  const tripNote = tripUnits.length
    ? (() => {
        const onShelf = tripUnits.filter((u) => u.status === "bought" && !u.shipmentId).length;
        const boxed = tripUnits.filter((u) => u.status === "bought" && u.shipmentId);
        const runs = [...new Set(boxed.map((u) => u.shipmentCode).filter(Boolean))];
        const later = tripUnits.filter((u) => purchaseIndex(u.status) > purchaseIndex("bought")).length;
        const before = tripUnits.filter((u) => purchaseIndex(u.status) < purchaseIndex("bought")).length;
        return [
          `Đợt ${tripUnits[0].batchCode}: ${tripUnits.length} cái`,
          `${onShelf} cái ở Kho Nhật chưa đóng (đang liệt kê)`,
          boxed.length ? `${boxed.length} cái đã đóng vào ${runs.join(", ")}` : "",
          later ? `${later} cái đã gửi / đang về / đã về VN` : "",
          before ? `${before} cái chưa mua / đã đặt chưa nhận` : "",
        ]
          .filter(Boolean)
          .join(" · ");
      })()
    : "";
  const saved = first(sp.saved);
  const error = first(sp.error);
  // ⑤: every unit with the carrier, by place; ?at=<place> narrows the page to one place
  const transitGroups = transit ? listStockGroups(db, { statuses: ["to_carrier_jp", "shipped_jp_vn", "at_carrier_vn", "to_shop"] }) : [];
  const at = TRANSIT_AT.find((x) => x.key === first(sp.at)) ?? null;
  const atGroups = at ? transitGroups.filter((g) => g.status === at.status) : transitGroups.filter((g) => !g.shipmentId);
  const runsShown = at ? shipments.filter((x) => x.status === at.run) : shipments;
  const unitsIn = (status: string) => transitGroups.filter((g) => g.status === status).reduce((n, g) => n + g.qty, 0);
  return (
    <>
      <FlowSteps current={transit ? "transit" : "pack"} counts={flowCounts(db)} />
      <PageHeader
        title={transit ? "Vận chuyển JP-VN" : "Đóng hàng JP"}
        subtitle={transit ? `Chuyến đã giao ĐVVC: kho Kiến Nhật → bay NB→VN → kho ĐVVC Hà Nội → về kho shop VN · ${shipments.filter((s) => s.status !== "done").length} chuyến đang đi` : `Đóng hàng từ Kho Nhật (shop) gửi ĐVVC · ${shipments.length} chuyến đang đóng · ở Kho Nhật còn ${shelfUnits} đv (${shelfProducts} sản phẩm) chưa đóng`}
      />
      {saved ? <Flash>{saved}</Flash> : null}
      {error ? <Flash kind="error">{error}</Flash> : null}

      {transit ? (
        <nav className="mb-4 flex flex-wrap gap-2" aria-label="Hàng đang ở đâu" data-testid="transit-tabs">
          <Link href="/admin/inventory/shipments/?stage=transit" className={cn("rounded-md border px-3 py-1.5 text-[13px] font-semibold no-underline", !at ? "border-lien-blue bg-lien-blue text-white" : "border-[#d1d5db] bg-white text-lien-text hover:border-lien-blue")}>
            Tất cả chuyến ({shipments.filter((x) => x.status !== "done").length})
          </Link>
          {TRANSIT_AT.map((x) => (
            <Link key={x.key} href={`/admin/inventory/shipments/?stage=transit&at=${x.key}`} className={cn("rounded-md border px-3 py-1.5 text-[13px] font-semibold no-underline", at?.key === x.key ? "border-sky-700 bg-sky-700 text-white" : "border-sky-200 bg-sky-50 text-sky-900 hover:border-sky-500")} data-testid={`transit-tab-${x.key}`}>
              <Fa name={x.icon} /> {x.label} ({unitsIn(x.status)} cái)
            </Link>
          ))}
        </nav>
      ) : null}

      <div className={cn("mb-4 grid gap-3 md:grid-cols-2", transit && "hidden")}>
        <details id="new-shipment" className="min-w-0" open={shipments.length === 0} data-testid="new-shipment">
          <summary className="hidden">Chuyến hàng mới</summary>
          <div>
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
                  <input type="date" id="ns-date" name="plannedAt" className={adminInput} />
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
      </div>

      {!transit ? (
        <BarTools>
          <OpenDetailsButton target="new-shipment" label="+ Chuyến mới" className={cn(btnSecondary, "!py-1.5")} />
        </BarTools>
      ) : null}
      <div className="space-y-5">
        {at ? <TransitTable title={`${at.label} — ${atGroups.reduce((n, g) => n + g.qty, 0)} cái · ${atGroups.length} dòng bill`} groups={atGroups} withRun testId={`at-${at.key}`} /> : null}
        {runsShown.length === 0 && !at ? (
          <Card>
            <p className="m-0 text-[13px] text-lien-muted">{transit ? "Chưa có chuyến nào đang vận chuyển. Chuyến ở ④ Đóng hàng JP chuyển sang đây khi bấm “Đã chuyển cho ĐVVC”." : "Chưa có chuyến đang đóng. Bấm “+ Chuyến hàng mới”."}</p>
          </Card>
        ) : null}
        {runsShown.map((s) => (
          <ShipmentCard key={s.id} s={s} sources={sources} carrierView={transit} pick={s.id === pickFor && pickFilter ? { active: true, order: pickOrder, batch: pickBatchRaw, q: pickQ, rows: picked, note: tripNote } : shipmentEditable(s.status) ? { active: false, order: "", batch: "", q: "", rows: allCands, note: "" } : null} pickSources={pickSources} />
        ))}
        {transit && !at && atGroups.length ? <TransitTable title={`Hàng đang vận chuyển ngoài chuyến (${atGroups.reduce((n, g) => n + g.qty, 0)} cái · ${atGroups.length} dòng bill)`} groups={atGroups} testId="loose-transit" /> : null}
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

/** Goods with the carrier, one line per bill line: where it is, how many, which order holds it (and which run). */
function TransitTable({ title, groups, withRun = false, testId }: { title: string; groups: ReturnType<typeof listStockGroups>; withRun?: boolean; testId: string }) {
  return (
    <Card title={title}>
      <div className="overflow-x-auto">
        {groups.length ? <LiveTotals target={`[data-sheet="transit-${testId}"] table`} /> : null}
        <SheetTable id={`transit-${testId}`}>
        <table className={tableClass} data-testid={testId}>
          <thead>
            <tr>
              <th className={thClass}>Sản phẩm</th>
              <th className={thClass}>Bill · mã</th>
              <th className={thClass}>Đang ở</th>
              <th className={thClass}>SL</th>
              <th className={thClass}>Giữ cho đơn</th>
              {withRun ? <th className={thClass}>Chuyến</th> : null}
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 ? (
              <tr>
                <td colSpan={withRun ? 6 : 5} className={cn(tdClass, "text-center text-lien-muted")}>
                  Không có hàng nào.
                </td>
              </tr>
            ) : null}
            {groups.map((g) => (
              <tr key={g.key} data-qty={g.qty} data-jpy={g.unitCostJpy !== null ? g.unitCostJpy * g.qty : ""} data-g={g.productWeightG ? g.productWeightG * g.qty : ""} data-held={g.heldQty}>
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
                {withRun ? (
                  <td className={cn(tdClass, "text-[12px]")}>
                    {g.shipmentId ? (
                      <a href={`#shipment-${g.shipmentId}`} className="font-mono text-lien-blue hover:underline">
                        {g.shipmentCode}
                      </a>
                    ) : (
                      <span className="text-lien-muted">ngoài chuyến</span>
                    )}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
        </SheetTable>
      </div>
    </Card>
  );
}

interface Pick {
  /** Some filter is on (order / trip / search). */
  active: boolean;
  /** "" | "none" | order id */
  order: string;
  /** "" | "none" | trip id */
  batch: string;
  q: string;
  rows: PackCandidate[];
  /** Where the filtered purchase trip's units are (explains a count below its total). */
  note: string;
}
type PickSources = ReturnType<typeof listPackSources>;

/** Timeline of a packing run: one dot per stage (click to jump), the current one highlighted, Lùi / Tiếp buttons. */
function ShipmentTimeline({ s }: { s: Shipment }) {
  const cur = shipmentIndex(s.status);
  const n = SHIPMENT_STAGES.length;
  const pct = n > 1 ? (cur / (n - 1)) * 100 : 0;
  return (
    <div className="mb-3 rounded-md border border-[#e5e7eb] bg-[#f9fafb] px-3 py-3" data-testid={`ship-timeline-${s.id}`}>
      <ol className="relative m-0 grid list-none p-0" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        <span aria-hidden="true" className="absolute top-[9px] h-[3px] rounded bg-[#e5e5e5]" style={{ left: `calc(100% / ${n * 2})`, right: `calc(100% / ${n * 2})` }} />
        <span aria-hidden="true" className="absolute top-[9px] h-[3px] rounded bg-lien-heart" style={{ left: `calc(100% / ${n * 2})`, width: `calc((100% - 100% / ${n}) * ${pct / 100})` }} />
        {SHIPMENT_STAGES.map((st, i) => {
          const done = i <= cur;
          const current = i === cur;
          return (
            <li key={st.key} className="relative flex flex-col items-center text-center">
              <form action={setShipmentStatusAction}>
                <input type="hidden" name="shipmentId" value={s.id} />
                <input type="hidden" name="status" value={st.key} />
                <button type="submit" disabled={current} className="group flex flex-col items-center gap-1.5 disabled:cursor-default" title={current ? `Đang: ${st.label}` : `Chuyển chuyến sang: ${st.label}`} data-testid={`ship-step-${s.id}-${st.key}`}>
                  <span className={cn("relative z-[1] block h-[21px] w-[21px] rounded-full border-[3px] bg-white transition-shadow", done ? "border-lien-heart" : "border-[#d1d5db] group-hover:border-lien-blue", current && "shadow-[0_0_0_5px_rgba(232,32,22,0.15)]")}>
                    {done ? <span className={cn("absolute inset-[3px] rounded-full", current ? "bg-lien-heart" : "bg-lien-heart/70")} /> : null}
                  </span>
                  <span className={cn("text-[11px] leading-4 sm:text-[12px]", current ? "font-bold text-lien-heart" : done ? "font-semibold text-lien-heading" : "text-lien-muted group-hover:text-lien-blue")}>{st.short}</span>
                </button>
              </form>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** ⑤ Vận chuyển JP-VN: the carrier's own five states (API codes shown) — clicking a dot moves the run to the matching status. */
function CarrierTimeline({ s }: { s: Shipment }) {
  const cur = carrierStepIndex(s.status);
  const n = CARRIER_STEPS.length;
  const pct = cur <= 0 ? 0 : (cur / (n - 1)) * 100;
  return (
    <div className="mb-3 rounded-md border border-sky-200 bg-sky-50/40 px-3 py-3" data-testid={`carrier-timeline-${s.id}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px] text-lien-muted">
        <Fa name="truck" /> Trạng thái bên Kiến Express
        {s.carrierStatus ? (
          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-800" title={s.carrierCheckedAt ? `API báo lúc ${formatDateTime(s.carrierCheckedAt)}` : ""}>
            API: {s.carrierStatus}
          </span>
        ) : (
          <span className="text-[11px]">— đối chiếu API tự động sẽ chạy khi có mã quốc tế (KEA…)</span>
        )}
        {cur < 0 ? <span className="ml-auto text-[11px]">chưa gửi cho ĐVVC</span> : null}
      </div>
      <ol className="relative m-0 grid list-none p-0" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        <span aria-hidden="true" className="absolute top-[9px] h-[3px] rounded bg-[#e5e5e5]" style={{ left: `calc(100% / ${n * 2})`, right: `calc(100% / ${n * 2})` }} />
        <span aria-hidden="true" className="absolute top-[9px] h-[3px] rounded bg-lien-heart" style={{ left: `calc(100% / ${n * 2})`, width: `calc((100% - 100% / ${n}) * ${pct / 100})` }} />
        {CARRIER_STEPS.map((st, i) => {
          const done = i <= cur;
          const current = i === cur;
          return (
            <li key={st.api} className="relative flex flex-col items-center text-center">
              <form action={setShipmentStatusAction}>
                <input type="hidden" name="shipmentId" value={s.id} />
                <input type="hidden" name="status" value={st.run} />
                <button type="submit" disabled={current} className="group flex flex-col items-center gap-1.5 disabled:cursor-default" title={`${st.hint}${current ? "" : " — bấm để chuyển chuyến tới bước này"}`} data-testid={`carrier-${s.id}-${st.api}`}>
                  <span className={cn("relative z-[1] block h-[21px] w-[21px] rounded-full border-[3px] bg-white transition-shadow", done ? "border-lien-heart" : "border-[#d1d5db] group-hover:border-lien-blue", current && "shadow-[0_0_0_4px_rgba(192,0,0,0.15)]")}>
                    {done ? <span className={cn("absolute inset-[3px] rounded-full", current ? "bg-lien-heart" : "bg-lien-heart/70")} /> : null}
                  </span>
                  <span className={cn("text-[11px] leading-4 sm:text-[12px]", current ? "font-bold text-lien-heart" : done ? "font-semibold text-lien-heading" : "text-lien-muted group-hover:text-lien-blue")}>{st.label}</span>
                  <code className="text-[10px] text-lien-muted">{st.api}</code>
                </button>
              </form>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function ShipmentCard({ s, sources, pick, pickSources, carrierView = false }: { s: Shipment; sources: PurchaseSource[]; pick: Pick | null; pickSources: PickSources; carrierView?: boolean }) {
  const editable = shipmentEditable(s.status);
  // locked = "Đã đóng xong": contents frozen until Mở khoá (back to Đang đóng)
  const open = shipmentOpen(s.status);
  const locked = editable && !open;
  const infoId = `si-${s.id}`;
  const btnHead = "!rounded-md !border !px-2.5 !py-1 !text-[12px] font-semibold";
  const pkId = `pk-${s.id}`;
  const outId = `out-${s.id}`;
  return (
    <div id={`shipment-${s.id}`} data-testid={`shipment-${s.id}`}>
      <Card
        actions={
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold leading-6 text-lien-heading">
              <span>
                {s.code}
                {s.label ? ` · ${s.label}` : ""}
              </span>
              {s.tracking ? (
                <span className="rounded-md border border-sky-200 bg-sky-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-sky-900" title="Mã vận chuyển quốc tế JP → VN (Kiến Express)" data-testid={`code-intl-${s.id}`}>
                  <Fa name="plane" /> {s.tracking}
                </span>
              ) : null}
              {s.trackingDomestic ? (
                <span className="rounded-md border border-[#e5e7eb] bg-white px-1.5 py-0.5 font-mono text-[11px] font-semibold text-lien-heading" title="Mã nội địa Nhật: kho shop JP → kho Kiến Express JP" data-testid={`code-dom-${s.id}`}>
                  <Fa name="truck" /> {s.trackingDomestic}
                </span>
              ) : null}
              <OpenDetailsButton target={`info-${s.id}`} label="✎ Sửa" className={cn(btnSecondary, btnHead, "!border-lien-blue !text-lien-blue")} />
              {locked ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800" data-testid={`locked-${s.id}`}>
                  <Fa name="lock" /> Đã khoá
                  <InfoPopover>Chuyến đã đóng xong và khoá: không thêm / rút hàng được. Bấm <b>Mở khoá</b> ở bên phải để chuyến về “Đang đóng” rồi sửa hàng.</InfoPopover>
                </span>
              ) : null}
            </h2>
            <label className="flex items-center gap-1.5 text-[12px] text-lien-muted">
              Dự kiến gửi
              <input type="date" name="plannedAt" form={infoId} defaultValue={s.plannedAt ?? ""} className={cn(adminInput, "!mb-0 !w-[150px] !py-1 !text-[13px]")} aria-label="Ngày dự kiến gửi" data-testid={`planned-${s.id}`} />
            </label>
            {s.shippedAt ? <span className="text-[12px] text-lien-muted">đã gửi {formatDate(s.shippedAt)}</span> : null}
            <span className="ml-auto flex items-center gap-3">
              {editable ? (
                <form action={deleteShipmentAction}>
                  <input type="hidden" name="shipmentId" value={s.id} />
                  <ConfirmSubmit message={`Xoá chuyến ${s.code}? ${s.units} cái trở lại kệ Kho Nhật.`} className={cn(btnSecondary, btnHead, "!border-lien-heart !text-lien-heart")}>
                    <Fa name="trash" /> Xoá chuyến
                  </ConfirmSubmit>
                </form>
              ) : null}
              {editable ? (
                <form action={setShipmentStatusAction}>
                  <input type="hidden" name="shipmentId" value={s.id} />
                  <input type="hidden" name="status" value={locked ? "packing" : "packed"} />
                  <button type="submit" className={cn(btnSecondary, btnHead, locked ? "!border-amber-500 !bg-amber-50 !text-amber-800" : "!border-green-600 !text-green-700")} title={locked ? "Mở khoá: chuyến về Đang đóng, thêm / rút hàng được" : "Khoá: chuyến sang Đã đóng xong, không thêm / rút hàng nữa"} data-testid={`lock-${s.id}`}>
                    <Fa name={locked ? "unlock" : "lock"} /> {locked ? "Mở khoá" : "Khoá"}
                  </button>
                </form>
              ) : null}
              <BatchToggle id={s.id} ns="ship" labels={["Thu gọn", "Mở chuyến"]} className={cn(btnSecondary, btnHead)} />
            </span>
          </div>
        }
      >
        <BatchBody id={s.id} ns="ship">
        {carrierView ? <CarrierTimeline s={s} /> : <ShipmentTimeline s={s} />}

        {open ? (
          <>
            <form id={outId} action={unpackUnitsAction}>
              <input type="hidden" name="shipmentId" value={s.id} />
            </form>
            <BulkBar scope={outId} label={s.code}>
              <button type="submit" form={outId} className={cn(btnSecondary, "!py-1 !text-lien-heart")} data-testid={`unpack-${s.id}`}>
                ✕ Rút khỏi chuyến
              </button>
            </BulkBar>
          </>
        ) : null}
        <div className="overflow-x-auto">
          {s.groups.length ? <LiveTotals target={`[data-sheet="run-${s.id}"] table`} /> : null}
          <SheetTable id={`run-${s.id}`}>
          <table className={tableClass}>
            <thead>
              <tr>
                {editable ? (
                  <th className={cn(thClass, "w-8")}>
                    <TableSelectAll />
                  </th>
                ) : null}
                <th className={thClass}>Sản phẩm</th>
                <th className={thClass}>SL đóng</th>
                <th className={thClass}>Bill · mã</th>
                <th className={thClass}>HSD</th>
                <th className={thClass}>Cho đơn</th>
                <th className={thClass}>Mua ở · ¥/đv</th>
                <th className={thClass}>Vị trí</th>
              </tr>
            </thead>
            <tbody>
              {s.groups.length === 0 ? (
                <tr>
                  <td colSpan={8} className={`${tdClass} text-center text-lien-muted`}>
                    Chưa đóng gì.
                  </td>
                </tr>
              ) : null}
              {s.groups.map((g) => {
                const st = expiryState(g.expiry);
                const days = daysToExpiry(g.expiry);
                return (
                  <tr key={g.key} className="align-top hover:bg-[#fafafa]" data-qty={g.qty} data-jpy={g.unitCostJpy !== null ? g.unitCostJpy * g.qty : ""} data-g={g.productWeightG ? g.productWeightG * g.qty : ""} data-held={g.heldQty} data-testid={`shipment-group-${g.unitIds[0]}`}>
                    {editable ? (
                      <td className={`${tdClass} w-8`}>
                        <input type="checkbox" name="uids" value={g.unitIds.join(",")} form={outId} className="h-4 w-4" aria-label={`Chọn ${g.productName}`} />
                      </td>
                    ) : null}
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
                      {g.holders.length === 0 ? <span className="text-lien-muted">lưu kho</span> : null}
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
                  </tr>
                );
              })}
            </tbody>
          </table>
          </SheetTable>
        </div>

        {open && pick ? (
          <div className="mt-4 rounded-md border-2 border-lien-heart bg-white" data-testid={`pick-${s.id}`}>
            <form id={pkId} action={packCandidatesAction}>
              <input type="hidden" name="shipmentId" value={s.id} />
            </form>
            <TickGate scope={pkId} />
            {/* stays on screen while the candidate lists scroll */}
            <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded-t-md border-b border-lien-heart/40 bg-[#fff5f5]/95 px-3 py-2 shadow-sm backdrop-blur" data-testid={`pick-bar-${s.id}`}>
              <PackControls s={s} pick={pick} pkId={pkId} />
              <PickFilters s={s} pick={pick} pickSources={pickSources} testIds />
            </div>
            <div className="px-3 pb-3">
              {(() => {
                // ① what customers are waiting for (ticked by default) · ② stock with no order behind it
                const orderRows = pick.rows.filter((c) => c.orders.length).sort((x, y) => Math.min(...x.orders.map((o) => o.orderNumber)) - Math.min(...y.orders.map((o) => o.orderNumber)));
                const stockRows = pick.rows.filter((c) => !c.orders.length);
                const tickAll = pick.active && ((pick.batch !== "" && pick.batch !== "none") || (pick.order !== "" && pick.order !== "none"));
                const units = (rows: PackCandidate[]) => rows.reduce((k, c) => k + c.qty, 0);
                return (
                  <>
                    <p className="mb-1 mt-3 text-[13px] font-semibold text-lien-heading" data-testid={`pick-orders-${s.id}`}>
                      ① Hàng theo đơn <span className="font-normal text-lien-muted">({orderRows.length} dòng · {units(orderRows)} cái)</span>
                    </p>
                    {pick.note ? (
                      <p className="m-0 mt-2 rounded-md bg-sky-50 px-2 py-1 text-[12px] text-sky-900" data-testid={`trip-note-${s.id}`}>
                        {pick.note}
                        {tickAll ? " — đã tick sẵn mọi dòng, bỏ tick cái không đóng rồi bấm + Thêm vào chuyến." : ""}
                      </p>
                    ) : null}
                    <CandTable rows={orderRows} pkId={pkId} pick={pick} sources={sources} kind="orders" tick empty="Không có hàng theo đơn nào ở Kho Nhật (shop)." />
                    {stockRows.length ? (
                      <details className="mt-3" open={pick.active} data-testid={`pick-stock-${s.id}`}>
                        <summary className="cursor-pointer text-[13px] font-semibold text-lien-heading">
                          ② Hàng tồn kho không theo đơn <span className="font-normal text-lien-muted">({stockRows.length} dòng · {units(stockRows)} cái)</span>
                        </summary>
                        <CandTable rows={stockRows} pkId={pkId} pick={pick} sources={sources} kind="stock" tick={tickAll} empty="" />
                      </details>
                    ) : null}
                  </>
                );
              })()}
            </div>
          </div>
        ) : null}

        <details id={`info-${s.id}`} className="mt-3 hidden rounded-md border border-lien-blue px-3 pb-3 open:block" data-testid={`info-${s.id}`}>
          <summary className="cursor-pointer pt-2 text-[12px] font-semibold text-lien-blue">Sửa thông tin chuyến (tên, ngày gửi, mã nội địa PU…, mã quốc tế KEA…, ghi chú) — bấm để đóng</summary>
          <form id={infoId} action={updateShipmentAction} className="mt-2 grid gap-2 lg:grid-cols-[1fr_130px_170px_170px_1fr_auto] lg:items-end">
            <input type="hidden" name="shipmentId" value={s.id} />
            <div>
              <label className={adminLabel} htmlFor={`ul-${s.id}`}>
                Tên chuyến
              </label>
              <input id={`ul-${s.id}`} name="label" defaultValue={s.label} maxLength={80} className={cn(adminInput, "!py-1.5 !text-[13px]")} />
            </div>
            <div>
              <label className={adminLabel} htmlFor={`ud-${s.id}`}>
                Ngày gửi
              </label>
              <input type="date" id={`ud-${s.id}`} name="shippedAt" defaultValue={s.shippedAt ?? ""} className={cn(adminInput, "!py-1.5 !text-[13px]")} />
            </div>
            <div>
              <label className={adminLabel} htmlFor={`utd-${s.id}`} title="Kiến Express cấp khi lấy hàng từ kho shop JP về kho Kiến JP">
                Mã nội địa JP (PU…)
              </label>
              <input id={`utd-${s.id}`} name="trackingDomestic" defaultValue={s.trackingDomestic} maxLength={120} placeholder="PU26093001" className={cn(adminInput, "!py-1.5 font-mono !text-[13px]")} />
            </div>
            <div>
              <label className={adminLabel} htmlFor={`ut-${s.id}`} title="Mã kiện quốc tế JP → VN trên app Kiến Express — dùng để đối chiếu API">
                Mã quốc tế JP→VN (KEA…)
              </label>
              <input id={`ut-${s.id}`} name="tracking" defaultValue={s.tracking} maxLength={120} placeholder="KEA260930003" className={cn(adminInput, "!py-1.5 font-mono !text-[13px]")} />
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
        </BatchBody>
      </Card>
    </div>
  );
}

/** "+ Thêm vào chuyến" of one run with what the picker currently lists. */
function PackControls({ s, pick, pkId }: { s: Shipment; pick: Pick; pkId: string }) {
  return (
    <>
      <button type="submit" form={pkId} className={cn(btnPrimary, "!py-1 !text-[13px] disabled:opacity-50")} data-testid={`pack-${s.id}`}>
        + Thêm vào chuyến
      </button>
      <span className="self-center text-[12px] text-lien-muted">
        {pick.rows.length} dòng · {pick.rows.reduce((k, c) => k + c.qty, 0)} cái
      </span>
    </>
  );
}

/**
 * What the picker lists: an order (or "không theo đơn") → Xem, a purchase trip (or "không theo đợt mua") → Xem,
 * a search → Lọc. Each form carries the other two choices along, so the filters combine.
 */
function PickFilters({ s, pick, pickSources, testIds = false }: { s: Shipment; pick: Pick; pickSources: PickSources; testIds?: boolean }) {
  const tid = (k: string) => (testIds ? `pick-${k}-${s.id}` : undefined);
  const keep = (omit: "order" | "batch" | "q") => (
    <>
      <input type="hidden" name="pick" value={s.id} />
      {omit !== "order" && pick.order ? <input type="hidden" name="order" value={pick.order} /> : null}
      {omit !== "batch" && pick.batch ? <input type="hidden" name="batch" value={pick.batch} /> : null}
      {omit !== "q" && pick.q ? <input type="hidden" name="q" value={pick.q} /> : null}
    </>
  );
  const btn = cn(btnSecondary, "!px-2.5 !py-1 !text-[13px]");
  return (
    <>
      <form method="get" className="flex items-center gap-1" data-testid={tid("q")}>
        {keep("q")}
        <input name="q" type="search" defaultValue={pick.q} placeholder="tên, SKU, mã H…, #đơn" className={cn(adminInput, "!mb-0 !w-[180px] !py-1 !text-[13px]")} aria-label="Tìm hàng để đóng" />
        <button type="submit" className={btn} data-testid={tid("go")}>
          Lọc
        </button>
      </form>
      <form method="get" className="flex items-center gap-1" data-testid={tid("order")}>
        {keep("order")}
        <select name="order" defaultValue={pick.order} className={cn(adminInput, "!mb-0 !w-[190px] !py-1 !text-[13px]")} aria-label="Theo đơn">
          <option value="">Theo đơn ({pickSources.orders.length})</option>
          <option value="none">— Không theo đơn ({pickSources.noOrderUnits} cái)</option>
          {pickSources.orders.map((o) => (
            <option key={o.orderId} value={o.orderId}>
              #{o.orderNumber} · {o.customer} · {o.units} cái
            </option>
          ))}
        </select>
        <button type="submit" className={btn}>
          Xem
        </button>
      </form>
      <form method="get" className="flex items-center gap-1" data-testid={tid("batch")}>
        {keep("batch")}
        <select name="batch" defaultValue={pick.batch} className={cn(adminInput, "!mb-0 !w-[190px] !py-1 !text-[13px]")} aria-label="Theo đợt mua">
          <option value="">Theo đợt mua ({pickSources.batches.length})</option>
          <option value="none">— Không theo đợt mua ({pickSources.noBatchUnits} cái)</option>
          {pickSources.batches.map((b) => (
            <option key={b.batchId} value={b.batchId}>
              {b.code} · {b.units} cái (gồm hàng theo đơn)
            </option>
          ))}
        </select>
        <button type="submit" className={btn}>
          Xem
        </button>
      </form>
      {pick.active ? (
        <Link href={`/admin/inventory/shipments/#shipment-${s.id}`} className="self-center text-[12px] text-lien-blue hover:underline">
          bỏ lọc
        </Link>
      ) : null}
    </>
  );
}

function CandTable({ rows, pkId, sources, kind, tick, empty }: { rows: PackCandidate[]; pkId: string; pick: Pick; sources: PurchaseSource[]; kind: "orders" | "stock"; tick: boolean; empty: string }) {
  return (
    <div className="overflow-x-auto">
      {rows.length ? <LiveTotals target={`[data-sheet="${pkId}-${kind}"] table`} /> : null}
      <SheetTable id={`${pkId}-${kind}`}>
      <table className={tableClass}>
        <thead>
          <tr>
            <th className={cn(thClass, "w-8")}>
              <TableSelectAll name="keys" />
            </th>
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
            <tr key={c.key} className="hover:bg-[#fafafa]" data-qty={c.qty} data-jpy={c.unitCostJpy !== null ? c.unitCostJpy * c.qty : ""} data-g={c.productWeightG ? c.productWeightG * c.qty : ""} data-held={c.orders.reduce((n, o) => n + o.qty, 0)} data-testid={`cand-${c.unitIds[0]}`}>
              <td className={`${tdClass} w-8`}>
                <input type="checkbox" name="keys" value={c.key} form={pkId} defaultChecked={tick} className="h-4 w-4" aria-label={`Chọn ${c.productName}`} />
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
      </SheetTable>
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
