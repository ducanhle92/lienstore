import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { addProductAction, bulkBatchRowsAction, createBatchAction, createBillAction, deleteBatchAction, importBillsAction, renameBillAction, saveBatchRowsAction, syncBatchOrdersAction, updateBatchAction } from "@/app/admin/purchases/batch-actions";
import { deleteReceiptFileAction, parseBillAction, uploadReceiptFilesAction } from "@/app/admin/purchases/receipt-actions";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import type { PurchaseLine } from "@/lib/db";
import { formatAmount, formatDate } from "@/lib/format";
import { todayIso } from "@/lib/lots";
import { PURCHASE_STAGES, type PurchaseStatus, purchaseIndex } from "@/lib/purchase";
import { BATCH_STAGES } from "@/lib/purchase-batches";
import { purchaseSourceName } from "@/lib/purchase-sources";
import { cn } from "@/lib/utils";
import { billLineKey, UNIT_ORIGIN_LABEL } from "@/lib/units";
import type { UnitView } from "@/lib/units-db";
import type { PurchaseBatch, PurchaseBatchBill, PurchaseBatchLine, PurchaseSource } from "@/types/shop";
import { BatchTree } from "./BatchTree";
import { BulkBar } from "./BulkBar";
import { AddRowButton, OpenDetailsButton } from "./AddRowButton";
import { BarTools } from "./BulkBar";
import { BatchBody, BatchToggle } from "./BatchCollapse";
import { BulkOpButton } from "./BulkOpButton";
import { ConfirmSubmit } from "./ConfirmSubmit";
import { type PickableProduct, ProductSearchSelect } from "./ProductSearchSelect";
import { adminInput, adminLabel, btnPrimary, btnSecondary, Card, Flash, tableClass, tdClass, thClass } from "./ui";
import { StatChip } from "./StatChip";
import { SheetTable } from "./SheetTable";

interface Props {
  batches: PurchaseBatch[];
  /** Open order lines still "Chưa mua" and not in any batch — candidates for every batch card. */
  openLines: PurchaseLine[];
  products: PickableProduct[];
  sources: PurchaseSource[];
  includeDone: boolean;
  /** Batch search (name / code, bought-date range, open / done) — kept in the URL. */
  search: { q: string; from: string; to: string; status: "" | "done" | "all" };
  /** Batch whose Bill block starts open (after creating a bill / attaching a photo). */
  openBillsFor?: number | null;
  /** Page-header switch: list by product (tree) or every unit code (flat). */
  view?: "tree" | "flat";
}

const cell = "!mb-0 !py-1 !text-[13px]";
const BACK = "/admin/purchases/?tab=batches";
/**
 * Quản lý mua hàng › tab "Mua theo đợt": one card per purchase trip (đợt mua = một lần đi mua / một bill). Every row
 * (order line, slip, lot) is a set of inputs bound to ONE save form per batch — the red "Lưu thay đổi" bar sticks to the
 * bottom of the screen while the card is in view. Bills (phiếu mua, PM-…) are the paper trail: each row says which bill
 * it came from; photos attach on the bill inside the card.
 */
export function PurchaseBatchPanel({ batches, openLines, products, sources, includeDone, search, openBillsFor = null, view = "tree" }: Props) {
  void includeDone;
  const searching = !!(search.q || search.from || search.to || search.status);
  void openLines;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5" data-testid="batch-panel">
      {/* top bar: search batches, open a new one, usage — collapsed so the batches get the space */}
      <div className="flex flex-wrap items-center gap-2" data-testid="batch-topbar">
        <form method="get" className="flex flex-wrap items-center gap-2 text-[13px]">
          <input type="hidden" name="tab" value="batches" />
          <input name="bq" defaultValue={search.q} placeholder="Tìm đợt: tên / mã DG-…" className={cn(adminInput, "!mb-0 !w-[220px] !py-1")} aria-label="Tìm đợt mua" />
          <span className="text-lien-muted">ngày mua từ</span>
          <input type="date" name="bfrom" defaultValue={search.from} className={cn(adminInput, "!mb-0 !w-[112px] !py-1")} aria-label="Từ ngày" />
          <span className="text-lien-muted">đến</span>
          <input type="date" name="bto" defaultValue={search.to} className={cn(adminInput, "!mb-0 !w-[112px] !py-1")} aria-label="Đến ngày" />
          <select name="bstatus" defaultValue={search.status} className={cn(adminInput, "!mb-0 !w-auto !py-1")} aria-label="Trạng thái đợt">
            <option value="">Đợt đang mở</option>
            <option value="done">Đợt đã về kho VN</option>
            <option value="all">Tất cả</option>
          </select>
          <button type="submit" className={cn(btnPrimary, "!py-1")}>
            Tìm
          </button>
          {searching ? (
            <Link href={BACK} className="text-[12px] text-lien-blue hover:underline">
              Xoá tìm
            </Link>
          ) : null}
        </form>
      </div>

      <BarTools>
        <OpenDetailsButton target="new-batch" label="+ Mở đợt mua mới" className={btnPrimary} />
      </BarTools>
      <div className="grid gap-3 md:grid-cols-2">
        <details id="new-batch" className="min-w-0" open={batches.length === 0} data-testid="new-batch">
          <summary className="hidden">Mở đợt mua mới</summary>
          <div>
            <Card title="Mở đợt mua mới (một lần đi mua / một bill)">
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
                    <select id="nb-src" name="sourceKey" defaultValue={sources.find((x) => /os\s*drug/i.test(x.name))?.key ?? "amazon"} className={adminInput}>
                      {sources.map((s) => (
                        <option key={s.key} value={s.key}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={adminLabel} htmlFor="nb-date">
                      Ngày mua
                    </label>
                    <input type="date" id="nb-date" name="boughtAt" defaultValue={todayIso()} className={adminInput} />
                  </div>
                </div>
                <div>
                  <label className={adminLabel} htmlFor="nb-note">
                    Ghi chú
                  </label>
                  <input id="nb-note" name="note" maxLength={300} className={adminInput} />
                </div>
                <button type="submit" className={`${btnPrimary} justify-self-start`}>
                  + Mở đợt mua
                </button>
              </form>
            </Card>
          </div>
        </details>
      </div>
      {searching && batches.length === 0 ? (
        <>
          <Flash kind="warning">{search.q ? `Không có sản phẩm / đợt nào trong các đợt mua hàng khớp “${search.q}”.` : "Không có đợt mua nào khớp điều kiện tìm."}</Flash>
          <p className="m-0 text-[13px] text-lien-muted" data-testid="batch-search-empty">
            {search.q ? `Không có sản phẩm / đợt nào khớp “${search.q}”` : "Không có đợt nào khớp tìm kiếm"} — <Link href={BACK} className="text-lien-blue hover:underline">xoá tìm</Link>.
          </p>
        </>
      ) : null}
      {batches.length ? (
        <BarTools>
          <AddRowButton label="+ Thêm sản phẩm" className={btnSecondary} />
          <BulkOpButton
            prefix="bb-"
            op="delete"
            label="Xoá sản phẩm"
            title="Xoá các dòng đã tick?"
            message="{n} dòng đã tick bị xoá khỏi đợt (nhập nhầm): mã và lịch sử của các cái đó bị xoá hẳn; dòng “cần mua” đã tick rời đợt, đơn vẫn giữ."
            confirmLabel="Xoá"
            className={cn(btnSecondary, "!border-red-300 !text-lien-heart disabled:opacity-50")}
          />
        </BarTools>
      ) : null}

      <div className="space-y-5">
        {batches.length === 0 && !searching ? (
          <Card>
            <p className="m-0 text-[13px] text-lien-muted">Chưa có đợt nào. Bấm “+ Mở đợt mua mới”, rồi nhập bill / thêm các sản phẩm đã mua — hệ thống tự gán cho đơn đang chờ trước, phần còn lại lưu kho.</p>
          </Card>
        ) : null}
        {batches.map((b) => (
          <BatchCard key={b.id} batch={b} products={products} sources={sources} billsOpen={openBillsFor === b.id} view={view} />
        ))}
      </div>
    </div>
  );
}

const CHANNEL: Record<string, "online" | "store" | "other"> = { website: "online", auction: "online", secondhand: "online", store: "store", other: "other" };
const expRange = (xs: Array<string | null>) => {
  const v = xs.filter((x): x is string => !!x).sort();
  if (!v.length) return "—";
  return v[0] === v[v.length - 1] ? formatDate(v[0]) : `${formatDate(v[0])} → ${formatDate(v[v.length - 1])}`;
};
const jpyRange = (xs: Array<number | null>) => {
  const v = xs.filter((x): x is number => x !== null).sort((a, b) => a - b);
  if (!v.length) return "—";
  return v[0] === v[v.length - 1] ? `¥${formatAmount(v[0])}` : `¥${formatAmount(v[0])}–${formatAmount(v[v.length - 1])}`;
};
const statusCounts = (units: UnitView[]) => {
  const m = new Map<PurchaseStatus, number>();
  for (const u of units) m.set(u.status, (m.get(u.status) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => purchaseIndex(a[0]) - purchaseIndex(b[0]));
};
const StatusChips = ({ units }: { units: UnitView[] }) => (
  <span className="flex flex-wrap gap-1">
    {statusCounts(units).map(([s, n]) => (
      <span key={s} className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", PURCHASE_STAGES[purchaseIndex(s)].cls)} title={PURCHASE_STAGES[purchaseIndex(s)].label}>
        {PURCHASE_STAGES[purchaseIndex(s)].short} {n}
      </span>
    ))}
  </span>
);

interface Ctx {
  b: PurchaseBatch;
  bulkId: string;
  saveId: string;
  sources: PurchaseSource[];
  searchOf: (productId: number, name: string, sku: string | null) => string;
  channelOf: (key: string) => string;
}

function BatchCard({ batch: b, products, sources, billsOpen, view }: { view: "tree" | "flat"; batch: PurchaseBatch; products: PickableProduct[]; sources: PurchaseSource[]; billsOpen: boolean }) {
  const st = PURCHASE_STAGES[purchaseIndex(b.status)];
  const stage = BATCH_STAGES.find((s) => s.key === b.status) ?? BATCH_STAGES[0];
  const left = b.units.some((u) => purchaseIndex(u.status) > purchaseIndex("bought"));
  const addId = `badd-${b.id}`;
  const bulkId = `bb-${b.id}`;
  const saveId = `bsave-${b.id}`;
  const tableId = `btable-${b.id}`;
  const jaById = new Map(products.map((p) => [p.id, p.nameJa ?? ""]));
  const kindByKey = new Map(sources.map((s) => [s.key, s.kind]));
  const ctx: Ctx = {
    b,
    bulkId,
    saveId,
    sources,
    searchOf: (productId, name, sku) => `${name} ${jaById.get(productId) ?? ""} ${sku ?? ""} #${productId}`,
    channelOf: (key) => CHANNEL[kindByKey.get(key) ?? "other"] ?? "other",
  };
  // tree: product → bill line (same product · bill · source · store · date · HSD · ¥) → units; "cần mua" lines under the product
  const tree = new Map<number, { name: string; sku: string | null; thumb: string; groupCode: string; lines: Map<string, UnitView[]>; needs: PurchaseBatchLine[] }>();
  const node = (id: number, name: string, sku: string | null, thumb: string, groupCode: string) => {
    let n = tree.get(id);
    if (!n) {
      n = { name, sku, thumb, groupCode, lines: new Map(), needs: [] };
      tree.set(id, n);
    }
    return n;
  };
  for (const u of b.units) {
    const n = node(u.productId, u.productName, u.productSku, u.productThumb, u.groupCode);
    const k = billLineKey(u);
    n.lines.set(k, [...(n.lines.get(k) ?? []), u]);
  }
  for (const l of b.needs) node(l.productId, l.productName, l.productSku, l.productThumb, "").needs.push(l);
  const productIds = [...tree.keys()].sort((x, y) => tree.get(x)!.name.localeCompare(tree.get(y)!.name, "vi"));
  const held = b.units.filter((u) => u.itemId).length;
  const needUnits = b.needs.reduce((n, l) => n + l.need, 0);
  const jpy = b.units.reduce((n, u) => n + (u.unitCostJpy ?? 0), 0);
  // net weight of the bought goods (product weight per piece; pieces without a weight counted apart)
  const grams = b.units.reduce((n, u) => n + (u.productWeightG && u.productWeightG > 0 ? u.productWeightG : 0), 0);
  const noWeight = b.units.filter((u) => !(u.productWeightG && u.productWeightG > 0)).length;
  const kgText = grams >= 1000 ? `${(grams / 1000).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} kg` : `${Math.round(grams)} g`;
  let idx = 0;
  const rows: ReactNode[] = [];
  for (const pid of productIds) {
    const n = tree.get(pid)!;
    const all = [...n.lines.values()].flat();
    rows.push(<ProductRow key={`p${pid}`} pid={pid} n={n} units={all} idx={idx++} {...ctx} />);
    for (const units of n.lines.values()) {
      rows.push(<BillLineRow key={`g${units[0].id}`} units={units} idx={idx++} {...ctx} />);
      for (const u of units) rows.push(<UnitRow key={`u${u.id}`} u={u} gid={units[0].id} idx={idx++} {...ctx} />);
    }
    for (const l of n.needs) rows.push(<NeedRow key={`n${l.itemId}`} l={l} idx={idx++} {...ctx} />);
  }
  return (
    <div id={`batch-${b.id}`} data-testid={`batch-${b.id}`} className="min-w-0">
      <Card
        title={`${b.code}${b.label ? ` · ${b.label}` : ""}`}
        actions={
          <span className="flex items-center gap-3">
            <span className="flex flex-wrap items-center gap-1.5" data-testid={`batch-head-${b.id}`}>
              <StatChip icon="cube" value={b.units.length} label="cái đã mua" />
              <StatChip icon="shopping-cart" value={held} label="cho đơn" tone="amber" hidden={!held} />
              <StatChip icon="archive" value={b.units.length - held} label="lưu kho" tone="gray" hidden={!(b.units.length - held)} />
              <StatChip icon="cart-plus" value={needUnits} label="cần mua" tone="red" hidden={!needUnits} />
              <StatChip icon="money" value={`≈ ¥${formatAmount(jpy)}`} label="tiền hàng" tone="green" hidden={!jpy} />
              <StatChip icon="balance-scale" value={`≈ ${kgText}`} label={noWeight ? `hàng · ${noWeight} cái chưa rõ cân` : "hàng"} tone="blue" hidden={!b.units.length} title="Cân nặng sản phẩm × số cái, chưa gồm thùng, lót" />
            </span>
            {b.units.some((u) => u.status === "bought" && !u.shipmentId) ? (
              <Link href={`/admin/inventory/shipments/?batch=${b.id}`} className={cn(btnSecondary, "!px-2 !py-0.5 !text-[12px]")} title="Mở ④ Đóng hàng JP, lọc sẵn hàng của đợt này (gồm hàng theo đơn), tick sẵn — bỏ tick cái không đóng" data-testid={`pack-batch-${b.id}`}>
                <Fa name="cube" /> Đóng hàng đợt này
              </Link>
            ) : null}
            <details className="relative" data-testid={`edit-batch-${b.id}`}>
              <summary className={cn(btnSecondary, "inline-flex cursor-pointer list-none !px-2 !py-0.5 !text-[12px]")} title="Sửa tên, nguồn mặc định, ngày mua, tracking, ghi chú của đợt">
                <Fa name="cog" /> Sửa
              </summary>
              <div className="absolute right-0 z-30 mt-1 w-[min(92vw,720px)] rounded-md border border-[#e5e7eb] bg-white p-3 shadow-lg">
                <form action={updateBatchAction} className="grid gap-2 lg:grid-cols-[1fr_160px_120px_160px_1fr_auto] lg:items-end">
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
                    <input type="date" id={`ub-${b.id}`} name="boughtAt" defaultValue={b.boughtAt ?? ""} className={cn(adminInput, "!py-1.5 !text-[13px]")} />
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
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#f0f0f0] pt-2">
                  <form action={syncBatchOrdersAction}>
                    <input type="hidden" name="batchId" value={b.id} />
                    <button type="submit" className={cn(btnSecondary, "!py-1 !text-[12px]")} title="Tự chạy sau mỗi thay đổi; bấm để chạy lại ngay: đơn huỷ trả hàng về tồn, đơn đang chờ được xếp lại (vị trí → hạn dùng → bill)">
                      <Fa name="refresh" /> Cập nhật theo đơn hàng
                    </button>
                  </form>
                  {left ? (
                    <span className="text-[12px] text-lien-muted">Không xoá được đợt: đã có hàng rời Kho Nhật.</span>
                  ) : (
                    <form action={deleteBatchAction}>
                      <input type="hidden" name="batchId" value={b.id} />
                      <ConfirmSubmit message={`Xoá đợt ${b.code}? Hàng đã mua vẫn giữ mã và vị trí, chỉ không còn thuộc đợt.`} confirmLabel="Xoá đợt" className={cn(btnSecondary, "!border-red-300 !py-1 !text-[12px] !text-lien-heart")}>
                        <Fa name="trash" /> Xoá đợt
                      </ConfirmSubmit>
                    </form>
                  )}
                </div>
              </div>
            </details>
            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", st.cls)} title={`${stage.label} — trạng thái của cái chậm nhất trong đợt`}>
              {stage.short}
            </span>
            <BatchToggle id={b.id} className={cn(btnSecondary, "!px-2 !py-0.5 !text-[12px]")} />
          </span>
        }
      >
        <BatchBody id={b.id}>
        {/* every input in the table belongs to this one form; the bar at the bottom submits it */}
        <form id={saveId} action={saveBatchRowsAction}>
          <input type="hidden" name="batchId" value={b.id} />
        </form>
        <datalist id={`bills-${b.id}`}>
          {b.receipts.map((r) => (
            <option key={r.id} value={r.code} />
          ))}
        </datalist>
        <form id={bulkId} action={bulkBatchRowsAction}>
          <input type="hidden" name="batchId" value={b.id} />
        </form>
        {/* what "Xoá sản phẩm" in the bottom bar submits for this trip */}
        <button type="submit" form={bulkId} name="op" value="delete" data-op="delete" hidden aria-hidden tabIndex={-1} />
        <form id={addId} action={addProductAction}>
          <input type="hidden" name="batchId" value={b.id} />
        </form>

        <BillsBlock b={b} sources={sources} done={false} open={billsOpen} />

        {/* actions on ticked units / "cần mua" lines; disabled until something is ticked */}
        <BulkBar scope={bulkId}>
          <select name="bulkStatus" form={bulkId} defaultValue="bought" className={cn(adminInput, cell, "!w-auto disabled:opacity-50")} aria-label="Trạng thái cho các dòng đã tick">
            {PURCHASE_STAGES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          <button type="submit" form={bulkId} name="op" value="status" className={cn(btnPrimary, "!py-1 disabled:opacity-50")} title="Các cái đã tick chuyển sang trạng thái này; dòng “cần mua” đã tick được tạo mã (mua cho đơn) ở trạng thái đó">
            Cập nhật trạng thái
          </button>
          <ConfirmSubmit form={bulkId} name="op" value="lost" message="Đánh dấu các cái đã tick là thất lạc? Chúng ra khỏi tồn kho; đơn đang giữ sẽ tự tìm cái khác." confirmLabel="Thất lạc" className={cn(btnSecondary, "!py-1 disabled:opacity-50")}>
            Thất lạc
          </ConfirmSubmit>
        </BulkBar>

        <BatchTree batchId={b.id} view={view} />
        <div className="overflow-x-auto" id={tableId} data-select-scope={bulkId}>
          <SheetTable id={`batch-${b.id}`}>
          <table className={cn(tableClass, "max-lg:block")}>
            <thead className="max-lg:hidden">
              {rows.length ? (
                <tr className="bg-[#f9fafb] text-[13px] font-semibold text-lien-heading" data-testid={`totals-${b.id}`} data-sheet-ignore>
                    <td className={cn(tdClass, STICKY_L)} />
                    <td className={cn(tdClass, STICKY_N)}>
                      Tổng cộng <span className="font-normal text-lien-muted">(theo dòng đang hiện)</span>
                    </td>
                    <td className={tdClass}>
                      <span data-total="units">{b.units.length + needUnits}</span>
                    </td>
                    <td className={tdClass}>
                      <span data-total="jpy">{jpy ? `¥${formatAmount(jpy)}` : "—"}</span>
                    </td>
                    <td className={tdClass} colSpan={5} />
                  </tr>
              ) : null}
              <tr>
                <th className={cn(thClass, "sticky left-0 z-10 w-8 bg-[#f9fafb]")}>
                  <input type="checkbox" data-tick="all" className="h-4 w-4" aria-label="Chọn tất cả dòng đang hiện" title="Chọn tất cả cái đang hiện" />
                </th>
                {(
                  [
                    ["name", "Sản phẩm · bill · mã"],
                    ["qty", "SL"],
                    ["unit", "¥/đv"],
                    ["expiry", "HSD"],
                    ["statusidx", "Trạng thái"],
                    ["bought", "Ngày mua"],
                    ["srcname", "Mua ở / cửa hàng"],
                    ["bill", "Bill · cho đơn"],
                  ] as const
                ).map(([k, label]) => (
                  <th key={k} className={cn(thClass, k === "name" && "sticky left-12 z-10 bg-[#f9fafb] shadow-[1px_0_0_#e5e7eb]")}>
                    <button type="button" data-sort={k} className="group inline-flex items-center gap-1 font-semibold uppercase text-inherit hover:text-lien-blue data-[dir=asc]:text-lien-blue data-[dir=desc]:text-lien-blue" title="Bấm để sắp xếp">
                      {label}
                      <span className="text-[10px] text-lien-muted group-data-[dir=asc]:hidden group-data-[dir=desc]:hidden">⇅</span>
                      <span className="hidden text-[10px] group-data-[dir=asc]:inline">▲</span>
                      <span className="hidden text-[10px] group-data-[dir=desc]:inline">▼</span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="max-lg:grid max-lg:grid-cols-1 max-lg:gap-2">
              {rows.length === 0 ? (
                <tr className="max-lg:block">
                  <td colSpan={9} className={`${tdClass} text-center text-lien-muted`}>
                    Đợt chưa có gì — nhập bill hoặc bấm “+ Thêm sản phẩm” ở thanh dưới.
                  </td>
                </tr>
              ) : null}
              {rows}
              <tr className="hidden bg-[#fffbeb] align-top [&:not(.hidden)]:max-lg:block" data-add-row={b.id} data-sheet-ignore data-testid={`add-row-${b.id}`}>
                <td className={cn(tdClass, TD, STICKY_L, "w-8 !bg-[#fffbeb]")} />
                <td className={cn(tdClass, TD, STICKY_N, "min-w-[220px] !bg-[#fffbeb]")}>
                  <span className="mb-1 block text-[11px] font-semibold uppercase text-lien-muted">Sản phẩm đã mua</span>
                  <ProductSearchSelect products={products} form={addId} placeholder="Gõ tên Việt / Nhật hoặc SKU…" />
                </td>
                <td className={cn(tdClass, TD, LBL)} data-label="SL">
                  <input name="qty" form={addId} inputMode="numeric" required placeholder="SL" className={cn(adminInput, cell, "!w-14 !text-center")} aria-label="Số lượng mua" title="Mỗi cái được một mã riêng (H…)" />
                </td>
                <td className={cn(tdClass, TD, LBL)} data-label="¥/đv">
                  <input name="unitCostJpy" form={addId} inputMode="numeric" placeholder="¥/đv" className={cn(adminInput, cell, "!w-[84px]")} aria-label="Giá ¥ mỗi đơn vị" />
                </td>
                <td className={cn(tdClass, TD, LBL)} data-label="HSD">
                  <input name="expiry" form={addId} placeholder="03/2027" className={cn(adminInput, cell, "!w-[112px]")} aria-label="Hạn dùng" />
                </td>
                <td className={cn(tdClass, TD, LBL)} data-label="Trạng thái">
                  <select name="status" form={addId} defaultValue="bought" className={cn(adminInput, cell, "!w-40")} aria-label="Trạng thái" title="Mua tại cửa hàng = Tại kho Nhật; đặt online chưa về = Đã đặt mua">
                    {BATCH_STAGES.map((x) => (
                      <option key={x.key} value={x.key}>
                        {x.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className={cn(tdClass, TD, LBL)} data-label="Ngày mua">
                  <input type="date" name="boughtAt" form={addId} defaultValue={b.boughtAt ?? todayIso()} className={cn(adminInput, cell, "!w-[112px]")} aria-label="Ngày mua" />
                </td>
                <td className={cn(tdClass, TD, LBL)} data-label="Mua ở">
                  <div className="grid w-[150px] gap-1">
                    <select name="sourceKey" form={addId} defaultValue={b.sourceKey} className={cn(adminInput, cell, "!w-full")} aria-label="Mua ở">
                      {sources.map((x) => (
                        <option key={x.key} value={x.key}>
                          {x.name}
                        </option>
                      ))}
                    </select>
                    <input name="note" form={addId} maxLength={80} placeholder="cửa hàng / chi nhánh…" className={cn(adminInput, cell, "!w-full !text-[12px]")} aria-label="Cửa hàng" />
                  </div>
                </td>
                <td className={cn(tdClass, TD, LBL)} data-label="Bill">
                  <div className="grid w-[170px] gap-1">
                    <select name="billId" form={addId} defaultValue={b.receipts[0]?.id ?? "new"} className={cn(adminInput, cell, "!w-full font-mono !text-[12px]")} aria-label="Bill" title="Bill đã trả tiền món này; “+ bill mới” tự tạo theo nơi mua / ngày mua">
                      {b.receipts.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.code}
                        </option>
                      ))}
                      <option value="new">+ bill mới</option>
                      <option value="">không gắn bill</option>
                    </select>
                    <button type="submit" form={addId} className={cn(btnPrimary, "!py-1 !text-[13px]")}>
                      + Thêm vào đợt
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
          </SheetTable>
        </div>
        </BatchBody>
      </Card>
    </div>
  );
}

/** Bills of the batch: the numbered paper trail — photos attach here; new bills by pasting text or as an empty bill for photos. */
function BillsBlock({ b, sources, done, open }: { b: PurchaseBatch; sources: PurchaseSource[]; done: boolean; open: boolean }) {
  const tabField = <input type="hidden" name="fromTab" value="batches" />;
  return (
    <details className="mb-2" data-testid={`bills-${b.id}`} open={open || b.receipts.some((r) => r.status === "draft")}>
      <summary className={cn(btnSecondary, "ml-auto flex w-fit cursor-pointer list-none !py-1 !text-[13px]")} title="Danh sách bill của đợt, nhập bill mới, đính kèm ảnh">
        <Fa name="file-text-o" /> Bill ({b.receipts.length})
        {done ? null : <span className="text-lien-muted">· nhập bill / ảnh</span>}
      </summary>
      <div className="mt-2 grid gap-3 rounded-md border border-[#e5e7eb] bg-white px-3 py-3 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-2">
          {b.receipts.length === 0 ? <p className="m-0 text-[12px] text-lien-muted">Đợt chưa có bill. Dán nội dung bill (email Amazon / Rakuten, hoặc mỗi dòng: tên · SL · giá) ở khung bên phải, hoặc tạo bill trống rồi đính ảnh chụp.</p> : null}
          {b.receipts.map((r) => (
            <BillRow key={r.id} r={r} b={b} sources={sources} tabField={tabField} />
          ))}
        </div>
        {done ? null : (
          <div className="space-y-3">
            <form action={parseBillAction} className="grid gap-2 rounded-md border border-dashed border-[#d1d5db] p-2" data-testid={`bill-paste-${b.id}`}>
              {tabField}
              <input type="hidden" name="batchId" value={b.id} />
              <label className={adminLabel} htmlFor={`bt-${b.id}`}>
                Nhập bill mới <span className="font-normal text-lien-muted">— dán nội dung, tự tách sản phẩm · SL · ¥</span>
              </label>
              <textarea id={`bt-${b.id}`} name="bill" rows={5} placeholder={"注文番号: 249-1234567-8901234\nロート製薬 メンソレータム アクネス 14g\n数量: 2  ¥1,320\n\nhoặc: 3 x Sữa rửa mặt Hatomugi 800ml 690円"} className={cn(adminInput, "!mb-0 font-mono !text-[12px]")} />
              <div className="grid grid-cols-2 gap-2">
                <select name="sourceKey" defaultValue={b.sourceKey} className={cn(adminInput, "!mb-0 !py-1 !text-[13px]")} aria-label="Mua ở">
                  {sources.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <input type="date" name="boughtAt" defaultValue={b.boughtAt ?? todayIso()} className={cn(adminInput, "!mb-0 !py-1 !text-[13px]")} aria-label="Ngày mua" />
              </div>
              <input name="orderRef" placeholder="mã đơn nguồn (trống = tự đọc)" className={cn(adminInput, "!mb-0 !py-1 !text-[13px]")} aria-label="Mã đơn nguồn" />
              <button type="submit" className={cn(btnPrimary, "justify-self-start !py-1 !text-[13px]")}>
                Đọc bill → phiếu nháp
              </button>
            </form>
            <details className="rounded-md border border-dashed border-[#d1d5db] p-2" data-testid={`bill-import-${b.id}`}>
              <summary className="cursor-pointer text-[12px] font-semibold text-lien-heading">
                Nhập nhanh nhiều bill <span className="font-normal text-lien-muted">— dán danh sách, mỗi dòng một bill</span>
              </summary>
              <form action={importBillsAction} className="mt-2 grid gap-2">
                <input type="hidden" name="batchId" value={b.id} />
                <textarea name="bills" rows={7} placeholder={"@ OS Drug Store\nBILL-260927-1113 | 船橋店 | パブロンゴールドA錠 | ¥1,518 PayPay\n@ Sugi drug store\nBILL-260927-1530 | 船橋駅南店 | サンデーケア ×2 + ... | ¥10,919"} className={cn(adminInput, "!mb-0 font-mono !text-[12px]")} aria-label="Danh sách bill" />
                <p className="m-0 text-[11px] leading-4 text-lien-muted">Dòng “@ Tên nguồn” đặt nơi mua cho các dòng dưới (nguồn chưa có sẽ được tạo). Mỗi bill: mã | cửa hàng | nội dung | tổng (tab hoặc | ngăn cách; ngày lấy từ mã BILL-yymmdd-…). Mã đã có thì bỏ qua.</p>
                <button type="submit" className={cn(btnSecondary, "justify-self-start !py-1 !text-[13px]")}>
                  Tạo các bill trong danh sách
                </button>
              </form>
            </details>
            <form action={createBillAction} className="grid gap-2 rounded-md border border-dashed border-[#d1d5db] p-2" data-testid={`bill-new-${b.id}`}>
              <input type="hidden" name="batchId" value={b.id} />
              <span className={adminLabel}>
                Bill trống <span className="font-normal text-lien-muted">— chỉ để đính ảnh chụp, gắn sản phẩm sau</span>
              </span>
              <div className="grid grid-cols-2 gap-2">
                <select name="sourceKey" defaultValue={b.sourceKey} className={cn(adminInput, "!mb-0 !py-1 !text-[13px]")} aria-label="Mua ở">
                  {sources.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <input type="date" name="boughtAt" defaultValue={b.boughtAt ?? todayIso()} className={cn(adminInput, "!mb-0 !py-1 !text-[13px]")} aria-label="Ngày mua" />
              </div>
              <input name="orderRef" placeholder="mã đơn / số bill (tuỳ chọn)" className={cn(adminInput, "!mb-0 !py-1 !text-[13px]")} aria-label="Mã đơn nguồn" />
              <button type="submit" className={cn(btnSecondary, "justify-self-start !py-1 !text-[13px]")}>
                + Tạo bill trống
              </button>
            </form>
          </div>
        )}
      </div>
    </details>
  );
}

function BillRow({ r, b, sources, tabField }: { r: PurchaseBatchBill; b: PurchaseBatch; sources: PurchaseSource[]; tabField: ReactNode }) {
  return (
    <div id={`receipt-${r.id}`} className="rounded-md border border-[#e5e7eb] bg-[#f9fafb] px-3 py-2 text-[12px]" data-testid={`bill-${r.id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <form action={renameBillAction} className="inline-flex items-center gap-1" data-testid={`bill-rename-${r.id}`}>
          <input type="hidden" name="batchId" value={b.id} />
          <input type="hidden" name="receiptId" value={r.id} />
          <input name="code" defaultValue={r.code} maxLength={60} className={cn(adminInput, "!mb-0 !w-[190px] !py-0.5 font-mono !text-[12px] font-semibold")} aria-label="Mã bill" title="Mã bill của cửa hàng (vd BILL_260927_1454 giống tên ảnh)" />
          <button type="submit" className={cn(btnSecondary, "!px-2 !py-0.5 !text-[11px]")} title="Đổi mã bill">
            Đổi mã
          </button>
        </form>
        <span>{formatDate(r.boughtAt)}</span>
        <span>· {purchaseSourceName(r.sourceKey, sources)}</span>
        {r.orderRef ? <span className="text-lien-muted">· {r.orderRef}</span> : null}
        {r.totalJpy ? <span className="text-lien-muted">· ¥{formatAmount(r.totalJpy)}</span> : null}
        <span className="text-lien-muted">
          · {r.items} sp trên bill · {r.units} mã hàng
        </span>
        {r.status === "draft" ? (
          <Link href={`${BACK}&receipts=1&draft=${r.id}#receipt-${r.id}`} className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 no-underline hover:underline">
            nháp — xác nhận sản phẩm →
          </Link>
        ) : null}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        {r.files.map((f) => (
          <span key={f.path} className="inline-flex items-center gap-1 rounded border border-[#e5e7eb] bg-white p-1">
            <a href={f.url} target="_blank" rel="noreferrer" title={f.name} className="no-underline">
              {f.mime.startsWith("image/") ? <Image src={f.url} alt={f.name} width={56} height={56} unoptimized className="h-14 w-14 rounded object-cover" /> : <span className="inline-block max-w-[140px] truncate px-1 text-lien-blue">📄 {f.name || "PDF"}</span>}
            </a>
            <form action={deleteReceiptFileAction}>
              {tabField}
              <input type="hidden" name="id" value={r.id} />
              <input type="hidden" name="path" value={f.path} />
              <input type="hidden" name="back" value={`${BACK}&bills=${b.id}#receipt-${r.id}`} />
              <ConfirmSubmit message="Gỡ ảnh này khỏi bill?" className="px-1 text-[11px] text-lien-heart hover:underline">
                gỡ
              </ConfirmSubmit>
            </form>
          </span>
        ))}
        <form action={uploadReceiptFilesAction} className="inline-flex flex-wrap items-center gap-1">
          {tabField}
          <input type="hidden" name="id" value={r.id} />
          <input type="hidden" name="back" value={`${BACK}&bills=${b.id}#receipt-${r.id}`} />
          <input type="file" name="files" accept="image/*,application/pdf" multiple className="max-w-[220px] text-[12px]" aria-label="Ảnh bill" />
          <button type="submit" className={cn(btnSecondary, "!px-2 !py-0.5 !text-[12px]")} title="Đính kèm ảnh chụp bill / PDF (≤ 10 MB mỗi tệp)">
            <Fa name="paperclip" /> Thêm ảnh bill
          </button>
        </form>
      </div>
    </div>
  );
}

/** Table cell (lg+) that becomes a labelled block inside the row card below lg. */
const TD = "max-lg:block max-lg:border-0 max-lg:px-0 max-lg:py-1";
const LBL = "max-lg:before:mr-1 max-lg:before:text-[11px] max-lg:before:text-lien-muted max-lg:before:content-[attr(data-label)]";
const STICKY_L = "lg:sticky lg:left-0 lg:z-[5] lg:bg-inherit";
/** The product / bill-line column stays next to the tick column when the table scrolls sideways (like a frozen column). */
const STICKY_N = "lg:sticky lg:left-12 lg:z-[4] lg:bg-inherit lg:shadow-[1px_0_0_#e5e7eb]";
const Toggle = ({ label }: { label: string }) => (
  <button type="button" data-toggle className="mr-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-[#d1d5db] bg-white text-[10px] text-lien-heading transition-transform hover:border-lien-blue group-data-[open=1]:rotate-90" aria-label={label} title={label}>
    ▶
  </button>
);

/** Tầng 1 — one product of the batch: every unit of it summed (SL, places, dates, ¥), bill lines below. */
function ProductRow({ pid, n, units, idx, b, searchOf, sources }: { pid: number; n: { name: string; sku: string | null; thumb: string; groupCode: string; lines: Map<string, UnitView[]>; needs: PurchaseBatchLine[] }; units: UnitView[]; idx: number } & Ctx) {
  const need = n.needs.reduce((k, l) => k + l.need, 0);
  const heldN = units.filter((u) => u.itemId).length;
  const bills = new Set(units.map((u) => u.receiptCode).filter(Boolean));
  const slow = units.length ? units.reduce((m, u) => (purchaseIndex(u.status) < purchaseIndex(m) ? u.status : m), units[0].status) : ("not_bought" as PurchaseStatus);
  // clean values for the column filter (▾) of the whole product: every status / store / bill / order of its units
  const uniq = (xs: Array<string | null | undefined>) => [...new Set(xs.filter((x): x is string => !!x))].join("|");
  const minOf = (xs: Array<string | number | null>) => xs.filter((x) => x !== null && x !== "").sort()[0] ?? "";
  const fv = {
    status: uniq([...units.map((u) => PURCHASE_STAGES[purchaseIndex(u.status)].label), need ? PURCHASE_STAGES[0].label : null]),
    src: uniq([...units.map((u) => purchaseSourceName(u.sourceKey, sources)), ...n.needs.map((l) => (l.sourceKey ? purchaseSourceName(l.sourceKey, sources) : null))]),
    bill: uniq([...units.map((u) => u.receiptCode || "chưa có bill"), ...units.map((u) => (u.orderNumber ? `#${u.orderNumber}` : "lưu kho")), ...n.needs.map((l) => `#${l.orderNumber}`)]),
    expiry: uniq(units.map((u) => (u.expiry ? formatDate(u.expiry) : "—"))),
    bought: uniq(units.map((u) => (u.boughtAt ? formatDate(u.boughtAt) : "—"))),
  };
  const minJpy = units.map((u) => u.unitCostJpy).filter((x): x is number => x !== null).sort((a, z) => a - z)[0];
  return (
    <tr className="group border-t-2 border-[#e5e7eb] bg-sky-50 align-top hover:bg-sky-100 max-lg:block max-lg:rounded-md max-lg:border max-lg:p-3" data-lvl="p" data-sheet-start data-p={pid} data-open="0" data-idx={idx} data-name={n.name} data-qty={units.length + need} data-statusidx={purchaseIndex(slow)} data-expiry={units.map((u) => u.expiry ?? "").filter(Boolean).sort()[0] ?? ""} data-bought={units.map((u) => u.boughtAt ?? "").filter(Boolean).sort()[0] ?? ""} data-unit={units.find((u) => u.unitCostJpy)?.unitCostJpy ?? ""} data-srcname={units[0] ? units[0].sourceKey : ""} data-bill={[...bills][0] ?? ""} data-testid={`bprod-${b.id}-${pid}`}>
      <td className={cn(tdClass, TD, STICKY_L, "w-8 max-lg:float-right")}>
        <input type="checkbox" data-tick={`p:${pid}`} className="h-4 w-4" aria-label={`Chọn mọi cái của ${n.name}`} title="Chọn mọi cái của sản phẩm (đang hiện)" />
      </td>
      <td className={cn(tdClass, TD, STICKY_N, "min-w-[240px] max-w-[320px]")}>
        <div className="flex items-start gap-1.5">
          <Toggle label="Mở / đóng các dòng bill" />
          {n.thumb ? <Image src={n.thumb} alt="" width={32} height={32} unoptimized className="h-8 w-8 shrink-0 rounded border border-[#e5e7eb] object-contain" /> : <span className="h-8 w-8 shrink-0 rounded border border-dashed border-[#e5e7eb]" />}
          <span className="flex min-w-0 flex-col leading-4">
            <Link href={`/admin/inventory/lots/${pid}/`} className="line-clamp-2 text-[13px] font-bold text-lien-heading hover:text-lien-blue" title={searchOf(pid, n.name, n.sku)}>
              {n.name}
            </Link>
            <span className="text-[11px] text-lien-muted">
              #{pid}
              {n.sku ? ` · ${n.sku}` : ""}
              {n.groupCode ? <span className="ml-1 rounded bg-[#f3f4f6] px-1 font-mono text-[10px] text-lien-heading" title="Mã nhóm biến thể">{n.groupCode}</span> : null}
            </span>
          </span>
        </div>
      </td>
      <td className={cn(tdClass, TD, LBL, "text-[14px] font-bold")} data-label="SL">
        <span data-shown>{units.length}</span>
        {need ? <span className="block text-[11px] font-semibold text-lien-heart">+{need} cần mua</span> : null}
      </td>
      <td className={cn(tdClass, TD, LBL, "whitespace-nowrap text-[12px]")} data-label="¥/đv" data-s={minJpy ?? ""}>
        {jpyRange(units.map((u) => u.unitCostJpy))}
      </td>
      <td className={cn(tdClass, TD, LBL, "whitespace-nowrap text-[12px]")} data-label="HSD" data-v={fv.expiry} data-s={minOf(units.map((u) => u.expiry))}>
        {expRange(units.map((u) => u.expiry))}
      </td>
      <td className={cn(tdClass, TD, LBL)} data-label="Trạng thái" data-v={fv.status} data-s={purchaseIndex(slow)}>
        <StatusChips units={units} />
      </td>
      <td className={cn(tdClass, TD, LBL, "whitespace-nowrap text-[12px]")} data-label="Ngày mua" data-v={fv.bought} data-s={minOf(units.map((u) => u.boughtAt))}>
        {expRange(units.map((u) => u.boughtAt))}
      </td>
      <td className={cn(tdClass, TD, LBL, "text-[12px]")} data-label="Mua ở" data-v={fv.src}>
        {Array.from(new Set(units.map((u) => u.sourceKey))).length} nơi
      </td>
      <td className={cn(tdClass, TD, LBL, "text-[12px] text-lien-muted")} data-label="Bill" data-v={fv.bill}>
        {bills.size} bill · giữ cho đơn {heldN} · lưu kho {units.length - heldN}
      </td>
    </tr>
  );
}

/** Tầng 2 — a bill line: the units of one product bought on one bill at one price / HSD. Editing applies to all of them. */
/** Statuses a purchase row can take here: buying → at Kho VN (delivery is ⑦ Giao hàng VN), plus the current one. */
const stagesFor = (current: PurchaseStatus) => PURCHASE_STAGES.filter((x) => purchaseIndex(x.key) <= purchaseIndex("at_shop") || x.key === current);

function BillLineRow({ units, idx, b, saveId, sources, channelOf }: { units: UnitView[]; idx: number } & Ctx) {
  const u = units[0];
  const g = `g_${u.id}_`;
  const holders = new Map<string, { orderId: string; number: number; customer: string; n: number; committed: boolean }>();
  for (const x of units) {
    if (!x.orderId) continue;
    const h = holders.get(x.orderId) ?? { orderId: x.orderId, number: x.orderNumber ?? 0, customer: x.customerName, n: 0, committed: false };
    h.n++;
    h.committed = h.committed || x.committed;
    holders.set(x.orderId, h);
  }
  const free = units.filter((x) => !x.itemId).length;
  const locked = units.filter((x) => x.itemId || x.shipmentId).length;
  const slow = units.reduce((m, x) => (purchaseIndex(x.status) < purchaseIndex(m) ? x.status : m), u.status);
  const uniform = units.every((x) => x.status === units[0].status) ? units[0].status : null;
  return (
    <tr className="group bg-white align-top max-lg:block max-lg:rounded-md max-lg:border max-lg:border-[#e5e7eb] max-lg:p-3" data-lvl="g" data-p={u.productId} data-g={u.id} data-open="0" data-idx={idx} data-testid={`bline-${u.id}`}>
      <td className={cn(tdClass, TD, STICKY_L, "w-8 max-lg:float-right")}>
        <input type="checkbox" data-tick={`g:${u.id}`} className="h-4 w-4" aria-label="Chọn mọi cái của dòng bill" title="Chọn mọi cái của dòng bill (đang hiện)" />
      </td>
      <td className={cn(tdClass, TD, STICKY_N, "min-w-[240px] pl-6")}>
        <input type="hidden" name={`${g}ids`} form={saveId} value={units.map((x) => x.id).join(",")} />
        <div className="flex items-start gap-1">
          <Toggle label="Mở / đóng từng mã" />
          <span className="flex min-w-0 flex-col leading-4">
            <span className="text-[12px] font-semibold text-lien-heading">
              Dòng bill {u.receiptCode ? <span className="font-mono">{u.receiptCode}</span> : <span className="text-lien-muted">chưa có bill</span>}
            </span>
            <span className="font-mono text-[11px] text-lien-muted" title={units.map((x) => x.code).join(" ")}>
              {units.length > 1 ? `${units[0].code} … ${units[units.length - 1].code}` : u.code} · <span data-shown>{units.length}</span> mã
            </span>
          </span>
        </div>
      </td>
      <td className={cn(tdClass, TD, LBL)} data-label="SL">
        <input name={`${g}qty`} form={saveId} inputMode="numeric" defaultValue={units.length} className={cn(adminInput, cell, "!w-14 !text-center font-semibold")} aria-label="Số lượng của dòng bill" title={`Tăng = thêm cái mới cùng bill / giá / HSD; giảm = bỏ các cái chưa giữ cho đơn${locked ? ` (${locked} cái đang giữ cho đơn / đã đóng chuyến không bớt được)` : ""}`} />
      </td>
      <td className={cn(tdClass, TD, LBL)} data-label="¥/đv">
        <input name={`${g}unitCostJpy`} form={saveId} inputMode="numeric" defaultValue={u.unitCostJpy ?? ""} placeholder="¥/đv" className={cn(adminInput, cell, "!w-[84px]")} aria-label="Giá ¥ mỗi đơn vị" />
      </td>
      <td className={cn(tdClass, TD, LBL)} data-label="HSD">
        <input name={`${g}expiry`} form={saveId} defaultValue={u.expiry ?? ""} placeholder="03/2027" className={cn(adminInput, cell, "!w-[112px]")} aria-label="Hạn dùng" />
      </td>
      <td className={cn(tdClass, TD, LBL)} data-label="Trạng thái">
        {/* the status of every unit of the bill line: shows the line's status; picking another moves all of them
            (only units whose status differs are written). Mixed lines show how many are where until one is picked. */}
        <select name={`${g}status`} form={saveId} defaultValue={uniform ?? ""} className={cn(adminInput, cell, "!w-40")} aria-label="Trạng thái cả dòng bill" title="Đổi = mọi cái của dòng bill chuyển sang trạng thái này (từng mã vẫn đổi riêng được khi mở dòng)">
          {uniform ? null : <option value="">{`— ${units.length} cái, nhiều trạng thái —`}</option>}
          {stagesFor(uniform ?? slow).map((x) => (
            <option key={x.key} value={x.key}>
              {x.label}
            </option>
          ))}
        </select>
        {uniform ? null : (
          <span className="mt-1 block">
            <StatusChips units={units} />
          </span>
        )}
      </td>
      <td className={cn(tdClass, TD, LBL)} data-label="Ngày mua">
        <input type="date" name={`${g}boughtAt`} form={saveId} defaultValue={u.boughtAt ?? ""} className={cn(adminInput, cell, "!w-[112px]")} aria-label="Ngày mua" />
      </td>
      <td className={cn(tdClass, TD, LBL)} data-label="Mua ở">
        <div className="grid w-[150px] gap-1">
          <select name={`${g}sourceKey`} form={saveId} defaultValue={u.sourceKey} className={cn(adminInput, cell, "!w-full")} aria-label="Mua ở" data-ch={channelOf(u.sourceKey)}>
            {sources.map((s) => (
              <option key={s.key} value={s.key}>
                {s.name}
              </option>
            ))}
          </select>
          <input name={`${g}store`} form={saveId} defaultValue={u.store} placeholder="cửa hàng / chi nhánh…" className={cn(adminInput, cell, "!w-full !text-[12px]")} aria-label="Cửa hàng" />
        </div>
      </td>
      <td className={cn(tdClass, TD, LBL)} data-label="Bill">
        <input name={`${g}billCode`} form={saveId} defaultValue={u.receiptCode} list={`bills-${b.id}`} placeholder="mã bill…" className={cn(adminInput, cell, "!w-[150px] font-mono !text-[12px]")} aria-label="Mã bill" title="Gõ mã bill của cửa hàng (vd BILL_260927_1454): mã mới → tạo bill trong đợt, mã có sẵn → gắn vào bill đó, xoá trống → bỏ gắn" />
        <span className="mt-1 flex flex-wrap gap-1 text-[10px]">
          {[...holders.values()].map((h) => (
            <Link key={h.orderId} href={`/admin/orders/${h.orderId}/`} className={cn("rounded px-1.5 py-0.5 font-semibold no-underline hover:underline", h.committed ? "bg-green-100 text-green-800" : "bg-[#eef2ff] text-[#3730a3]")} title={h.committed ? "Đơn đã thanh toán / COD — hàng đã trừ tồn" : "Đơn chưa thanh toán — đang giữ chỗ"}>
              #{h.number} {h.customer} ×{h.n}
            </Link>
          ))}
          {free ? <span className="rounded bg-[#ecfdf5] px-1.5 py-0.5 font-semibold text-[#065f46]">lưu kho {free}</span> : null}
        </span>
      </td>
    </tr>
  );
}

/** Tầng 3 — one physical item: its code, where it is, who it is held for. */
function UnitRow({ u, gid, idx, bulkId, saveId, sources, searchOf, channelOf }: { u: UnitView; gid: number; idx: number } & Ctx) {
  const stage = PURCHASE_STAGES[purchaseIndex(u.status)];
  return (
    <tr className="group hidden bg-[#fcfcfd] align-top text-[12px] hover:bg-[#f5f7ff] max-lg:block max-lg:rounded-md max-lg:border max-lg:border-dashed max-lg:border-[#e5e7eb] max-lg:p-2" data-lvl="u" data-p={u.productId} data-g={gid} data-idx={idx} data-code={u.code} data-search={`${searchOf(u.productId, u.productName, u.productSku)} ${u.code} ${u.receiptCode} ${u.store}`} data-name={u.productName} data-src={u.sourceKey} data-ch={channelOf(u.sourceKey)} data-srcname={purchaseSourceName(u.sourceKey, sources)} data-bought={u.boughtAt ?? ""} data-expiry={u.expiry ?? ""} data-unit={u.unitCostJpy ?? ""} data-bill={u.receiptCode || "—"} data-status={u.status} data-statusidx={purchaseIndex(u.status)} data-kind={u.itemId ? "line" : "stock"} data-order={u.orderNumber ?? ""} data-customer={u.customerName} data-qty={1} data-jpy={u.unitCostJpy ?? 0} data-testid={`bunit-${u.id}`}>
      <td className={cn(tdClass, TD, STICKY_L, "w-8 max-lg:float-right")}>
        <input type="checkbox" name="uids" value={u.id} form={bulkId} className="h-4 w-4" aria-label={`Chọn ${u.code}`} />
      </td>
      <td className={cn(tdClass, TD, STICKY_N, "pl-12")}>
        <Link href={`/admin/inventory/units/${u.code}/`} className="font-mono text-[13px] font-bold text-lien-blue no-underline hover:underline" title="Xem lịch sử của mã">
          {u.code}
        </Link>
        <span className="ml-1 text-[11px] text-lien-muted">{UNIT_ORIGIN_LABEL[u.origin]}</span>
        <span className="hidden truncate text-[11px] text-lien-muted [[data-view=flat]_&]:block" data-flat-name>
          {u.productName}
        </span>
      </td>
      <td className={cn(tdClass, TD, LBL)} data-label="SL">
        1
      </td>
      <td className={cn(tdClass, TD, LBL, "whitespace-nowrap text-lien-muted")} data-label="¥/đv">
        {u.unitCostJpy ? `¥${formatAmount(u.unitCostJpy)}` : "—"}
      </td>
      <td className={cn(tdClass, TD, LBL, "whitespace-nowrap text-lien-muted")} data-label="HSD">
        {u.expiry ? formatDate(u.expiry) : "—"}
      </td>
      <td className={cn(tdClass, TD, LBL)} data-label="Trạng thái">
        <select name={`u_${u.id}_status`} form={saveId} defaultValue={u.status} className={cn(adminInput, cell, "!w-40 !text-[12px]")} aria-label={`Trạng thái ${u.code}`} title={stage.label}>
          {stagesFor(u.status).map((x) => (
            <option key={x.key} value={x.key}>
              {x.label}
            </option>
          ))}
        </select>
      </td>
      <td className={cn(tdClass, TD, LBL, "whitespace-nowrap text-lien-muted")} data-label="Ngày mua">
        {u.boughtAt ? formatDate(u.boughtAt) : "—"}
      </td>
      <td className={cn(tdClass, TD, LBL, "text-lien-muted")} data-label="Mua ở">
        {purchaseSourceName(u.sourceKey, sources)}
        {u.store ? ` · ${u.store}` : ""}
      </td>
      <td className={cn(tdClass, TD, LBL)} data-label="Cho đơn">
        {u.orderId ? (
          <Link href={`/admin/orders/${u.orderId}/`} className={cn("rounded px-1.5 py-0.5 text-[11px] font-semibold no-underline hover:underline", u.committed ? "bg-green-100 text-green-800" : "bg-[#eef2ff] text-[#3730a3]")}>
            Đơn #{u.orderNumber} · {u.customerName}
            {u.committed ? " · đã TT" : ""}
          </Link>
        ) : (
          <span className="text-lien-muted">lưu kho</span>
        )}
        {u.shipmentCode ? <span className="ml-1 rounded bg-amber-50 px-1 text-[10px] text-amber-800">chuyến {u.shipmentCode}</span> : null}
        {u.receiptCode ? <span className="block font-mono text-[10px] text-lien-muted">{u.receiptCode}</span> : null}
      </td>
    </tr>
  );
}

/** An order line planned in this batch that still has no unit: "cần mua". Tick + status = bought for that customer. */
function NeedRow({ l, idx, bulkId, sources, searchOf, channelOf }: { l: PurchaseBatchLine; idx: number } & Ctx) {
  return (
    <tr className="bg-[#fff7f7] align-top text-[12px] max-lg:block max-lg:rounded-md max-lg:border max-lg:border-red-200 max-lg:p-2" data-lvl="n" data-p={l.productId} data-idx={idx} data-search={searchOf(l.productId, l.productName, l.productSku)} data-name={l.productName} data-src={l.sourceKey} data-ch={channelOf(l.sourceKey)} data-srcname={purchaseSourceName(l.sourceKey, sources)} data-status="not_bought" data-statusidx={0} data-kind="need" data-order={l.orderNumber} data-customer={l.customerName} data-qty={l.need} data-jpy={(l.costJpy ?? 0) * l.need} data-bill="—" data-testid={`bneed-${l.itemId}`}>
      <td className={cn(tdClass, TD, STICKY_L, "w-8 max-lg:float-right")}>
        <input type="checkbox" name="needIds" value={l.itemId} form={bulkId} className="h-4 w-4" aria-label={`Chọn dòng cần mua của đơn #${l.orderNumber}`} />
      </td>
      <td className={cn(tdClass, TD, STICKY_N, "pl-6")}>
        <span className="rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-semibold text-red-800">Cần mua</span>{" "}
        <Link href={`/admin/orders/${l.orderId}/`} className="font-semibold text-[#3730a3] no-underline hover:underline">
          Đơn #{l.orderNumber} · {l.customerName}
        </Link>
      </td>
      <td className={cn(tdClass, TD, LBL, "font-semibold text-lien-heart")} data-label="SL">
        {l.need}
        {l.need < l.quantity ? <span className="block text-[10px] font-normal text-lien-muted">/ {l.quantity} đặt</span> : null}
      </td>
      <td className={cn(tdClass, TD, LBL, "text-lien-muted")} data-label="">
        {l.costJpy ? `giá tham khảo ¥${formatAmount(l.costJpy)}` : ""}
      </td>
      <td className={cn(tdClass, TD, LBL, "text-lien-muted")} colSpan={3} data-label="">
        Mua xong: tick dòng → chọn trạng thái → <b>Cập nhật trạng thái</b> (tạo mã cho đơn) — hoặc thêm sản phẩm theo bill, đơn được giữ hàng tự động.
      </td>
      <td className={cn(tdClass, TD, LBL, "text-lien-muted")} data-label="Mua ở">
        {l.sourceKey ? purchaseSourceName(l.sourceKey, sources) : "—"}
      </td>
      <td className={cn(tdClass, TD, LBL)} data-label="" />
    </tr>
  );
}
