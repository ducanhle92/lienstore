import Link from "next/link";
import { Fa, type FaName } from "@/components/sites/lienstore/shared/icons";
import type { FlowCounts, FlowStep } from "@/lib/flow-db";
import { cn } from "@/lib/utils";

interface Step {
  key: FlowStep;
  n: string;
  label: string;
  href: string;
  icon: FaName;
  value: (c: FlowCounts) => string;
}

export const FLOW_STEPS: Step[] = [
  { key: "buy", n: "1", label: "Mua hàng", href: "/admin/purchases/", icon: "shopping-basket", value: (c) => `${c.openBatches} đợt mở${c.toBuy ? ` · ${c.toBuy} đv chưa mua` : ""}` },
  { key: "jp", n: "2", label: "Tồn kho Nhật", href: "/admin/inventory/?side=jp", icon: "archive", value: (c) => `${c.jp} đv trên kệ` },
  { key: "pack", n: "3", label: "Đóng hàng", href: "/admin/inventory/shipments/", icon: "cube", value: (c) => `${c.pack} đv · ${c.packRuns} chuyến` },
  { key: "transit", n: "4", label: "Vận chuyển", href: "/admin/inventory/shipments/?stage=transit", icon: "truck", value: (c) => `${c.transit} đv · ${c.transitRuns} chuyến` },
  { key: "vn", n: "5", label: "Tồn kho VN", href: "/admin/inventory/?side=vn", icon: "building", value: (c) => `${c.vn} đv` },
];

/** The five-step import flow as a bar on top of each step's page; the current step is highlighted. */
export function FlowSteps({ current, counts }: { current: FlowStep | null; counts: FlowCounts }) {
  return (
    <nav aria-label="Quy trình nhập hàng" className="mb-4 overflow-x-auto" data-testid="flow-steps">
      <ol className="m-0 flex min-w-max list-none items-stretch gap-1 p-0">
        {FLOW_STEPS.map((s, i) => {
          const on = s.key === current;
          return (
            <li key={s.key} className="flex items-center gap-1">
              {i > 0 ? <Fa name="angle-right" className="text-[#9ca3af]" /> : null}
              <Link
                href={s.href}
                aria-current={on ? "step" : undefined}
                className={cn("flex items-center gap-2 rounded-md border px-3 py-1.5 no-underline", on ? "border-lien-blue bg-lien-blue text-white" : "border-[#e5e7eb] bg-white text-lien-heading hover:border-lien-blue")}
                data-step={s.key}
              >
                <span className={cn("grid h-5 w-5 place-items-center rounded-full text-[11px] font-bold", on ? "bg-white text-lien-blue" : "bg-[#f3f4f6] text-lien-muted")}>{s.n}</span>
                <span className="flex flex-col leading-tight">
                  <span className="text-[13px] font-semibold">
                    <Fa name={s.icon} /> {s.label}
                  </span>
                  <span className={cn("text-[11px]", on ? "text-white/85" : "text-lien-muted")}>{s.value(counts)}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
