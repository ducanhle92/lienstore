import type { ReactNode } from "react";
import { Fa, type FaName } from "@/components/sites/lienstore/shared/icons";
import { cn } from "@/lib/utils";

export type ChipTone = "gray" | "blue" | "amber" | "green" | "red";
const TONE: Record<ChipTone, string> = {
  gray: "border-[#e5e7eb] bg-white text-lien-heading",
  blue: "border-sky-200 bg-sky-50 text-sky-900",
  amber: "border-amber-200 bg-amber-50 text-amber-900",
  green: "border-green-200 bg-green-50 text-green-900",
  red: "border-red-200 bg-red-50 text-red-900",
};

/** One labelled figure in a small bordered pill (icon · bold value · label), like the parcel weight badge. */
export function StatChip({ icon, value, label, tone = "gray", className, title, testId, hidden = false, dataKey }: { icon?: FaName; value: ReactNode; label?: ReactNode; tone?: ChipTone; className?: string; title?: string; testId?: string; hidden?: boolean; /** data-k hook for scripts that rewrite the value (LiveTotals). */ dataKey?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 text-[12px] leading-5", TONE[tone], hidden && "hidden", className)} title={title} data-testid={testId} data-k={dataKey}>
      {icon ? <Fa name={icon} className="opacity-70" /> : null}
      <b className="font-semibold">{value}</b>
      {label ? <span className="opacity-80">{label}</span> : null}
    </span>
  );
}

/** A wrapping row of chips, optionally led by a bold caption ("Tổng cộng"). */
export function StatChips({ caption, children, className, testId }: { caption?: ReactNode; children: ReactNode; className?: string; testId?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5 text-[13px] text-lien-heading", className)} data-testid={testId}>
      {caption ? <b className="mr-1">{caption}</b> : null}
      {children}
    </div>
  );
}
