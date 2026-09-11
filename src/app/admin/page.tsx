import Link from "next/link";
import { Card, Flash, PageHeader, StatusBadge, tableClass, tdClass, thClass } from "@/components/sites/lienstore/admin/ui";
import { requireAdmin } from "@/lib/auth";
import { ADMIN_MODULES } from "@/lib/permissions";
import { getOrders, getStats } from "@/lib/db";
import { formatDateTime, formatPrice } from "@/lib/format";

export const dynamic = "force-dynamic";

interface DashboardProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminDashboard({ searchParams }: DashboardProps) {
  const session = await requireAdmin();
  const sp = await searchParams;
  const deniedKey = Array.isArray(sp.denied) ? sp.denied[0] : sp.denied;
  const denied = deniedKey ? ADMIN_MODULES.find((m) => m.key === deniedKey)?.label ?? deniedKey : null;
  const [stats, orders] = await Promise.all([getStats(), getOrders()]);
  const recent = orders.slice(0, 8);

  const canP = session.permissions.includes("products");
  const canO = session.permissions.includes("orders");
  const tiles = [
    { label: "Sản phẩm", value: stats.products, href: canP ? "/admin/products/" : "/admin/" },
    { label: "Đang bán", value: stats.published, href: canP ? "/admin/products/?status=publish" : "/admin/" },
    { label: "Ngừng bán (hết hàng)", value: stats.outOfStock, href: canP ? "/admin/products/?stock=out" : "/admin/" },
    { label: "Đơn hàng", value: stats.orders, href: canO ? "/admin/orders/" : "/admin/" },
    { label: "Chờ xử lý", value: stats.pending, href: canO ? "/admin/orders/?status=pending" : "/admin/" },
    { label: "Doanh thu", value: formatPrice(stats.revenue), href: canO ? "/admin/orders/" : "/admin/" },
    { label: "Khách hàng", value: stats.customers, href: session.permissions.includes("users") ? "/admin/users/" : "/admin/" },
  ];

  return (
    <>
      <PageHeader title="Tổng quan" subtitle={`Tình hình cửa hàng hôm nay · đăng nhập: ${session.label}`} />
      {denied ? <Flash kind="error">Tài khoản của bạn không có quyền vào module “{denied}”. Liên hệ quản trị viên để được cấp quyền.</Flash> : null}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-7">
        {tiles.map((t) => (
          <Link key={t.label} href={t.href} className="rounded-lg border border-[#e5e7eb] bg-white p-4 no-underline shadow-sm hover:border-lien-blue">
            <div className="text-[12px] font-semibold uppercase tracking-wide text-[#6b7280]">{t.label}</div>
            <div className="mt-1 font-oswald text-[26px] leading-8 text-lien-heading">{t.value}</div>
          </Link>
        ))}
      </div>
      {session.permissions.includes("products") ? (
        <p className="mb-6 text-[13px] text-lien-muted">
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- API download, not a page */}
          <a href="/api/admin/export" className="text-lien-blue hover:underline">
            Tải toàn bộ catalogue (seed.json)
          </a>{" "}
          — sản phẩm, danh mục, trang, bài viết; dùng để đồng bộ về máy dev (`npm run sync:prod`).
        </p>
      ) : null}
      <Card
        title="Đơn hàng gần đây"
        actions={
          <Link href="/admin/orders/" className="text-[14px] text-lien-blue hover:underline">
            Xem tất cả →
          </Link>
        }
      >
        {recent.length === 0 ? (
          <p className="text-[14px] text-lien-muted">Chưa có đơn hàng nào.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className={tableClass}>
              <thead>
                <tr>
                  <th className={thClass}>Mã</th>
                  <th className={thClass}>Ngày</th>
                  <th className={thClass}>Khách hàng</th>
                  <th className={thClass}>Tổng</th>
                  <th className={thClass}>Trạng thái</th>
                  <th className={thClass} />
                </tr>
              </thead>
              <tbody>
                {recent.map((o) => (
                  <tr key={o.id} className="hover:bg-[#fafafa]">
                    <td className={`${tdClass} font-semibold`}>#{o.number}</td>
                    <td className={tdClass}>{formatDateTime(o.createdAt)}</td>
                    <td className={tdClass}>
                      {o.customer.lastName} {o.customer.firstName}
                      <div className="text-[12px] text-lien-muted">{o.customer.phone}</div>
                    </td>
                    <td className={tdClass}>{formatPrice(o.total, o.currency)}</td>
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
