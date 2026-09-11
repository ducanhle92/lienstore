import { Fa } from "@/components/sites/lienstore/shared/icons";
import { T } from "@/components/sites/lienstore/shared/LangProvider";
import { formatAmount } from "@/lib/format";
import type { Order, OrderLeg } from "@/types/shop";

/** Customers only see the Vietnam leg of the shipping label — the Japan legs are included in product prices. */
export function vnLegLabel(label: string): string {
  return label.split(" + ").pop()?.trim() ?? label;
}

const TRACK_LABEL: Record<OrderLeg["leg"], string> = {
  jp_domestic: "Mã vận đơn nội địa Nhật",
  jp_vn: "Mã vận đơn Nhật → Việt Nam",
  vn_transfer: "Mã vận đơn về kho Thanh Hóa",
  vn_domestic: "Mã vận đơn giao tới bạn",
};

/**
 * Mercari-style "配送情報" block: how the parcel is delivered, its fee, the tracking numbers the shop has entered
 * for each leg, and the live carrier quote when one was used.
 */
export function OrderParcel({ order, legs }: { order: Order; legs: OrderLeg[] }) {
  const tracked = legs.filter((l) => l.tracking.trim());
  let quote: { service?: string; carrier?: string } | null = null;
  if (order.shipQuote) {
    try {
      const j = JSON.parse(order.shipQuote) as { service?: { name?: string }; carrier?: string };
      quote = { service: j.service?.name, carrier: j.carrier };
    } catch {
      quote = null;
    }
  }
  const rows: Array<[string, React.ReactNode]> = [
    [
      "Hình thức",
      order.delivery === "pickup" ? "Nhận tại kho LienStore (Hoằng Hóa, Thanh Hóa)" : `Giao tận nhà · ${vnLegLabel(order.shippingLabel) || "đơn vị vận chuyển"}${quote?.service ? ` · ${quote.service}` : ""}`,
    ],
    [
      "Phí giao hàng",
      order.shippingFee > 0 ? (
        <>
          {formatAmount(order.shippingFee)}đ{order.shipFeePayment === "on_delivery" ? <span className="text-lien-muted"> · trả cho shipper khi nhận</span> : null}
        </>
      ) : (
        "Miễn phí"
      ),
    ],
    ...tracked.map((l): [string, React.ReactNode] => [
      TRACK_LABEL[l.leg],
      <span key={l.leg} className="font-mono text-[15px] font-semibold tracking-wide text-lien-heading">
        {l.tracking}
        {l.label ? <span className="ml-2 font-sans text-[12px] font-normal text-lien-muted">({l.label})</span> : null}
      </span>,
    ]),
  ];
  const vn = legs.find((l) => l.leg === "vn_domestic");
  if (vn?.note && !/khách trả phí/i.test(vn.note)) rows.push(["Ghi chú", vn.note]);

  return (
    <section className="rounded-md border border-lien-line bg-white p-4 sm:p-5" aria-label="Thông tin kiện hàng">
      <h2 className="m-0 mb-3 flex items-center gap-2 text-[16px] font-bold text-lien-heading">
        <Fa name="cube" className="text-lien-blue" /> <T k="parcelInfo" />
      </h2>
      <dl className="m-0 grid gap-x-4 gap-y-2 text-[14px] leading-6 sm:grid-cols-[180px_1fr]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-lien-muted">{k}</dt>
            <dd className="m-0 text-lien-text">{v}</dd>
          </div>
        ))}
      </dl>
      {tracked.length === 0 && order.delivery === "ship" ? <p className="m-0 mt-3 text-[13px] leading-5 text-lien-muted">Mã vận đơn sẽ hiện ở đây khi hàng được giao cho đơn vị vận chuyển.</p> : null}
    </section>
  );
}
