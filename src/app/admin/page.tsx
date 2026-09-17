import Link from "next/link";
import { StatTile } from "@/components/sites/lienstore/admin/StatTile";
import { Card, Flash, PageHeader, StatusBadge, tableClass, tdClass, thClass } from "@/components/sites/lienstore/admin/ui";
import { accountingRowsFor } from "@/lib/accounting";
import { requireAdmin } from "@/lib/auth";
import { ADMIN_MODULES } from "@/lib/permissions";
import { getOrders, getStats } from "@/lib/db";
import { formatCompactVnd, formatDateTime, formatPrice } from "@/lib/format";

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
  const canU = session.permissions.includes("users");
  const canAcc = session.permissions.includes("accounting");
  // Lãi/lỗ: same formula as Kế toán › Lãi/lỗ, over every non-cancelled order
  const live = orders.filter((o) => o.status !== "cancelled");
  const pnl = canAcc ? await accountingRowsFor(live) : null;
  const profit = pnl ? [...pnl.values()].reduce((s, r) => s + r.profit, 0) : 0;
  const missingCost = pnl ? [...pnl.values()].filter((r) => r.missingCost > 0).length : 0;
  const n = (v: number) => v.toLocaleString("vi-VN");
  const linkIf = (ok: boolean, href: string) => (ok ? href : undefined);

  return (
    <>
      <PageHeader title="Tổng quan" subtitle={`Tình hình cửa hàng hôm nay · đăng nhập: ${session.label}`} />
      {denied ? <Flash kind="error">Tài khoản của bạn không có quyền vào module “{denied}”. Liên hệ quản trị viên để được cấp quyền.</Flash> : null}
      <section className="mb-5" aria-labelledby="kpi-sales">
        <h2 id="kpi-sales" className="mb-2 text-[12px] font-bold uppercase tracking-wide text-lien-muted">
          Bán hàng <span className="font-normal normal-case tracking-normal">· toàn thời gian, trừ đơn đã hủy</span>
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5" data-testid="kpi-sales">
          <StatTile
            label="Doanh thu"
            value={formatCompactVnd(stats.revenue)}
            sub={`${formatPrice(stats.revenue)} · hôm nay ${formatCompactVnd(stats.revenueToday)}`}
            tone="blue"
            href={linkIf(canO, "/admin/orders/")}
            testId="kpi-revenue"
            info={<>Tổng cột <strong>Tổng</strong> của mọi đơn chưa hủy: tiền hàng khách trả + phí ship khách trả − voucher. Chưa trừ giá vốn hay phí nhập hàng (xem Lãi/lỗ). Tính từ ngày mở shop; “hôm nay” theo giờ máy chủ.</>}
          />
          <StatTile
            label="Lãi / lỗ"
            value={pnl ? formatCompactVnd(profit) : "—"}
            sub={pnl ? (missingCost ? `${n(missingCost)} đơn thiếu giá vốn` : `trên ${n(stats.orders)} đơn`) : "cần quyền Kế toán"}
            tone={pnl ? (profit >= 0 ? "green" : "red") : "gray"}
            href={linkIf(canAcc, "/admin/accounting/")}
            testId="kpi-profit"
            info={<>Cùng công thức Kế toán › Lãi/lỗ: doanh thu + ship khách trả − giá vốn tại Nhật − phí 3 chặng nhập hàng − phí giao nội địa shop trả, cộng cho mọi đơn chưa hủy. Đơn có sản phẩm chưa nhập giá vốn được đếm là “thiếu giá vốn” và làm số này cao hơn thực tế.</>}
          />
          <StatTile
            label="Đơn hàng"
            value={n(stats.orders)}
            sub={`hôm nay ${n(stats.ordersToday)} · đã hủy ${n(stats.cancelled)} · hoàn thành ${n(stats.completed)}`}
            href={linkIf(canO, "/admin/orders/")}
            testId="kpi-orders"
            info={<>Số đơn đã đặt chưa hủy (mọi trạng thái: đã đặt, đang xử lý, hoàn thành). Đơn đã hủy đếm riêng và không tính vào doanh thu.</>}
          />
          <StatTile
            label="Chờ xử lý"
            value={n(stats.pending)}
            sub={`đang xử lý ${n(stats.processing)}`}
            tone={stats.pending ? "amber" : "gray"}
            href={linkIf(canO, "/admin/orders/?status=pending")}
            testId="kpi-pending"
            info={<>Đơn ở trạng thái <strong>Chờ xử lý</strong>: khách đã đặt, shop chưa xác nhận / chưa mua hàng tại Nhật. Việc cần làm ngay là ở đây. “Đang xử lý” = đã xác nhận, đang mua hoặc vận chuyển.</>}
          />
          <StatTile
            label="Khách hàng"
            value={n(stats.customers)}
            sub={`${n(stats.buyers)} đã mua ít nhất 1 đơn`}
            href={linkIf(canU, "/admin/users/")}
            testId="kpi-customers"
            info={<>Tài khoản khách đã đăng ký trên web (không tính tài khoản chủ shop / quản trị). “Đã mua” = có ít nhất một đơn chưa hủy gắn với tài khoản; khách mua không đăng nhập không được đếm.</>}
          />
        </div>
      </section>
      <section className="mb-6" aria-labelledby="kpi-catalog">
        <h2 id="kpi-catalog" className="mb-2 text-[12px] font-bold uppercase tracking-wide text-lien-muted">Sản phẩm</h2>
        <div className="grid grid-cols-3 gap-3 md:max-w-[640px]" data-testid="kpi-catalog">
          <StatTile label="Tổng sản phẩm" value={n(stats.products)} sub={`${n(stats.drafts)} bản nháp`} href={linkIf(canP, "/admin/products/")} testId="kpi-products" info={<>Mọi sản phẩm trong kho hàng, gồm cả bản nháp chưa hiện trên web.</>} />
          <StatTile label="Đang bán" value={n(stats.published)} sub="hiện trên web" tone="green" href={linkIf(canP, "/admin/products/?status=publish")} testId="kpi-published" info={<>Sản phẩm ở trạng thái “Đang bán”: khách thấy và đặt được (kể cả khi đang hết hàng — khi đó thẻ báo hết hàng).</>} />
          <StatTile label="Hết hàng" value={n(stats.outOfStock)} sub="cần nhập thêm" tone={stats.outOfStock ? "red" : "gray"} href={linkIf(canP, "/admin/products/?stock=out")} testId="kpi-oos" info={<>Sản phẩm có tình trạng kho “Hết hàng” (tồn bằng 0 với sản phẩm lưu kho, hoặc được đánh dấu hết hàng). Không phải “ngừng bán”: sản phẩm vẫn hiện trên web với nhãn hết hàng.</>} />
        </div>
      </section>
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
