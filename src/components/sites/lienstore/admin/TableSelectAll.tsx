"use client";

import { useEffect, useRef } from "react";

/**
 * Header checkbox of a table: ticks / unticks every row checkbox in the same <table>'s <tbody> (rows hidden by a filter
 * are skipped) and shows checked / partly checked as the rows change. Put it in the first <th>; no label.
 * `name` limits it to row checkboxes with that name (tables that also hold other checkboxes).
 */
export function TableSelectAll({ name, label = "Chọn tất cả dòng" }: { name?: string; label?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const boxes = () => {
    const table = ref.current?.closest("table");
    if (!table) return [];
    return Array.from(table.querySelectorAll<HTMLInputElement>(`tbody input[type="checkbox"]${name ? `[name="${name}"]` : ""}`)).filter((b) => !b.disabled && !b.closest("tr")?.classList.contains("hidden"));
  };
  useEffect(() => {
    const table = ref.current?.closest("table");
    if (!table) return;
    const sync = () => {
      const all = boxes();
      const on = all.filter((b) => b.checked).length;
      if (!ref.current) return;
      ref.current.checked = all.length > 0 && on === all.length;
      ref.current.indeterminate = on > 0 && on < all.length;
    };
    sync();
    table.addEventListener("change", sync);
    return () => table.removeEventListener("change", sync);
  });
  const toggle = (on: boolean) => {
    for (const b of boxes()) {
      if (b.checked === on) continue;
      b.checked = on;
      b.dispatchEvent(new Event("change", { bubbles: true }));
    }
  };
  return <input ref={ref} type="checkbox" onChange={(e) => toggle(e.target.checked)} className="h-4 w-4 align-middle" aria-label={label} title={label} />;
}
