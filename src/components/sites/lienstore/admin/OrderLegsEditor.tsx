import { saveOrderLegAction } from "@/app/admin/shipping/order-actions";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { formatAmount } from "@/lib/format";
import { SHIPPING_LEGS, type ShippingLeg } from "@/lib/shipping";
import { cn } from "@/lib/utils";
import type { Order, OrderLeg, ShippingMethod } from "@/types/shop";
import { adminInput, btnSecondary } from "./ui";

interface Props {
  order: Pick<Order, "id" | "number" | "shippingFee" | "shippingLabel" | "delivery" | "subtotal">;
  legs: OrderLeg[];
  methods: ShippingMethod[];
  /** Where to return after saving. */
  back: string;
  /** Render as three stacked cards (order page) instead of table cells. */
  stacked?: boolean;
}

const LEG_ICON: Record<ShippingLeg, "cube" | "plane" | "truck"> = { jp_domestic: "cube", jp_vn: "plane", vn_domestic: "truck" };
const tiny = `${adminInput} !px-2 !py-1 !text-[12px]`;

/** One editable cell per leg: method·zone select, fee, tracking, note. */
export function OrderLegCell({ order, leg, current, methods, back }: { order: Props["order"]; leg: ShippingLeg; current: OrderLeg | undefined; methods: ShippingMethod[]; back: string }) {
  const fid = `ol-${order.id}-${leg}`;
  const options = methods.filter((m) => m.leg === leg);
  const value = current?.methodId ? `m:${current.methodId}:${current.zoneId ?? "-"}` : "";
  return (
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
        <input name="fee" defaultValue={current ? formatAmount(current.fee) : ""} inputMode="numeric" placeholder="Phí (trống = tự tính)" className={cn(tiny, "w-[120px]")} aria-label="Phí" />
        <input name="tracking" defaultValue={current?.tracking ?? ""} placeholder="Mã vận đơn" className={cn(tiny, "flex-1")} aria-label="Mã vận đơn" />
      </div>
      <div className="flex items-center gap-1.5">
        <input name="note" defaultValue={current?.note ?? ""} placeholder="Ghi chú" className={cn(tiny, "flex-1")} aria-label="Ghi chú" />
        <button type="submit" className={`${btnSecondary} !px-2 !py-1 !text-[12px]`} title="Lưu">
          <Fa name="check" />
        </button>
      </div>
      {leg === "vn_domestic" ? (
        <label className="flex items-center gap-1.5 text-[11px] text-lien-muted">
          <input type="checkbox" name="applyToCustomer" defaultChecked className="h-3.5 w-3.5" /> Áp phí vào đơn khách (hiện: {order.delivery === "pickup" ? "nhận tại kho" : order.shippingLabel || "—"} · {formatAmount(order.shippingFee)}đ)
        </label>
      ) : null}
      {current?.label ? <p className="m-0 text-[11px] text-lien-muted">Đang chọn: {current.label}</p> : null}
    </form>
  );
}

/** Three legs of one order, as stacked cards (order detail page). */
export function OrderLegsEditor({ order, legs, methods, back }: Props) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {SHIPPING_LEGS.map((l) => (
        <div key={l.key} className="rounded-md border border-[#e5e7eb] p-3">
          <p className="m-0 mb-2 text-[13px] font-semibold text-lien-heading">
            <Fa name={LEG_ICON[l.key]} className="mr-1 text-lien-blue" />
            {l.label}
          </p>
          <OrderLegCell order={order} leg={l.key} current={legs.find((x) => x.leg === l.key)} methods={methods} back={back} />
        </div>
      ))}
    </div>
  );
}
