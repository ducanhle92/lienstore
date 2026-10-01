import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { saveCustomerProfileAction, setCustomerRegularAction } from "@/app/admin/customers/actions";
import { ADMIN_STATUS_LABELS, adminInput, btnPrimary, btnSecondary, Card, Flash, PageHeader, StatusBadge, tableClass, tdClass, thClass } from "@/components/sites/lienstore/admin/ui";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { requireAdmin } from "@/lib/auth";
import { TIER_CLASS, TIER_LABEL } from "@/lib/customer-tiers";
import { countOrderFiles, getCustomerDirectoryRow, getOrdersForCustomerKey } from "@/lib/db";
import { cn } from "@/lib/utils";
import { formatDateTime, formatPrice } from "@/lib/format";
import { SheetTable } from "@/components/sites/lienstore/admin/SheetTable";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ key: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** One customer (registered or guest): profile, every order with its items, and which orders already have a receipt. */
export default async function AdminCustomerDetail({ params, searchParams }: Props) {
  await requireAdmin("customers");
  const { key: raw } = await params;
  const key = decodeURIComponent(raw);
  // every buyer has a profile now; an old "g:<email|phone>" link lands on the profile its orders belong to
  if (!key.startsWith("c:")) {
    const legacy = await getOrdersForCustomerKey(key);
    const cid = legacy.find((o) => o.customerId)?.customerId;
    if (cid) redirect(`/admin/customers/${encodeURIComponent(`c:${cid}`)}/`);
    notFound();
  }
  const c = await getCustomerDirectoryRow(key.slice(2));
  if (!c) notFound();
  const [orders, fileCounts] = await Promise.all([getOrdersForCustomerKey(key), countOrderFiles()]);
  const sp = await searchParams;
  const flag = (k: string) => { const v = sp[k]; return (Array.isArray(v) ? v[0] : v) ?? ""; };
  const isRegular = c.isRegular;
  const tier = c.tierEffective;

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
        summary={
          <span className="flex flex-wrap items-center gap-2 font-normal">
            {c.customerNo ? <span className="font-mono text-[13px] text-lien-muted">#{c.customerNo}</span> : null}
            <span className={cn("rounded-full px-2 py-0.5 text-[12px] font-semibold", TIER_CLASS[tier])} data-testid="customer-tier">
              {TIER_LABEL[tier]}
              {c.tierManual ? " ✎" : ""}
            </span>
          </span>
        }
        subtitle={`${orders.length} đơn · ${c.stats.delivered} đã giao · đã chi ${formatPrice(spent)}${c.kind === "account" ? " · có tài khoản web" : " · chưa có tài khoản (hồ sơ theo SĐT)"}${isRegular ? " · khách quen" : ""}`}
        back={{ href: "/admin/customers/", label: "Khách hàng" }}
        actions={
          c.id ? (
            <form action={setCustomerRegularAction} className="flex items-center gap-2" data-testid="regular-form">
              <input type="hidden" name="customerId" value={c.id} />
              <input type="hidden" name="regular" value={isRegular ? "0" : "1"} />
              <label className="inline-flex cursor-pointer items-center gap-2 text-[13px]" title="Khách quen được chọn thanh toán khi nhận hàng; admin đổi đơn sang thu khi giao thì tồn kho trừ ngay">
                <input type="checkbox" checked={isRegular} readOnly className="h-4 w-4" />
                Khách quen
              </label>
              <button type="submit" className={`${btnSecondary} !py-1 !text-[12px]`}>
                {isRegular ? "Bỏ đánh dấu" : "Đánh dấu"}
              </button>
            </form>
          ) : null
        }
      />
      {flag("saved") ? <Flash>{flag("saved")}</Flash> : null}
      {flag("error") ? <Flash kind="error">{flag("error")}</Flash> : null}
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
          <Card
            title="Thông tin"
            actions={
              <details className="relative" data-testid="edit-profile">
                <summary className={cn(btnSecondary, "inline-flex cursor-pointer list-none !px-2 !py-0.5 !text-[12px]")} title="Sửa hồ sơ khách (tên, SĐT, email, địa chỉ, ghi chú, hạng)">
                  <Fa name="pencil" /> Sửa
                </summary>
                <div className="absolute right-0 z-30 mt-1 w-[min(92vw,380px)] rounded-md border border-[#e5e7eb] bg-white p-3 shadow-lg">
                  <form action={saveCustomerProfileAction} className="grid gap-2 text-[13px]">
                    <input type="hidden" name="customerId" value={c.id} />
                    <label className="grid gap-0.5 font-semibold text-lien-heading">
                      Họ tên
                      <input name="name" defaultValue={c.name} required maxLength={120} className={cn(adminInput, "!py-1.5 !text-[13px] font-normal")} />
                    </label>
                    <label className="grid gap-0.5 font-semibold text-lien-heading">
                      Điện thoại
                      <input name="phone" defaultValue={c.phone} inputMode="tel" maxLength={30} className={cn(adminInput, "!py-1.5 !text-[13px] font-normal")} />
                    </label>
                    <label className="grid gap-0.5 font-semibold text-lien-heading">
                      Email
                      <input name="email" type="email" defaultValue={c.email} maxLength={160} className={cn(adminInput, "!py-1.5 !text-[13px] font-normal")} />
                    </label>
                    <label className="grid gap-0.5 font-semibold text-lien-heading">
                      Địa chỉ
                      <textarea name="address" defaultValue={c.address} rows={2} maxLength={400} className={cn(adminInput, "!py-1.5 !text-[13px] font-normal")} />
                    </label>
                    <label className="grid gap-0.5 font-semibold text-lien-heading">
                      Hạng
                      <select name="tierManual" defaultValue={c.tierManual} className={cn(adminInput, "!py-1.5 !text-[13px] font-normal")} data-testid="tier-select">
                        <option value="">Tự động ({TIER_LABEL[c.tier]})</option>
                        <option value="silver">Bạc (đặt tay)</option>
                        <option value="gold">Vàng (đặt tay)</option>
                        <option value="diamond">Kim cương (đặt tay)</option>
                      </select>
                    </label>
                    <label className="grid gap-0.5 font-semibold text-lien-heading">
                      Ghi chú về khách
                      <textarea name="note" defaultValue={c.note} rows={2} maxLength={1000} className={cn(adminInput, "!py-1.5 !text-[13px] font-normal")} />
                    </label>
                    <button type="submit" className={cn(btnPrimary, "justify-self-start !py-1.5 !text-[13px]")} data-testid="save-profile">
                      <Fa name="check" /> Lưu
                    </button>
                  </form>
                </div>
              </details>
            }
          >
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
                <dd>{c.kind === "account" ? `Tài khoản web (tạo ${formatDateTime(c.createdAt)})` : `Hồ sơ theo số điện thoại (tạo ${formatDateTime(c.createdAt)})`}</dd>
              </div>
              {c.note ? (
                <div>
                  <dt className="text-[12px] font-semibold uppercase text-[#6b7280]">Ghi chú</dt>
                  <dd className="whitespace-pre-wrap">{c.note}</dd>
                </div>
              ) : null}
            </dl>
          </Card>
          <Card title="Đã mua">
            {itemsBought.size === 0 ? <p className="m-0 text-lien-muted">—</p> : null}
            <SheetTable id="customer-items">
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
            </SheetTable>
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
