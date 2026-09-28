import Image from "next/image";
import Link from "next/link";
import type { AllocationView } from "@/lib/allocations-db";
import type { PurchaseLine } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { reallocateAllAction, reallocateOneAction } from "@/app/admin/inventory/orders-actions";
import { ConfirmSubmit } from "./ConfirmSubmit";
import { adminInput, btnPrimary, btnSecondary, Card, tableClass, tdClass, thClass } from "./ui";

interface Props {
  lines: PurchaseLine[];
  allocations: AllocationView[];
  /** Customer-facing progress per order id (ordered / paid / in_transit / vn_warehouse / delivering / delivered). */
  stageByOrder: Map<string, string>;
  filter: { q: string; only: "" | "short" | "ready" };
}

const TONE: Record<string, string> = { green: "bg-green-100 text-green-800", sky: "bg-sky-100 text-sky-800", amber: "bg-amber-100 text-amber-800", gray: "bg-gray-200 text-gray-700" };
const STAGE_LABEL: Record<string, string> = { ordered: "Đã đặt", paid: "Đã thanh toán", in_transit: "Đang về VN", vn_warehouse: "Tại kho VN", delivering: "Đang giao", delivered: "Đã nhận" };
const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d");

interface Group {
  orderId: string;
  number: number;
  customer: string;
  createdAt: string;
  paymentMethod: string;
  committed: boolean;
  stage: string;
  lines: PurchaseLine[];
  /** Every unit sits in a lot at Kho Việt Nam (shop). */
  readyVn: boolean;
}

/**
 * Tồn kho › Hàng theo đơn: one block per open order, each line with where its goods are right now (lot / place /
 * shipment) — the same badges as the order page, read-only, so the shop sees at a glance what can be handed over.
 */
export function OrdersStockPanel({ lines, allocations, stageByOrder, filter }: Props) {
  const byItem = new Map<number, AllocationView[]>();
  for (const a of allocations) byItem.set(a.orderItemId, [...(byItem.get(a.orderItemId) ?? []), a]);
  const groups = new Map<string, Group>();
  for (const l of lines) {
    const g = groups.get(l.orderId) ?? { orderId: l.orderId, number: l.orderNumber, customer: l.customerName, createdAt: l.orderCreatedAt, paymentMethod: l.paymentMethod, committed: !!l.stockCommittedAt, stage: stageByOrder.get(l.orderId) ?? "ordered", lines: [], readyVn: true };
    g.lines.push(l);
    const allocs = byItem.get(l.itemId) ?? [];
    // ready = every unit sits in a lot at Kho Việt Nam (shop), reserved ("Có sẵn · Kho VN") or already deducted ("Đã trừ kho · Kho Việt Nam (shop)")
    if (!allocs.length || allocs.some((a) => !(a.sourceType === "unit" && a.status === "at_shop"))) g.readyVn = false;
    groups.set(l.orderId, g);
  }
  const q = fold(filter.q.trim());
  const all = [...groups.values()].sort((a, b) => b.number - a.number);
  const shown = all.filter((g) => {
    if (filter.only === "short" && g.readyVn) return false;
    if (filter.only === "ready" && !g.readyVn) return false;
    if (q && !fold(`#${g.number} ${g.customer} ${g.lines.map((l) => `${l.name} ${l.sku ?? ""} #${l.productId}`).join(" ")}`).includes(q)) return false;
    return true;
  });
  const ready = all.filter((g) => g.readyVn).length;
  const chip = (v: "" | "short" | "ready", label: string) => (
    <Link key={v} href={`/admin/inventory/?${new URLSearchParams({ side: "orders", ...(filter.q ? { q: filter.q } : {}), ...(v ? { only: v } : {}) }).toString()}`} className={cn("rounded-full border px-2.5 py-0.5 text-[12px] font-semibold no-underline", filter.only === v ? "border-lien-blue bg-lien-blue text-white" : "border-[#d1d5db] bg-white text-lien-text hover:border-lien-blue")}>
      {label}
    </Link>
  );
  return (
    <div className="space-y-4" data-testid="orders-stock">
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-md border border-[#e5e7eb] bg-white px-3 py-2 text-lien-heading">
          <div className="text-[10px] font-semibold uppercase tracking-wide opacity-70">Đơn đang xử lý</div>
          <div className="font-oswald text-[16px] leading-5">{all.length}</div>
        </div>
        <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-green-900">
          <div className="text-[10px] font-semibold uppercase tracking-wide opacity-70">Đủ hàng tại kho VN (shop)</div>
          <div className="font-oswald text-[16px] leading-5">{ready}</div>
        </div>
        <div className={cn("rounded-md border px-3 py-2", all.length - ready ? "border-amber-200 bg-amber-50 text-amber-900" : "border-[#e5e7eb] bg-white text-lien-heading")}>
          <div className="text-[10px] font-semibold uppercase tracking-wide opacity-70">Còn chờ hàng về / cần mua</div>
          <div className="font-oswald text-[16px] leading-5">{all.length - ready}</div>
        </div>
      </div>
      <Card>
        <form method="get" className="mb-3 flex flex-wrap items-center gap-2 text-[13px]">
          <input type="hidden" name="side" value="orders" />
          {filter.only ? <input type="hidden" name="only" value={filter.only} /> : null}
          <input name="q" defaultValue={filter.q} placeholder="Tìm #đơn, tên khách, sản phẩm, SKU…" className={cn(adminInput, "!mb-0 !w-[280px] !py-1")} aria-label="Tìm đơn" />
          <button type="submit" className={cn(btnSecondary, "!py-1")}>
            Tìm
          </button>
          <span className="mx-1 text-lien-muted">|</span>
          {chip("", `Tất cả (${all.length})`)}
          {chip("short", `Còn chờ hàng (${all.length - ready})`)}
          {chip("ready", `Đủ hàng tại kho VN (${ready})`)}
        </form>
        <form action={reallocateAllAction} className="mb-3 flex flex-wrap items-center gap-2 text-[12px]" data-testid="reallocate-all">
          <ConfirmSubmit message="Ghép lại nguồn hàng cho mọi đơn đang chờ (chưa trừ tồn)? Phần giữ chỗ tự động được xếp lại: đơn cũ trước, hàng ở VN trước, rồi hạn dùng gần, rồi bill mua sớm. Phần đã trừ tồn và nguồn chọn tay giữ nguyên." confirmLabel="Ghép lại" className={cn(btnPrimary, "!py-1 !text-[13px]")}>
            Ghép lại tất cả đơn đang chờ
          </ConfirmSubmit>
          <span className="text-lien-muted">Đơn mới và hàng mới nhập đã tự ghép; nút này chỉ cần khi muốn xếp lại toàn bộ (vd. vừa có hàng về VN).</span>
        </form>
        {shown.length === 0 ? <p className="m-0 text-[13px] text-lien-muted">Không có đơn nào khớp.</p> : null}
        {shown.length ? (
          <div className="overflow-x-auto">
            <table className={tableClass}>
              <thead>
                <tr>
                  <th className={thClass}>Đơn</th>
                  <th className={thClass}>Khách · ngày</th>
                  <th className={thClass}>Thanh toán</th>
                  <th className={thClass}>Sản phẩm</th>
                  <th className={thClass}>SL</th>
                  <th className={thClass}>Hàng đang ở đâu</th>
                  <th className={thClass}>Tiến độ đơn</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((g) =>
                  g.lines.map((l, i) => {
                    const allocs = byItem.get(l.itemId) ?? [];
                    const first = i === 0;
                    const span = g.lines.length;
                    return (
                      <tr key={l.itemId} className={cn("align-top hover:bg-[#fafafa]", first && "border-t-2 border-[#e5e7eb]")} data-testid={first ? `stock-order-${g.number}` : undefined}>
                        {first ? (
                          <td className={`${tdClass} whitespace-nowrap align-top`} rowSpan={span}>
                            <Link href={`/admin/orders/${g.orderId}/`} className="font-semibold text-lien-heading hover:text-lien-blue">
                              #{g.number}
                            </Link>
                            {!g.committed ? (
                              <form action={reallocateOneAction} className="mt-1">
                                <input type="hidden" name="orderId" value={g.orderId} />
                                <button type="submit" className="text-[11px] text-lien-blue hover:underline" title="Xếp lại nguồn hàng cho đơn này theo quy tắc hiện tại">
                                  ghép lại
                                </button>
                              </form>
                            ) : null}
                          </td>
                        ) : null}
                        {first ? (
                          <td className={`${tdClass} align-top text-[12px]`} rowSpan={span}>
                            <span className="block font-semibold text-lien-heading">{g.customer}</span>
                            <span className="text-lien-muted">{formatDateTime(g.createdAt)}</span>
                          </td>
                        ) : null}
                        {first ? (
                          <td className={`${tdClass} align-top`} rowSpan={span}>
                            <span className={cn("inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold", g.committed ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800")}>{g.paymentMethod === "cod" ? "Thu khi giao" : g.committed ? "Đã thanh toán" : "Chưa thanh toán"}</span>
                          </td>
                        ) : null}
                        <td className={`${tdClass} min-w-[220px]`}>
                          <div className="flex items-center gap-2">
                            {l.thumb ? <Image src={l.thumb} alt="" width={32} height={32} unoptimized className="h-8 w-8 shrink-0 rounded border border-[#e5e7eb] object-cover" /> : null}
                            <span className="flex min-w-0 flex-col leading-4">
                              <Link href={`/admin/inventory/lots/${l.productId}/`} className="line-clamp-2 text-[13px] font-semibold text-lien-heading hover:text-lien-blue" title={l.name}>
                                {l.name}
                              </Link>
                              <span className="text-[11px] text-lien-muted">
                                #{l.productId}
                                {l.sku ? ` · ${l.sku}` : ""}
                              </span>
                            </span>
                          </div>
                        </td>
                        <td className={`${tdClass} font-semibold`}>{l.quantity}</td>
                        <td className={`${tdClass} text-[12px]`}>
                          {allocs.length === 0 ? <span className="text-lien-muted">— chưa có nguồn ({l.purchaseStatus})</span> : null}
                          <div className="space-y-1">
                            {allocs.map((a) => (
                              <div key={a.id} className="leading-4">
                                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", TONE[a.tone])}>{a.label}</span>
                                {l.quantity > 1 ? <span className="ml-1 font-semibold">×{a.qty}</span> : null}
                                {a.detail ? <span className="ml-1 text-lien-muted">{a.detail}</span> : null}
                                {a.consumedAt ? <span className="ml-1 text-[10px] text-green-700">đã trừ tồn</span> : null}
                                {a.codes.length ? (
                                  <Link href={`/admin/inventory/units/${a.codes[0]}/`} className="ml-1 font-mono text-[10px] text-lien-blue hover:underline" title={a.codes.join(" ")}>
                                    {a.codes.length > 1 ? `${a.codes[0]} +${a.codes.length - 1}` : a.codes[0]}
                                  </Link>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </td>
                        {first ? (
                          <td className={`${tdClass} align-top whitespace-nowrap`} rowSpan={span}>
                            <span className="inline-block rounded-full bg-[#eef2ff] px-2 py-0.5 text-[11px] font-semibold text-[#3730a3]">{STAGE_LABEL[g.stage] ?? g.stage}</span>
                            <span className={cn("mt-1 block w-fit rounded-full px-2 py-0.5 text-[11px] font-semibold", g.readyVn ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800")}>{g.readyVn ? "đủ hàng tại kho VN" : "còn chờ hàng"}</span>
                          </td>
                        ) : null}
                      </tr>
                    );
                  }),
                )}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
