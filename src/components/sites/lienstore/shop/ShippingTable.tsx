import { Fa } from "@/components/sites/lienstore/shared/icons";
import { formatAmount } from "@/lib/format";
import { billableKg, chargeableWeightG, estimateZoneFee, SHIPPING_LEGS, volumetricWeightG, type ShippingLeg } from "@/lib/shipping";
import type { ShippingMethod } from "@/types/shop";

interface Props {
  methods: ShippingMethod[];
  notes: string[];
  /** Compact = inside the product tabs (smaller heading). */
  compact?: boolean;
  /** Product weight (grams) and dimensions ("DxRxC" cm) → per-zone fee estimate for weight-based zones. */
  weightG?: number | null;
  dimsCm?: string | null;
}

const th = "border border-lien-line bg-lien-footer2 px-3 py-2.5 text-center text-[13px] font-bold text-lien-heading";
const td = "border border-lien-line px-3 py-2.5 text-center text-[13px] leading-5 text-lien-text";

function Fee({ amount, unit, currency, freeOver, plus }: { amount: number; unit: string; currency: string; freeOver: number | null; plus?: boolean }) {
  return (
    <>
      <span className="font-semibold text-lien-heading">
        {plus ? "+" : ""}
        {formatAmount(amount)}
        {currency}
        {unit}
      </span>
      {freeOver ? (
        <span className="block text-[12px] text-lien-sale-text">
          Miễn phí trên {formatAmount(freeOver)}
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
export function ShippingTable({ methods, notes, compact = false, weightG = null, dimsCm = null }: Props) {
  const chargeable = chargeableWeightG(weightG, dimsCm);
  const volumetric = volumetricWeightG(dimsCm);
  if (methods.length === 0 && notes.length === 0) {
    return <p className="m-0 text-[14px] text-lien-muted">Chưa có thông tin vận chuyển. Vui lòng liên hệ Zalo 0964 839 769 để được báo phí.</p>;
  }
  const legs = SHIPPING_LEGS.filter((l) => methods.some((m) => m.leg === l.key));
  const hTitle = compact ? "m-0 mb-1 text-[15px] font-bold text-lien-blue" : "m-0 mb-1 text-[18px] font-bold text-lien-blue";

  return (
    <div className="space-y-10">
      {chargeable ? (
        <p className="m-0 rounded-md border border-lien-blue/30 bg-lien-blue-soft/60 px-3 py-2 text-[13px] leading-5 text-lien-text">
          <Fa name="cube" className="mr-1 text-lien-blue" />
          Sản phẩm này{weightG ? ` nặng khoảng ${formatAmount(weightG)} g` : ""}
          {dimsCm ? ` · kích thước ${dimsCm} cm` : ""}
          {volumetric && weightG && volumetric > weightG ? ` · cân nặng quy đổi theo thể tích ${formatAmount(volumetric)} g` : ""}. Các cột tính theo kg bên dưới đã ước tính cho{" "}
          <strong>{billableKg(chargeable)} kg</strong> (làm tròn lên từng kg). Phí thật tính trên cả đơn hàng khi đóng gói.
        </p>
      ) : null}

      {legs.map((leg) => (
        <section key={leg.key} aria-labelledby={`leg-${leg.key}`}>
          <h3 id={`leg-${leg.key}`} className={compact ? "m-0 mb-3 text-[16px] font-bold uppercase tracking-[0.3px] text-lien-heading" : "m-0 mb-3 text-[20px] font-bold uppercase tracking-[0.3px] text-lien-heading"}>
            <Fa name={leg.key === "vn_domestic" ? "truck" : leg.key === "jp_vn" ? "plane" : "cube"} className="mr-2 text-lien-blue" />
            {leg.label}
          </h3>
          <div className="space-y-6">
            {methods
              .filter((m) => m.leg === leg.key)
              .map((m) => <MethodTable key={m.id} m={m} hTitle={hTitle} chargeable={chargeable} />)}
          </div>
        </section>
      ))}

      {notes.length ? (
        <section aria-labelledby="ship-notes">
          <h3 id="ship-notes" className="m-0 mb-2 text-[15px] font-bold text-lien-success">
            Lưu ý về vận chuyển
          </h3>
          <ul className="m-0 list-disc space-y-1 pl-5 text-[13px] leading-5 text-lien-text">
            {notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function MethodTable({ m, hTitle, chargeable }: { m: ShippingMethod; hTitle: string; chargeable: number | null }) {
  const zones = m.zones;
  const hasExtra = m.extraLabel && zones.some((z) => z.extraFee !== null);
  const estimates = zones.map((z) => estimateZoneFee(z, chargeable));
  const hasEstimate = estimates.some((e) => e !== null);
  const methodNotes = m.notes.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  return (
    <div className="rounded-md border border-lien-line bg-white p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h4 className={hTitle}>{m.name}</h4>
        {m.carrierName ? <span className="rounded-full bg-lien-heading px-2.5 py-0.5 text-[11px] font-semibold text-white">{m.carrierName}</span> : null}
        <Chip ok={m.includesBothEnds} yes="Giá đã gồm 2 đầu" no="Chưa gồm ship nội địa 2 đầu" />
        <Chip ok={m.homeDelivery} yes="Giao tận nhà" no="Nhận tại kho / điểm giao" />
      </div>
      {m.description ? <p className="m-0 mb-2 text-[13px] leading-5 text-lien-muted">{m.description}</p> : null}
      {m.warehouse ? (
        <p className="m-0 mb-3 text-[13px] leading-5 text-lien-text">
          <Fa name="map-marker" className="mr-1 text-lien-blue" />
          <span className="font-semibold">Kho:</span> {m.warehouse}
        </p>
      ) : null}
      {zones.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse">
            <thead>
              <tr>
                <th className={th}>Thông tin</th>
                {zones.map((z) => (
                  <th key={z.id} className={th}>
                    {z.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th className={`${th} text-left`}>Phí</th>
                {zones.map((z) => (
                  <td key={z.id} className={td}>
                    <Fee amount={z.fee} unit={z.unit} currency={m.currency} freeOver={z.freeOver} />
                  </td>
                ))}
              </tr>
              {hasExtra ? (
                <tr>
                  <th className={`${th} text-left`}>{m.extraLabel}</th>
                  {zones.map((z) => (
                    <td key={z.id} className={td}>
                      {z.extraFee !== null ? <Fee amount={z.extraFee} unit={z.unit} currency={m.currency} freeOver={z.extraFreeOver} plus /> : "-"}
                    </td>
                  ))}
                </tr>
              ) : null}
              {hasEstimate ? (
                <tr className="bg-lien-blue-soft/50">
                  <th className={`${th} text-left`}>Ước tính cho sản phẩm này</th>
                  {zones.map((z, i) => (
                    <td key={z.id} className={`${td} font-bold text-lien-price`}>
                      {estimates[i] !== null ? `≈ ${formatAmount(estimates[i] as number)}${m.currency}` : "-"}
                    </td>
                  ))}
                </tr>
              ) : null}
              <tr>
                <th className={`${th} text-left`}>Khu vực / điều kiện</th>
                {zones.map((z) => (
                  <td key={z.id} className={td}>
                    {z.areas || "-"}
                  </td>
                ))}
              </tr>
              <tr>
                <th className={`${th} text-left`}>Thời gian</th>
                {zones.map((z) => (
                  <td key={z.id} className={td}>
                    {z.eta || "-"}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <p className="m-0 text-[13px] text-lien-muted">Liên hệ để được báo phí.</p>
      )}
      {methodNotes.length ? (
        <ul className="m-0 mt-3 list-disc space-y-0.5 pl-5 text-[12px] leading-5 text-lien-muted">
          {methodNotes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
