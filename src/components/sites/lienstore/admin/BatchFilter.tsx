"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { cn } from "@/lib/utils";
import { adminInput, btnSecondary } from "./ui";

interface Props {
  batchId: number;
  /** Rows the card renders. */
  total: number;
  sources: Array<{ key: string; name: string }>;
  bills: Array<{ id: number; code: string }>;
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
  src: string;
  date: string;
  bill: string;
}
const EMPTY: Filter = { q: "", src: "", date: "", bill: "" };

function readUrl(search: string): Filter {
  if (!search) return EMPTY;
  const p = new URLSearchParams(search);
  return { q: p.get("q") ?? "", src: p.get("src") ?? "", date: p.get("date") ?? "", bill: p.get("bill") ?? "" };
}
function writeUrl(f: Filter) {
  const p = new URLSearchParams(window.location.search);
  const put = (k: string, v: string) => (v ? p.set(k, v) : p.delete(k));
  put("q", f.q);
  put("src", f.src);
  put("date", f.date);
  put("bill", f.bill);
  const qs = p.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`);
}
const isEmpty = (f: Filter) => !f.q && !f.src && !f.date && !f.bill;

/**
 * Client-side filter for one batch card: rows are server-rendered (their inputs stay bound to the save form) and carry
 * data-* attributes; this hides the ones that do not match (product / order text, source, bought date, bill), keeps the
 * filter in the URL (F5-safe) and recomputes the totals row (rows · units · ¥) from what is shown.
 */
export function BatchFilter({ batchId, total, sources, bills }: Props) {
  const search = useSyncExternalStore(
    () => () => {},
    () => window.location.search,
    () => "",
  );
  const initial = useMemo(() => readUrl(search), [search]);
  const [edited, setF] = useState<Filter | null>(null);
  const f = edited ?? initial;
  const update = (fn: (cur: Filter) => Filter): void => setF((cur) => fn(cur ?? initial));
  const [qEdited, setQInput] = useState<string | null>(null);
  const qInput = qEdited ?? initial.q;
  const countRef = useRef<HTMLSpanElement>(null);
  const debounce = useRef<number | null>(null);
  const card = () => document.getElementById(`batch-${batchId}`);

  useEffect(() => {
    const root = card();
    if (!root) return;
    const rows = Array.from(root.querySelectorAll<HTMLTableRowElement>("tr[data-brow]"));
    const q = fold(f.q.trim().replace(/^#/, ""));
    let n = 0;
    let units = 0;
    let jpy = 0;
    for (const r of rows) {
      const d = r.dataset;
      let ok = true;
      if (q && !fold(`${d.search ?? ""} ${d.order ?? ""} ${d.customer ?? ""}`).includes(q)) ok = false;
      if (ok && f.src && (d.src ?? "") !== f.src) ok = false;
      if (ok && f.date && !(d.bought ?? "").startsWith(f.date)) ok = false;
      if (ok && f.bill && (d.bill ?? "") !== f.bill) ok = false;
      r.classList.toggle("hidden", !ok);
      if (ok) {
        n++;
        units += Number(d.qty ?? 0);
        jpy += Number(d.jpy ?? 0);
      }
    }
    const text = `${n}/${total} dòng · ${units} đv${jpy ? ` · ≈¥${jpy.toLocaleString("ja-JP")}` : ""}`;
    if (countRef.current) countRef.current.textContent = text;
    // totals row under the table (server renders the full-batch numbers; the client keeps it in step with the filter)
    const set = (k: string, v: string) => {
      const el = root.querySelector<HTMLElement>(`[data-total="${k}"]`);
      if (el) el.textContent = v;
    };
    set("rows", String(n));
    set("units", String(units));
    set("jpy", jpy ? `¥${jpy.toLocaleString("ja-JP")}` : "—");
    writeUrl(f);
  }, [f, batchId, total]);

  const onQ = (v: string) => {
    setQInput(v);
    if (debounce.current) window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => update((cur) => ({ ...cur, q: v })), 200);
  };
  const clear = () => {
    setQInput("");
    setF(EMPTY);
  };
  const active = !isEmpty(f);
  const sel = "!mb-0 !w-auto !py-1 !text-[13px]";
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-[#e5e7eb] bg-white px-3 py-2 text-[13px]" data-testid={`batch-filter-${batchId}`}>
      <input value={qInput} onChange={(e) => onQ(e.target.value)} placeholder="Tìm sản phẩm / SKU / #đơn / khách…" className={cn(adminInput, "!mb-0 !w-[240px] !py-1 !text-[13px]")} aria-label="Tìm trong đợt" data-testid="batch-q" />
      <select value={f.src} onChange={(e) => update((cur) => ({ ...cur, src: e.target.value }))} className={cn(adminInput, sel)} aria-label="Mua ở" data-testid="batch-src">
        <option value="">Mua ở: tất cả</option>
        {sources.map((s) => (
          <option key={s.key} value={s.key}>
            {s.name}
          </option>
        ))}
      </select>
      <input value={f.date} onChange={(e) => update((cur) => ({ ...cur, date: e.target.value.trim() }))} placeholder="Ngày mua 2026-09-27" className={cn(adminInput, "!mb-0 !w-[150px] !py-1 !text-[13px]")} aria-label="Ngày mua" title="Gõ ngày (2026-09-27) hoặc tháng (2026-09)" data-testid="batch-date" />
      <select value={f.bill} onChange={(e) => update((cur) => ({ ...cur, bill: e.target.value }))} className={cn(adminInput, sel)} aria-label="Bill" data-testid="batch-bill">
        <option value="">Bill: tất cả</option>
        {bills.map((b) => (
          <option key={b.id} value={b.code}>
            {b.code}
          </option>
        ))}
        <option value="—">chưa có bill</option>
      </select>
      <span className="ml-auto text-[12px] text-lien-muted" data-testid="batch-count">
        Đang hiện <span ref={countRef} className="font-semibold text-lien-heading">{total}/{total} dòng</span>
      </span>
      {active ? (
        <button type="button" onClick={clear} className={cn(btnSecondary, "!px-2 !py-0.5 !text-[12px]")}>
          <Fa name="times" /> Xoá lọc
        </button>
      ) : null}
    </div>
  );
}
