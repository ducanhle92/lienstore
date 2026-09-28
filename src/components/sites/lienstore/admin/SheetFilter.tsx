"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { cn } from "@/lib/utils";

/**
 * Excel-style filter / sort in a table's column headers, for server-rendered tables:
 *
 *   <div data-sheet="orders">                    ← one sheet (any wrapper of the table)
 *     <th>Đơn <ColumnFilter sheet="orders" col="order" kind="number" /></th>
 *     <tbody data-sheet-row data-v-order="#1024" data-s-order="1024">…</tbody>   ← one row (a <tr> or a <tbody> group)
 *
 * `data-v-<col>` holds the row's values for that column (several joined by "|"), `data-s-<col>` an optional sort key.
 * Filters and sort stay per browser tab (sessionStorage) and are re-applied when the server re-renders the table.
 */

type Kind = "text" | "number" | "date";
interface SheetState {
  filters: Record<string, string[]>;
  sort: { col: string; dir: 1 | -1; kind: Kind } | null;
}
const EMPTY: SheetState = { filters: {}, sort: null };
const states = new Map<string, SheetState>();
const listeners = new Set<() => void>();
const storeKey = (id: string) => `lien-sheet:${id}`;

function getState(id: string): SheetState {
  let s = states.get(id);
  if (!s) {
    s = EMPTY;
    try {
      const raw = window.sessionStorage.getItem(storeKey(id));
      if (raw) s = { ...EMPTY, ...(JSON.parse(raw) as SheetState) };
    } catch {
      /* no storage: start empty */
    }
    states.set(id, s);
  }
  return s;
}
function setState(id: string, next: SheetState) {
  states.set(id, next);
  try {
    window.sessionStorage.setItem(storeKey(id), JSON.stringify(next));
  } catch {
    /* ignore */
  }
  applySheet(id);
  for (const l of listeners) l();
}
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
function useSheetState(id: string): SheetState {
  return useSyncExternalStore(subscribe, () => getState(id), () => EMPTY);
}

const valuesOf = (el: HTMLElement, col: string) => (el.getAttribute(`data-v-${col}`) ?? "").split("|").map((v) => v.trim()).filter(Boolean);
const rowsOf = (id: string) => Array.from(document.querySelectorAll<HTMLElement>(`[data-sheet="${id}"] [data-sheet-row]`));
const collator = new Intl.Collator("vi", { numeric: true, sensitivity: "base" });

/** Auto sheets (<SheetTable>) re-read their cells before each apply — the server may have re-rendered the rows. */
const annotators = new Map<string, () => void>();
export function registerAnnotator(id: string, fn: (() => void) | null) {
  if (fn) annotators.set(id, fn);
  else annotators.delete(id);
}

/** Rows that belong to a row (a group spanning several <tr>: rowspan cells, or a product with its bill lines). */
const membersOf = (id: string, r: HTMLElement) => (r.dataset.sheetG ? Array.from(document.querySelectorAll<HTMLElement>(`[data-sheet="${id}"] [data-sheet-member="${r.dataset.sheetG}"]`)) : []);

/** Show / hide and order the rows of a sheet from its state. */
export function applySheet(id: string) {
  annotators.get(id)?.();
  const st = getState(id);
  const rows = rowsOf(id);
  rows.forEach((r, i) => {
    if (!r.dataset.sheetI) r.dataset.sheetI = String(i);
  });
  let shown = 0;
  for (const r of rows) {
    const ok = Object.entries(st.filters).every(([col, keep]) => {
      const set = new Set(keep);
      const vs = valuesOf(r, col);
      return vs.length ? vs.some((v) => set.has(v)) : set.has("(trống)");
    });
    r.hidden = !ok;
    for (const m of membersOf(id, r)) m.hidden = !ok;
    if (ok) shown++;
  }
  // order: the chosen column, else the server's order (a group moves with its members)
  const parent = rows[0]?.parentElement;
  if (parent && rows.every((r) => r.parentElement === parent)) {
    const key = (r: HTMLElement) => (st.sort ? (r.getAttribute(`data-s-${st.sort.col}`) ?? valuesOf(r, st.sort.col)[0] ?? "") : "");
    const sorted = [...rows].sort((a, b) => {
      if (st.sort) {
        const ka = key(a);
        const kb = key(b);
        const c = st.sort.kind === "number" ? Number(ka || 0) - Number(kb || 0) : collator.compare(ka, kb);
        if (c) return c * st.sort.dir;
      }
      return Number(a.dataset.sheetI) - Number(b.dataset.sheetI);
    });
    const now = Array.from(parent.children).filter((c) => (c as HTMLElement).hasAttribute("data-sheet-row"));
    if (sorted.some((r, i) => now[i] !== r)) {
      for (const r of sorted) {
        const members = membersOf(id, r);
        parent.appendChild(r);
        for (const m of members) parent.appendChild(m);
      }
    }
  }
  const info = document.querySelector<HTMLElement>(`[data-sheet-info="${id}"]`);
  if (info) info.dataset.shown = String(shown);
  document.dispatchEvent(new CustomEvent("lien-sheet-applied", { detail: { id, shown, total: rows.length } }));
}

const SORT_LABEL: Record<Kind, [string, string]> = { text: ["A → Z", "Z → A"], number: ["Nhỏ → lớn", "Lớn → nhỏ"], date: ["Cũ → mới", "Mới → cũ"] };

/** The ▾ of one column header: sort, search, tick the values to keep. */
export function ColumnFilter({ sheet, col, kind = "text", label, auto = false }: { sheet: string; col: string; kind?: Kind; label: string; /** Inside <SheetTable>, which watches the rows itself. */ auto?: boolean }) {
  const st = useSheetState(sheet);
  // the ▾ that opened the menu (null = closed)
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const active = !!st.filters[col];
  const sorted = st.sort?.col === col ? st.sort.dir : 0;

  // re-apply when the server re-renders the rows (new / changed orders keep the current filter)
  useEffect(() => {
    if (auto) return;
    const root = document.querySelector(`[data-sheet="${sheet}"]`);
    applySheet(sheet);
    if (!root) return;
    let frame = 0;
    const mo = new MutationObserver((list) => {
      if (list.every((m) => Array.from(m.addedNodes).every((n) => n instanceof HTMLElement && n.hasAttribute("data-sheet-row") && n.dataset.sheetI))) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => applySheet(sheet));
    });
    mo.observe(root, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(frame);
      mo.disconnect();
    };
  }, [sheet, auto]);

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          const el = e.currentTarget;
          setAnchor((a) => (a ? null : el));
        }}
        className={cn("ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded border px-0.5 align-middle text-[10px] leading-none", active || sorted ? "border-lien-blue bg-lien-blue text-white" : "border-[#d1d5db] bg-white text-lien-muted hover:border-lien-blue hover:text-lien-blue")}
        aria-label={`Lọc / sắp xếp cột ${label}`}
        title={`Lọc / sắp xếp: ${label}`}
        data-testid={`colf-${sheet}-${col}`}
      >
        {sorted === 1 ? "↑" : sorted === -1 ? "↓" : null}
        {active ? <Fa name="filter" /> : sorted ? null : "▾"}
      </button>
      {anchor ? <Menu sheet={sheet} col={col} kind={kind} label={label} anchor={anchor} onClose={() => setAnchor(null)} /> : null}
    </>
  );
}

function Menu({ sheet, col, kind, label, anchor, onClose }: { sheet: string; col: string; kind: Kind; label: string; anchor: HTMLElement; onClose: () => void }) {
  const st = getState(sheet);
  const box = useRef<HTMLDivElement>(null);
  // placed under the ▾ in page coordinates, so it scrolls with the page (the table stays next to it)
  const [pos] = useState(() => {
    const r = anchor.getBoundingClientRect();
    return { left: Math.max(8, Math.min(r.left, window.innerWidth - 288)) + window.scrollX, top: r.bottom + 4 + window.scrollY };
  });
  const [q, setQ] = useState("");
  // distinct values of the column with how many rows have them (among rows the OTHER filters let through)
  const values = useMemo(() => {
    const others = Object.entries(st.filters).filter(([c]) => c !== col);
    const counts = new Map<string, number>();
    for (const r of rowsOf(sheet)) {
      const passOthers = others.every(([c, keep]) => {
        const vs = valuesOf(r, c);
        return vs.length ? vs.some((v) => keep.includes(v)) : keep.includes("(trống)");
      });
      if (!passOthers) continue;
      const vs = valuesOf(r, col);
      for (const v of vs.length ? new Set(vs) : ["(trống)"]) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => (kind === "number" ? Number(a[0].replace(/\D/g, "")) - Number(b[0].replace(/\D/g, "")) : collator.compare(a[0], b[0])));
  }, [sheet, col, kind, st.filters]);
  const [keep, setKeep] = useState<Set<string>>(() => new Set(st.filters[col] ?? values.map(([v]) => v)));
  const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d");
  const visible = values.filter(([v]) => !q || fold(v).includes(fold(q)));

  // not enough room under the ▾ (the fixed bottom bar counts) → open upwards; measured once it is on screen
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const r = anchor.getBoundingClientRect();
    const bar = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--admin-bar-h")) || 0;
    const room = window.innerHeight - bar - 8;
    if (r.bottom + 4 + el.offsetHeight > room) el.style.top = `${Math.max(8, Math.min(r.top - el.offsetHeight - 4, room - el.offsetHeight)) + window.scrollY}px`;
  }, [anchor]);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [anchor, onClose]);

  const allVisibleOn = visible.length > 0 && visible.every(([v]) => keep.has(v));
  const sortBy = (dir: 1 | -1) => {
    setState(sheet, { ...getState(sheet), sort: { col, dir, kind } });
    onClose();
  };
  const ok = () => {
    // searching then OK keeps only the matching values (like Excel)
    const chosen = q ? visible.filter(([v]) => keep.has(v)).map(([v]) => v) : [...keep];
    const everything = !q && values.every(([v]) => keep.has(v));
    const filters = { ...getState(sheet).filters };
    if (everything) delete filters[col];
    else filters[col] = chosen;
    setState(sheet, { ...getState(sheet), filters });
    onClose();
  };
  const clear = () => {
    const cur = getState(sheet);
    const filters = { ...cur.filters };
    delete filters[col];
    setState(sheet, { filters, sort: cur.sort?.col === col ? null : cur.sort });
    onClose();
  };
  const [asc, desc] = SORT_LABEL[kind];
  return createPortal(
    <div ref={box} role="dialog" aria-label={`Lọc cột ${label}`} className="absolute z-[80] w-[280px] rounded-md border border-[#d1d5db] bg-white p-2 text-[13px] font-normal normal-case tracking-normal text-lien-text shadow-xl" style={{ left: pos.left, top: pos.top }} data-testid={`colf-menu-${col}`}>
      <div className="mb-2 grid grid-cols-2 gap-1">
        <button type="button" onClick={() => sortBy(1)} className={cn("rounded border px-2 py-1 text-left hover:border-lien-blue", st.sort?.col === col && st.sort.dir === 1 ? "border-lien-blue bg-lien-blue-soft" : "border-[#e5e7eb]")}>
          ↑ {asc}
        </button>
        <button type="button" onClick={() => sortBy(-1)} className={cn("rounded border px-2 py-1 text-left hover:border-lien-blue", st.sort?.col === col && st.sort.dir === -1 ? "border-lien-blue bg-lien-blue-soft" : "border-[#e5e7eb]")}>
          ↓ {desc}
        </button>
      </div>
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ok()} placeholder="Tìm…" className="mb-1 w-full rounded border border-[#d1d5db] px-2 py-1 text-[13px] outline-none focus:border-lien-blue" aria-label="Tìm giá trị" />
      <div className="max-h-[240px] overflow-y-auto rounded border border-[#f0f0f0] py-1">
        <label className="flex cursor-pointer items-center gap-2 px-2 py-0.5 font-semibold hover:bg-[#f9fafb]">
          <input
            type="checkbox"
            checked={allVisibleOn}
            onChange={(e) => {
              const next = new Set(keep);
              for (const [v] of visible) {
                if (e.target.checked) next.add(v);
                else next.delete(v);
              }
              setKeep(next);
            }}
            className="h-3.5 w-3.5"
          />
          (Chọn tất cả{q ? " kết quả tìm" : ""})
        </label>
        {visible.map(([v, n]) => (
          <label key={v} className="flex cursor-pointer items-start gap-2 px-2 py-0.5 hover:bg-[#f9fafb]">
            <input
              type="checkbox"
              checked={keep.has(v)}
              onChange={(e) => {
                const next = new Set(keep);
                if (e.target.checked) next.add(v);
                else next.delete(v);
                setKeep(next);
              }}
              className="mt-0.5 h-3.5 w-3.5 shrink-0"
            />
            <span className="min-w-0 flex-1 break-words leading-4">{v}</span>
            <span className="shrink-0 text-[11px] text-lien-muted">{n}</span>
          </label>
        ))}
        {visible.length === 0 ? <p className="m-0 px-2 py-1 text-[12px] text-lien-muted">Không có giá trị khớp.</p> : null}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button type="button" onClick={clear} className="text-[12px] text-lien-blue hover:underline">
          Bỏ lọc cột
        </button>
        <button type="button" onClick={onClose} className="ml-auto rounded border border-[#d1d5db] px-3 py-1 text-[12px] hover:border-lien-blue">
          Huỷ
        </button>
        <button type="button" onClick={ok} className="rounded bg-lien-blue px-3 py-1 text-[12px] font-semibold text-white hover:bg-lien-blue-hover" data-testid={`colf-ok-${col}`}>
          OK
        </button>
      </div>
    </div>,
    document.body,
  );
}

/** "Đang lọc n / m đơn · Bỏ lọc" — only while a filter or sort is on; nothing otherwise. */
export function SheetInfo({ sheet, unit = "dòng" }: { sheet: string; unit?: string }) {
  const st = useSheetState(sheet);
  const [counts, setCounts] = useState<{ shown: number; total: number } | null>(null);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ id: string; shown: number; total: number }>).detail;
      if (d.id === sheet) setCounts({ shown: d.shown, total: d.total });
    };
    document.addEventListener("lien-sheet-applied", on);
    return () => document.removeEventListener("lien-sheet-applied", on);
  }, [sheet]);
  const nFilters = Object.keys(st.filters).length;
  if (!nFilters && !st.sort) return <span hidden data-sheet-info={sheet} />;
  return (
    <p className="m-0 mb-2 flex flex-wrap items-center gap-2 text-[12px] text-lien-muted" data-sheet-info={sheet} data-testid={`sheet-info-${sheet}`}>
      <Fa name="filter" className="text-lien-blue" />
      {nFilters && counts ? (
        <span>
          Đang lọc <b className="text-lien-heading">{counts.shown}</b> / {counts.total} {unit}
          {counts.shown === 0 ? " — không có dòng nào khớp" : ""}
        </span>
      ) : null}
      {st.sort ? <span>Sắp xếp theo cột đã chọn</span> : null}
      <button type="button" onClick={() => setState(sheet, EMPTY)} className="text-lien-blue hover:underline">
        Bỏ lọc &amp; sắp xếp
      </button>
    </p>
  );
}
