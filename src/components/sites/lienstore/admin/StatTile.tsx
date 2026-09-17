import Link from "next/link";
import type { ReactNode } from "react";
import { InfoPopover } from "./InfoPopover";

export type StatTone = "gray" | "blue" | "green" | "red" | "amber";
const VALUE_TONE: Record<StatTone, string> = {
  gray: "text-lien-heading",
  blue: "text-lien-blue",
  green: "text-green-700",
  red: "text-lien-sale-text",
  amber: "text-amber-700",
};

interface StatTileProps {
  label: string;
  /** Big figure — keep it short (compact currency, counts); the exact value goes in `sub`. */
  value: string;
  sub?: string;
  /** Definition / formula shown in the ⓘ popover. */
  info: ReactNode;
  href?: string;
  tone?: StatTone;
  testId?: string;
}

/** One dashboard KPI: label + ⓘ definition, big tabular number that never overflows, one-line detail underneath. */
export function StatTile({ label, value, sub, info, href, tone = "gray", testId }: StatTileProps) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-1">
        <span className="text-[11px] font-bold uppercase leading-4 tracking-wide text-[#6b7280]">{label}</span>
        <InfoPopover className="-mr-1 -mt-0.5 shrink-0">{info}</InfoPopover>
      </div>
      <div className={`mt-2 truncate font-oswald text-[26px] leading-8 tabular-nums ${VALUE_TONE[tone]}`} title={sub ?? value}>
        {value}
      </div>
      <div className="mt-0.5 truncate text-[12px] leading-4 text-lien-muted">{sub ?? " "}</div>
    </>
  );
  const cls = "block min-w-0 rounded-lg border border-[#e5e7eb] bg-white px-4 py-3 no-underline shadow-sm transition-colors";
  return href ? (
    <Link href={href} className={`${cls} hover:border-lien-blue`} data-testid={testId}>
      {body}
    </Link>
  ) : (
    <div className={cls} data-testid={testId}>
      {body}
    </div>
  );
}
