import Link from "next/link";
import { applySuggestedPricesAction, runPricingNowAction, saveFxAction, savePricingConfigAction } from "@/app/admin/products/pricing/actions";
import { readFx } from "@/lib/fx";
import { formatDateTime } from "@/lib/format";
import { ConfirmSubmit } from "@/components/sites/lienstore/admin/ConfirmSubmit";
import { adminInput, adminLabel, btnPrimary, Card, Flash, PageHeader, tableClass, tdClass, thClass } from "@/components/sites/lienstore/admin/ui";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { requireAdmin } from "@/lib/auth";
import { getAllProducts, getImportQuoteConfig, getPricingConfig } from "@/lib/db";
import { formatAmount, formatPrice } from "@/lib/format";
import { MARGIN_RANGE, suggestPrice } from "@/lib/pricing";
import { IMPORT_LEGS, LEG_LABEL, type QuoteMethod } from "@/lib/shipping";
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
  const [products, quote, pricing] = await Promise.all([getAllProducts(true), getImportQuoteConfig(), getPricingConfig()]);
  const fx = readFx();
  const withJpy = products.filter((p) => p.costJpy).length;
  const legMethods: Array<{ leg: (typeof IMPORT_LEGS)[number]; method: QuoteMethod | null; href: string }> = [
    { leg: "jp_domestic", method: quote.jpDomestic, href: "/admin/shipping/?leg=jp_domestic" },
    { leg: "jp_vn", method: quote.jpVn, href: "/admin/shipping/?leg=jp_vn" },
    { leg: "vn_transfer", method: quote.vnTransfer, href: "/admin/shipping/?leg=vn_transfer" },
  ];
  const rows = products
    .map((p) => ({ p, s: suggestPrice({ costPrice: p.costPrice, weightG: p.weightG, dimsCm: p.dimsCm, dimsConfidence: p.dimsConfidence }, quote, pricing) }))
    .filter((r): r is { p: (typeof products)[number]; s: NonNullable<ReturnType<typeof suggestPrice>> } => r.s !== null)
    .sort((a, b) => Math.abs(b.s.suggested - b.p.price) - Math.abs(a.s.suggested - a.p.price));
  const applicable = rows.filter((r) => r.p.regularPrice === null && r.s.suggested !== r.p.price);
  const noCost = products.length - rows.length;

  return (
    <>
      <PageHeader
        title="Công thức giá bán"
        subtitle="Giá bán = giá vốn + lãi % + phí vận chuyển 3 chặng nhập hàng (nội địa Nhật → Nhật–Việt → kho ĐVVC về kho shop). Khách chỉ trả thêm phí giao nội địa Việt Nam."
        back={{ href: "/admin/products/", label: "Sản phẩm" }}
      />
      {first(sp.saved) ? <Flash>{first(sp.saved)}</Flash> : null}
      {first(sp.error) ? <Flash kind="error">{first(sp.error)}</Flash> : null}

      <Card className="mb-6" title="Tỉ giá ¥ → đ và cập nhật giá vốn hằng ngày">
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <form action={saveFxAction} className="grid gap-4 sm:grid-cols-[200px_1fr] sm:items-start">
            <div>
              <label className={adminLabel} htmlFor="dcomRate">
                Tỉ giá DCOM (đ / 1 ¥)
              </label>
              <input id="dcomRate" name="dcomRate" inputMode="decimal" defaultValue={fx.dcomRate ?? ""} placeholder="VD: 176,5" className={adminInput} />
              <p className="mt-1 text-[12px] text-lien-muted">{fx.dcomUpdatedAt ? `Nhập lúc ${formatDateTime(fx.dcomUpdatedAt)}` : "Chưa nhập — DCOM chỉ công bố trên app / Facebook, nhập tay ở đây."}</p>
            </div>
            <div className="space-y-2 text-[14px]">
              <label className="flex items-start gap-2">
                <input type="radio" name="mode" value="dcom" defaultChecked={fx.mode === "dcom"} className="mt-1 h-4 w-4" />
                <span>
                  <strong>Dùng tỉ giá DCOM</strong> đã nhập; khi chưa nhập thì tạm dùng tỉ giá thị trường.
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
              Đang dùng: <strong>{formatAmount(fx.effective)} đ/¥</strong> ({fx.mode === "dcom" && fx.dcomRate ? "DCOM" : "thị trường"}) · {withJpy} sản phẩm có giá ¥.
            </p>
            <p className="m-0 mt-1 text-lien-muted">Tự chạy lúc <strong>04:00</strong> mỗi ngày: lấy tỉ giá → giá vốn VNĐ = giá ¥ × tỉ giá → giá bán (nếu bật). Lần cuối: {fx.lastRunAt ? `${formatDateTime(fx.lastRunAt)} — ${fx.lastRunSummary}` : "chưa chạy"}.</p>
            <form action={runPricingNowAction} className="mt-3">
              <button type="submit" className={btnPrimary}>
                <Fa name="refresh" /> Cập nhật giá vốn theo tỉ giá ngay
              </button>
            </form>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <Card title="Tham số">
          <form action={savePricingConfigAction} className="grid gap-4 sm:grid-cols-[150px_170px_170px_auto] sm:items-end">
            <div>
              <label className={adminLabel} htmlFor="marginPct">
                Lãi (% trên giá vốn)
              </label>
              <input id="marginPct" name="marginPct" inputMode="decimal" defaultValue={pricing.marginPct} className={adminInput} />
              <p className="mt-1 text-[12px] text-lien-muted">
                Khuyến nghị {MARGIN_RANGE.suggestedMin}–{MARGIN_RANGE.suggestedMax}%.
              </p>
            </div>
            <div>
              <label className={adminLabel} htmlFor="roundTo">
                Làm tròn lên
              </label>
              <select id="roundTo" name="roundTo" defaultValue={pricing.roundTo} className={adminInput}>
                {[1, 100, 500, 1000, 5000, 10000].map((n) => (
                  <option key={n} value={n}>
                    {n === 1 ? "Không làm tròn" : `${formatAmount(n)}đ`}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={adminLabel} htmlFor="lotKg">
                Cân lô gom hàng (kg)
              </label>
              <input id="lotKg" name="lotKg" inputMode="decimal" defaultValue={pricing.lotWeightG / 1000} className={adminInput} />
              <p className="mt-1 text-[12px] text-lien-muted">Một chuyến hàng điển hình.</p>
            </div>
            <button type="submit" className={cn(btnPrimary, "sm:mb-6")}>
              <Fa name="check" /> Lưu
            </button>
          </form>
          <p className="mt-4 rounded-md border border-lien-blue/30 bg-lien-blue-soft/60 px-3 py-2 text-[13px] leading-6 text-lien-text">
            <strong>Luồng nhập hàng mặc định:</strong> nhà tại Funabashi (〒273-0005) → <em>bưu điện Nhật</em> → kho Kiến Express Nhật (Chiba) → <em>Kiến Express</em> → kho Kiến Hà Nội (Xuân Phương, Nam Từ Liêm) → <em>Viettel Post</em> → kho LienStore Thanh Hóa. Đổi hãng / thứ tự ở tab từng chặng trong Vận chuyển.
          </p>
          <p className="mt-4 text-[13px] leading-6 text-lien-text">
            Phí vận chuyển mỗi sản phẩm tính theo <strong>cân tính phí</strong> (lớn hơn giữa cân thực và cân quy đổi kích thước, nhân hệ số an toàn theo độ tin cậy) với phương thức <strong>đang bật, đứng đầu</strong> của từng chặng. Mỗi chặng được tính cho cả lô {formatAmount(pricing.lotWeightG / 1000)} kg (đúng cách hàng thực sự đi: một kiện tới Kiến, một chuyến Kiến, một kiện Viettel về Thanh Hóa) rồi chia theo số gram của sản phẩm — không làm tròn lên 1 kg cho từng món. Giá ¥ đổi sang đ theo tỷ giá 1¥ = {formatAmount(quote.jpyRate)}đ (
            <Link href="/admin/shipping/?leg=display" className="text-lien-blue hover:underline">
              sửa ở Vận chuyển › Hiển thị cho khách
            </Link>
            ).
          </p>
        </Card>

        <Card title="3 chặng đang dùng để tính giá">
          <ul className="m-0 list-none space-y-2 p-0 text-[13px]">
            {legMethods.map((l) => (
              <li key={l.leg} className="flex items-start justify-between gap-3 rounded-md border border-[#e5e7eb] px-3 py-2">
                <span>
                  <span className="block font-semibold text-lien-heading">{LEG_LABEL[l.leg]}</span>
                  <span className={l.method ? "text-lien-text" : "text-red-600"}>{l.method ? `${l.method.name}${l.method.carrierName && !l.method.name.includes(l.method.carrierName) ? ` (${l.method.carrierName})` : ""}` : "Chưa có phương thức đang bật — chặng này tính 0đ"}</span>
                </span>
                <Link href={l.href} className="shrink-0 text-lien-blue hover:underline">
                  Sửa
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card
        className="mt-6"
        title={`Giá đề xuất theo công thức (${rows.length} sản phẩm có giá vốn${noCost ? ` · ${noCost} sản phẩm chưa nhập giá vốn` : ""})`}
        actions={
          applicable.length ? (
            <form action={applySuggestedPricesAction}>
              <ConfirmSubmit className={btnPrimary} message={`Cập nhật giá bán cho ${applicable.length} sản phẩm theo công thức? Sản phẩm đang giảm giá được bỏ qua.`}>
                <Fa name="check" /> Áp dụng cho {applicable.length} sản phẩm
              </ConfirmSubmit>
            </form>
          ) : (
            <span className="text-[13px] text-lien-muted">Giá bán hiện tại đã khớp công thức.</span>
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
                <th className={thClass}>Lãi {pricing.marginPct}%</th>
                <th className={thClass}>Ship 3 chặng</th>
                <th className={thClass}>Giá đề xuất</th>
                <th className={thClass}>Giá hiện tại</th>
                <th className={thClass}>Chênh</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className={`${tdClass} text-center text-lien-muted`}>
                    Chưa có sản phẩm nào nhập giá vốn.
                  </td>
                </tr>
              ) : null}
              {rows.map(({ p, s }) => {
                const diff = s.suggested - p.price;
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
                    <td className={`${tdClass} whitespace-nowrap`}>{formatPrice(s.margin)}</td>
                    <td className={`${tdClass} whitespace-nowrap`} title={s.legs.map((l) => `${LEG_LABEL[l.leg]}: ${formatAmount(l.fee)}đ (${l.label})`).join("\n") || "Chưa có phương thức"}>
                      {formatPrice(s.shipping)}
                      <span className="block text-[11px] text-lien-muted">{formatAmount(s.weightG)} g tính phí</span>
                    </td>
                    <td className={`${tdClass} whitespace-nowrap font-semibold text-lien-heading`}>{formatPrice(s.suggested)}</td>
                    <td className={`${tdClass} whitespace-nowrap`}>{formatPrice(p.price)}</td>
                    <td className={cn(tdClass, "whitespace-nowrap", diff > 0 ? "text-red-600" : diff < 0 ? "text-green-700" : "text-lien-muted")}>{diff === 0 ? "—" : `${diff > 0 ? "+" : "−"}${formatAmount(Math.abs(diff))}đ`}</td>
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
