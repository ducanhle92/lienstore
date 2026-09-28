import Image from "next/image";
import Link from "next/link";
import { bulkPurchaseAction, setPurchaseAction } from "@/app/admin/purchases/actions";
import { addLinesToBatchAction, allocateSurplusAction } from "@/app/admin/purchases/batch-actions";
import { createReceiptFromLinesAction } from "@/app/admin/purchases/receipt-actions";
import { OrdersByOrderPanel } from "@/components/sites/lienstore/admin/OrdersByOrderPanel";
import { PurchaseBatchPanel } from "@/components/sites/lienstore/admin/PurchaseBatchPanel";
import { listAllocationViews, listReservationsForStockPurchases } from "@/lib/allocations-db";
import { itemIdsNeedingPurchase } from "@/lib/allocations-db";
import { getDb } from "@/lib/sqlite";
import { listBatchHeads, listOpenSurplus, listPurchaseBatches } from "@/lib/purchase-batches-db";
import { listLotViews } from "@/lib/lots-db";
import { ReceiptsPanel } from "@/components/sites/lienstore/admin/ReceiptsPanel";
import { todayIso } from "@/lib/lots";
import { purchaseSourceName } from "@/lib/purchase-sources";
import { listReceipts } from "@/lib/receipts-db";
import type { PurchaseSource } from "@/types/shop";
import { ResizableTable } from "@/components/sites/lienstore/admin/ResizableTable";
import { adminInput, btnPrimary, btnSecondary, Flash, PageHeader } from "@/components/sites/lienstore/admin/ui";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { requireAdmin } from "@/lib/auth";
import { getAllProducts, getPurchaseLines, listPurchaseSources, listStockPurchases } from "@/lib/db";
import { StockPurchasePanel } from "@/components/sites/lienstore/admin/StockPurchasePanel";
import { IN_TRANSIT_STATUSES, PURCHASE_STAGES, type PurchaseStatus } from "@/lib/purchase";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/**
 * Kho hàng › Quản lý mua hàng: every line of an open order with its purchase / logistics status
 * (Chưa mua → Đã mua → NB→VN → về kho shop → tại kho → gửi khách → khách nhận). Grouped view answers
 * "how many units of X are still to buy, on the way, or already in Vietnam".
 */
export default async function AdminPurchases({ searchParams }: Props) {
  const session = await requireAdmin("inventory");
  const sp = await searchParams;
  const status = first(sp.status);
  const q = first(sp.q).trim().toLowerCase();
  const view = first(sp.view) === "product" ? "product" : "line";
  const includeDone = first(sp.done) === "1";
  // by default only lines still "Cần mua" (no lot / slip / batch behind them); ?all=1 shows every open line
  const showAll = first(sp.all) === "1";
  const needIds = itemIdsNeedingPurchase(getDb());
  // three tabs; the old "receipts" tab maps to Mua theo đặt hàng with the bill section open
  const tab = first(sp.tab) === "stock" ? "stock" : first(sp.tab) === "orders" ? "orders" : "batches";
  const receiptsOpen = first(sp.receipts) === "1" || first(sp.tab) === "receipts" || !!first(sp.draft);
  // date range on the order's creation time (shop day, inclusive) + purchase source
  const from = /^\d{4}-\d{2}-\d{2}$/.test(first(sp.from)) ? first(sp.from) : "";
  const to = /^\d{4}-\d{2}-\d{2}$/.test(first(sp.to)) ? first(sp.to) : "";
  const source = first(sp.source);
  const shopDayOf = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
  const [all, stockPurchases, sources, allProducts] = await Promise.all([getPurchaseLines(includeDone), listStockPurchases(includeDone), listPurchaseSources(), tab !== "orders" ? getAllProducts(true) : Promise.resolve([])]);
  const receipts = listReceipts(40);
  // Mua theo đợt: search by name / code and bought-date range (searching also looks at finished batches)
  const bq = first(sp.bq).trim();
  const bfrom = /^\d{4}-\d{2}-\d{2}$/.test(first(sp.bfrom)) ? first(sp.bfrom) : "";
  const bto = /^\d{4}-\d{2}-\d{2}$/.test(first(sp.bto)) ? first(sp.bto) : "";
  const billBatch = Number.parseInt(first(sp.bill), 10);
  const billsOpenFor = Number.parseInt(first(sp.bills), 10);
  const bstatus: "" | "done" | "all" = first(sp.bstatus) === "done" ? "done" : first(sp.bstatus) === "all" ? "all" : "";
  const batches = tab === "batches" ? listPurchaseBatches({ includeDone: includeDone || bstatus === "all" || !!(bq || bfrom || bto), onlyDone: bstatus === "done", q: bq, from: bfrom, to: bto }) : [];
  const batchHeads = listBatchHeads();
  const openSurplus = listOpenSurplus();
  void openSurplus;
  const allocViews = tab === "orders" ? listAllocationViews(getDb(), all.map((l) => l.itemId)) : [];
  const stockLots = tab === "stock" ? listLotViews(getDb(), {}).filter((l) => l.free > 0) : [];
  const draftId = Number.parseInt(first(sp.draft), 10);
  const pickable = allProducts.map((p) => ({ id: p.id, name: p.name, nameJa: p.nameJa, sku: p.sku, thumb: p.thumb, costJpy: p.costJpy, stock: p.stock }));
  const stockInTransit = stockPurchases.filter((p) => !p.lotId).reduce((n, p) => n + p.qty, 0);
  const lines = all
    .filter((l) => showAll || includeDone || needIds.has(l.itemId))
    .filter((l) => !status || l.purchaseStatus === status)
    .filter((l) => !q || `${l.name} ${l.sku ?? ""} #${l.orderNumber} ${l.customerName} ${l.receiptCode}`.toLowerCase().includes(q))
    .filter((l) => !from || shopDayOf(l.orderCreatedAt) >= from)
    .filter((l) => !to || shopDayOf(l.orderCreatedAt) <= to)
    .filter((l) => !source || (source === "-" ? !l.sourceKey : l.sourceKey === source));
  const counts = Object.fromEntries(PURCHASE_STAGES.map((s) => [s.key, all.filter((l) => l.purchaseStatus === s.key).reduce((n, l) => n + l.quantity, 0)])) as Record<PurchaseStatus, number>;
  const self = `/admin/purchases/?${new URLSearchParams({ ...(status ? { status } : {}), ...(q ? { q } : {}), ...(view !== "line" ? { view } : {}), ...(includeDone ? { done: "1" } : {}), ...(showAll ? { all: "1" } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}), ...(source ? { source } : {}) }).toString()}`;
  const needCount = all.filter((l) => needIds.has(l.itemId)).length;

  // per-product roll-up
  const byProduct = new Map<number, { name: string; sku: string | null; thumb: string | null; costPrice: number | null; supplierUrl: string | null; total: number; per: Record<PurchaseStatus, number>; orders: string[] }>();
  for (const l of lines) {
    const g = byProduct.get(l.productId) ?? { name: l.name, sku: l.sku, thumb: l.thumb, costPrice: l.costPrice, supplierUrl: l.supplierUrl, total: 0, per: Object.fromEntries(PURCHASE_STAGES.map((s) => [s.key, 0])) as Record<PurchaseStatus, number>, orders: [] };
    g.total += l.quantity;
    g.per[l.purchaseStatus] += l.quantity;
    g.orders.push(`#${l.orderNumber}×${l.quantity}`);
    byProduct.set(l.productId, g);
  }

  return (
    <>
      <PageHeader
        title="Quản lý mua hàng"
        subtitle={`${all.length} dòng trong các đơn đang xử lý · ${all.reduce((n, l) => n + l.quantity, 0)} đơn vị · chưa mua ${counts.not_bought} · đã mua, đang trên đường về ${IN_TRANSIT_STATUSES.reduce((n, k) => n + counts[k], 0)} (tại Nhật ${counts.bought + counts.to_carrier_jp} · NB→VN ${counts.shipped_jp_vn} · kho ĐVVC VN ${counts.at_carrier_vn + counts.to_shop}) · sẵn tại kho shop ${counts.at_shop}`}
        actions={
          <>
            <Link href="/admin/inventory/export/" className={btnSecondary}>
              <Fa name="download" /> CSV cần mua
            </Link>
            <Link href="/admin/inventory/" className={btnSecondary}>
              <Fa name="archive" /> Tồn kho
            </Link>
          </>
        }
      />
      {first(sp.saved) ? <Flash>{first(sp.saved)}</Flash> : null}
      {first(sp.error) ? <Flash kind="error">{first(sp.error)}</Flash> : null}

      <div className="mb-5 flex flex-wrap gap-2" data-testid="purchase-tabs">
        <Link href="/admin/purchases/?tab=batches" className={cn("rounded-md border px-3 py-1.5 text-[13px] font-semibold no-underline", tab === "batches" ? "border-lien-blue bg-lien-blue text-white" : "border-[#d1d5db] bg-white text-lien-text hover:bg-[#f3f4f6]")} data-testid="tab-batches">
          Mua theo đợt ({batchHeads.length} đợt đang mở)
        </Link>
        <Link href="/admin/purchases/?tab=orders" className={cn("rounded-md border px-3 py-1.5 text-[13px] font-semibold no-underline", tab === "orders" ? "border-lien-blue bg-lien-blue text-white" : "border-[#d1d5db] bg-white text-lien-text hover:bg-[#f3f4f6]")}>
          Mua theo đặt hàng ({needCount} dòng cần mua)
        </Link>
        <Link href="/admin/purchases/?tab=stock" className={cn("rounded-md border px-3 py-1.5 text-[13px] font-semibold no-underline", tab === "stock" ? "border-lien-blue bg-lien-blue text-white" : "border-[#d1d5db] bg-white text-lien-text hover:bg-[#f3f4f6]")}>
          Mua lưu kho ({stockPurchases.filter((p) => !p.lotId).length} phiếu · {stockInTransit} đv đang về)
        </Link>

      </div>

      {tab === "stock" ? <StockPurchasePanel purchases={stockPurchases} products={pickable} sources={sources} includeDone={includeDone} batches={batchHeads} reserved={listReservationsForStockPurchases(getDb(), stockPurchases.map((p) => p.id))} lots={stockLots} /> : null}
      {tab === "batches" && receiptsOpen ? (
        <div className="mb-5" id="receipts">
          <ReceiptsPanel receipts={receipts} sources={sources} products={pickable} draftId={Number.isInteger(draftId) ? draftId : null} fromTab={tab} batches={batchHeads} defaultBatchId={Number.isInteger(billBatch) ? billBatch : (batchHeads[0]?.id ?? null)} />
        </div>
      ) : null}
      {tab === "batches" ? <PurchaseBatchPanel batches={batches} openLines={all.filter((l) => l.purchaseStatus === "not_bought" && !l.batchId)} products={pickable} sources={sources} includeDone={includeDone} search={{ q: bq, from: bfrom, to: bto, status: bstatus }} openBillsFor={Number.isInteger(billsOpenFor) ? billsOpenFor : null} isOwner={session.role === "owner"} /> : null}

      {tab === "orders" ? <OrdersByOrderPanel lines={all} allocations={allocViews} sources={sources} batches={batchHeads} filter={{ q: first(sp.q), only: first(sp.only) === "need" ? "need" : first(sp.only) === "ready" ? "ready" : "" }} back={self} /> : null}
      {/* every tab can enter a purchase bill; on Mua theo đợt the bill can be booked straight into a batch */}
      {tab === "batches" ? null : (
      <details open={receiptsOpen} className="mt-6" id="receipts">
        <summary className="cursor-pointer text-[15px] font-bold text-lien-heading">
          Phiếu mua hàng · nhập bill <span className="text-[13px] font-normal text-lien-muted">({receipts.length} phiếu gần đây{receipts.some((r) => r.status === "draft") ? ` · ${receipts.filter((r) => r.status === "draft").length} nháp chờ xác nhận` : ""})</span>
        </summary>
        <div className="mt-3">
          <ReceiptsPanel receipts={receipts} sources={sources} products={pickable} draftId={Number.isInteger(draftId) ? draftId : null} fromTab={tab} batches={batchHeads} defaultBatchId={null} />
        </div>
      </details>
      )}
    </>
  );
}

