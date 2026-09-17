import { requoteOrderAction, requoteTransferAction } from "@/app/admin/shipping/carrier-actions";
import type { TransferQuote } from "@/lib/ship-quote";
import { saveOrderLegAction } from "@/app/admin/shipping/order-actions";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { formatAmount, formatDateTime } from "@/lib/format";
import { LEG_STATUS_CLS, LEG_STATUS_LABEL, LEG_STATUSES } from "@/lib/leg-status";
import { quoteMethod, SHIPPING_LEGS, type ShippingLeg, type ShippingQuoteConfig, zoneFeeForWeight } from "@/lib/shipping";
import { cn } from "@/lib/utils";
import type { Order, OrderLeg, ShippingMethod } from "@/types/shop";
import { adminInput, btnSecondary } from "./ui";

/** Carrier answers for leg ③ stored by "Báo giá chặng ③" (setting leg3_quotes:<orderId>). */
export interface TransferQuotesView {
  at: string;
  from: string;
  to: string;
  quotes: TransferQuote[];
}

interface Props {
  order: Pick<Order, "id" | "number" | "shippingFee" | "shippingLabel" | "delivery" | "subtotal" | "shipQuote">;
  /** Leg ③ quotes from the carrier APIs, when the admin asked for them. */
  transferQuotes?: TransferQuotesView | null;
  legs: OrderLeg[];
  methods: ShippingMethod[];
  /** Where to return after saving. */
  back: string;
  /** Render as three stacked cards (order page) instead of table cells. */
  stacked?: boolean;
  /** Billable grams of the whole order (max(actual, volumetric) × safety factor per item); drives the ≈ fee hints. */
  weightG?: number;
  /** Default import flow (Công thức giá › Tham số chi phí): pre-selects the method of legs the admin has not touched yet. */
  quote?: ShippingQuoteConfig;
}

const LEG_ICON: Record<ShippingLeg, "cube" | "plane" | "truck" | "building"> = { jp_domestic: "cube", jp_vn: "plane", vn_transfer: "building", vn_domestic: "truck" };
const tiny = `${adminInput} !px-2 !py-1 !text-[12px]`;

/** One editable cell per leg: method·zone select, fee, tracking, note. */
/** What the customer picked at checkout (stored with the order as a JSON snapshot of the carrier quote). */
function customerChoice(order: Props["order"]): { carrierName: string; serviceName: string; fee: number } | null {
  if (order.delivery === "pickup") return null;
  try {
    const q = order.shipQuote ? (JSON.parse(order.shipQuote) as { carrierName?: string; serviceName?: string; totalFeeVnd?: number | null }) : null;
    if (q?.carrierName) return { carrierName: q.carrierName, serviceName: q.serviceName ?? "", fee: q.totalFeeVnd ?? order.shippingFee };
  } catch {
    /* no snapshot */
  }
  return order.shippingLabel ? { carrierName: order.shippingLabel, serviceName: "", fee: order.shippingFee } : null;
}
const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export function OrderLegCell({ order, leg, current, methods, back, weightG, quote, transferQuotes }: { order: Props["order"]; leg: ShippingLeg; current: OrderLeg | undefined; methods: ShippingMethod[]; back: string; weightG?: number; quote?: ShippingQuoteConfig; transferQuotes?: TransferQuotesView | null }) {
  const fid = `ol-${order.id}-${leg}`;
  const options = methods.filter((m) => m.leg === leg);
  // legs never edited by the admin start on the default flow (Japan Post → Kiến Express → Viettel Post) for this order's weight
  const defMethod = quote ? (leg === "jp_domestic" ? quote.jpDomestic : leg === "jp_vn" ? quote.jpVn : leg === "vn_transfer" ? quote.vnTransfer : null) : null;
  const preset = !current && defMethod ? quoteMethod(defMethod, leg, weightG ?? 1000, order.subtotal, quote?.jpyRate ?? 175) : null;
  // ④: the customer already chose a carrier at checkout — that is the default; the admin only changes it on request
  const chosen = leg === "vn_domestic" && !current ? customerChoice(order) : null;
  // the label may read "Vietnam Post (VNPost) · Chuyển phát tiêu chuẩn" or "Miền Nam · Viettel Post": match on the carrier's first word
  const chosenMethod = chosen
    ? options.find((m) => {
        const key = fold(m.carrierName ?? m.name).split(/[\s(·:]+/).find((w) => w.length >= 3);
        return !!key && fold(chosen.carrierName).includes(key);
      })
    : undefined;
  const value = current?.methodId ? `m:${current.methodId}:${current.zoneId ?? "-"}` : chosenMethod ? `m:${chosenMethod.id}:${chosenMethod.zones[0]?.id ?? "-"}` : preset ? `m:${preset.methodId}:${preset.zoneId}` : "";
  // VN domestic: every option shows the fee this order would cost (weight steps / per kg), so the admin can compare carriers
  const est = (m: ShippingMethod, z: ShippingMethod["zones"][number]) =>
    leg === "vn_domestic" && weightG && /đ|vnd/i.test(m.currency) ? ` ≈ ${formatAmount(z.freeOver !== null && order.subtotal >= z.freeOver ? 0 : zoneFeeForWeight(z, weightG))}đ` : "";
  const form = (
    <form id={fid} action={saveOrderLegAction} className="min-w-[230px] space-y-1.5">
      <input type="hidden" name="orderId" value={order.id} />
      <input type="hidden" name="leg" value={leg} />
      <input type="hidden" name="back" value={back} />
      <select name="choice" defaultValue={value} className={tiny} aria-label="Phương thức">
        <option value="">— Chưa chọn —</option>
        {options.map((m) =>
          m.zones.length ? (
            <optgroup key={m.id} label={`${m.name}${m.carrierName ? ` · ${m.carrierName}` : ""}`}>
              {m.zones.map((z) => (
                <option key={z.id} value={`m:${m.id}:${z.id}`}>
                  {z.name} — {formatAmount(z.fee)}
                  {m.currency}
                  {z.unit}
                  {est(m, z)}
                </option>
              ))}
            </optgroup>
          ) : (
            <option key={m.id} value={`m:${m.id}:-`}>
              {m.name}
              {m.carrierName ? ` · ${m.carrierName}` : ""}
            </option>
          ),
        )}
      </select>
      <div className="flex gap-1.5">
        <input name="fee" defaultValue={current ? formatAmount(current.fee) : chosen ? formatAmount(chosen.fee) : ""} inputMode="numeric" placeholder={preset ? `≈ ${formatAmount(preset.fee)}đ` : "Phí (trống = tự tính)"} className={cn(tiny, "w-[120px]")} aria-label="Phí" />
        <input name="tracking" defaultValue={current?.tracking ?? ""} placeholder="Mã vận đơn" className={cn(tiny, "flex-1")} aria-label="Mã vận đơn" />
      </div>
      <div className="flex items-center gap-1.5">
        <select name="status" defaultValue={current?.status ?? "pending"} className={cn(tiny, "w-[104px] shrink-0 font-semibold", LEG_STATUS_CLS[current?.status ?? "pending"])} aria-label="Trạng thái chặng" title="Trạng thái của chặng này: chưa gửi → đã gửi → đã đến. Đổi rồi bấm ✓ — sản phẩm trong đơn và tiến độ đơn tự cập nhật theo.">
          {LEG_STATUSES.map((s) => (
            <option key={s} value={s}>
              {LEG_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <input name="note" defaultValue={current?.note ?? ""} placeholder="Ghi chú" className={cn(tiny, "flex-1")} aria-label="Ghi chú" />
        <button type="submit" className={`${btnSecondary} !px-2 !py-1 !text-[12px]`} title="Lưu">
          <Fa name="check" />
        </button>
      </div>
      {current?.sentAt || current?.arrivedAt ? (
        <p className="m-0 text-[11px] text-lien-muted">
          {current.sentAt ? `Gửi ${formatDateTime(current.sentAt)}` : ""}
          {current.sentAt && current.arrivedAt ? " · " : ""}
          {current.arrivedAt ? `Đến ${formatDateTime(current.arrivedAt)}` : ""}
        </p>
      ) : null}
      {leg === "vn_domestic" && weightG ? <p className="m-0 text-[11px] text-lien-muted">Cân tính phí của đơn: {formatAmount(weightG)} g (đã nhân hệ số an toàn theo độ tin cậy kích thước)</p> : null}
      {leg === "vn_domestic" ? (
        <label className="flex items-center gap-1.5 text-[11px] text-lien-muted">
          <input type="checkbox" name="applyToCustomer" defaultChecked className="h-3.5 w-3.5" /> Áp phí vào đơn khách (hiện: {order.delivery === "pickup" ? "nhận tại kho" : order.shippingLabel || "—"} · {formatAmount(order.shippingFee)}đ)
        </label>
      ) : null}
      {current?.label ? (
        <p className="m-0 text-[11px] text-lien-muted">Đang chọn: {current.label}</p>
      ) : chosen ? (
        <p className="m-0 text-[11px] text-lien-muted">
          Khách đã chọn: <strong className="text-lien-heading">{chosen.carrierName}{chosen.serviceName ? ` · ${chosen.serviceName}` : ""}</strong> · {formatAmount(chosen.fee)}đ — mặc định theo khách; chỉ đổi khi khách yêu cầu. Bấm ✓ để ghi vào đơn.
        </p>
      ) : preset ? (
        <p className="m-0 text-[11px] text-lien-muted">Mặc định theo luồng nhập hàng — bấm ✓ để ghi vào đơn, hoặc đổi rồi lưu.</p>
      ) : null}
    </form>
  );
  if (leg !== "vn_transfer") return form;
  // ③: the static tariff above, or a live carrier quote for this parcel (Hà Nội → Thanh Hóa) — pick the cheapest
  return (
    <>
      {form}
      <div className="mt-2 rounded-md border border-dashed border-[#d1d5db] p-2" data-testid="transfer-quotes">
        <form action={requoteTransferAction} className="flex items-center justify-between gap-2">
          <input type="hidden" name="orderId" value={order.id} />
          <input type="hidden" name="back" value={back} />
          <span className="text-[11px] text-lien-muted">{transferQuotes ? `Báo giá ${new Date(transferQuotes.at).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour12: false })}` : "Chưa hỏi giá hãng cho chặng này"}</span>
          <button type="submit" className={`${btnSecondary} !px-2 !py-1 !text-[11px]`} title="Hỏi cước các hãng (Goship / GHN…) cho kiện của đơn từ kho ĐVVC Hà Nội về kho shop Thanh Hóa">
            <Fa name="refresh" /> Báo giá chặng ③
          </button>
        </form>
        {transferQuotes?.quotes.length ? (
          <ul className="m-0 mt-1.5 list-none space-y-1 p-0">
            {transferQuotes.quotes.map((q) => (
              <li key={`${q.carrier}-${q.serviceCode}`} className="flex items-center justify-between gap-2 text-[12px]">
                <span className={q.available ? "text-lien-text" : "text-lien-muted"}>
                  {q.carrierName}
                  {q.serviceName ? ` · ${q.serviceName}` : ""}
                  {q.available && q.fee !== null ? <strong className="ml-1 text-lien-heading">{q.fromPrice ? "từ " : ""}{formatAmount(q.fee)}đ</strong> : <span className="ml-1">{q.statusText}</span>}
                  {q.eta ? <span className="ml-1 text-lien-muted">· {q.eta}</span> : null}
                </span>
                {q.available && q.fee !== null ? (
                  <form action={saveOrderLegAction}>
                    <input type="hidden" name="orderId" value={order.id} />
                    <input type="hidden" name="leg" value="vn_transfer" />
                    <input type="hidden" name="back" value={back} />
                    <input type="hidden" name="choice" value="" />
                    <input type="hidden" name="fee" value={q.fee} />
                    <input type="hidden" name="label" value={`${q.carrierName}${q.serviceName ? ` · ${q.serviceName}` : ""} (báo giá API)`} />
                    <input type="hidden" name="tracking" value={current?.tracking ?? ""} />
                    <input type="hidden" name="note" value={current?.note ?? ""} />
                    <button type="submit" className="rounded border border-lien-blue px-2 py-0.5 text-[11px] font-semibold text-lien-blue hover:bg-lien-blue-soft">
                      Chọn
                    </button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </>
  );
}

/** "Báo giá lại" for the VN leg: fresh quotes from every carrier for the order's address and parcel (before the waybill). */
export function RequoteButton({ orderId, back }: { orderId: string; back: string }) {
  return (
    <form action={requoteOrderAction} className="mt-1.5">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="back" value={back} />
      <button type="submit" className={`${btnSecondary} !px-2 !py-1 !text-[12px]`} title="Lấy cước mới nhất của các hãng cho địa chỉ và kiện hàng của đơn; không tự đổi tiền khách">
        <Fa name="refresh" /> Báo giá lại cước nội địa
      </button>
    </form>
  );
}

/** The legs of one order, as stacked cards (order detail page). */
export function OrderLegsEditor({ order, legs, methods, back, weightG, quote, transferQuotes = null }: Props) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {SHIPPING_LEGS.map((l) => (
        <div key={l.key} className="rounded-md border border-[#e5e7eb] p-3">
          <p className="m-0 mb-2 text-[13px] font-semibold text-lien-heading">
            <Fa name={LEG_ICON[l.key]} className="mr-1 text-lien-blue" />
            {l.label}
          </p>
          <OrderLegCell order={order} leg={l.key} current={legs.find((x) => x.leg === l.key)} methods={methods} back={back} weightG={weightG} quote={quote} transferQuotes={l.key === "vn_transfer" ? transferQuotes : null} />
          {l.key === "vn_domestic" && order.delivery === "ship" ? <RequoteButton orderId={order.id} back={back} /> : null}
        </div>
      ))}
    </div>
  );
}
