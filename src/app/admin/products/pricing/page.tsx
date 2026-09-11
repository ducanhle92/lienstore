import Link from "next/link";
import { applySuggestedPricesAction, refreshDcomAction, runPricingNowAction, saveCostParamsAction, saveFxAction, savePricingConfigAction } from "@/app/admin/products/pricing/actions";
import { CategoryMarginForm } from "@/components/sites/lienstore/admin/CategoryMarginForm";
import { PurchaseSourceCard } from "@/components/sites/lienstore/admin/PurchaseSourceCard";
import { readFx } from "@/lib/fx";
import { formatDateTime } from "@/lib/format";
import { ConfirmSubmit } from "@/components/sites/lienstore/admin/ConfirmSubmit";
import { adminInput, adminLabel, btnPrimary, Card, Flash, PageHeader, tableClass, tdClass, thClass } from "@/components/sites/lienstore/admin/ui";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { requireAdmin } from "@/lib/auth";
import { getAllProducts, getCategories, getImportQuoteConfig, getPricingConfig, getQuoteDefaults, getShippingMethods } from "@/lib/db";
import { formatAmount, formatPrice } from "@/lib/format";
import { MARGIN_RANGE, suggestPrice } from "@/lib/pricing";
import { IMPORT_LEGS, LEG_LABEL } from "@/lib/shipping";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** Kho hàng › Công thức giá: margin %, the three import legs, and a preview/apply of the suggested selling prices. */
export default async function AdminPricing({ searchParams }: Props) {
  await requireAdmin("products");
  const sp = await searchParams;
  const [products, quote, pricing, categories, methods, quoteDefaults] = await Promise.all([getAllProducts(true), getImportQuoteConfig(), getPricingConfig(), getCategories(), getShippingMethods(true), getQuoteDefaults()]);
  const fx = readFx();
  const withJpy = products.filter((p) => p.costJpy).length;
  const rows = products
    .map((p) => ({ p, s: suggestPrice({ costPrice: p.costPrice, weightG: p.weightG, dimsCm: p.dimsCm, dimsConfidence: p.dimsConfidence, marginPct: p.marginPct, categories: p.categories }, quote, pricing) }))
    .filter((r): r is { p: (typeof products)[number]; s: NonNullable<ReturnType<typeof suggestPrice>> } => r.s !== null)
    .sort((a, b) => Math.abs(b.s.suggested - b.p.price) - Math.abs(a.s.suggested - a.p.price)); // biggest gap between expected and actual first
  const applicable = rows.filter((r) => r.p.regularPrice === null && r.s.suggested !== r.p.price);
  const noCost = products.length - rows.length;

  return (
    <>
      <PageHeader
        title="Công thức giá bán"
        subtitle="Giá vốn về tới VN = giá vốn (¥ × tỉ giá) + phí 3 chặng nhập hàng (nội địa Nhật → Nhật–Việt → kho ĐVVC về kho shop). Giá kỳ vọng bán ra trên website = giá vốn về VN × (1 + tỉ lệ lãi kỳ vọng). Lợi nhuận kỳ vọng = giá kỳ vọng − giá vốn về VN; lãi/lỗ thực tế = giá thực tế trên website − giá vốn về VN. Khách chỉ trả thêm phí giao nội địa Việt Nam."
        back={{ href: "/admin/products/", label: "Sản phẩm" }}
      />
      {first(sp.saved) ? <Flash>{first(sp.saved)}</Flash> : null}
      {first(sp.error) ? <Flash kind="error">{first(sp.error)}</Flash> : null}

      <Card className="mb-6" title="Tỉ giá ¥ → đ và cập nhật giá vốn hằng ngày">
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <form action={saveFxAction} className="grid gap-4 sm:grid-cols-[200px_1fr] sm:items-start">
            <div>
              <p className={adminLabel}>Tỉ giá DCOM tự lấy (đ / 1 ¥)</p>
              <p className="m-0 text-[22px] font-bold leading-7 text-lien-heading" data-testid="dcom-auto">
                {fx.dcomAutoRate ? fx.dcomAutoRate.toLocaleString("vi-VN", { maximumFractionDigits: 2 }) : "—"}
              </p>
              <p className="mt-1 text-[12px] leading-5 text-lien-muted">
                {fx.dcomAutoRate ? (
                  <>
                    Từ <a href="https://sendmoney.co.jp/vi/fx-rate" target="_blank" rel="noreferrer" className="text-lien-blue underline">sendmoney.co.jp</a>
                    {fx.dcomAutoPageTime ? ` (DCOM cập nhật ${fx.dcomAutoPageTime})` : ""} · lấy lúc {fx.dcomAutoUpdatedAt ? formatDateTime(fx.dcomAutoUpdatedAt) : "?"}
                  </>
                ) : (
                  "Chưa lấy được — bấm \"Lấy tỉ giá DCOM ngay\" hoặc chờ 04:00."
                )}
              </p>
              <label className={`${adminLabel} mt-3`} htmlFor="dcomRate">
                Nhập tay (ghi đè, để trống = theo DCOM tự lấy)
              </label>
              <input id="dcomRate" name="dcomRate" inputMode="decimal" defaultValue={fx.dcomManualRate ?? ""} placeholder="VD: 167,4" className={adminInput} />
              {fx.dcomManualRate ? <p className="mt-1 text-[12px] text-amber-700">Đang ghi đè bằng {formatAmount(fx.dcomManualRate)} đ/¥ (nhập lúc {fx.dcomManualUpdatedAt ? formatDateTime(fx.dcomManualUpdatedAt) : "?"}). Xóa ô này và Lưu để quay về tỉ giá tự lấy.</p> : null}
            </div>
            <div className="space-y-2 text-[14px]">
              <label className="flex items-start gap-2">
                <input type="radio" name="mode" value="dcom" defaultChecked={fx.mode === "dcom"} className="mt-1 h-4 w-4" />
                <span>
                  <strong>Dùng tỉ giá DCOM</strong> (tự lấy mỗi đêm từ sendmoney.co.jp; khi chưa lấy được thì tạm dùng tỉ giá thị trường).
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input type="radio" name="mode" value="market" defaultChecked={fx.mode === "market"} className="mt-1 h-4 w-4" />
                <span>
                  <strong>Dùng tỉ giá thị trường</strong> tự lấy mỗi đêm ({fx.marketRate ? `${fx.marketRate} đ/¥ · ${fx.marketSource} · ${fx.marketUpdatedAt ? formatDateTime(fx.marketUpdatedAt) : ""}` : "chưa lấy được"}).
                </span>
              </label>
              <label className="flex items-start gap-2 border-t border-[#e5e7eb] pt-2">
                <input type="checkbox" name="autoSell" defaultChecked={fx.autoSell} className="mt-1 h-4 w-4" />
                <span>
                  <strong>Tự cập nhật giá bán</strong> theo công thức sau mỗi lần tính lại giá vốn (bỏ qua sản phẩm đang giảm giá).
                </span>
              </label>
              <button type="submit" className={btnPrimary}>
                <Fa name="check" /> Lưu tỉ giá
              </button>
            </div>
          </form>
          <div className="rounded-md border border-lien-blue/30 bg-lien-blue-soft/60 p-4 text-[13px] leading-6 text-lien-text">
            <p className="m-0">
              Đang dùng: <strong data-testid="fx-effective">{fx.effective.toLocaleString("vi-VN", { maximumFractionDigits: 2 })} đ/¥</strong> ({fx.mode === "dcom" && fx.dcomRate ? (fx.dcomManualRate ? "DCOM nhập tay" : "DCOM tự lấy") : "thị trường"}) · {withJpy} sản phẩm có giá ¥.
            </p>
            <form action={refreshDcomAction} className="mt-2">
              <button type="submit" className="inline-flex items-center gap-1 rounded-md border border-lien-blue bg-white px-3 py-1.5 text-[13px] font-semibold text-lien-blue hover:bg-lien-blue-soft">
                <Fa name="refresh" /> Lấy tỉ giá DCOM ngay
              </button>
            </form>
            <p className="m-0 mt-1 text-lien-muted">Tự chạy lúc <strong>04:00</strong> mỗi ngày: lấy tỉ giá → giá vốn VNĐ = giá ¥ × tỉ giá → giá bán (nếu bật). Lần cuối: {fx.lastRunAt ? `${formatDateTime(fx.lastRunAt)} — ${fx.lastRunSummary}` : "chưa chạy"}.</p>
            <form action={runPricingNowAction} className="mt-3">
              <button type="submit" className={btnPrimary}>
                <Fa name="refresh" /> Cập nhật giá vốn theo tỉ giá ngay
              </button>
            </form>
          </div>
        </div>
      </Card>

      <Card className="mb-6" title="Tham số chi phí vận chuyển (3 chặng nhập hàng)">
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <form action={saveCostParamsAction} className="grid gap-4 sm:grid-cols-2">
            {IMPORT_LEGS.map((leg) => {
              const list = methods.filter((m) => m.leg === leg && m.active);
              const current = leg === "jp_domestic" ? quote.jpDomestic?.id : leg === "jp_vn" ? quote.jpVn?.id : quote.vnTransfer?.id;
              return (
                <div key={leg}>
                  <label className={adminLabel} htmlFor={`default_${leg}`}>
                    {LEG_LABEL[leg]} — đơn vị vận chuyển mặc định
                  </label>
                  <select id={`default_${leg}`} name={`default_${leg}`} defaultValue={quoteDefaults[leg] ?? current ?? ""} className={adminInput}>
                    {list.length === 0 ? <option value="">Chưa có phương thức đang bật</option> : null}
                    {list.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                        {m.carrierName && !m.name.includes(m.carrierName) ? ` (${m.carrierName})` : ""}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[12px] text-lien-muted">
                    <Link href={`/admin/shipping/?leg=${leg}`} className="text-lien-blue hover:underline">
                      Sửa công thức / bảng giá của chặng này
                    </Link>
                  </p>
                </div>
              );
            })}
            <div>
              <label className={adminLabel} htmlFor="lotKg">
                Cân lô gom hàng (kg)
              </label>
              <input id="lotKg" name="lotKg" inputMode="decimal" defaultValue={pricing.lotWeightG / 1000} className={cn(adminInput, "!w-[160px]")} />
              <p className="mt-1 text-[12px] text-lien-muted">Số kg gom đủ trong một lô rồi đóng gửi; lô càng lớn thì phí chia cho mỗi món càng nhỏ. Gom đơn thật ở Vận chuyển › Đơn hàng · 4 chặng.</p>
            </div>
            <div className="sm:col-span-2">
              <button type="submit" className={btnPrimary}>
                <Fa name="check" /> Lưu tham số chi phí
              </button>
            </div>
          </form>
          <div className="rounded-md border border-lien-blue/30 bg-lien-blue-soft/60 p-4 text-[13px] leading-6 text-lien-text">
            <p className="m-0">
              <strong>Luồng nhập hàng mặc định:</strong> nhà tại Funabashi (〒273-0005) → <em>bưu điện Nhật</em> → kho Kiến Express Nhật (〒270-0145 千葉県流山市名都借 827-3 1F, Nagareyama, Chiba) → <em>Kiến Express</em> → kho Kiến Hà Nội (OV3.15 XP5 KĐT Xuân Phương Viglacera, Nam Từ Liêm) → <em>Viettel Post</em> → kho LienStore Thanh Hóa. Luồng này được điền sẵn cho từng đơn; admin đổi ở Vận chuyển khi cần.
            </p>
            <p className="m-0 mt-2 text-lien-muted">
              Phí mỗi sản phẩm = cân tính phí (max cân thực / cân quy đổi × hệ số an toàn) × biểu phí của đơn vị mặc định, tính cho cả lô {formatAmount(pricing.lotWeightG / 1000)} kg rồi chia theo gram — không làm tròn lên 1 kg cho từng món. Giá ¥ đổi sang đ theo 1¥ = {formatAmount(quote.jpyRate)}đ.
            </p>
          </div>
        </div>
      </Card>

      <PurchaseSourceCard />

      <Card className="mb-6" title="Tham số tỉ lệ lãi kỳ vọng">
        <CategoryMarginForm categories={categories.map((c) => ({ slug: c.slug, name: c.name, parentSlug: c.parentSlug }))} overrides={pricing.marginByCategory} defaultPct={pricing.marginPct} />
        <form action={savePricingConfigAction} className="mt-5 flex flex-wrap items-end gap-3 border-t border-[#e5e7eb] pt-4">
          <div>
            <label className={adminLabel} htmlFor="roundTo">
              Làm tròn lên
            </label>
            <select id="roundTo" name="roundTo" defaultValue={pricing.roundTo} className={cn(adminInput, "!mb-0 !w-[180px]")}>
              {[1, 100, 500, 1000, 5000, 10000].map((n) => (
                <option key={n} value={n}>
                  {n === 1 ? "Không làm tròn" : `${formatAmount(n)}đ`}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className={btnPrimary}>
            <Fa name="check" /> Lưu
          </button>
          <p className="m-0 text-[12px] leading-5 text-lien-muted">Giá kỳ vọng = giá vốn về VN × (1 + tỉ lệ lãi kỳ vọng), làm tròn lên bước này. Khuyến nghị lãi {MARGIN_RANGE.suggestedMin}–{MARGIN_RANGE.suggestedMax}%.</p>
        </form>
      </Card>

      <Card
        className="mt-6"
        title={`Giá kỳ vọng theo công thức (${rows.length} sản phẩm có giá vốn${noCost ? ` · ${noCost} sản phẩm chưa nhập giá vốn` : ""})`}
        actions={
          applicable.length ? (
            <form action={applySuggestedPricesAction}>
              <ConfirmSubmit className={btnPrimary} message={`Cập nhật giá bán cho ${applicable.length} sản phẩm theo công thức? Sản phẩm đang giảm giá được bỏ qua.`}>
                <Fa name="check" /> Áp dụng cho {applicable.length} sản phẩm
              </ConfirmSubmit>
            </form>
          ) : (
            <span className="text-[13px] text-lien-muted">Giá thực tế trên website đã khớp giá kỳ vọng.</span>
          )
        }
      >
        <div className="overflow-x-auto">
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>Sản phẩm</th>
                <th className={thClass}>Giá ¥</th>
                <th className={thClass}>Giá vốn</th>
                <th className={thClass}>Ship 3 chặng</th>
                <th className={thClass}>Giá vốn về tới VN</th>
                <th className={thClass}>Tỉ lệ lãi kỳ vọng</th>
                <th className={thClass}>Giá kỳ vọng bán ra trên website</th>
                <th className={thClass}>Lợi nhuận kỳ vọng</th>
                <th className={thClass}>Giá thực tế trên website</th>
                <th className={thClass} title="Giá thực tế trên website − giá vốn về tới VN">Lãi/lỗ thực tế</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className={`${tdClass} text-center text-lien-muted`}>
                    Chưa có sản phẩm nào nhập giá vốn.
                  </td>
                </tr>
              ) : null}
              {rows.map(({ p, s }) => {
                const real = p.price > 0 ? p.price - s.landed : null;
                return (
                  <tr key={p.id} className="hover:bg-[#fafafa]">
                    <td className={tdClass}>
                      <Link href={`/admin/products/${p.id}/`} className="font-semibold text-lien-heading hover:text-lien-blue">
                        {p.name}
                      </Link>
                      {p.regularPrice !== null ? <span className="ml-2 rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-orange-800">đang giảm giá · bỏ qua</span> : null}
                    </td>
                    <td className={`${tdClass} whitespace-nowrap font-mono text-[13px] text-lien-muted`}>{p.costJpy ? `¥${p.costJpy.toLocaleString("ja-JP")}` : "—"}</td>
                    <td className={`${tdClass} whitespace-nowrap`}>{formatPrice(s.cost)}</td>
                    <td className={`${tdClass} whitespace-nowrap`} title={s.legs.map((l) => `${LEG_LABEL[l.leg]}: ${formatAmount(l.fee)}đ (${l.label})`).join("\n") || "Chưa có phương thức"}>
                      {formatPrice(s.shipping)}
                      <span className="block text-[11px] text-lien-muted">{formatAmount(s.weightG)} g tính phí</span>
                    </td>
                    <td className={`${tdClass} whitespace-nowrap font-semibold`}>{formatPrice(s.landed)}</td>
                    <td className={`${tdClass} whitespace-nowrap`}>
                      {s.marginPct}%{p.marginPct !== null ? <span className="ml-1 rounded bg-lien-blue-soft px-1 text-[10px] text-lien-blue">riêng</span> : null}
                    </td>
                    <td className={`${tdClass} whitespace-nowrap font-semibold text-lien-heading`}>{formatPrice(s.suggested)}</td>
                    <td className={`${tdClass} whitespace-nowrap text-green-700`}>{formatPrice(s.margin)}</td>
                    <td className={`${tdClass} whitespace-nowrap`}>{formatPrice(p.price)}</td>
                    <td className={cn(tdClass, "whitespace-nowrap font-semibold", real === null ? "text-lien-muted" : real >= 0 ? "text-green-700" : "text-red-600")}>{real === null ? "chưa có giá" : `${real < 0 ? "−" : ""}${formatAmount(Math.abs(real))}đ`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
