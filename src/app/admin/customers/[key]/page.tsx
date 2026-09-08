import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ADMIN_STATUS_LABELS, Card, PageHeader, StatusBadge, tableClass, tdClass, thClass } from "@/components/sites/lienstore/admin/ui";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { requireAdmin } from "@/lib/auth";
import { countOrderFiles, getCustomerOverview, getOrdersForCustomerKey } from "@/lib/db";
import { formatDateTime, formatPrice } from "@/lib/format";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ key: string }>;
}

/** One customer (registered or guest): profile, every order with its items, and which orders already have a receipt. */
export default async function AdminCustomerDetail({ params }: Props) {
  await requireAdmin("customers");
  const { key: raw } = await params;
  const key = decodeURIComponent(raw);
  const [overview, orders, fileCounts] = await Promise.all([getCustomerOverview(), getOrdersForCustomerKey(key), countOrderFiles()]);
  const c = overview.find((x) => x.key === key);
  if (!c) notFound();

  const spent = orders.filter((o) => o.status !== "cancelled").reduce((s, o) => s + o.total, 0);
  const itemsBought = new Map<string, { name: string; slug: string; image: string; qty: number; total: number }>();
  for (const o of orders) {
    if (o.status === "cancelled") continue;
    for (const it of o.items) {
      const cur = itemsBought.get(it.slug) ?? { name: it.name, slug: it.slug, image: it.image, qty: 0, total: 0 };
      cur.qty += it.quantity;
      cur.total += it.price * it.quantity;
      itemsBought.set(it.slug, cur);
    }
  }

  return (
    <>
      <PageHeader
        title={c.name || c.email || c.phone || "Khách hàng"}
        subtitle={`${orders.length} đơn · đã chi ${formatPrice(spent)}${c.registered ? " · có tài khoản" : " · khách vãng lai"}`}
        back={{ href: "/admin/customers/", label: "Khách hàng" }}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Đơn hàng">
            {orders.length === 0 ? <p className="text-lien-muted">Chưa có đơn hàng.</p> : null}
            <div className="space-y-4">
              {orders.map((o) => (
                <div key={o.id} className="rounded-md border border-[#e5e7eb]">
                  <div className="flex flex-wrap items-center gap-3 border-b border-[#f0f0f0] bg-[#f9fafb] px-4 py-2">
                    <Link href={`/admin/orders/${o.id}/`} className="font-semibold text-lien-heading hover:text-lien-blue">
                      #{o.number}
                    </Link>
                    <span className="text-[13px] text-lien-muted">{formatDateTime(o.createdAt)}</span>
                    <StatusBadge status={o.status} />
                    <span className="ml-auto font-semibold">{formatPrice(o.total, o.currency)}</span>
                    {fileCounts.get(o.id) ? (
                      <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-[12px] font-semibold text-green-800">
                        <Fa name="paperclip" /> {fileCounts.get(o.id)} bill
                      </span>
                    ) : (
                      <Link href={`/admin/orders/${o.id}/#bill`} className="rounded-full border border-lien-blue px-2.5 py-0.5 text-[12px] font-semibold text-lien-blue no-underline hover:bg-lien-blue hover:text-white">
                        <Fa name="upload" /> Gửi bill Nhật
                      </Link>
                    )}
                  </div>
                  <table className={tableClass}>
                    <tbody>
                      {o.items.map((it) => (
                        <tr key={`${o.id}-${it.productId}`}>
                          <td className={`${tdClass} w-12`}>
                            {it.image ? <Image src={it.image} alt="" width={32} height={32} className="h-8 w-8 rounded border border-[#e5e7eb] object-cover" unoptimized /> : null}
                          </td>
                          <td className={tdClass}>
                            <Link href={`/product/${it.slug}/`} target="_blank" className="text-lien-text hover:text-lien-blue">
                              {it.name}
                            </Link>
                          </td>
                          <td className={`${tdClass} whitespace-nowrap`}>× {it.quantity}</td>
                          <td className={`${tdClass} whitespace-nowrap text-right`}>{formatPrice(it.price * it.quantity, o.currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {o.adminNote ? <p className="m-0 border-t border-[#f0f0f0] px-4 py-2 text-[13px] text-lien-muted">Ghi chú nội bộ: {o.adminNote}</p> : null}
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Thông tin">
            <dl className="grid gap-2 text-[14px] leading-5">
              <div>
                <dt className="text-[12px] font-semibold uppercase text-[#6b7280]">Điện thoại</dt>
                <dd>{c.phone || "—"}</dd>
              </div>
              <div>
                <dt className="text-[12px] font-semibold uppercase text-[#6b7280]">Email</dt>
                <dd>{c.email || "—"}</dd>
              </div>
              <div>
                <dt className="text-[12px] font-semibold uppercase text-[#6b7280]">Địa chỉ</dt>
                <dd>{c.address || "—"}</dd>
              </div>
              <div>
                <dt className="text-[12px] font-semibold uppercase text-[#6b7280]">Loại</dt>
                <dd>{c.registered ? `Tài khoản (tạo ${c.createdAt ? formatDateTime(c.createdAt) : ""})` : "Khách vãng lai (gộp theo email/điện thoại)"}</dd>
              </div>
            </dl>
          </Card>
          <Card title="Đã mua">
            {itemsBought.size === 0 ? <p className="m-0 text-lien-muted">—</p> : null}
            <table className={tableClass}>
              <thead>
                <tr>
                  <th className={thClass}>Sản phẩm</th>
                  <th className={thClass}>SL</th>
                  <th className={`${thClass} text-right`}>Tiền</th>
                </tr>
              </thead>
              <tbody>
                {[...itemsBought.values()]
                  .sort((a, b) => b.qty - a.qty)
                  .map((it) => (
                    <tr key={it.slug}>
                      <td className={`${tdClass} text-[13px]`}>{it.name}</td>
                      <td className={tdClass}>{it.qty}</td>
                      <td className={`${tdClass} whitespace-nowrap text-right text-[13px]`}>{formatPrice(it.total)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </Card>
          <Card title="Trạng thái đơn">
            <ul className="m-0 list-none p-0 text-[13px] leading-6">
              {(["pending", "processing", "completed", "cancelled"] as const).map((s) => (
                <li key={s} className="flex justify-between">
                  <span>{ADMIN_STATUS_LABELS[s]}</span>
                  <span className="font-semibold">{orders.filter((o) => o.status === s).length}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
