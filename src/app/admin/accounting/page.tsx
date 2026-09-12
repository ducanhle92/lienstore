import Link from "next/link";
import { Card, PageHeader, StatusBadge, tableClass, tdClass, thClass, adminInput, adminLabel, btnPrimary, btnSecondary } from "@/components/sites/lienstore/admin/ui";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { dayKey, getAccounting } from "@/lib/accounting";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime, formatPrice } from "@/lib/format";
import { getInventory } from "@/lib/inventory";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

function Kpi({ label, value, hint, tone = "gray" }: { label: string; value: string; hint?: string; tone?: "green" | "red" | "blue" | "gray" | "amber" }) {
  const cls = { green: "border-green-200 bg-green-50 text-green-800", red: "border-red-200 bg-red-50 text-red-800", blue: "border-sky-200 bg-sky-50 text-sky-800", gray: "border-[#e5e7eb] bg-white text-lien-heading", amber: "border-amber-200 bg-amber-50 text-amber-800" }[tone];
  return (
    <div className={cn("rounded-lg border p-4", cls)}>
      <p className="m-0 text-[12px] font-semibold uppercase tracking-wide opacity-80">{label}</p>
      <p className="m-0 mt-1 text-[22px] font-bold leading-7">{value}</p>
      {hint ? <p className="m-0 mt-1 text-[12px] leading-4 opacity-80">{hint}</p> : null}
    </div>
  );
}

/** Kế toán: lãi/lỗ theo đơn và theo tháng + vốn tồn kho (moved off the products page). */
export default async function AdminAccounting({ searchParams }: Props) {
  await requireAdmin("accounting");
  const sp = await searchParams;
  const today = dayKey(new Date().toISOString());
  const defaultFrom = `${today.slice(0, 7)}-01`;
  const from = isDay(first(sp.from)) ? first(sp.from) : defaultFrom;
  const to = isDay(first(sp.to)) ? first(sp.to) : today;
  const [{ rows, totals, byMonth }, inv] = await Promise.all([getAccounting(from, to), getInventory()]);
  const money = (n: number) => formatPrice(n);
  const signed = (n: number) => (
    <span className={n >= 0 ? "text-green-700" : "text-red-600"}>
      {n < 0 ? "−" : ""}
      {formatPrice(Math.abs(n))}
    </span>
  );
  const marginPct = totals.revenue > 0 ? Math.round((totals.profit / totals.revenue) * 1000) / 10 : 0;
  const csvHref = `/admin/accounting/export/?from=${from}&to=${to}`;
  const preset = (label: string, f: string, t: string) => (
    <Link href={`/admin/accounting/?from=${f}&to=${t}`} className={cn("rounded-md border px-2.5 py-1 text-[12px] no-underline", f === from && t === to ? "border-lien-blue bg-lien-blue text-white" : "border-[#d1d5db] bg-white text-lien-text hover:bg-[#f3f4f6]")}>
      {label}
    </Link>
  );
  const d = new Date(`${today}T00:00:00`);
  const monthAgo = new Date(d);
  monthAgo.setMonth(d.getMonth() - 1);
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const lastMonth = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  const lastMonthEnd = new Date(d.getFullYear(), d.getMonth(), 0);
  const fmt = (x: Date) => x.toLocaleDateString("en-CA");

  return (
    <>
      <PageHeader
        title="Kế toán — lãi / lỗ"
        subtitle="Lợi nhuận = doanh thu (hàng − giảm giá) + phí ship khách trả − giá vốn hàng bán − phí 3 chặng nhập hàng ghi trên đơn − phí giao nội địa trả hãng. Đơn đã huỷ không tính; giá vốn lấy theo giá vốn hiện tại của sản phẩm."
        actions={
          <Link href={csvHref} className={btnSecondary}>
            <Fa name="download" /> Xuất CSV
          </Link>
        }
      />

      <Card className="mb-6">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div>
            <label className={adminLabel} htmlFor="from">
              Từ ngày
            </label>
            <input id="from" type="date" name="from" defaultValue={from} className={cn(adminInput, "!mb-0 !w-[170px]")} />
          </div>
          <div>
            <label className={adminLabel} htmlFor="to">
              Đến ngày
            </label>
            <input id="to" type="date" name="to" defaultValue={to} className={cn(adminInput, "!mb-0 !w-[170px]")} />
          </div>
          <button type="submit" className={btnPrimary}>
            <Fa name="search" /> Xem
          </button>
          <div className="flex flex-wrap gap-1.5 md:ml-4">
            {preset("Tháng này", defaultFrom, today)}
            {preset("Tháng trước", fmt(lastMonth), fmt(lastMonthEnd))}
            {preset("30 ngày", fmt(monthAgo), today)}
            {preset("Từ đầu năm", yearStart, today)}
            {preset("Tất cả", "2020-01-01", today)}
          </div>
        </form>
      </Card>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="acc-kpis">
        <Kpi label="Doanh thu" value={money(totals.revenue)} hint={`${totals.orders} đơn · ${totals.paidOrders} đã thanh toán · phí ship khách trả ${money(totals.shipCollected)}`} tone="blue" />
        <Kpi label="Giá vốn hàng bán" value={money(totals.cogs)} hint={totals.missingCost ? `${totals.missingCost} dòng chưa có giá vốn` : "Theo giá vốn hiện tại của sản phẩm"} tone="gray" />
        <Kpi label="Chi phí vận chuyển" value={money(totals.importFees + totals.vnCarrierFee)} hint={`Nhập hàng 3 chặng ${money(totals.importFees)} · giao nội địa trả hãng ${money(totals.vnCarrierFee)}`} tone="amber" />
        <Kpi label="Lợi nhuận" value={`${totals.profit < 0 ? "−" : ""}${money(Math.abs(totals.profit))}`} hint={`${marginPct}% doanh thu`} tone={totals.profit >= 0 ? "green" : "red"} />
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-[1fr_380px]">
        <Card title="Theo tháng">
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>Tháng</th>
                <th className={`${thClass} text-right`}>Đơn</th>
                <th className={`${thClass} text-right`}>Doanh thu</th>
                <th className={`${thClass} text-right`}>Giá vốn</th>
                <th className={`${thClass} text-right`}>Vận chuyển</th>
                <th className={`${thClass} text-right`}>Lợi nhuận</th>
              </tr>
            </thead>
            <tbody>
              {byMonth.map((m) => (
                <tr key={m.month}>
                  <td className={tdClass}>{m.month}</td>
                  <td className={`${tdClass} text-right`}>{m.orders}</td>
                  <td className={`${tdClass} text-right`}>{money(m.revenue + m.shipCollected)}</td>
                  <td className={`${tdClass} text-right`}>{money(m.cogs)}</td>
                  <td className={`${tdClass} text-right`}>{money(m.importFees + m.vnCarrierFee)}</td>
                  <td className={`${tdClass} text-right font-semibold`}>{signed(m.profit)}</td>
                </tr>
              ))}
              {byMonth.length === 0 ? (
                <tr>
                  <td colSpan={6} className={`${tdClass} text-center text-lien-muted`}>
                    Không có đơn trong khoảng đã chọn.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </Card>
        <Card title="Vốn tồn kho (hiện tại)">
          <dl className="m-0 grid grid-cols-[1fr_auto] gap-y-2 text-[13px] leading-6">
            <dt className="text-lien-muted">Tồn kho tự do</dt>
            <dd className="m-0 text-right font-semibold" data-testid="acc-stock-units">{inv.summary.units} đv</dd>
            <dt className="text-lien-muted">Đã mua, đang trên đường về</dt>
            <dd className="m-0 text-right font-semibold">{inv.summary.inTransitUnits} đv · {money(inv.summary.inTransitValue)}</dd>
            <dt className="text-lien-muted">Đã mua, sẵn tại kho (chờ giao)</dt>
            <dd className="m-0 text-right font-semibold">{inv.summary.atShopUnits} đv</dd>
            <dt className="text-lien-muted">Vốn tồn kho (tồn + đang về) × giá vốn</dt>
            <dd className="m-0 text-right font-semibold">{money(inv.summary.stockValue)}</dd>
            <dt className="text-lien-muted">Lợi nhuận kỳ vọng của tồn kho</dt>
            <dd className="m-0 text-right font-semibold text-green-700">{money(inv.summary.stockProfit)}</dd>
            <dt className="text-lien-muted">Cần đặt thêm</dt>
            <dd className="m-0 text-right">{inv.summary.toBuyUnits} đv · {money(inv.summary.toBuyCost)}</dd>
          </dl>
          <p className="m-0 mt-3 text-[12px] leading-5 text-lien-muted">
            Chi tiết từng sản phẩm ở{" "}
            <Link href="/admin/inventory/" className="text-lien-blue hover:underline">
              Tồn kho
            </Link>{" "}
            và{" "}
            <Link href="/admin/purchases/" className="text-lien-blue hover:underline">
              Quản lý mua hàng
            </Link>
            .
          </p>
        </Card>
      </div>

      <Card title={`Theo đơn (${rows.length})`}>
        <div className="overflow-x-auto">
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>Đơn</th>
                <th className={thClass}>Ngày</th>
                <th className={thClass}>Khách</th>
                <th className={thClass}>Trạng thái</th>
                <th className={`${thClass} text-right`}>Doanh thu</th>
                <th className={`${thClass} text-right`}>Ship khách trả</th>
                <th className={`${thClass} text-right`}>Giá vốn</th>
                <th className={`${thClass} text-right`}>Nhập 3 chặng</th>
                <th className={`${thClass} text-right`}>Giao VN trả hãng</th>
                <th className={`${thClass} text-right`}>Lãi / lỗ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} data-testid={`acc-row-${r.number}`}>
                  <td className={`${tdClass} whitespace-nowrap`}>
                    <Link href={`/admin/orders/${r.id}/`} className="font-semibold text-lien-blue hover:underline">
                      #{r.number}
                    </Link>
                    <span className="block text-[11px] text-lien-muted">{r.items} sp</span>
                  </td>
                  <td className={`${tdClass} whitespace-nowrap text-[12px]`}>{formatDateTime(r.createdAt)}</td>
                  <td className={tdClass}>{r.customer || "—"}</td>
                  <td className={tdClass}>
                    <StatusBadge status={r.status} />
                    {r.paid ? <span className="ml-1 text-[11px] text-green-700">đã TT</span> : <span className="ml-1 text-[11px] text-amber-700">chờ TT</span>}
                  </td>
                  <td className={`${tdClass} text-right whitespace-nowrap`}>{money(r.revenue)}</td>
                  <td className={`${tdClass} text-right whitespace-nowrap`}>{r.shipOnDelivery ? <span className="text-lien-muted">trả shipper</span> : money(r.shipCollected)}</td>
                  <td className={`${tdClass} text-right whitespace-nowrap`}>
                    {money(r.cogs)}
                    {r.missingCost ? <span className="block text-[11px] text-amber-700">{r.missingCost} dòng thiếu giá vốn</span> : null}
                  </td>
                  <td className={`${tdClass} text-right whitespace-nowrap`}>{money(r.importFees)}</td>
                  <td className={`${tdClass} text-right whitespace-nowrap`}>{money(r.vnCarrierFee)}</td>
                  <td className={`${tdClass} text-right whitespace-nowrap font-semibold`}>{signed(r.profit)}</td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className={`${tdClass} text-center text-lien-muted`}>
                    Không có đơn trong khoảng đã chọn.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
