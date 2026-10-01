import Link from "next/link";
import { adjustPointsAction, saveLoyaltyRulesAction } from "@/app/admin/loyalty/actions";
import { OpenDetailsButton } from "@/components/sites/lienstore/admin/AddRowButton";
import { BarTools } from "@/components/sites/lienstore/admin/BulkBar";
import { SheetTable } from "@/components/sites/lienstore/admin/SheetTable";
import { StatTile, StatTiles } from "@/components/sites/lienstore/admin/StatTiles";
import { adminInput, btnPrimary, btnSecondary, Card, Flash, PageHeader, tableClass, tdClass, thClass } from "@/components/sites/lienstore/admin/ui";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { requireAdmin } from "@/lib/auth";
import { TIER_CLASS, TIER_LABEL, type CustomerTier } from "@/lib/customer-tiers";
import { getLoyaltyRules, getLoyaltySummaries, getTierRules, listCustomerDirectory } from "@/lib/db";
import { formatDate, formatDateTime, formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** Sales › Chính sách hậu mãi: buyers with tier, points earned / spent / balance, the rules behind them. */
export default async function AdminLoyalty({ searchParams }: Props) {
  const session = await requireAdmin("customers");
  const isOwner = session.role === "owner";
  const sp = await searchParams;
  const q = first(sp.q).trim().toLowerCase();
  const tier = first(sp.tier);
  const [dir, rules, tierRules, sums] = await Promise.all([listCustomerDirectory(), getLoyaltyRules(), getTierRules(), getLoyaltySummaries()]);
  const rows = dir
    .map((c) => ({ c, s: sums.get(c.id) ?? { customerId: c.id, earned: 0, redeemed: 0, balance: 0, firstOrderAt: null, excludedOrders: 0 } }))
    .filter(({ c }) => !q || `${c.customerNo ?? ""} ${c.name} ${c.phone} ${c.email}`.toLowerCase().includes(q))
    .filter(({ c }) => !tier || (tier === "points" ? (sums.get(c.id)?.balance ?? 0) > 0 : c.tierEffective === tier))
    .sort((a, b) => b.s.balance - a.s.balance || b.c.stats.spentDelivered - a.c.stats.spentDelivered);
  const totalBalance = [...sums.values()].reduce((n, s) => n + s.balance, 0);
  const totalEarned = [...sums.values()].reduce((n, s) => n + s.earned, 0);
  const totalRedeemed = [...sums.values()].reduce((n, s) => n + s.redeemed, 0);
  const money = (pts: number) => formatPrice(pts * rules.pointValue);
  const label = "text-[12px] font-semibold text-[#374151]";
  const href = (t: string) => `/admin/loyalty/${t ? `?tier=${t}` : ""}`;
  const pct = (t: CustomerTier) => `${rules.earnPct[t]}%`;

  return (
    <>
      <PageHeader title="Chính sách hậu mãi" summary={<span className="text-green-700">{rows.length} khách · {totalBalance.toLocaleString("vi-VN")} điểm đang có (≈ {money(totalBalance)})</span>} />
      {first(sp.saved) ? <Flash>{first(sp.saved)}</Flash> : null}
      {first(sp.error) ? <Flash kind="error">{first(sp.error)}</Flash> : null}
      <BarTools>{isOwner ? <OpenDetailsButton target="loyalty-rules" label="Chính sách điểm" className={cn(btnPrimary, "!py-1 !text-[13px]")} /> : null}</BarTools>

      <StatTiles testId="loyalty-stats">
        <StatTile label="Khách có điểm" value={`${[...sums.values()].filter((s) => s.balance > 0).length}`} accent="green" href={href("points")} active={tier === "points"} />
        <StatTile label="Điểm đã tích" value={`${totalEarned.toLocaleString("vi-VN")}`} accent="blue" title={`≈ ${money(totalEarned)}`} />
        <StatTile label="Điểm đã dùng" value={`${totalRedeemed.toLocaleString("vi-VN")}`} accent="amber" title={`≈ ${money(totalRedeemed)}`} />
        <StatTile label="Kim cương" value={`${dir.filter((c) => c.tierEffective === "diamond").length} · ${pct("diamond")}`} accent="blue" href={href("diamond")} active={tier === "diamond"} title={`Đã giao ≥ ${formatPrice(tierRules.diamondSpend)} · tích ${pct("diamond")} giá trị hàng`} />
        <StatTile label="Vàng" value={`${dir.filter((c) => c.tierEffective === "gold").length} · ${pct("gold")}`} accent="amber" href={href("gold")} active={tier === "gold"} title={`Đã giao ≥ ${formatPrice(tierRules.goldSpend)} · tích ${pct("gold")}`} />
        <StatTile label="Bạc" value={`${dir.filter((c) => c.tierEffective === "silver").length} · ${pct("silver")}`} accent="gray" href={href("silver")} active={tier === "silver"} title={`≥ ${tierRules.silverOrders} đơn đã giao hoặc ≥ ${formatPrice(tierRules.silverSpend)} · tích ${pct("silver")}`} />
      </StatTiles>

      <details id="loyalty-rules" className="mb-5 hidden rounded-md border-2 border-lien-blue bg-white open:block" data-savebar="off" data-testid="loyalty-rules" open={first(sp.rules) === "1"}>
        <summary className="cursor-pointer px-4 py-2.5 text-[14px] font-semibold text-lien-heading">
          <Fa name="gift" /> Chính sách điểm thưởng <span className="text-[12px] font-normal text-lien-muted">— đơn giao thành công tích điểm theo hạng; điểm trừ thẳng vào tiền đơn sau · bấm để đóng</span>
        </summary>
        <div className="border-t border-[#e5e7eb] px-4 py-4 text-[13px]">
          <p className="m-0 mb-3 text-[12px] leading-5 text-lien-muted">
            Khi đơn chuyển <b>Đã giao hàng thành công</b>, khách được tích điểm = tỉ lệ theo hạng × giá trị hàng (tạm tính − giảm giá), chia cho giá trị 1 điểm (làm tròn xuống). Đơn bị tick <b>loại khỏi hậu mãi</b> (đã giảm trực tiếp) không tích điểm và không tính hạng. Đơn huỷ: điểm đã tích thu hồi, điểm đã dùng hoàn lại. Hạng (ngưỡng ở Khách hàng › Ngưỡng hạng): Bạc ≥ {tierRules.silverOrders} đơn hoặc ≥ {formatPrice(tierRules.silverSpend)} · Vàng ≥ {formatPrice(tierRules.goldSpend)} · Kim cương ≥ {formatPrice(tierRules.diamondSpend)}.
          </p>
          {isOwner ? (
            <form action={saveLoyaltyRulesAction} className="grid gap-3 md:grid-cols-6">
              <label className={label}>
                1 điểm = (đ)
                <input name="pointValue" defaultValue={rules.pointValue} inputMode="numeric" className={cn(adminInput, "mt-1")} />
              </label>
              <label className={label}>
                Chưa xếp hạng tích (%)
                <input name="pctNone" defaultValue={rules.earnPct[""]} inputMode="numeric" className={cn(adminInput, "mt-1")} />
              </label>
              <label className={label}>
                Bạc tích (%)
                <input name="pctSilver" defaultValue={rules.earnPct.silver} inputMode="numeric" className={cn(adminInput, "mt-1")} />
              </label>
              <label className={label}>
                Vàng tích (%)
                <input name="pctGold" defaultValue={rules.earnPct.gold} inputMode="numeric" className={cn(adminInput, "mt-1")} />
              </label>
              <label className={label}>
                Kim cương tích (%)
                <input name="pctDiamond" defaultValue={rules.earnPct.diamond} inputMode="numeric" className={cn(adminInput, "mt-1")} />
              </label>
              <label className={label}>
                Đơn từ (đ) mới tích
                <input name="minOrder" defaultValue={rules.minOrder} inputMode="numeric" className={cn(adminInput, "mt-1")} />
              </label>
              <button type="submit" className={cn(btnPrimary, "justify-self-start md:col-span-6")} data-testid="save-loyalty-rules">
                <Fa name="check" /> Lưu chính sách
              </button>
            </form>
          ) : (
            <p className="m-0 text-[13px]">
              1 điểm = {formatPrice(rules.pointValue)} · tích theo hạng: chưa xếp {pct("")} · Bạc {pct("silver")} · Vàng {pct("gold")} · Kim cương {pct("diamond")}
              {rules.minOrder ? ` · đơn từ ${formatPrice(rules.minOrder)}` : ""} (chủ cửa hàng mới sửa được)
            </p>
          )}
        </div>
      </details>

      <Card>
        <form method="get" className="mb-4 grid gap-3 md:grid-cols-[1fr_220px_auto]">
          <input name="q" defaultValue={first(sp.q)} placeholder="Tìm theo mã KH, tên, điện thoại, email…" className={adminInput} />
          <select name="tier" defaultValue={tier} className={adminInput} aria-label="Lọc">
            <option value="">Mọi khách</option>
            <option value="points">Đang có điểm</option>
            <option value="diamond">Kim cương</option>
            <option value="gold">Vàng</option>
            <option value="silver">Bạc</option>
          </select>
          <button type="submit" className={btnPrimary}>
            Lọc
          </button>
        </form>
        <div className="overflow-x-auto">
          <SheetTable id="loyalty">
          <table className={tableClass} data-csv-table>
            <thead>
              <tr>
                <th className={thClass}>Mã KH</th>
                <th className={thClass}>Khách hàng</th>
                <th className={thClass}>Hạng</th>
                <th className={thClass}>Mua từ</th>
                <th className={thClass}>Đơn đã giao</th>
                <th className={thClass}>Đã chi (tính hạng)</th>
                <th className={thClass}>Đã tích</th>
                <th className={thClass}>Đã dùng</th>
                <th className={thClass}>Điểm hiện có</th>
                <th className={thClass}>≈ Tiền</th>
                <th className={thClass} />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={11} className={`${tdClass} text-center text-lien-muted`}>
                    Không có khách nào khớp.
                  </td>
                </tr>
              ) : null}
              {rows.map(({ c, s }) => {
                const t = c.tierEffective;
                const url = `/admin/customers/${encodeURIComponent(`c:${c.id}`)}/`;
                return (
                  <tr key={c.id} className="hover:bg-[#fafafa]" data-testid={`loyalty-${c.id}`}>
                    <td className={`${tdClass} whitespace-nowrap font-mono text-[14px] font-semibold text-lien-heading`}>{c.customerNo ?? "—"}</td>
                    <td className={tdClass}>
                      <Link href={url} className="font-semibold text-lien-heading hover:text-lien-blue">
                        {c.name || c.phone || "Khách"}
                      </Link>
                      <div className="text-[12px] text-lien-muted">
                        {c.phone}
                        {s.excludedOrders ? ` · ${s.excludedOrders} đơn loại khỏi hậu mãi` : ""}
                      </div>
                    </td>
                    <td className={tdClass} data-v={TIER_LABEL[t]} data-s={t === "diamond" ? 3 : t === "gold" ? 2 : t === "silver" ? 1 : 0}>
                      <span className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-semibold", TIER_CLASS[t])}>{TIER_LABEL[t]}</span>
                    </td>
                    <td className={`${tdClass} whitespace-nowrap text-[13px]`} data-s={s.firstOrderAt ?? ""}>{s.firstOrderAt ? formatDate(s.firstOrderAt) : "—"}</td>
                    <td className={tdClass}>{c.stats.delivered}</td>
                    <td className={`${tdClass} whitespace-nowrap`} data-s={c.stats.spentDelivered}>{formatPrice(c.stats.spentDelivered)}</td>
                    <td className={tdClass}>{s.earned.toLocaleString("vi-VN")}</td>
                    <td className={tdClass}>{s.redeemed.toLocaleString("vi-VN")}</td>
                    <td className={`${tdClass} font-semibold text-lien-heading`} data-s={s.balance}>{s.balance.toLocaleString("vi-VN")}</td>
                    <td className={`${tdClass} whitespace-nowrap text-green-700`}>{money(s.balance)}</td>
                    <td className={`${tdClass} whitespace-nowrap text-right`}>
                      <details className="relative inline-block text-left">
                        <summary className={cn(btnSecondary, "inline-flex cursor-pointer list-none !px-2 !py-0.5 !text-[12px]")} title="Tặng / trừ điểm bằng tay">
                          ± điểm
                        </summary>
                        <form action={adjustPointsAction} className="absolute right-0 z-30 mt-1 grid w-[260px] gap-2 rounded-md border border-[#e5e7eb] bg-white p-3 text-[13px] shadow-lg">
                          <input type="hidden" name="customerId" value={c.id} />
                          <input type="hidden" name="back" value="/admin/loyalty/" />
                          <input name="points" inputMode="numeric" placeholder="+50 tặng · -20 trừ" className={cn(adminInput, "!mb-0 !py-1")} aria-label="Số điểm" />
                          <input name="note" placeholder="lý do" className={cn(adminInput, "!mb-0 !py-1")} aria-label="Lý do" />
                          <button type="submit" className={cn(btnPrimary, "!py-1 !text-[13px]")}>
                            Ghi
                          </button>
                        </form>
                      </details>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </SheetTable>
        </div>
        <p className="m-0 mt-3 text-[12px] text-lien-muted">Trừ điểm vào đơn: mở đơn của khách → ô Khách hàng → <b>Dùng điểm</b>. Lịch sử điểm từng khách xem trong hồ sơ khách. Cập nhật lúc {formatDateTime(new Date().toISOString())}.</p>
      </Card>
    </>
  );
}
