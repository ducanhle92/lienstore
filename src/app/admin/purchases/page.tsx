import Image from "next/image";
import Link from "next/link";
import { bulkPurchaseAction, setPurchaseAction } from "@/app/admin/purchases/actions";
import { createReceiptFromLinesAction } from "@/app/admin/purchases/receipt-actions";
import { ReceiptsPanel } from "@/components/sites/lienstore/admin/ReceiptsPanel";
import { todayIso } from "@/lib/lots";
import { purchaseSourceName } from "@/lib/purchase-sources";
import { listReceipts } from "@/lib/receipts-db";
import type { PurchaseSource } from "@/types/shop";
import { ResizableTable } from "@/components/sites/lienstore/admin/ResizableTable";
import { adminInput, btnPrimary, btnSecondary, Card, Flash, PageHeader, tableClass, tdClass, thClass } from "@/components/sites/lienstore/admin/ui";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { requireAdmin } from "@/lib/auth";
import { getAllProducts, getPurchaseLines, listPurchaseSources, listStockPurchases, type PurchaseLine } from "@/lib/db";
import { StockPurchasePanel } from "@/components/sites/lienstore/admin/StockPurchasePanel";
import { formatDateTime, formatPrice } from "@/lib/format";
import { IN_TRANSIT_STATUSES, PURCHASE_STAGES, type PurchaseStatus, purchaseIndex } from "@/lib/purchase";
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
  await requireAdmin("inventory");
  const sp = await searchParams;
  const status = first(sp.status);
  const q = first(sp.q).trim().toLowerCase();
  const view = first(sp.view) === "product" ? "product" : "line";
  const includeDone = first(sp.done) === "1";
  const tab = first(sp.tab) === "stock" ? "stock" : first(sp.tab) === "receipts" ? "receipts" : "orders";
  // date range on the order's creation time (shop day, inclusive) + purchase source
  const from = /^\d{4}-\d{2}-\d{2}$/.test(first(sp.from)) ? first(sp.from) : "";
  const to = /^\d{4}-\d{2}-\d{2}$/.test(first(sp.to)) ? first(sp.to) : "";
  const source = first(sp.source);
  const shopDayOf = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
  const [all, stockPurchases, sources, allProducts] = await Promise.all([getPurchaseLines(includeDone), listStockPurchases(includeDone), listPurchaseSources(), tab !== "orders" ? getAllProducts(true) : Promise.resolve([])]);
  const receipts = tab === "receipts" ? listReceipts(80) : [];
  const draftId = Number.parseInt(first(sp.draft), 10);
  const pickable = allProducts.map((p) => ({ id: p.id, name: p.name, sku: p.sku, thumb: p.thumb, costJpy: p.costJpy, stock: p.stock }));
  const stockInTransit = stockPurchases.filter((p) => !p.lotId).reduce((n, p) => n + p.qty, 0);
  const lines = all
    .filter((l) => !status || l.purchaseStatus === status)
    .filter((l) => !q || `${l.name} ${l.sku ?? ""} #${l.orderNumber} ${l.customerName} ${l.receiptCode}`.toLowerCase().includes(q))
    .filter((l) => !from || shopDayOf(l.orderCreatedAt) >= from)
    .filter((l) => !to || shopDayOf(l.orderCreatedAt) <= to)
    .filter((l) => !source || (source === "-" ? !l.sourceKey : l.sourceKey === source));
  const counts = Object.fromEntries(PURCHASE_STAGES.map((s) => [s.key, all.filter((l) => l.purchaseStatus === s.key).reduce((n, l) => n + l.quantity, 0)])) as Record<PurchaseStatus, number>;
  const self = `/admin/purchases/?${new URLSearchParams({ ...(status ? { status } : {}), ...(q ? { q } : {}), ...(view !== "line" ? { view } : {}), ...(includeDone ? { done: "1" } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}), ...(source ? { source } : {}) }).toString()}`;

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
        <Link href="/admin/purchases/" className={cn("rounded-md border px-3 py-1.5 text-[13px] font-semibold no-underline", tab === "orders" ? "border-lien-blue bg-lien-blue text-white" : "border-[#d1d5db] bg-white text-lien-text hover:bg-[#f3f4f6]")}>
          Theo đơn hàng ({all.length} dòng)
        </Link>
        <Link href="/admin/purchases/?tab=stock" className={cn("rounded-md border px-3 py-1.5 text-[13px] font-semibold no-underline", tab === "stock" ? "border-lien-blue bg-lien-blue text-white" : "border-[#d1d5db] bg-white text-lien-text hover:bg-[#f3f4f6]")}>
          Mua lưu kho ({stockPurchases.filter((p) => !p.lotId).length} phiếu · {stockInTransit} đv đang về)
        </Link>
        <Link href="/admin/purchases/?tab=receipts" className={cn("rounded-md border px-3 py-1.5 text-[13px] font-semibold no-underline", tab === "receipts" ? "border-lien-blue bg-lien-blue text-white" : "border-[#d1d5db] bg-white text-lien-text hover:bg-[#f3f4f6]")} data-testid="tab-receipts">
          Phiếu mua hàng · nhập bill
        </Link>
      </div>

      {tab === "stock" ? <StockPurchasePanel purchases={stockPurchases} products={pickable} sources={sources} includeDone={includeDone} /> : null}
      {tab === "receipts" ? <ReceiptsPanel receipts={receipts} sources={sources} products={pickable} draftId={Number.isInteger(draftId) ? draftId : null} /> : null}

      {/* compact stage counters (same density as Kho hàng) — the table below is the working view */}
      <div className={cn("mb-3 grid grid-cols-3 gap-1.5 sm:grid-cols-5 lg:grid-cols-9", tab !== "orders" && "hidden")}>
        {PURCHASE_STAGES.map((s) => (
          <Link key={s.key} href={`/admin/purchases/?status=${s.key}${includeDone || s.key === "delivered" ? "&done=1" : ""}`} className={cn("rounded-md border px-2 py-1.5 no-underline", status === s.key ? "border-lien-blue bg-lien-blue-soft/60" : "border-[#e5e7eb] bg-white hover:border-lien-blue/50")} title={s.label}>
            <div className="truncate text-[10px] font-semibold uppercase tracking-wide text-[#6b7280]">{s.short}</div>
            <div className="font-oswald text-[16px] leading-5 text-lien-heading">
              {counts[s.key]} <span className="text-[10px] font-sans font-normal text-lien-muted">đv</span>
            </div>
          </Link>
        ))}
      </div>

      <Card className={cn(tab !== "orders" && "hidden")}>
        <form method="get" className="mb-4 grid gap-3 md:grid-cols-[1fr_200px_150px_150px_180px_auto] md:items-center">
          <input name="q" defaultValue={first(sp.q)} placeholder="Tìm sản phẩm, SKU, #đơn, tên khách, mã phiếu…" className={adminInput} />
          <select name="status" defaultValue={status} className={adminInput}>
            <option value="">Mọi trạng thái</option>
            {PURCHASE_STAGES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          <input type="date" name="from" defaultValue={from} className={adminInput} aria-label="Đơn từ ngày" title="Đơn đặt từ ngày" />
          <input type="date" name="to" defaultValue={to} className={adminInput} aria-label="Đơn đến ngày" title="Đơn đặt đến ngày" />
          <select name="source" defaultValue={source} className={adminInput} aria-label="Mua ở">
            <option value="">Mua ở: tất cả</option>
            <option value="-">Chưa chọn nguồn</option>
            {sources.map((s) => (
              <option key={s.key} value={s.key}>
                {s.name}
              </option>
            ))}
          </select>
          <label className="inline-flex items-center gap-2 text-[13px]">
            <input type="radio" name="view" value="line" defaultChecked={view === "line"} className="h-4 w-4" /> Từng dòng đơn
          </label>
          <label className="inline-flex items-center gap-2 text-[13px]">
            <input type="radio" name="view" value="product" defaultChecked={view === "product"} className="h-4 w-4" /> Gộp theo sản phẩm
          </label>
          <label className="inline-flex items-center gap-2 text-[13px]">
            <input type="checkbox" name="done" value="1" defaultChecked={includeDone} className="h-4 w-4" /> Gồm đơn đã xong
          </label>
          <button type="submit" className={cn(btnPrimary, "md:col-start-6")}>
            Lọc
          </button>
        </form>

        {view === "product" ? (
          <div className="overflow-x-auto">
            <table className={tableClass}>
              <thead>
                <tr>
                  <th className={thClass} />
                  <th className={thClass}>Sản phẩm</th>
                  <th className={thClass}>Tổng</th>
                  {PURCHASE_STAGES.map((s) => (
                    <th key={s.key} className={thClass} title={s.label}>
                      {s.short}
                    </th>
                  ))}
                  <th className={thClass}>Vốn</th>
                  <th className={thClass}>Mua ở</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(byProduct.entries()).map(([pid, g]) => (
                  <tr key={pid} className="hover:bg-[#fafafa]">
                    <td className={`${tdClass} w-12`}>{g.thumb ? <Image src={g.thumb} alt="" width={36} height={36} unoptimized className="h-9 w-9 rounded border border-[#e5e7eb] object-cover" /> : null}</td>
                    <td className={tdClass}>
                      <Link href={`/admin/products/${pid}/`} className="font-semibold text-lien-heading hover:text-lien-blue">
                        {g.name}
                      </Link>
                      <div className="text-[12px] text-lien-muted">
                        #{pid}
                        {g.sku ? ` · ${g.sku}` : ""} · {g.orders.join(" ")}
                      </div>
                    </td>
                    <td className={`${tdClass} font-semibold`}>{g.total}</td>
                    {PURCHASE_STAGES.map((s) => (
                      <td key={s.key} className={tdClass}>
                        {g.per[s.key] ? <span className={cn("rounded px-1.5 py-0.5 text-[12px] font-semibold", s.cls)}>{g.per[s.key]}</span> : <span className="text-lien-muted">—</span>}
                      </td>
                    ))}
                    <td className={`${tdClass} whitespace-nowrap text-lien-muted`}>{g.costPrice === null ? "—" : formatPrice(g.total * g.costPrice)}</td>
                    <td className={`${tdClass} whitespace-nowrap`}>
                      {g.supplierUrl ? (
                        <a href={g.supplierUrl} target="_blank" rel="noreferrer" className="text-lien-blue hover:underline">
                          <Fa name="external-link" /> {g.supplierUrl.includes("amazon") ? "Amazon JP" : "Link"}
                        </a>
                      ) : (
                        <span className="text-lien-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {byProduct.size === 0 ? (
                  <tr>
                    <td colSpan={11} className={`${tdClass} text-center text-lien-muted`}>
                      Không có dòng nào.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : (
          <form action={bulkPurchaseAction}>
            <input type="hidden" name="back" value={self} />
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-[#e5e7eb] bg-[#f9fafb] px-3 py-2 text-[13px]">
              <span className="font-semibold text-lien-heading">Các dòng đã tick →</span>
              <select name="status" defaultValue="" className={cn(adminInput, "!w-auto !py-1")}>
                <option value="">chọn trạng thái…</option>
                {PURCHASE_STAGES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
              <button type="submit" className={cn(btnPrimary, "!py-1")}>
                Áp dụng
              </button>
              <span className="mx-1 text-lien-muted">|</span>
              <span className="font-semibold text-lien-heading">hoặc tạo phiếu mua:</span>
              <select name="receiptSource" defaultValue="amazon" className={cn(adminInput, "!w-auto !py-1")} aria-label="Nguồn của phiếu">
                {sources.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.name}
                  </option>
                ))}
              </select>
              <input name="receiptDate" defaultValue={todayIso()} className={cn(adminInput, "!w-[120px] !py-1")} aria-label="Ngày mua" title="Ngày mua" />
              <input name="receiptRef" placeholder="mã đơn nguồn" className={cn(adminInput, "!w-[170px] !py-1")} aria-label="Mã đơn nguồn" />
              <button type="submit" formAction={createReceiptFromLinesAction} className={cn(btnSecondary, "!py-1")} title="Gom các dòng đã tick thành một phiếu mua (mã PM-…), chuyển sang Đã mua và ghi nguồn">
                <Fa name="file-text-o" /> Tạo phiếu mua
              </button>
            </div>
            <ResizableTable id="purchases">
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th className={thClass} />
                    <th className={thClass} />
                    <th className={thClass}>Sản phẩm</th>
                    <th className={thClass}>Đơn</th>
                    <th className={thClass}>SL</th>
                    <th className={thClass}>Trạng thái</th>
                    <th className={thClass}>Ghi chú</th>
                    <th className={thClass}>Mua ở</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.length === 0 ? (
                    <tr>
                      <td colSpan={8} className={`${tdClass} text-center text-lien-muted`}>
                        Không có dòng nào.
                      </td>
                    </tr>
                  ) : null}
                  {lines.map((l) => (
                    <LineRow key={l.itemId} line={l} back={self} sources={sources} />
                  ))}
                </tbody>
              </table>
            </ResizableTable>
          </form>
        )}
        {view !== "product"
          ? lines.map((l) => (
              // per-line forms live outside the bulk form (inputs reference them with form=…) — nested forms are not allowed
              <form key={l.itemId} id={`pl-${l.itemId}`} action={setPurchaseAction}>
                <input type="hidden" name="itemId" value={l.itemId} />
                <input type="hidden" name="back" value={self} />
              </form>
            ))
          : null}
      </Card>
    </>
  );
}

function LineRow({ line: l, back, sources }: { line: PurchaseLine; back: string; sources: PurchaseSource[] }) {
  const st = PURCHASE_STAGES[purchaseIndex(l.purchaseStatus)];
  const fid = `pl-${l.itemId}`;
  void back;
  return (
    <tr className="hover:bg-[#fafafa]">
      <td className={`${tdClass} w-8`}>
        <input type="checkbox" name="ids" value={l.itemId} className="h-4 w-4" aria-label={`Chọn ${l.name}`} />
      </td>
      <td className={`${tdClass} w-12`}>{l.thumb ? <Image src={l.thumb} alt="" width={36} height={36} unoptimized className="h-9 w-9 rounded border border-[#e5e7eb] object-cover" /> : null}</td>
      <td className={`${tdClass} min-w-[260px]`}>
        <Link href={`/admin/products/${l.productId}/`} className="font-semibold text-lien-heading hover:text-lien-blue">
          {l.name}
        </Link>
        <div className="text-[12px] text-lien-muted">
          #{l.productId}
          {l.sku ? ` · ${l.sku}` : ""}
          {l.costPrice !== null ? ` · vốn ${formatPrice(l.costPrice)}` : ""}
        </div>
      </td>
      <td className={`${tdClass} whitespace-nowrap`}>
        <Link href={`/admin/orders/${l.orderId}/`} className="font-semibold text-lien-blue hover:underline">
          #{l.orderNumber}
        </Link>
        <div className="text-[12px] text-lien-muted">
          {l.customerName} · {formatDateTime(l.orderCreatedAt)}
        </div>
      </td>
      <td className={`${tdClass} font-semibold`}>{l.quantity}</td>
      <td className={tdClass}>
        {/* the per-line form lives outside the bulk form (form= attribute) so both can post independently */}
        <div className="flex items-center gap-1">
          <select name="status" form={fid} defaultValue={l.purchaseStatus} className={cn(adminInput, "!w-auto !py-1 !text-[13px]")} aria-label="Trạng thái mua hàng">
            {PURCHASE_STAGES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          <button type="submit" form={fid} className={cn(btnSecondary, "!px-2 !py-1")} title="Lưu dòng này">
            <Fa name="check-circle" />
          </button>
        </div>
        <span className={cn("mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold", st.cls)}>{st.short}</span>
        {l.purchaseUpdatedAt ? <span className="ml-1 text-[11px] text-lien-muted">{formatDateTime(l.purchaseUpdatedAt)}</span> : null}
      </td>
      <td className={tdClass}>
        <input name="note" form={fid} defaultValue={l.purchaseNote} placeholder="mã đơn Amazon, tracking…" className={cn(adminInput, "!w-[180px] !py-1 !text-[13px]")} aria-label="Ghi chú mua hàng" />
      </td>
      <td className={`${tdClass} whitespace-nowrap`}>
        {/* where this line is bought: saved with the row's ✓ together with status / note */}
        <select name="sourceKey" form={fid} defaultValue={l.sourceKey} className={cn(adminInput, "!w-[150px] !py-1 !text-[13px]", !l.sourceKey && "text-lien-muted")} aria-label="Mua ở" title={l.sourceKey ? purchaseSourceName(l.sourceKey, sources) : "Chưa chọn nguồn"}>
          <option value="">— chọn nguồn —</option>
          {sources.map((s) => (
            <option key={s.key} value={s.key}>
              {s.name}
            </option>
          ))}
        </select>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
          {l.supplierUrl ? (
            <a href={l.supplierUrl} target="_blank" rel="noreferrer" className="text-lien-blue hover:underline">
              <Fa name="external-link" /> link mua
            </a>
          ) : null}
          {l.receiptCode ? (
            <Link href={`/admin/purchases/?tab=receipts#receipt-${l.receiptId}`} className="rounded bg-[#eef2ff] px-1.5 py-0.5 font-mono font-semibold text-[#3730a3] no-underline hover:underline" title="Phiếu mua hàng">
              {l.receiptCode}
            </Link>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

