"use client";

import { useState } from "react";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { cn } from "@/lib/utils";

/**
 * Column header that sorts the server-rendered rows of a table in place (reorders <tr data-brow> nodes by one of
 * their data-* attributes). Numeric columns compare as numbers; the others as folded text; blanks go last.
 */
export function SortHeader({ table, attr, label, numeric = false, className }: { table: string; attr: string; label: string; numeric?: boolean; className?: string }) {
  const [dir, setDir] = useState<"" | "asc" | "desc">("");
  const sort = () => {
    const next: "asc" | "desc" = dir === "asc" ? "desc" : "asc";
    const root = document.getElementById(table);
    const body = root?.querySelector("tbody");
    if (!body) return;
    const rows = Array.from(body.querySelectorAll<HTMLTableRowElement>("tr[data-brow]"));
    const val = (r: HTMLTableRowElement) => r.dataset[attr] ?? "";
    const fold = (s: string) =>
      s
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "");
    rows.sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      if (va === "" && vb !== "") return 1;
      if (vb === "" && va !== "") return -1;
      const c = numeric ? Number(va) - Number(vb) : fold(va).localeCompare(fold(vb), "vi");
      return next === "asc" ? c : -c;
    });
    for (const r of rows) body.appendChild(r);
    // one active indicator per table
    for (const el of root!.querySelectorAll<HTMLElement>("[data-sort-active]")) el.removeAttribute("data-sort-active");
    setDir(next);
  };
  return (
    <button type="button" onClick={sort} className={cn("inline-flex items-center gap-1 whitespace-nowrap text-left font-semibold uppercase hover:text-lien-blue", className)} title={`Sắp xếp theo ${label.toLowerCase()}`} data-sort-active={dir || undefined}>
      {label}
      <Fa name={dir === "asc" ? "angle-up" : dir === "desc" ? "angle-down" : "bars"} className={cn("text-[10px]", dir ? "text-lien-blue" : "text-lien-muted/60")} />
    </button>
  );
}
