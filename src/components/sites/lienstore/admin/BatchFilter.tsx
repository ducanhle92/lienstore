"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { cn } from "@/lib/utils";
import { adminInput, btnSecondary } from "./ui";

interface Props {
  batchId: number;
  /** Rows the card renders (order lines + stock rows + held rows). */
  total: number;
  sources: Array<{ key: string; name: string }>;
  statuses: Array<{ key: string; label: string }>;
  orders: Array<{ number: number; customer: string }>;
}

/** lower-case, no diacritics — same idea as lib/tags foldVi, kept local so the client bundle stays small */
const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d");

interface Filter {
  q: string;
  order: string;
  kind: Set<string>;
  src: Set<string>;
  status: Set<string>;
  noteOnly: boolean;
  min2: boolean;
}
const EMPTY: Filter = { q: "", order: "", kind: new Set(), src: new Set(), status: new Set(), noteOnly: false, min2: false };
const SEP = ",";

function readUrl(search: string): Filter {
  if (!search) return EMPTY;
  const p = new URLSearchParams(search);
  const set = (k: string) => new Set((p.get(k) ?? "").split(SEP).filter(Boolean));
  return { q: p.get("q") ?? "", order: p.get("order") ?? "", kind: set("kind"), src: set("src"), status: set("st"), noteOnly: p.get("note") === "1", min2: p.get("min2") === "1" };
}
function writeUrl(f: Filter) {
  const p = new URLSearchParams(window.location.search);
  const put = (k: string, v: string) => (v ? p.set(k, v) : p.delete(k));
  put("q", f.q);
  put("order", f.order);
  put("kind", [...f.kind].join(SEP));
  put("src", [...f.src].join(SEP));
  put("st", [...f.status].join(SEP));
  put("note", f.noteOnly ? "1" : "");
  put("min2", f.min2 ? "1" : "");
  const qs = p.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`);
}
const isEmpty = (f: Filter) => !f.q && !f.order && !f.kind.size && !f.src.size && !f.status.size && !f.noteOnly && !f.min2;

/**
 * Client-side filter for one batch card: rows are server-rendered (their forms stay intact) and carry
 * data-brow attributes; this component hides the ones that do not match, keeps the filter in the URL (F5-safe),
 * counts what is shown, offers "select all shown" for the bulk bar, focuses the split box when one row is left,
 * and maps Enter / Shift+Enter in that box to "Giữ Nhật" / "Tách dòng".
 */
export function BatchFilter({ batchId, total, sources, statuses, orders }: Props) {
  // the URL is the initial state (server renders with an empty filter, the client picks the query up on hydration)
  const search = useSyncExternalStore(
    () => () => {},
    () => window.location.search,
    () => "",
  );
  const initial = useMemo(() => readUrl(search), [search]);
  const [edited, setF] = useState<Filter | null>(null);
  const f = edited ?? initial;
  const update = (fn: (cur: Filter) => Filter): void => setF((cur) => fn(cur ?? initial));
  const [openState, setOpen] = useState<boolean | null>(null);
  const open = openState ?? (total >= 8 || !isEmpty(initial));
  const [qEdited, setQInput] = useState<string | null>(null);
  const qInput = qEdited ?? initial.q;
  const countRef = useRef<HTMLSpanElement>(null);
  const debounce = useRef<number | null>(null);
  const card = () => document.getElementById(`batch-${batchId}`);

  // apply
  useEffect(() => {
    const root = card();
    if (!root) return;
    const rows = Array.from(root.querySelectorAll<HTMLTableRowElement>("tr[data-brow]"));
    const q = fold(f.q.trim());
    const oq = fold(f.order.trim().replace(/^#/, ""));
    // order filter: matching line rows + stock rows of the same products
    let orderProducts: Set<string> | null = null;
    if (oq) {
      orderProducts = new Set();
      for (const r of rows) {
        if (r.dataset.kind !== "line") continue;
        const hit = (r.dataset.order ?? "") === oq || fold(r.dataset.customer ?? "").includes(oq);
        if (hit) orderProducts.add(r.dataset.product ?? "");
      }
    }
    let n = 0;
    let units = 0;
    let jpy = 0;
    let last: HTMLTableRowElement | null = null;
    for (const r of rows) {
      const d = r.dataset;
      let ok = true;
      if (q && !fold(d.search ?? "").includes(q)) ok = false;
      if (ok && oq) {
        const isLine = d.kind === "line";
        const lineHit = isLine && ((d.order ?? "") === oq || fold(d.customer ?? "").includes(oq));
        const stockHit = !isLine && !!orderProducts && orderProducts.has(d.product ?? "");
        if (!lineHit && !stockHit) ok = false;
      }
      if (ok && f.kind.size && !f.kind.has(d.kind === "line" ? "line" : "stock")) ok = false;
      if (ok && f.src.size && !f.src.has(d.src ?? "")) ok = false;
      if (ok && f.status.size && !f.status.has(d.status ?? "")) ok = false;
      if (ok && f.noteOnly && d.note !== "1") ok = false;
      if (ok && f.min2 && Number(d.qty ?? 0) < 2) ok = false;
      r.classList.toggle("hidden", !ok);
      if (ok) {
        n++;
        units += Number(d.qty ?? 0);
        jpy += Number(d.jpy ?? 0);
        last = r;
      }
    }
    if (countRef.current) countRef.current.textContent = `${n}/${total} dòng · ${units} đv${jpy ? ` · ≈¥${jpy.toLocaleString("ja-JP")}` : ""}`;
    // one product row left after typing → the split box is ready for a number
    if (n === 1 && q && last) {
      const box = last.querySelector<HTMLInputElement>('input[name="splitQty"]');
      if (box && document.activeElement !== box) box.focus();
    }
    writeUrl(f);
  }, [f, batchId, total]);

  // Enter = Giữ Nhật (the form's first submit button), Shift+Enter = Tách dòng
  useEffect(() => {
    const root = card();
    if (!root) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (!(t instanceof HTMLInputElement) || t.name !== "splitQty" || e.key !== "Enter") return;
      const formId = t.getAttribute("form");
      if (!formId) return;
      e.preventDefault();
      const mode = e.shiftKey ? "split" : "hold";
      root.querySelector<HTMLButtonElement>(`button[form="${formId}"][name="mode"][value="${mode}"]`)?.click();
    };
    root.addEventListener("keydown", onKey);
    return () => root.removeEventListener("keydown", onKey);
  }, [batchId]);

  const onQ = (v: string) => {
    setQInput(v);
    if (debounce.current) window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => update((cur) => ({ ...cur, q: v })), 200);
  };
  const toggle = (key: "kind" | "src" | "status", v: string) =>
    update((cur) => {
      const next = new Set(cur[key]);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return { ...cur, [key]: next };
    });
  const clear = () => {
    setQInput("");
    setF(EMPTY);
  };
  const selectShown = (checked: boolean) => {
    const root = card();
    if (!root) return;
    for (const r of root.querySelectorAll<HTMLTableRowElement>("tr[data-brow]:not(.hidden)")) {
      const box = r.querySelector<HTMLInputElement>('input[type="checkbox"][name="ids"], input[type="checkbox"][name="sids"]');
      if (box) box.checked = checked;
    }
  };
  const chip = (active: boolean, label: string, onClick: () => void, key: string) => (
    <button key={key} type="button" onClick={onClick} className={cn("rounded-full border px-2 py-0.5 text-[11px] font-semibold", active ? "border-lien-blue bg-lien-blue text-white" : "border-[#d1d5db] bg-white text-lien-text hover:border-lien-blue")}>
      {label}
    </button>
  );
  const orderList = useMemo(() => orders, [orders]);
  const listId = `orders-${batchId}`;
  const active = !isEmpty(f);
  return (
    <div className="mb-2 rounded-md border border-[#e5e7eb] bg-white px-3 py-2 text-[13px]" data-testid={`batch-filter-${batchId}`}>
      <div className="flex flex-wrap items-center gap-2">
        <input value={qInput} onChange={(e) => onQ(e.target.value)} placeholder="Tìm sản phẩm / SKU / #id…" className={cn(adminInput, "!mb-0 !w-[240px] !py-1 !text-[13px]")} aria-label="Tìm sản phẩm trong đợt" data-testid="batch-q" />
        {open ? (
          <>
            <input list={listId} value={f.order} onChange={(e) => update((cur) => ({ ...cur, order: e.target.value }))} placeholder="Đơn hàng: #số hoặc tên khách" className={cn(adminInput, "!mb-0 !w-[220px] !py-1 !text-[13px]")} aria-label="Lọc theo đơn" data-testid="batch-order" />
            <datalist id={listId}>
              {orderList.map((o) => (
                <option key={o.number} value={`#${o.number}`}>
                  {o.customer}
                </option>
              ))}
            </datalist>
          </>
        ) : null}
        <label className="inline-flex items-center gap-1.5 text-[12px]">
          <input type="checkbox" onChange={(e) => selectShown(e.target.checked)} className="h-4 w-4" aria-label="Chọn tất cả dòng đang hiện" /> chọn tất cả đang hiện
        </label>
        <span className="ml-auto text-[12px] text-lien-muted" data-testid="batch-count">
          Đang hiện <span ref={countRef} className="font-semibold text-lien-heading">{total}/{total} dòng</span>
        </span>
        {active ? (
          <button type="button" onClick={clear} className={cn(btnSecondary, "!px-2 !py-0.5 !text-[12px]")}>
            <Fa name="times" /> Xoá lọc
          </button>
        ) : null}
        {!open ? (
          <button type="button" onClick={() => setOpen(true)} className="text-[12px] text-lien-blue hover:underline">
            Bộ lọc ▾
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="flex flex-wrap items-center gap-1">
            <span className="text-[11px] text-lien-muted">Loại:</span>
            {chip(f.kind.has("line"), "Dòng đơn", () => toggle("kind", "line"), "k-line")}
            {chip(f.kind.has("stock"), "Lưu kho", () => toggle("kind", "stock"), "k-stock")}
          </span>
          {sources.length ? (
            <span className="flex flex-wrap items-center gap-1">
              <span className="text-[11px] text-lien-muted">Mua ở:</span>
              {sources.map((s) => chip(f.src.has(s.key), s.name, () => toggle("src", s.key), `s-${s.key}`))}
            </span>
          ) : null}
          {statuses.length > 1 ? (
            <span className="flex flex-wrap items-center gap-1">
              <span className="text-[11px] text-lien-muted">Trạng thái:</span>
              {statuses.map((s) => chip(f.status.has(s.key), s.label, () => toggle("status", s.key), `t-${s.key}`))}
            </span>
          ) : null}
          {chip(f.noteOnly, "Chỉ dòng có ghi chú", () => update((cur) => ({ ...cur, noteOnly: !cur.noteOnly })), "note")}
          {chip(f.min2, "Chỉ SL ≥ 2 (tách được)", () => update((cur) => ({ ...cur, min2: !cur.min2 })), "min2")}
        </div>
      ) : null}
    </div>
  );
}
