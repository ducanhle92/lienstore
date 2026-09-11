import type { ShipPolicy } from "@/lib/ship-policy";
import { ShipPolicyCard } from "./ShipPolicyCard";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { T } from "@/components/sites/lienstore/shared/LangProvider";
import { formatAmount } from "@/lib/format";
import { SHIPPING_LEGS, billableKg, billableProductWeightG, estimateZoneFee, isTiered, safetyFactor, type DimsConfidence, volumetricWeightG } from "@/lib/shipping";
import type { ShippingMethod } from "@/types/shop";
import { t, type I18nKey, type Lang } from "@/lib/i18n";

/** Admin-entered shipping texts are Vietnamese; swap the recurring phrases when the page is in Japanese. */
const JA_PHRASES: Array<[RegExp, string]> = [
  // whole sentences first, then place names, then units
  [/Chuyển phát nội địa Nhật theo cỡ kiện \(size = dài\+rộng\+cao, cm\)\./g, "日本国内の宅配便。サイズ＝縦+横+高さ（cm）。"], [/Chuyển phát nội địa Nhật\./g, "日本国内の宅配便。"],
  [/Bưu điện Nhật, gửi tại bưu cục hoặc combini\./g, "日本郵便。郵便局またはコンビニから発送。"],
  [/Khách \/ người mua tự mang hàng tới kho gom, không tính phí\./g, "お客様が集荷倉庫へ直接持ち込み。無料。"], [/LienStore tới tận nhà gom hàng trong bán kính 30 km, từ 20 kg trở lên\./g, "倉庫から30km圏内・20kg以上はLienStoreが集荷に伺います。"],
  [/Gom đơn hàng tuần và gửi về Việt Nam\. Phí tính theo cân nặng thực tế sau khi đóng gói\./g, "毎週まとめてベトナムへ発送。料金は梱包後の実重量で計算します。"],
  [/Gửi thẳng từ bưu điện Nhật về địa chỉ Việt Nam, 3–6 ngày, có mã theo dõi\./g, "日本郵便からベトナムの住所へ直送、3〜6日、追跡番号付き。"],
  [/Từ kho Thanh Hóa giao tới tận nhà qua đơn vị vận chuyển\. Phí tính theo khu vực nhận hàng\./g, "タインホア倉庫から配送業者でご自宅へ。料金は配送地域によります。"],
  [/Từ kho Thanh Hóa gửi qua bưu điện, phù hợp vùng xa\./g, "タインホア倉庫から郵便で発送。遠隔地向け。"],
  [/Áp dụng trong bán kính 30 km quanh kho Nhật, đơn từ 20 kg/g, "日本倉庫から30km圏内、20kg以上の注文に適用"],
  [/Hàng lỏng \/ bình xịt \/ cồng kềnh/g, "液体・スプレー・大型品"], [/Giao hàng nội địa Việt Nam/g, "ベトナム国内配送"], [/Vận chuyển Nhật Bản → Việt Nam/g, "日本→ベトナム輸送"],
  [/Toàn Nhật Bản/g, "日本全国"], [/Toàn Việt Nam/g, "ベトナム全国"], [/Toàn quốc/g, "全国"], [/Miền Bắc/g, "北部"], [/Miền Trung/g, "中部"], [/Miền Nam/g, "南部"],
  [/TP Hồ Chí Minh|TP HCM/g, "ホーチミン市"], [/Hà Nội/g, "ハノイ"], [/Tây Nguyên/g, "中部高原"], [/Kho Thanh Hóa/g, "タインホア倉庫"], [/Thanh Hóa/g, "タインホア"],
  [/Về kho Nhật:/g, "日本倉庫へ:"], [/Kho Việt Nam:/g, "ベトナム倉庫:"], [/Kho Nhật/g, "日本倉庫"], [/các tỉnh/gi, "各省"], [/ và /g, "・"],
  [/(\d+)\s*[–-]\s*(\d+)\s*ngày/g, "$1〜$2日"], [/(\d+)\s*ngày/g, "$1日"], [/(\d+)\s*[–-]\s*(\d+)\s*tuần/g, "$1〜$2週間"], [/(\d+)\s*tuần/g, "$1週間"], [/từ khi gom đủ đơn/g, "（集荷後）"],
  [/Theo lịch hẹn/g, "要予約"], [/Hẹn giờ qua Zalo/g, "Zaloで時間予約"], [/Đường bay/g, "航空便"], [/Đường biển/g, "船便"], [/Miễn phí/g, "無料"], [/Từ 20 kg, trong 30 km/g, "20kg以上・30km圏内"],
];
export function jaText(s: string, lang: Lang): string {
  if (lang !== "ja" || !s) return s;
  return JA_PHRASES.reduce((acc, [re, rep]) => acc.replace(re, rep), s);
}
import { getLang } from "@/lib/lang-server";

interface Props {
  methods: ShippingMethod[];
  notes: string[];
  /** Compact = inside the product tabs (smaller heading). */
  compact?: boolean;
  /** Product weight (grams) and dimensions ("DxRxC" cm) → per-zone fee estimate for weight-based zones. */
  weightG?: number | null;
  dimsCm?: string | null;
  dimsConfidence?: DimsConfidence | null;
  /** Show the safety-factor / billable-weight explanation (back office only). */
  admin?: boolean;
  /** Shop free-shipping policy card shown above the tables (only renders when enabled). */
  policy?: ShipPolicy;
}

const th = "border border-lien-line bg-lien-footer2 px-3 py-2.5 text-center text-[13px] font-bold text-lien-heading";
const td = "border border-lien-line px-3 py-2.5 text-center text-[13px] leading-5 text-lien-text";

function Fee({ amount, unit, currency, freeOver, plus, tier }: { amount: number; unit: string; currency: string; freeOver: number | null; plus?: boolean; tier?: { baseG: number; stepG: number; stepFee: number } | null }) {
  return (
    <>
      <span className="font-semibold text-lien-heading">
        {plus ? "+" : ""}
        {formatAmount(amount)}
        {currency}
        {unit}
      </span>
      {tier ? (
        <span className="block text-[12px] text-lien-muted">
          ≤ {formatAmount(tier.baseG)} g · +{formatAmount(tier.stepFee)}
          {currency}/{formatAmount(tier.stepG)} g
        </span>
      ) : null}
      {freeOver ? (
        <span className="block text-[12px] text-lien-sale-text">
          <T k="freeOverPrefix" /> {formatAmount(freeOver)}
          {currency}
        </span>
      ) : null}
    </>
  );
}

function Chip({ ok, yes, no }: { ok: boolean; yes: string; no: string }) {
  return (
    <span className={"inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold " + (ok ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700")}>
      <Fa name={ok ? "check-circle" : "info-circle"} /> {ok ? yes : no}
    </span>
  );
}

/**
 * Shipping fee tables grouped by leg (JP domestic → JP→VN → VN domestic). One table per method: columns = zones /
 * weight tiers, rows = base fee, optional surcharge, areas, delivery time (+ an estimate row when the product weight is known).
 */
export async function ShippingTable({ methods, notes, compact = false, weightG = null, dimsCm = null, dimsConfidence = null, admin = false, policy }: Props) {
  const lang = await getLang();
  const known = weightG !== null || dimsCm !== null;
  const chargeable = known ? billableProductWeightG(weightG, dimsCm, dimsConfidence) : null;
  const volumetric = volumetricWeightG(dimsCm);
  const showNumbers = dimsConfidence === "high";
  if (methods.length === 0 && notes.length === 0) {
    return <p className="m-0 text-[14px] text-lien-muted">{t(lang, "noShippingInfo")}</p>;
  }
  const legs = SHIPPING_LEGS.filter((l) => methods.some((m) => m.leg === l.key));
  const hTitle = compact ? "m-0 mb-1 text-[15px] font-bold text-lien-blue" : "m-0 mb-1 text-[18px] font-bold text-lien-blue";

  return (
    <div className="space-y-10">
      {chargeable && admin ? (
        <p className="m-0 rounded-md border border-lien-blue/30 bg-lien-blue-soft/60 px-3 py-2 text-[13px] leading-5 text-lien-text">
          <Fa name="cube" className="mr-1 text-lien-blue" />
          {showNumbers ? (
            <>
              {t(lang, "estThis")}{weightG ? ` ${t(lang, "estWeighs")} ${formatAmount(weightG)} g` : ""}
              {dimsCm ? ` · ${t(lang, "estDims")} ${dimsCm.replace(/x/g, " × ")} cm` : ""}
              {volumetric && weightG && volumetric > weightG ? ` · ${t(lang, "estVolumetric")} ${formatAmount(volumetric)} g` : ""}.
            </>
          ) : (
            <>{t(lang, "estUnconfirmed")} ×{safetyFactor(dimsConfidence)}.</>
          )}{" "}
          {t(lang, "estColumns1")} <strong>{billableKg(chargeable)} kg</strong> {t(lang, "estColumns2")} {formatAmount(chargeable)} g{lang === "ja" ? "" : ","} {t(lang, "estColumns3")}
        </p>
      ) : null}

      {policy ? <ShipPolicyCard policy={policy} /> : null}

      {legs.map((leg) => (
        <section key={leg.key} aria-labelledby={`leg-${leg.key}`}>
          <h3 id={`leg-${leg.key}`} className={compact ? "m-0 mb-3 text-[16px] font-bold uppercase tracking-[0.3px] text-lien-heading" : "m-0 mb-3 text-[20px] font-bold uppercase tracking-[0.3px] text-lien-heading"}>
            <Fa name={leg.key === "vn_domestic" ? "truck" : leg.key === "jp_vn" ? "plane" : "cube"} className="mr-2 text-lien-blue" />
            {t(lang, `leg_${leg.key}` as I18nKey)}
          </h3>
          <div className="space-y-6">
            {methods
              .filter((m) => m.leg === leg.key)
              .map((m) => <MethodTable key={m.id} m={m} hTitle={hTitle} chargeable={chargeable} lang={lang} />)}
          </div>
        </section>
      ))}

      {notes.length ? (
        <section aria-labelledby="ship-notes">
          <h3 id="ship-notes" className="m-0 mb-2 text-[15px] font-bold text-lien-success">
            {t(lang, "shipNotes")}
          </h3>
          <ul className="m-0 list-disc space-y-1 pl-5 text-[13px] leading-5 text-lien-text">
            {notes.map((n, i) => (
              <li key={i}>{jaText(n, lang)}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function MethodTable({ m, hTitle, chargeable, lang }: { m: ShippingMethod; hTitle: string; chargeable: number | null; lang: Lang }) {
  const zones = m.zones;
  const hasExtra = m.extraLabel && zones.some((z) => z.extraFee !== null);
  const estimates = zones.map((z) => estimateZoneFee(z, chargeable));
  const hasEstimate = estimates.some((e) => e !== null);
  const methodNotes = m.notes.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  return (
    <div className="rounded-md border border-lien-line bg-white p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h4 className={hTitle}>{jaText(m.name, lang)}</h4>
        {m.carrierName ? <span className="rounded-full bg-lien-heading px-2.5 py-0.5 text-[11px] font-semibold text-white">{m.carrierName}</span> : null}
        <Chip ok={m.includesBothEnds} yes={t(lang, "bothEndsYes")} no={t(lang, "bothEndsNo")} />
        <Chip ok={m.homeDelivery} yes={t(lang, "homeYes")} no={t(lang, "homeNo")} />
        {m.carrierWebsite ? (
          <a href={m.carrierWebsite} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-[12px] font-semibold text-lien-blue no-underline hover:underline">
            <Fa name="external-link" /> {t(lang, "officialRates")}
          </a>
        ) : null}
      </div>
      {m.description ? <p className="m-0 mb-2 text-[13px] leading-5 text-lien-muted">{jaText(m.description, lang)}</p> : null}
      {m.warehouse ? (
        <p className="m-0 mb-3 text-[13px] leading-5 text-lien-text">
          <Fa name="map-marker" className="mr-1 text-lien-blue" />
          <span className="font-semibold">{t(lang, "warehouse")}</span> {jaText(m.warehouse, lang)}
        </p>
      ) : null}
      {zones.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse">
            <thead>
              <tr>
                <th className={th}>{t(lang, "colInfo")}</th>
                {zones.map((z) => (
                  <th key={z.id} className={th}>
                    {jaText(z.name, lang)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th className={`${th} text-left`}>{t(lang, "colFee")}</th>
                {zones.map((z) => (
                  <td key={z.id} className={td}>
                    <Fee amount={z.fee} unit={z.unit} currency={m.currency} freeOver={z.freeOver} tier={isTiered(z) ? { baseG: z.baseG as number, stepG: z.stepG as number, stepFee: z.stepFee as number } : null} />
                  </td>
                ))}
              </tr>
              {hasExtra ? (
                <tr>
                  <th className={`${th} text-left`}>{jaText(m.extraLabel, lang)}</th>
                  {zones.map((z) => (
                    <td key={z.id} className={td}>
                      {z.extraFee !== null ? <Fee amount={z.extraFee} unit={z.unit} currency={m.currency} freeOver={z.extraFreeOver} plus /> : "-"}
                    </td>
                  ))}
                </tr>
              ) : null}
              {hasEstimate ? (
                <tr className="bg-lien-blue-soft/50">
                  <th className={`${th} text-left`}>{t(lang, "colEstimate")}</th>
                  {zones.map((z, i) => (
                    <td key={z.id} className={`${td} font-bold text-lien-price`}>
                      {estimates[i] !== null ? `≈ ${formatAmount(estimates[i] as number)}${m.currency}` : "-"}
                    </td>
                  ))}
                </tr>
              ) : null}
              <tr>
                <th className={`${th} text-left`}>{t(lang, "colArea")}</th>
                {zones.map((z) => (
                  <td key={z.id} className={td}>
                    {jaText(z.areas, lang) || "-"}
                  </td>
                ))}
              </tr>
              <tr>
                <th className={`${th} text-left`}>{t(lang, "colEta")}</th>
                {zones.map((z) => (
                  <td key={z.id} className={td}>
                    {jaText(z.eta, lang) || "-"}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <p className="m-0 text-[13px] text-lien-muted">{t(lang, "contactForQuote")}</p>
      )}
      {methodNotes.length ? (
        <ul className="m-0 mt-3 list-disc space-y-0.5 pl-5 text-[12px] leading-5 text-lien-muted">
          {methodNotes.map((n0, i) => (
            <li key={i}>{jaText(n0, lang)}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
