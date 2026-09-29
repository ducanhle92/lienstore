"use client";

import { Fa } from "@/components/sites/lienstore/shared/icons";
import { cn } from "@/lib/utils";
import { btnSecondary } from "./ui";

interface Props {
  /** CSS selector of the table (or a wrapper holding one) to export — the first match on the page. */
  target: string;
  filename: string;
  label?: string;
  className?: string;
  title?: string;
}

const cellText = (cell: HTMLTableCellElement): string => {
  const sel = cell.querySelector("select");
  if (sel) return sel.selectedOptions[0]?.text.trim() ?? "";
  const input = cell.querySelector<HTMLInputElement>("input:not([type=checkbox]):not([type=hidden]):not([type=radio])");
  if (input) return input.value.trim();
  const box = cell.querySelector<HTMLInputElement>("input[type=checkbox]");
  if (box && !cell.textContent?.trim()) return box.checked ? "x" : "";
  return (cell.innerText ?? "").replace(/\s*\n\s*/g, " · ").replace(/\s+/g, " ").trim();
};
const headerText = (th: HTMLTableCellElement): string => {
  const c = th.cloneNode(true) as HTMLElement;
  for (const s of c.querySelectorAll(".lien-sheet-slot, [data-sort], input, button")) s.remove();
  return (c.textContent ?? "").replace(/\s+/g, " ").trim();
};
const q = (s: string) => (/[",\r\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const shown = (el: HTMLElement) => !el.classList.contains("hidden") && el.offsetParent !== null;

/**
 * "Xuất CSV" of the table as it is on screen: the rows still shown after the ▾ column filters, in the current sort,
 * with the header texts — a checkbox column comes out as x / blank, selects and inputs as their values.
 */
export function TableCsvButton({ target, filename, label = "Xuất CSV", className, title }: Props) {
  const run = () => {
    const root = document.querySelector<HTMLElement>(target);
    const table = root instanceof HTMLTableElement ? root : root?.querySelector("table");
    if (!table) return;
    const headRow = table.tHead?.rows[table.tHead.rows.length - 1];
    const header = headRow ? Array.from(headRow.cells).map(headerText) : [];
    const lines: string[] = [];
    if (header.length) lines.push(header.map(q).join(","));
    for (const body of Array.from(table.tBodies)) {
      if (!shown(body)) continue;
      for (const tr of Array.from(body.rows)) {
        if (!shown(tr) || tr.hasAttribute("data-sheet-ignore")) continue;
        const cells = Array.from(tr.cells).map(cellText);
        if (cells.every((c) => !c)) continue;
        lines.push(cells.map(q).join(","));
      }
    }
    const blob = new Blob([`﻿${lines.join("\r\n")}\r\n`], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  return (
    <button type="button" onClick={run} className={cn(btnSecondary, className)} title={title ?? "Xuất đúng các dòng và thứ tự đang hiển thị (sau khi lọc ▾)"} data-testid="table-csv">
      <Fa name="download" /> {label}
    </button>
  );
}
