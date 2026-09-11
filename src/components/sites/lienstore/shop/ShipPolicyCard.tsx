import { Fa } from "@/components/sites/lienstore/shared/icons";
import type { ShipPolicy } from "@/lib/ship-policy";
import { REGION_LABEL, type VnRegion } from "@/lib/vn-regions";
import { cn } from "@/lib/utils";

/** Customer-facing box for the shop's free-shipping policy; renders nothing while the policy is switched off. */
export function ShipPolicyCard({ policy, className }: { policy: ShipPolicy; className?: string }) {
  if (!policy.enabled) return null;
  const rows = (Object.keys(REGION_LABEL) as VnRegion[]).filter((r) => policy.thresholds[r]);
  return (
    <section className={cn("rounded-md border border-lien-success/40 bg-[#f4fbe8] p-4", className)} aria-label={policy.title}>
      <h3 className="m-0 mb-1 flex items-center gap-2 text-[15px] font-bold text-lien-success">
        <Fa name="gift" /> {policy.title}
      </h3>
      {policy.text ? <p className="m-0 mb-2 text-[13px] leading-5 text-lien-text">{policy.text}</p> : null}
      {rows.length ? (
        <ul className="m-0 flex list-none flex-wrap gap-x-5 gap-y-1 p-0 text-[13px] text-lien-text">
          {rows.map((r) => (
            <li key={r}>
              <Fa name="check-circle" className="mr-1 text-lien-success" />
              {REGION_LABEL[r]}: đơn từ <strong>{policy.thresholds[r]!.toLocaleString("vi-VN")}đ</strong>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
