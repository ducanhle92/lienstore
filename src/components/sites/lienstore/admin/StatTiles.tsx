import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type TileAccent = "blue" | "red" | "amber" | "green" | "gray";
const ACCENT: Record<TileAccent, string> = {
  blue: "border-sky-200 bg-sky-50 text-sky-900",
  red: "border-red-200 bg-red-50 text-red-900",
  amber: "border-amber-200 bg-amber-50 text-amber-900",
  green: "border-green-200 bg-green-50 text-green-900",
  gray: "border-[#e5e7eb] bg-white text-lien-heading",
};

/** Compact figure tile (label over value), the smaller cousin of the Tồn kho board tiles — for page-top summaries. */
export function StatTile({ label, value, accent = "gray", href, title, active = false, testId }: { label: string; value: ReactNode; accent?: TileAccent; href?: string; title?: string; /** The view currently shown (ringed). */ active?: boolean; testId?: string }) {
  const cls = cn("block rounded-md border px-2.5 py-1.5", ACCENT[accent], href && "no-underline hover:brightness-95", active && "ring-2 ring-lien-heading/60 ring-offset-1");
  const body = (
    <>
      <div className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{label}</div>
      <div className="font-oswald text-[15px] leading-5">{value}</div>
    </>
  );
  return href ? (
    <Link href={href} className={cls} title={title} aria-current={active ? "page" : undefined} data-testid={testId}>
      {body}
    </Link>
  ) : (
    <div className={cls} title={title} data-testid={testId}>
      {body}
    </div>
  );
}

/** A responsive row of StatTile. */
export function StatTiles({ children, className, testId }: { children: ReactNode; className?: string; testId?: string }) {
  return (
    <div className={cn("mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6", className)} data-testid={testId}>
      {children}
    </div>
  );
}
