import Link from "next/link";
import { ADMIN_STATUS_LABELS, ADMIN_STATUSES, Card, PageHeader, StatusBadge, tableClass, tdClass, thClass } from "@/components/sites/lienstore/admin/ui";
import { requireAdmin } from "@/lib/auth";
import { getOrders, getUnreadMessageCounts } from "@/lib/db";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { SHIP_STAGES } from "@/lib/shipping";
import { formatDateTime, formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { OrderStatus } from "@/types/shop";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const PAYMENT: Record<string, string> = { bacs: "Chuyển khoản", cod: "COD" };

export default async function AdminOrders({ searchParams }: Props) {
  await requireAdmin("orders");
  const sp = await searchParams;
  const raw = Array.isArray(sp.status) ? sp.status[0] : sp.status;
  const status = ADMIN_STATUSES.includes(raw as OrderStatus) ? (raw as OrderStatus) : undefined;
  const [all, unread] = await Promise.all([getOrders(), getUnreadMessageCounts("admin")]);
  const stageLabel = (k: string) => SHIP_STAGES.find((s) => s.key === k)?.short ?? k;
  const items = status ? all.filter((o) => o.status === status) : all;
  const counts = Object.fromEntries(ADMIN_STATUSES.map((s) => [s, all.filter((o) => o.status === s).length])) as Record<OrderStatus, number>;

  const tab = (href: string, label: string, active: boolean) => (
    <Link
      key={href}
      href={href}
      className={cn(
        "rounded-md px-3 py-1.5 text-[14px] leading-5 no-underline",
        active ? "bg-lien-blue text-white" : "bg-white text-lien-text hover:bg-[#f3f4f6] border border-[#e5e7eb]",
      )}
    >
      {label}
    </Link>
  );

  return (
    <>
      <PageHeader title="Đơn hàng" subtitle={`${items.length} đơn`} />
      <div className="mb-5 flex flex-wrap gap-2">
        {tab("/admin/orders/", `Tất cả (${all.length})`, !status)}
        {ADMIN_STATUSES.map((s) => tab(`/admin/orders/?status=${s}`, `${ADMIN_STATUS_LABELS[s]} (${counts[s]})`, status === s))}
      </div>
      <Card>
        {items.length === 0 ? (
          <p className="text-[14px] text-lien-muted">Chưa có đơn hàng nào.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className={tableClass}>
              <thead>
                <tr>
                  <th className={thClass}>Mã</th>
                  <th className={thClass}>Ngày</th>
                  <th className={thClass}>Khách hàng</th>
                  <th className={thClass}>Sản phẩm</th>
                  <th className={thClass}>Thanh toán</th>
                  <th className={thClass}>Tổng</th>
                  <th className={thClass}>Trạng thái</th>
                  <th className={thClass} />
                </tr>
              </thead>
              <tbody>
                {items.map((o) => (
                  <tr key={o.id} className="hover:bg-[#fafafa]">
                    <td className={`${tdClass} font-semibold`}>
                      #{o.number}
                      {unread.get(o.id) ? (
                        <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-lien-heart px-1.5 py-0.5 text-[11px] font-bold text-white" title="Tin nhắn mới từ khách">
                          <Fa name="comments-o" /> {unread.get(o.id)}
                        </span>
                      ) : null}
                    </td>
                    <td className={`${tdClass} whitespace-nowrap`}>{formatDateTime(o.createdAt)}</td>
                    <td className={tdClass}>
                      {o.customer.lastName} {o.customer.firstName}
                      <div className="text-[12px] text-lien-muted">{o.customer.phone}</div>
                    </td>
                    <td className={tdClass}>{o.items.reduce((n, it) => n + it.quantity, 0)}</td>
                    <td className={tdClass}>
                      {PAYMENT[o.paymentMethod]}
                      <span className="block text-[11px] text-lien-muted">{stageLabel(o.shipStage)}</span>
                    </td>
                    <td className={`${tdClass} whitespace-nowrap`}>{formatPrice(o.total, o.currency)}</td>
                    <td className={tdClass}>
                      <StatusBadge status={o.status} />
                    </td>
                    <td className={`${tdClass} text-right`}>
                      <Link href={`/admin/orders/${o.id}/`} className="text-lien-blue hover:underline">
                        Chi tiết
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
