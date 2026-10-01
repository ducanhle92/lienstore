import Link from "next/link";
import { saveCustomerProfileAction, saveTierRulesAction } from "@/app/admin/customers/actions";
import { OpenDetailsButton } from "@/components/sites/lienstore/admin/AddRowButton";
import { BarTools } from "@/components/sites/lienstore/admin/BulkBar";
import { SheetTable } from "@/components/sites/lienstore/admin/SheetTable";
import { StatTile, StatTiles } from "@/components/sites/lienstore/admin/StatTiles";
import { adminInput, btnPrimary, btnSecondary, Card, Flash, PageHeader, tableClass, tdClass, thClass } from "@/components/sites/lienstore/admin/ui";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { requireAdmin } from "@/lib/auth";
import { TIER_CLASS, TIER_LABEL, type CustomerTier, isTier } from "@/lib/customer-tiers";
import { getTierRules, listCustomerDirectory } from "@/lib/db";
import { formatDateTime, formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").toLowerCase();

/** Admin › Khách hàng: one card per buyer (web account or profile made from an order), tiers, figures, add / edit. */
export default async function AdminCustomers({ searchParams }: Props) {
  const session = await requireAdmin("customers");
  const isOwner = session.role === "owner";
  const sp = await searchParams;
  const q = fold(first(sp.q).trim());
  const digits = first(sp.q).replace(/\D/g, "");
  const kind = first(sp.kind);
  const tier = first(sp.tier);
  const [all, rules] = await Promise.all([listCustomerDirectory(), getTierRules()]);
  const items = all
    .filter((c) => !q || (digits.length >= 3 && c.phone.replace(/\D/g, "").includes(digits)) || fold(`${c.customerNo ?? ""} ${c.name} ${c.email} ${c.phone} ${c.address}`).includes(q))
    .filter((c) => !kind || (kind === "account" ? c.kind === "account" : kind === "guest" ? c.kind === "guest" : kind === "regular" ? c.isRegular : true))
    .filter((c) => !tier || (tier === "none" ? !c.tierEffective : c.tierEffective === tier));
  const count = (t: CustomerTier) => all.filter((c) => c.tierEffective === t).length;
  const revenue = all.reduce((s, c) => s + c.stats.spent, 0);
  const href = (p: Record<string, string>) => {
    const u = new URLSearchParams(Object.entries({ q: first(sp.q), kind, tier, ...p }).filter(([, v]) => v));
    const s = u.toString();
    return `/admin/customers/${s ? `?${s}` : ""}`;
  };
  const label = "text-[12px] font-semibold text-[#374151]";
  const money = (n: number) => n.toLocaleString("vi-VN");

  return (
    <>
      <PageHeader title="Khách hàng" summary={<span className="text-green-700">{all.length} khách · đã chi {formatPrice(revenue)}</span>} />
      {first(sp.saved) ? <Flash>{first(sp.saved)}</Flash> : null}
      {first(sp.error) ? <Flash kind="error">{first(sp.error)}</Flash> : null}
      <BarTools>
        <OpenDetailsButton target="new-customer" label="+ Thêm khách" className={cn(btnPrimary, "!py-1 !text-[13px]")} />
        {isOwner ? <OpenDetailsButton target="tier-rules" label="Ngưỡng hạng" className={cn(btnSecondary, "!py-1 !text-[13px]")} /> : null}
      </BarTools>

      {/* the figures are the filter */}
      <StatTiles testId="customer-stats">
        <StatTile label="Tất cả khách" value={`${all.length}`} accent="blue" href={href({ tier: "", kind: "" })} active={!tier && !kind} />
        <StatTile label="Kim cương" value={`${count("diamond")}`} accent="blue" href={href({ tier: "diamond", kind: "" })} active={tier === "diamond"} title={`Đã giao ≥ ${money(rules.diamondSpend)}đ`} />
        <StatTile label="Vàng" value={`${count("gold")}`} accent="amber" href={href({ tier: "gold", kind: "" })} active={tier === "gold"} title={`Đã giao ≥ ${money(rules.goldSpend)}đ`} />
        <StatTile label="Bạc" value={`${count("silver")}`} accent="gray" href={href({ tier: "silver", kind: "" })} active={tier === "silver"} title={`≥ ${rules.silverOrders} đơn đã giao hoặc ≥ ${money(rules.silverSpend)}đ`} />
        <StatTile label="Chưa xếp hạng" value={`${count("")}`} accent="gray" href={href({ tier: "none", kind: "" })} active={tier === "none"} />
        <StatTile label="Khách quen (COD)" value={`${all.filter((c) => c.isRegular).length}`} accent="green" href={href({ kind: "regular", tier: "" })} active={kind === "regular"} title="Được thanh toán khi nhận hàng" />
      </StatTiles>

      <details id="new-customer" className="mb-5 hidden rounded-md border-2 border-lien-blue bg-white open:block" data-savebar="off" data-testid="new-customer">
        <summary className="cursor-pointer px-4 py-2.5 text-[14px] font-semibold text-lien-heading">
          <Fa name="plus" /> Thêm khách <span className="text-[12px] font-normal text-lien-muted">— hồ sơ nhận diện theo số điện thoại; đơn sau này (web hay admin tạo) tự gắn vào · bấm để đóng</span>
        </summary>
        <form action={saveCustomerProfileAction} className="grid gap-3 border-t border-[#e5e7eb] px-4 py-4 text-[13px] md:grid-cols-3">
          <label className={label}>
            Họ tên *
            <input name="name" required className={cn(adminInput, "mt-1")} placeholder="Nguyễn Văn A" />
          </label>
          <label className={label}>
            Điện thoại *
            <input name="phone" required inputMode="tel" className={cn(adminInput, "mt-1")} placeholder="09xx xxx xxx" />
          </label>
          <label className={label}>
            Email
            <input name="email" type="email" className={cn(adminInput, "mt-1")} placeholder="nếu có" />
          </label>
          <label className={cn(label, "md:col-span-2")}>
            Địa chỉ
            <input name="address" className={cn(adminInput, "mt-1")} placeholder="Số nhà, đường, xã / phường, tỉnh / thành" />
          </label>
          <label className={label}>
            Hạng đặt tay
            <select name="tierManual" defaultValue="" className={cn(adminInput, "mt-1")}>
              <option value="">Tự động theo đơn đã giao</option>
              <option value="silver">Bạc</option>
              <option value="gold">Vàng</option>
              <option value="diamond">Kim cương</option>
            </select>
          </label>
          <label className={cn(label, "md:col-span-3")}>
            Ghi chú về khách
            <input name="note" className={cn(adminInput, "mt-1")} placeholder="thói quen mua, lưu ý giao hàng…" />
          </label>
          <button type="submit" className={cn(btnPrimary, "justify-self-start")} data-testid="create-customer">
            <Fa name="check" /> Thêm khách
          </button>
        </form>
      </details>

      {isOwner ? (
        <details id="tier-rules" className="mb-5 hidden rounded-md border border-[#e5e7eb] bg-white open:block" data-savebar="off" data-testid="tier-rules">
          <summary className="cursor-pointer px-4 py-2.5 text-[14px] font-semibold text-lien-heading">
            Ngưỡng hạng khách <span className="text-[12px] font-normal text-lien-muted">— tính trên đơn đã giao thành công (trừ huỷ), toàn thời gian · bấm để đóng</span>
          </summary>
          <form action={saveTierRulesAction} className="grid gap-3 border-t border-[#e5e7eb] px-4 py-4 text-[13px] md:grid-cols-4">
            <label className={label}>
              Bạc: từ … đơn đã giao
              <input name="silverOrders" defaultValue={rules.silverOrders} inputMode="numeric" className={cn(adminInput, "mt-1")} />
            </label>
            <label className={label}>
              … hoặc đã chi từ (đ)
              <input name="silverSpend" defaultValue={rules.silverSpend} inputMode="numeric" className={cn(adminInput, "mt-1")} />
            </label>
            <label className={label}>
              Vàng: đã chi từ (đ)
              <input name="goldSpend" defaultValue={rules.goldSpend} inputMode="numeric" className={cn(adminInput, "mt-1")} />
            </label>
            <label className={label}>
              Kim cương: đã chi từ (đ)
              <input name="diamondSpend" defaultValue={rules.diamondSpend} inputMode="numeric" className={cn(adminInput, "mt-1")} />
            </label>
            <button type="submit" className={cn(btnPrimary, "justify-self-start md:col-span-4")} data-testid="save-tier-rules">
              <Fa name="check" /> Lưu & xếp hạng lại
            </button>
          </form>
        </details>
      ) : null}

      <Card>
        <form method="get" className="mb-4 grid gap-3 md:grid-cols-[1fr_200px_200px_auto]">
          <input name="q" defaultValue={first(sp.q)} placeholder="Tìm theo mã KH, tên, điện thoại, email, địa chỉ…" className={adminInput} />
          <select name="kind" defaultValue={kind} className={adminInput} aria-label="Loại">
            <option value="">Mọi loại</option>
            <option value="account">Có tài khoản web</option>
            <option value="guest">Chưa có tài khoản</option>
            <option value="regular">Khách quen (COD)</option>
          </select>
          <select name="tier" defaultValue={tier} className={adminInput} aria-label="Hạng">
            <option value="">Mọi hạng</option>
            <option value="diamond">Kim cương</option>
            <option value="gold">Vàng</option>
            <option value="silver">Bạc</option>
            <option value="none">Chưa xếp hạng</option>
          </select>
          <button type="submit" className={btnPrimary}>
            Lọc
          </button>
        </form>
        <div className="overflow-x-auto">
          <SheetTable id="customers">
          <table className={tableClass} data-csv-table>
            <thead>
              <tr>
                <th className={thClass}>Mã KH</th>
                <th className={thClass}>Khách hàng</th>
                <th className={thClass}>Hạng</th>
                <th className={thClass}>Liên hệ</th>
                <th className={thClass}>Loại</th>
                <th className={thClass}>Đơn</th>
                <th className={thClass}>Đã giao</th>
                <th className={thClass}>Tổng chi</th>
                <th className={thClass}>Đơn gần nhất</th>
                <th className={thClass} />
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={10} className={`${tdClass} text-center text-lien-muted`}>
                    Không có khách nào khớp.
                  </td>
                </tr>
              ) : null}
              {items.map((c) => {
                const t = isTier(c.tierEffective) ? c.tierEffective : "";
                const url = `/admin/customers/${encodeURIComponent(`c:${c.id}`)}/`;
                return (
                  <tr key={c.id} className="hover:bg-[#fafafa]" data-testid={`customer-${c.id}`}>
                    <td className={`${tdClass} whitespace-nowrap font-mono text-[14px] font-semibold text-lien-heading`}>{c.customerNo ?? "—"}</td>
                    <td className={tdClass}>
                      <Link href={url} className="font-semibold text-lien-heading hover:text-lien-blue">
                        {c.name || c.phone || "Khách"}
                      </Link>
                      {c.isRegular ? <span className="ml-1 rounded-full bg-lien-blue-soft px-1.5 py-0.5 text-[10px] font-semibold text-lien-blue">quen</span> : null}
                      {c.address ? <div className="max-w-[260px] truncate text-[12px] text-lien-muted">{c.address}</div> : null}
                    </td>
                    <td className={tdClass} data-v={TIER_LABEL[t]} data-s={t === "diamond" ? 3 : t === "gold" ? 2 : t === "silver" ? 1 : 0}>
                      <span className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-semibold", TIER_CLASS[t])} title={c.tierManual ? "Hạng đặt tay" : "Hạng tự động theo đơn đã giao"}>
                        {TIER_LABEL[t]}
                        {c.tierManual ? " ✎" : ""}
                      </span>
                    </td>
                    <td className={`${tdClass} text-[13px]`}>
                      {c.phone ? <div>{c.phone}</div> : null}
                      {c.email ? <div className="text-lien-muted">{c.email}</div> : null}
                    </td>
                    <td className={tdClass} data-v={c.kind === "account" ? "Tài khoản web" : "Chưa có tài khoản"}>
                      {c.kind === "account" ? (
                        <span className="whitespace-nowrap rounded-full bg-green-100 px-2.5 py-0.5 text-[12px] font-semibold text-green-800">Tài khoản web</span>
                      ) : (
                        <span className="whitespace-nowrap rounded-full bg-gray-200 px-2.5 py-0.5 text-[12px] font-semibold text-gray-700">Chưa có TK</span>
                      )}
                    </td>
                    <td className={tdClass}>{c.stats.orders}</td>
                    <td className={tdClass}>{c.stats.delivered}</td>
                    <td className={`${tdClass} whitespace-nowrap`} data-s={c.stats.spent}>{formatPrice(c.stats.spent)}</td>
                    <td className={`${tdClass} whitespace-nowrap text-[13px] text-lien-muted`} data-s={c.stats.lastOrderAt ?? ""}>{c.stats.lastOrderAt ? formatDateTime(c.stats.lastOrderAt) : "—"}</td>
                    <td className={`${tdClass} text-right`}>
                      <Link href={url} className="text-lien-blue hover:underline">
                        Chi tiết
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </SheetTable>
        </div>
      </Card>
    </>
  );
}
