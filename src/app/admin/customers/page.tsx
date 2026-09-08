import Link from "next/link";
import { adminInput, btnPrimary, Card, PageHeader, tableClass, tdClass, thClass } from "@/components/sites/lienstore/admin/ui";
import { requireAdmin } from "@/lib/auth";
import { getCustomerOverview } from "@/lib/db";
import { formatDateTime, formatPrice } from "@/lib/format";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function AdminCustomers({ searchParams }: Props) {
  await requireAdmin("customers");
  const sp = await searchParams;
  const q = first(sp.q).trim().toLowerCase();
  const kind = first(sp.kind);
  const all = await getCustomerOverview();
  const items = all
    .filter((c) => !q || `${c.name} ${c.email} ${c.phone}`.toLowerCase().includes(q))
    .filter((c) => !kind || (kind === "registered" ? c.registered : !c.registered));
  const registered = all.filter((c) => c.registered).length;
  const revenue = all.reduce((s, c) => s + c.totalSpent, 0);

  return (
    <>
      <PageHeader title="Khách hàng" subtitle={`${all.length} khách · ${registered} có tài khoản · ${all.length - registered} khách vãng lai · tổng chi tiêu ${formatPrice(revenue)}`} />
      <Card>
        <form method="get" className="mb-5 grid gap-3 md:grid-cols-[1fr_200px_auto]">
          <input name="q" defaultValue={first(sp.q)} placeholder="Tìm theo tên, email, điện thoại…" className={adminInput} />
          <select name="kind" defaultValue={kind} className={adminInput}>
            <option value="">Tất cả</option>
            <option value="registered">Có tài khoản</option>
            <option value="guest">Khách vãng lai</option>
          </select>
          <button type="submit" className={btnPrimary}>
            Lọc
          </button>
        </form>
        <div className="overflow-x-auto">
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>Khách hàng</th>
                <th className={thClass}>Liên hệ</th>
                <th className={thClass}>Loại</th>
                <th className={thClass}>Đơn hàng</th>
                <th className={thClass}>Tổng chi tiêu</th>
                <th className={thClass}>Đơn gần nhất</th>
                <th className={thClass} />
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={7} className={`${tdClass} text-center text-lien-muted`}>
                    Chưa có khách hàng nào.
                  </td>
                </tr>
              ) : null}
              {items.map((c) => (
                <tr key={c.key} className="hover:bg-[#fafafa]">
                  <td className={tdClass}>
                    <Link href={`/admin/customers/${encodeURIComponent(c.key)}/`} className="font-semibold text-lien-heading hover:text-lien-blue">
                      {c.name || c.email || c.phone || "Khách"}
                    </Link>
                    {c.address ? <div className="max-w-[260px] truncate text-[12px] text-lien-muted">{c.address}</div> : null}
                  </td>
                  <td className={`${tdClass} text-[13px]`}>
                    {c.phone ? <div>{c.phone}</div> : null}
                    {c.email ? <div className="text-lien-muted">{c.email}</div> : null}
                  </td>
                  <td className={tdClass}>
                    {c.registered ? (
                      <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-[12px] font-semibold text-green-800">Tài khoản</span>
                    ) : (
                      <span className="rounded-full bg-gray-200 px-2.5 py-0.5 text-[12px] font-semibold text-gray-700">Vãng lai</span>
                    )}
                  </td>
                  <td className={tdClass}>{c.ordersCount}</td>
                  <td className={`${tdClass} whitespace-nowrap`}>{formatPrice(c.totalSpent)}</td>
                  <td className={`${tdClass} whitespace-nowrap text-[13px] text-lien-muted`}>{c.lastOrderAt ? formatDateTime(c.lastOrderAt) : "—"}</td>
                  <td className={`${tdClass} text-right`}>
                    <Link href={`/admin/customers/${encodeURIComponent(c.key)}/`} className="text-lien-blue hover:underline">
                      Chi tiết
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
