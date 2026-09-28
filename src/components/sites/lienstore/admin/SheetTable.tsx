"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { applySheet, ColumnFilter, registerAnnotator, SheetInfo } from "./SheetFilter";

/**
 * Excel-style ▾ filter / sort on every column of an ordinary server-rendered table — no per-column markup needed:
 *
 *   <SheetTable id="orders"><table>…</table></SheetTable>
 *
 * Each header cell gets a ▾ (except the tick column, empty headers and `th[data-sheet-skip]`). A row's value in a
 * column is the first line of its cell (a name, "#1031", a status badge), or the chosen option / typed value of a
 * form field, or the cell's `data-v` ("a|b" for several). Sort kind (number / date / text) is read from the values;
 * `data-s` on a cell overrides the sort key. Rows joined by rowspan cells — or starting with `tr[data-sheet-start]`
 * (a product with its bill lines) — filter and move together. Empty-state rows (one cell across the table) are left out.
 */
export function SheetTable({ id, children, className, unit = "dòng" }: { id: string; children: ReactNode; className?: string; unit?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [heads, setHeads] = useState<Array<{ slot: HTMLElement; col: string; label: string; kind: Kind }>>([]);

  useEffect(() => {
    const root = ref.current;
    const table = root?.querySelector("table");
    if (!root || !table) return;
    const cols = headerColumns(table);
    const annotate = () => annotateRows(table, cols.length);
    const kinds = annotate();
    registerAnnotator(id, annotate);
    // a ▾ in each header cell that names a column
    const slots: Array<{ slot: HTMLElement; col: string; label: string; kind: Kind }> = [];
    for (const c of cols) {
      if (!c.th || c.skip) continue;
      const slot = document.createElement("span");
      slot.className = "lien-sheet-slot whitespace-nowrap";
      // headers that clip their text (resizable columns) get the ▾ first so it never disappears
      const cs = getComputedStyle(c.th);
      if (cs.overflow !== "visible" || cs.textOverflow === "ellipsis") {
        slot.className += " mr-1";
        c.th.insertBefore(slot, c.th.firstChild);
      } else c.th.appendChild(slot);
      slots.push({ slot, col: `c${c.index}`, label: c.label, kind: kinds[c.index] ?? "text" });
    }
    // the slots exist only now (after hydration); render the ▾ into them on the next frame
    const ready = requestAnimationFrame(() => setHeads(slots));
    applySheet(id);
    // the server re-rendered (a save, a new row): read the cells again and keep the filter
    let frame = 0;
    // our own re-ordering only moves rows we already marked; anything else is the server's
    const ours = (m: MutationRecord) => m.type === "childList" && m.target instanceof HTMLElement && m.target.tagName === "TBODY" && Array.from(m.addedNodes).every((n) => n instanceof HTMLElement && (n.dataset.sheetI !== undefined || n.dataset.sheetMember !== undefined));
    const mo = new MutationObserver((list) => {
      if (list.every(ours)) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => applySheet(id));
    });
    const body = table.tBodies;
    for (const b of Array.from(body)) mo.observe(b, { childList: true, subtree: true, characterData: true });
    return () => {
      cancelAnimationFrame(ready);
      cancelAnimationFrame(frame);
      mo.disconnect();
      registerAnnotator(id, null);
      for (const s of slots) s.slot.remove();
    };
  }, [id]);

  return (
    // its own horizontal scroll: a wide table never pushes the page sideways (phones)
    <div ref={ref} data-sheet={id} className={cn("max-w-full overflow-x-auto", className)}>
      <SheetInfo sheet={id} unit={unit} />
      {children}
      {heads.map((h) => createPortal(<ColumnFilter sheet={id} col={h.col} kind={h.kind} label={h.label} auto />, h.slot, `${id}-${h.col}`))}
    </div>
  );
}

type Kind = "text" | "number" | "date";

interface HeadCol {
  index: number;
  th: HTMLTableCellElement | null;
  label: string;
  skip: boolean;
}

/** Columns of the table from its last header row (colspan honoured). */
function headerColumns(table: HTMLTableElement): HeadCol[] {
  const row = table.tHead?.rows[table.tHead.rows.length - 1];
  if (!row) return [];
  const out: HeadCol[] = [];
  let index = 0;
  for (const th of Array.from(row.cells)) {
    const label = (th.textContent ?? "").replace(/[⇅▲▼▾]/g, "").replace(/\s+/g, " ").trim();
    const tick = !!th.querySelector("input[type=checkbox]");
    out.push({ index, th, label, skip: tick || !label || th.hasAttribute("data-sheet-skip") });
    index += Math.max(1, th.colSpan);
  }
  return out;
}

const FIELD_SKIP = new Set(["hidden", "checkbox", "radio", "submit", "button", "file"]);
const clean = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 120);

/** What a cell shows first: data-v, a form field's value, else the first line of text. */
function cellValues(cell: HTMLTableCellElement): string[] {
  const v = cell.getAttribute("data-v");
  if (v !== null) return v.split("|").map(clean).filter(Boolean);
  const sel = cell.querySelector("select:not([multiple])") as HTMLSelectElement | null;
  if (sel && sel.selectedIndex >= 0) return [clean(sel.options[sel.selectedIndex].text)].filter(Boolean);
  const input = Array.from(cell.querySelectorAll("input, textarea")).find((el) => !(el instanceof HTMLInputElement && FIELD_SKIP.has(el.type))) as HTMLInputElement | HTMLTextAreaElement | undefined;
  if (input && input.value.trim()) return [clean(input.value)];
  return [clean(firstLine(cell))].filter(Boolean);
}

/** Descend through single wrappers to the first child that carries text (e.g. the product name above its SKU). */
function firstLine(el: Element): string {
  let node: Element = el;
  for (let depth = 0; depth < 8; depth++) {
    const own = Array.from(node.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim());
    if (own) return node.textContent ?? "";
    const kids = Array.from(node.children).filter((k) => !["IMG", "SVG", "INPUT", "SELECT", "TEXTAREA", "BUTTON", "SCRIPT", "STYLE"].includes(k.tagName) && (k.textContent ?? "").trim() && !(k as HTMLElement).hidden && k.getAttribute("aria-hidden") !== "true");
    if (!kids.length) return "";
    node = kids[0];
    if (kids.length > 1) return node.textContent ?? "";
  }
  return node.textContent ?? "";
}

const DATE = /(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\D+(\d{1,2}):(\d{2}))?|(\d{1,2}):(\d{2})\D+(\d{1,2})\/(\d{1,2})\/(\d{4})|(\d{4})-(\d{2})-(\d{2})/;
function dateKey(s: string): string | null {
  const m = s.match(DATE);
  if (!m) return null;
  const p2 = (x: string | undefined) => (x ?? "0").padStart(2, "0");
  if (m[1]) return `${m[3]}-${p2(m[2])}-${p2(m[1])}T${p2(m[4])}:${p2(m[5])}`;
  if (m[6]) return `${m[10]}-${p2(m[9])}-${p2(m[8])}T${p2(m[6])}:${p2(m[7])}`;
  return `${m[11]}-${m[12]}-${m[13]}`;
}
function numberKey(s: string): number | null {
  const t = s.replace(/\s/g, "");
  if (!/^[−\-+]?[¥$]?\d[\d.,]*(đ|₫|VNĐ|VND|¥|%|g|kg|cái|đv)?$/i.test(t)) return null;
  const neg = /^[−-]/.test(t);
  const digits = t.replace(/[^\d]/g, "");
  return digits ? (neg ? -1 : 1) * Number(digits) : null;
}

/**
 * Mark rows / groups and write their values (data-v-c<i>, data-s-c<i>) for the filter; returns the sort kind per column.
 */
function annotateRows(table: HTMLTableElement, nCols: number): Kind[] {
  const trs = Array.from(table.tBodies).flatMap((b) => Array.from(b.rows));
  const treeMode = trs.some((tr) => tr.hasAttribute("data-sheet-start"));
  // groups of <tr>
  const groups: HTMLTableRowElement[][] = [];
  let left = 0;
  for (const tr of trs) {
    const empty = tr.cells.length === 1 && tr.cells[0].colSpan >= Math.max(2, nCols - 1);
    if (tr.hasAttribute("data-sheet-ignore") || empty) {
      tr.removeAttribute("data-sheet-row");
      tr.removeAttribute("data-sheet-member");
      continue;
    }
    const startsTree = treeMode && tr.hasAttribute("data-sheet-start");
    if (groups.length && ((treeMode && !startsTree) || (!treeMode && left > 0))) {
      groups[groups.length - 1].push(tr);
      left--;
      continue;
    }
    groups.push([tr]);
    left = treeMode ? 0 : Math.max(0, ...Array.from(tr.cells).map((c) => c.rowSpan - 1));
  }
  const samples: string[][] = Array.from({ length: nCols }, () => []);
  const owned = new Map<HTMLElement, Array<string | null>>();
  groups.forEach((g, gi) => {
    const lead = g[0];
    const gid = `g${gi}`;
    lead.setAttribute("data-sheet-row", "");
    lead.removeAttribute("data-sheet-member");
    lead.dataset.sheetG = gid;
    for (const m of g.slice(1)) {
      m.removeAttribute("data-sheet-row");
      m.dataset.sheetMember = gid;
    }
    // cell grid of the group (rowspan / colspan)
    const perCol: Array<Set<string>> = Array.from({ length: nCols }, () => new Set());
    const own: Array<string | null> = Array.from({ length: nCols }, () => null);
    const taken: boolean[][] = g.map(() => []);
    // a tree group (product → bill lines → units) is described by its first row, which carries the whole product's values
    (treeMode ? g.slice(0, 1) : g).forEach((tr, r) => {
      let c = 0;
      for (const cell of Array.from(tr.cells)) {
        while (taken[r][c]) c++;
        for (let dr = 0; dr < Math.max(1, cell.rowSpan) && r + dr < g.length; dr++) for (let dc = 0; dc < Math.max(1, cell.colSpan); dc++) taken[r + dr][c + dc] = true;
        if (c < nCols) {
          for (const v of cellValues(cell)) perCol[c].add(v);
          const sk = cell.getAttribute("data-s");
          if (sk !== null && own[c] === null) own[c] = sk;
        }
        c += Math.max(1, cell.colSpan);
      }
    });
    perCol.forEach((set, c) => {
      const vals = [...set];
      lead.setAttribute(`data-v-c${c}`, vals.join("|"));
      if (vals[0]) samples[c].push(vals[0]);
    });
    owned.set(lead, own);
  });
  // sort kind per column: mostly numbers → number, mostly dates → date; keys from the cell's data-s, else parsed
  const kinds: Kind[] = samples.map((vals) => {
    if (!vals.length) return "text";
    const nums = vals.filter((v) => numberKey(v) !== null).length;
    const dates = vals.filter((v) => dateKey(v) !== null).length;
    return nums >= vals.length * 0.8 ? "number" : dates >= vals.length * 0.8 ? "date" : "text";
  });
  for (const g of groups) {
    const lead = g[0];
    const own = owned.get(lead) ?? [];
    kinds.forEach((k, c) => {
      const first = (lead.getAttribute(`data-v-c${c}`) ?? "").split("|")[0] ?? "";
      const key = own[c] ?? (k === "number" ? numberKey(first) : k === "date" ? dateKey(first) : null);
      if (key === null) lead.removeAttribute(`data-s-c${c}`);
      else lead.setAttribute(`data-s-c${c}`, String(key));
    });
  }
  return kinds;
}
