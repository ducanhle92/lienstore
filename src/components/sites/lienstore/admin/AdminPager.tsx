import Link from "next/link";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { cn } from "@/lib/utils";

/**
 * Query-string pager for admin lists: « ‹ 1 … 4 5 [6] 7 8 … 65 › ». Keeps every other search param (filters, q) and
 * only sets `page`; page 1 drops the param so filter links stay clean. Pure server component (links only).
 */
export function AdminPager({ page, totalPages, path, params, className, testId = "pager" }: { page: number; totalPages: number; path: string; params: Record<string, string | string[] | undefined>; className?: string; testId?: string }) {
  if (totalPages <= 1) return null;
  const href = (n: number) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      const s = Array.isArray(v) ? v[0] : v;
      if (s && k !== "page") qs.set(k, s);
    }
    if (n > 1) qs.set("page", String(n));
    const q = qs.toString();
    return q ? `${path}?${q}` : path;
  };
  // 1 … (page-2 … page+2) … last, never more than ~9 cells
  const cells: Array<number | "…"> = [];
  const push = (n: number) => {
    if (n >= 1 && n <= totalPages && !cells.includes(n)) cells.push(n);
  };
  push(1);
  if (page - 2 > 2) cells.push("…");
  for (let n = Math.max(2, page - 2); n <= Math.min(totalPages - 1, page + 2); n++) push(n);
  if (page + 2 < totalPages - 1) cells.push("…");
  push(totalPages);
  const cell = "inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-[13px] font-semibold no-underline";
  const idle = "border-[#d1d5db] bg-white text-lien-text hover:border-lien-blue hover:text-lien-blue";
  const off = "border-[#e5e5e5] bg-[#f5f5f5] text-[#b5b5b5] pointer-events-none";
  return (
    <nav aria-label="Phân trang" className={cn("flex flex-wrap items-center gap-1", className)} data-testid={testId}>
      <Link href={href(1)} aria-label="Trang đầu" className={cn(cell, page > 1 ? idle : off)} data-testid={`${testId}-first`}>
        <Fa name="angle-double-left" />
      </Link>
      <Link href={href(page - 1)} aria-label="Trang trước" className={cn(cell, page > 1 ? idle : off)} data-testid={`${testId}-prev`}>
        <Fa name="angle-left" />
      </Link>
      {cells.map((c, i) =>
        c === "…" ? (
          <span key={`gap-${i}`} className="px-1 text-[13px] text-lien-muted">
            …
          </span>
        ) : c === page ? (
          <span key={c} aria-current="page" className={cn(cell, "border-lien-blue bg-lien-blue text-white")} data-testid={`${testId}-current`}>
            {c}
          </span>
        ) : (
          <Link key={c} href={href(c)} className={cn(cell, idle)} data-testid={`${testId}-${c}`}>
            {c}
          </Link>
        ),
      )}
      <Link href={href(page + 1)} aria-label="Trang sau" className={cn(cell, page < totalPages ? idle : off)} data-testid={`${testId}-next`}>
        <Fa name="angle-right" />
      </Link>
      <Link href={href(totalPages)} aria-label="Trang cuối" className={cn(cell, page < totalPages ? idle : off)} data-testid={`${testId}-last`}>
        <Fa name="angle-double-right" />
      </Link>
    </nav>
  );
}

/** `?page=` → 1-based page clamped to the list; `?per=` → rows per page from the allowed set. */
export function pageOf(sp: Record<string, string | string[] | undefined>, total: number, perDefault = 10, perAllowed: number[] = [10, 20, 50, 100]): { page: number; per: number; totalPages: number; from: number; to: number } {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const perRaw = Number.parseInt(first(sp.per), 10);
  const per = perAllowed.includes(perRaw) ? perRaw : perDefault;
  const totalPages = Math.max(1, Math.ceil(total / per));
  const page = Math.min(totalPages, Math.max(1, Number.parseInt(first(sp.page), 10) || 1));
  return { page, per, totalPages, from: total ? (page - 1) * per + 1 : 0, to: Math.min(total, page * per) };
}
