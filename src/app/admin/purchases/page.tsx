import Image from "next/image";
import Link from "next/link";
import { bulkPurchaseAction, setPurchaseAction } from "@/app/admin/purchases/actions";
import { createReceiptFromLinesAction } from "@/app/admin/purchases/receipt-actions";
import { OrdersByOrderPanel } from "@/components/sites/lienstore/admin/OrdersByOrderPanel";
import { PurchaseBatchPanel } from "@/components/sites/lienstore/admin/PurchaseBatchPanel";
import { listAllocationViews } from "@/lib/allocations-db";
import { itemIdsNeedingPurchase } from "@/lib/allocations-db";
import { getDb } from "@/lib/sqlite";
import { listBatchHeads, listPurchaseBatches } from "@/lib/purchase-batches-db";
import { listStockGroups } from "@/lib/lots-db";
import { ReceiptsPanel } from "@/components/sites/lienstore/admin/ReceiptsPanel";
import { todayIso } from "@/lib/lots";
import { purchaseSourceName } from "@/lib/purchase-sources";
import { listReceipts } from "@/lib/receipts-db";
import type { PurchaseSource } from "@/types/shop";
import { ResizableTable } from "@/components/sites/lienstore/admin/ResizableTable";
import { adminInput, btnPrimary, btnSecondary, Flash, PageHeader } from "@/components/sites/lienstore/admin/ui";
import { BarTools } from "@/components/sites/lienstore/admin/BulkBar";
import { StatTile, StatTiles } from "@/components/sites/lienstore/admin/StatTiles";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { requireAdmin } from "@/lib/auth";
import { getAllProducts, getPurchaseLines, listPurchaseSources } from "@/lib/db";
import { StockPurchasePanel } from "@/components/sites/lienstore/admin/StockPurchasePanel";
import { ExpensePanel } from "@/components/sites/lienstore/admin/ExpensePanel";
import { OpenDetailsButton } from "@/components/sites/lienstore/admin/AddRowButton";
import { listExpenses } from "@/lib/expenses-db";
import { getJpyRate } from "@/lib/db";
import { IN_TRANSIT_STATUSES, PURCHASE_STAGES, type PurchaseStatus } from "@/lib/purchase";
import { cn } from "@/lib/utils";
import { FlowSteps } from "@/components/sites/lienstore/admin/FlowSteps";
import { flowCounts } from "@/lib/flow-db";

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
  await requireAdmin("purchases");
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
  // Mua theo đợt: every batch table lists by product (tree) or every unit code (flat) — read client-side by BatchTree
  const batchView: "tree" | "flat" = first(sp.bv) === "flat" ? "flat" : "tree";
  const receiptsOpen = first(sp.receipts) === "1" || first(sp.tab) === "receipts" || !!first(sp.draft);
  // date range on the order's creation time (shop day, inclusive) + purchase source
  const from = /^\d{4}-\d{2}-\d{2}$/.test(first(sp.from)) ? first(sp.from) : "";
  const to = /^\d{4}-\d{2}-\d{2}$/.test(first(sp.to)) ? first(sp.to) : "";
  const source = first(sp.source);
  // đồ tiêu hao: the block opens when the bar button is used or an action just landed on it
  const expenses = listExpenses({ limit: 30 });
  const jpyRate = await getJpyRate();
  const expensesOpen = first(sp.expenses) === "1" || /Hoá đơn|hoá đơn|tệp/i.test(first(sp.saved));
  const shopDayOf = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
  const [all, sources, allProducts] = await Promise.all([getPurchaseLines(includeDone), listPurchaseSources(), tab !== "orders" ? getAllProducts(true) : Promise.resolve([])]);
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
  const allocViews = tab === "orders" ? listAllocationViews(getDb(), all.map((l) => l.itemId)) : [];
  // units no order holds (planned → Kho VN): the "Hàng lưu kho" tab
  const stockGroups = listStockGroups(getDb(), { free: true, statuses: ["not_bought", "ordered", "bought", "to_carrier_jp", "shipped_jp_vn", "at_carrier_vn", "to_shop", "at_shop"] });
  const stockUnits = stockGroups.reduce((n, g) => n + g.qty, 0);
  const draftId = Number.parseInt(first(sp.draft), 10);
  const pickable = allProducts.map((p) => ({ id: p.id, name: p.name, nameJa: p.nameJa, sku: p.sku, thumb: p.thumb, costJpy: p.costJpy, stock: p.stock }));
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
      <FlowSteps current="buy" counts={flowCounts(getDb())} />
      <PageHeader
        title="Quản lý mua hàng"
        summary={<span className="text-green-700">{batchHeads.length} đợt đang mở</span>}
        actions={
          tab === "batches" ? (
            <span className="inline-flex overflow-hidden rounded-md border border-[#d1d5db]" role="tablist" aria-label="Cách hiển thị đợt" data-testid="batch-view">
              <Link href="/admin/purchases/?tab=batches" role="tab" aria-selected={batchView === "tree"} className={cn("px-3 py-1.5 text-[13px] font-semibold no-underline", batchView === "tree" ? "bg-lien-blue text-white" : "bg-white text-lien-heading hover:bg-[#f3f4f6]")}>
                Theo sản phẩm
              </Link>
              <Link href="/admin/purchases/?tab=batches&bv=flat" role="tab" aria-selected={batchView === "flat"} className={cn("border-l border-[#d1d5db] px-3 py-1.5 text-[13px] font-semibold no-underline", batchView === "flat" ? "bg-lien-blue text-white" : "bg-white text-lien-heading hover:bg-[#f3f4f6]")}>
                Từng mã
              </Link>
            </span>
          ) : undefined
        }
      />
      <BarTools end>
        <OpenDetailsButton target="expenses" label="+ Hoá đơn đồ tiêu hao" className={btnSecondary} />
        <Link href="/admin/inventory/export/" className={btnSecondary} data-testid="bar-csv">
          <Fa name="download" /> CSV cần mua
        </Link>
      </BarTools>
      {first(sp.saved) ? <Flash>{first(sp.saved)}</Flash> : null}
      {first(sp.error) ? <Flash kind="error">{first(sp.error)}</Flash> : null}

      {/* the figures are the tabs: the three views (đợt / theo đơn / lưu kho) plus where the bought goods are */}
      <StatTiles testId="purchase-stats">
        <StatTile label="Đợt mua đang mở" value={`${batchHeads.length} đợt`} accent="blue" href="/admin/purchases/?tab=batches" active={tab === "batches"} title="Mua theo đợt: mỗi đợt = một lần đi mua / một bill" testId="tile-batches" />
        <StatTile label="Cần mua (theo đơn)" value={`${needCount} dòng · ${counts.not_bought} đv`} accent={needCount ? "red" : "green"} href="/admin/purchases/?tab=orders" active={tab === "orders"} title="Dòng trong đơn khách chưa có hàng — mua theo đặt hàng" testId="tile-orders" />
        <StatTile label="Hàng lưu kho (chưa có khách)" value={`${stockUnits} cái`} accent="amber" href="/admin/purchases/?tab=stock" active={tab === "stock"} title="Hàng mua để lưu kho, chưa gắn đơn nào" testId="tile-stock" />
        <StatTile label="Đã mua, đang về" value={`${IN_TRANSIT_STATUSES.reduce((n, k) => n + counts[k], 0)} đv`} accent="gray" href="/admin/inventory/?side=jp" title={`Tại Nhật ${counts.bought + counts.to_carrier_jp} · NB→VN ${counts.shipped_jp_vn} · kho ĐVVC VN ${counts.at_carrier_vn + counts.to_shop} — bấm sang Tồn kho Nhật`} />
        <StatTile label="Sẵn tại kho shop VN" value={`${counts.at_shop} đv`} accent="green" href="/admin/inventory/?side=vn" title="Hàng của đơn đã ở kho shop VN — bấm sang Tồn kho VN" />
        <StatTile label="Đơn đang xử lý" value={`${all.length} dòng · ${all.reduce((n, l) => n + l.quantity, 0)} đv`} accent="gray" href="/admin/orders/?view=stock" title="Mọi dòng sản phẩm trong các đơn đang xử lý — bấm sang Đơn hàng › Theo kho hàng" />
      </StatTiles>

      <ExpensePanel expenses={expenses} rate={jpyRate} tab={tab} open={expensesOpen} />

      {tab === "stock" ? <StockPurchasePanel groups={stockGroups} products={pickable} sources={sources} batches={batchHeads} /> : null}
      {tab === "batches" && receiptsOpen ? (
        <div className="mb-5" id="receipts">
          <ReceiptsPanel receipts={receipts} sources={sources} products={pickable} draftId={Number.isInteger(draftId) ? draftId : null} fromTab={tab} batches={batchHeads} defaultBatchId={Number.isInteger(billBatch) ? billBatch : (batchHeads[0]?.id ?? null)} />
        </div>
      ) : null}
      {tab === "batches" ? <PurchaseBatchPanel view={batchView} batches={batches} openLines={all.filter((l) => l.purchaseStatus === "not_bought" && !l.batchId)} products={pickable} sources={sources} includeDone={includeDone} search={{ q: bq, from: bfrom, to: bto, status: bstatus }} openBillsFor={Number.isInteger(billsOpenFor) ? billsOpenFor : null} /> : null}

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

