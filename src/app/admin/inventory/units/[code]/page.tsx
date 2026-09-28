import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Card, Flash, PageHeader, adminInput, btnSecondary } from "@/components/sites/lienstore/admin/ui";
import { requireAdmin } from "@/lib/auth";
import { listPurchaseSources } from "@/lib/db";
import { formatAmount, formatDate, formatDateTime } from "@/lib/format";
import { PURCHASE_STAGES, purchaseIndex } from "@/lib/purchase";
import { purchaseSourceName } from "@/lib/purchase-sources";
import { getDb } from "@/lib/sqlite";
import { parseUnitCode, UNIT_ORIGIN_LABEL, UNIT_REMOVED_LABEL } from "@/lib/units";
import { getUnitByCode, listUnitEvents } from "@/lib/units-db";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ code: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const KIND: Record<string, string> = { created: "Tạo mã", moved: "Đổi trạng thái", held: "Giữ cho đơn", released: "Trả về tồn", packed: "Đóng vào chuyến", unpacked: "Rút khỏi chuyến", edited: "Sửa thông tin", removed: "Loại khỏi tồn kho", restored: "Khôi phục", committed: "Trừ tồn (đơn đã thanh toán)" };
const label = (s: string | null) => (s ? (PURCHASE_STAGES.find((x) => x.key === s)?.label ?? UNIT_REMOVED_LABEL[s as keyof typeof UNIT_REMOVED_LABEL] ?? s) : "");

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[130px_1fr] gap-2 border-b border-[#f0f0f0] py-1.5 text-[13px] last:border-0">
      <span className="text-lien-muted">{k}</span>
      <span className="min-w-0 text-lien-heading">{children}</span>
    </div>
  );
}

/**
 * One physical item by its code (H0001235): where it came from (bill, trip, source, price, expiry), where it is, who it
 * is for, and every change. Also the landing page of a scanned label (/admin/inventory/units/<code>) — kiểm hàng later.
 */
export default async function UnitPage({ params, searchParams }: Props) {
  await requireAdmin("inventory");
  const [{ code: raw }, sp] = await Promise.all([params, searchParams]);
  const code = parseUnitCode(decodeURIComponent(raw));
  if (!code) {
    const typed = decodeURIComponent(raw).trim().toUpperCase();
    if (typed !== decodeURIComponent(raw)) redirect(`/admin/inventory/units/${encodeURIComponent(typed)}/`);
    notFound();
  }
  if (code !== decodeURIComponent(raw)) redirect(`/admin/inventory/units/${code}/`);
  const db = getDb();
  const u = getUnitByCode(db, code);
  if (!u) notFound();
  const [sources] = await Promise.all([listPurchaseSources(true)]);
  const events = listUnitEvents(db, u.id);
  const st = PURCHASE_STAGES[purchaseIndex(u.status)];
  const bill = u.receiptId ? (db.prepare("SELECT code, bought_at, batch_id FROM purchase_receipts WHERE id = ?").get(u.receiptId) as { code: string; bought_at: string; batch_id: number | null } | undefined) : undefined;
  const siblings = u.receiptId ? (db.prepare("SELECT COUNT(*) AS n FROM stock_units WHERE receipt_id = ? AND product_id = ?").get(u.receiptId, u.productId) as { n: number }).n : 0;
  return (
    <>
      <PageHeader
        title={u.code}
        subtitle={`${u.productName} · ${u.removed ? UNIT_REMOVED_LABEL[u.removed] : st.label}`}
        back={{ href: `/admin/inventory/lots/${u.productId}/`, label: "Hàng của sản phẩm" }}
        actions={
          <form method="get" action="/admin/inventory/units/find/" className="flex items-center gap-2">
            <input name="code" placeholder="Tra mã khác: H…" className={cn(adminInput, "!mb-0 !w-[160px] !py-1 font-mono")} aria-label="Tra mã" />
            <button type="submit" className={cn(btnSecondary, "!py-1")}>
              Tra
            </button>
          </form>
        }
      />
      {typeof sp.error === "string" ? <Flash kind="error">{sp.error}</Flash> : null}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card title="Nguồn gốc & vị trí">
          <div className="mb-3 flex items-center gap-3">
            {u.productThumb ? <Image src={u.productThumb} alt="" width={56} height={56} unoptimized className="h-14 w-14 rounded border border-[#e5e7eb] object-contain" /> : null}
            <div className="min-w-0">
              <Link href={`/admin/inventory/lots/${u.productId}/`} className="text-[15px] font-bold text-lien-heading hover:text-lien-blue">
                {u.productName}
              </Link>
              <div className="text-[12px] text-lien-muted">
                #{u.productId}
                {u.productSku ? ` · ${u.productSku}` : ""}
                {u.groupCode ? ` · nhóm ${u.groupCode}` : ""}
              </div>
            </div>
            <span className={cn("ml-auto rounded-full px-2.5 py-1 text-[12px] font-semibold", u.removed ? "bg-gray-200 text-gray-700" : st.cls)}>{u.removed ? UNIT_REMOVED_LABEL[u.removed] : st.short}</span>
          </div>
          <Row k="Mã">
            <span className="font-mono text-[15px] font-bold">{u.code}</span>
          </Row>
          <Row k="Bill">
            {bill ? (
              <Link href={`/admin/purchases/?tab=batches&bills=${bill.batch_id ?? ""}#receipt-${u.receiptId}`} className="font-mono text-lien-blue hover:underline">
                {bill.code}
              </Link>
            ) : (
              <span className="text-lien-muted">chưa có bill</span>
            )}
            {siblings > 1 ? <span className="ml-2 text-[12px] text-lien-muted">({siblings} cái cùng sản phẩm trên bill này)</span> : null}
          </Row>
          <Row k="Đợt mua">
            {u.batchId ? (
              <Link href={`/admin/purchases/?tab=batches#batch-${u.batchId}`} className="font-mono text-lien-blue hover:underline">
                {u.batchCode}
              </Link>
            ) : (
              "—"
            )}
          </Row>
          <Row k="Mua ở">
            {purchaseSourceName(u.sourceKey, sources)}
            {u.store ? ` · ${u.store}` : ""}
          </Row>
          <Row k="Ngày mua">{u.boughtAt ? formatDate(u.boughtAt) : "—"}</Row>
          <Row k="Hạn dùng">{u.expiry ? formatDate(u.expiry) : "—"}</Row>
          <Row k="Giá mua">
            {u.unitCostJpy ? `¥${formatAmount(u.unitCostJpy)}` : "—"}
            {u.unitCostVnd ? ` · ≈ ${formatAmount(u.unitCostVnd)}đ` : ""}
          </Row>
          <Row k="Loại">{UNIT_ORIGIN_LABEL[u.origin]}</Row>
          <Row k="Đang ở">{u.removed ? UNIT_REMOVED_LABEL[u.removed] : st.label}</Row>
          <Row k="Chuyến đóng hàng">{u.shipmentCode ? <Link href={`/admin/inventory/shipments/${u.shipmentStatus === "packing" || u.shipmentStatus === "packed" ? "" : "?stage=transit"}#shipment-${u.shipmentId}`} className="font-mono text-lien-blue hover:underline">{u.shipmentCode}</Link> : "—"}</Row>
          <Row k="Cho đơn">
            {u.orderId ? (
              <Link href={`/admin/orders/${u.orderId}/`} className="text-lien-blue hover:underline">
                #{u.orderNumber} · {u.customerName}
                {u.committed ? " · đã thanh toán (đã trừ tồn)" : u.manual ? " · chọn tay" : " · giữ chỗ tự động"}
              </Link>
            ) : (
              <span className="text-green-700">tồn tự do</span>
            )}
          </Row>
          {u.note ? <Row k="Ghi chú">{u.note}</Row> : null}
        </Card>
        <Card title={`Lịch sử (${events.length})`}>
          <ol className="m-0 list-none space-y-2 p-0 text-[12px]">
            {events.map((e) => (
              <li key={e.id} className="border-l-2 border-[#e5e7eb] pl-2">
                <div className="font-semibold text-lien-heading">
                  {KIND[e.kind] ?? e.kind}
                  {e.from || e.to ? <span className="font-normal text-lien-muted"> · {e.from ? `${label(e.from)} → ` : ""}{label(e.to)}</span> : null}
                  {e.orderNumber ? <span className="font-normal text-[#3730a3]"> · đơn #{e.orderNumber}</span> : null}
                </div>
                <div className="text-lien-muted">
                  {formatDateTime(e.at)}
                  {e.actor ? ` · ${e.actor}` : ""}
                  {e.note ? ` · ${e.note}` : ""}
                </div>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </>
  );
}
