"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { cn } from "@/lib/utils";
import { adminInput, btnSecondary } from "./ui";

/**
 * Client side of one batch table (Quản lý mua hàng › đợt): the rows are server-rendered in tree order
 *   product (data-lvl="p") → bill line (data-lvl="g") → unit (data-lvl="u"), plus "cần mua" rows (data-lvl="n") under a product,
 * and carry data-* attributes. This component:
 *  - filters the unit / need rows (text incl. codes, source, channel, bought date, bill, status, kind, order) and hides
 *    bill lines / products with nothing left; the totals row counts what is shown;
 *  - switches the view: "Theo sản phẩm" (tree, bill lines open on click) or "Từng mã" (every unit, flat);
 *  - cascades ticks (product / bill line / header → their shown units);
 *  - sorts product blocks (tree) or units (flat) from the header buttons [data-sort];
 *  - keeps filter + view in the URL (F5-safe).
 */
interface Props {
  batchId: number;
  sources: Array<{ key: string; name: string }>;
  statuses: Array<{ key: string; label: string }>;
  orders: Array<{ number: number; customer: string }>;
  bills: Array<{ id: number; code: string }>;
}

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d");

interface Filter {
  q: string;
  src: string;
  ch: string;
  date: string;
  bill: string;
  status: string;
  kind: string;
  order: string;
  view: "tree" | "flat";
}
const EMPTY: Filter = { q: "", src: "", ch: "", date: "", bill: "", status: "", kind: "", order: "", view: "tree" };
const KEYS: Array<[keyof Filter, string]> = [
  ["q", "q"],
  ["src", "src"],
  ["ch", "ch"],
  ["date", "date"],
  ["bill", "bill"],
  ["status", "st"],
  ["kind", "kind"],
  ["order", "ord"],
  ["view", "bv"],
];

function readUrl(search: string): Filter {
  if (!search) return EMPTY;
  const p = new URLSearchParams(search);
  const f = { ...EMPTY } as Record<string, string>;
  for (const [k, q] of KEYS) f[k] = p.get(q) ?? (k === "view" ? "tree" : "");
  if (f.view !== "flat") f.view = "tree";
  return f as unknown as Filter;
}
function writeUrl(f: Filter) {
  const p = new URLSearchParams(window.location.search);
  for (const [k, q] of KEYS) {
    const v = f[k];
    if (v && !(k === "view" && v === "tree")) p.set(q, v);
    else p.delete(q);
  }
  const qs = p.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`);
}
const isEmpty = (f: Filter) => KEYS.every(([k]) => (k === "view" ? true : !f[k]));

export function BatchTree({ batchId, sources, statuses, orders, bills }: Props) {
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
  const [sort, setSort] = useState<{ attr: string; dir: 1 | -1 } | null>(null);

  // apply filter + view + open state
  useEffect(() => {
    const root = document.getElementById(`batch-${batchId}`);
    const tbody = root?.querySelector<HTMLTableSectionElement>(`#btable-${batchId} tbody`);
    if (!root || !tbody) return;
    const rows = Array.from(tbody.querySelectorAll<HTMLTableRowElement>("tr[data-lvl]"));
    const q = fold(f.q.trim().replace(/^#/, ""));
    const flat = f.view === "flat";
    let units = 0;
    let jpy = 0;
    let lines = 0;
    const gShown = new Map<string, number>();
    const pShown = new Map<string, number>();
    for (const r of rows) {
      const d = r.dataset;
      if (d.lvl !== "u" && d.lvl !== "n") continue;
      let ok = true;
      if (q && !fold(`${d.search ?? ""} ${d.order ?? ""} ${d.customer ?? ""} ${d.code ?? ""}`).includes(q)) ok = false;
      if (ok && f.src && (d.src ?? "") !== f.src) ok = false;
      if (ok && f.ch && (d.ch ?? "") !== f.ch) ok = false;
      if (ok && f.date && !(d.bought ?? "").startsWith(f.date)) ok = false;
      if (ok && f.bill && (d.bill ?? "") !== f.bill) ok = false;
      if (ok && f.status && (d.status ?? "") !== f.status) ok = false;
      if (ok && f.kind && (d.kind ?? "") !== f.kind) ok = false;
      if (ok && f.order && !(d.order ?? "").split(" ").includes(f.order)) ok = false;
      r.dataset.match = ok ? "1" : "0";
      if (!ok) continue;
      units += Number(d.qty ?? 0);
      jpy += Number(d.jpy ?? 0);
      lines++;
      if (d.g) gShown.set(d.g, (gShown.get(d.g) ?? 0) + 1);
      if (d.p) pShown.set(d.p, (pShown.get(d.p) ?? 0) + 1);
    }
    for (const r of rows) {
      const d = r.dataset;
      let show: boolean;
      if (d.lvl === "p") show = !flat && (pShown.get(d.p ?? "") ?? 0) > 0;
      else if (d.lvl === "g") show = !flat && (gShown.get(d.g ?? "") ?? 0) > 0;
      else if (d.lvl === "n") show = d.match === "1" && (flat || rows.find((x) => x.dataset.lvl === "p" && x.dataset.p === d.p)?.dataset.open !== "0");
      else {
        const g = rows.find((x) => x.dataset.lvl === "g" && x.dataset.g === d.g);
        show = d.match === "1" && (flat || (g?.dataset.open === "1" && rows.find((x) => x.dataset.lvl === "p" && x.dataset.p === d.p)?.dataset.open !== "0"));
      }
      if (d.lvl === "g" && !flat) {
        const p = rows.find((x) => x.dataset.lvl === "p" && x.dataset.p === d.p);
        if (p?.dataset.open === "0") show = false;
      }
      r.classList.toggle("hidden", !show);
      // live counts on product / bill line rows
      if (d.lvl === "g" || d.lvl === "p") {
        const el = r.querySelector<HTMLElement>("[data-shown]");
        if (el) el.textContent = String(rows.filter((x) => x.dataset.lvl === "u" && x.dataset.match === "1" && (d.lvl === "g" ? x.dataset.g === d.g : x.dataset.p === d.p)).length);
      }
    }
    const text = `${units} cái${lines ? ` · ${lines} dòng` : ""}${jpy ? ` · ≈¥${jpy.toLocaleString("ja-JP")}` : ""}`;
    if (countRef.current) countRef.current.textContent = text;
    const set = (k: string, v: string) => {
      const el = root.querySelector<HTMLElement>(`[data-total="${k}"]`);
      if (el) el.textContent = v;
    };
    set("units", String(units));
    set("rows", String(lines));
    set("jpy", jpy ? `¥${jpy.toLocaleString("ja-JP")}` : "—");
    root.dataset.view = f.view;
    writeUrl(f);
  });

  // expand / collapse (bill lines and products) and cascading ticks — event delegation on the card
  useEffect(() => {
    const root = document.getElementById(`batch-${batchId}`);
    if (!root) return;
    const onClick = (e: Event) => {
      const t = e.target as HTMLElement;
      const tog = t.closest<HTMLElement>("[data-toggle]");
      if (tog) {
        const row = tog.closest<HTMLTableRowElement>("tr[data-lvl]");
        if (row) {
          row.dataset.open = row.dataset.open === "1" ? "0" : "1";
          setF((cur) => ({ ...(cur ?? initial) })); // re-run the layout effect
        }
      }
    };
    const onChange = (e: Event) => {
      const t = e.target as HTMLInputElement;
      if (t.type !== "checkbox" || !t.dataset.tick) return;
      const [kind, id] = t.dataset.tick.split(":");
      const scope = kind === "all" ? `tr[data-lvl="u"][data-match="1"], tr[data-lvl="n"][data-match="1"]` : kind === "p" ? `tr[data-lvl="u"][data-p="${id}"][data-match="1"], tr[data-lvl="n"][data-p="${id}"][data-match="1"]` : `tr[data-lvl="u"][data-g="${id}"][data-match="1"]`;
      for (const r of root.querySelectorAll<HTMLTableRowElement>(scope)) {
        const cb = r.querySelector<HTMLInputElement>("input[type=checkbox][form]");
        if (cb && cb.checked !== t.checked) {
          cb.checked = t.checked;
          cb.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
      if (kind !== "g") for (const cb of root.querySelectorAll<HTMLInputElement>(kind === "all" ? "input[data-tick^='g:'], input[data-tick^='p:']" : `tr[data-p="${id}"] input[data-tick^='g:']`)) cb.checked = t.checked;
    };
    root.addEventListener("click", onClick);
    root.addEventListener("change", onChange);
    return () => {
      root.removeEventListener("click", onClick);
      root.removeEventListener("change", onChange);
    };
  }, [batchId, initial]);

  // sort: product blocks (tree) or single units (flat); the original order is restored when sorting is cleared
  useEffect(() => {
    const tbody = document.querySelector<HTMLTableSectionElement>(`#btable-${batchId} tbody`);
    if (!tbody) return;
    const all = Array.from(tbody.querySelectorAll<HTMLTableRowElement>("tr[data-lvl]"));
    const tail = Array.from(tbody.querySelectorAll<HTMLTableRowElement>("tr:not([data-lvl])"));
    const byIdx = (a: HTMLTableRowElement, b: HTMLTableRowElement) => Number(a.dataset.idx) - Number(b.dataset.idx);
    const val = (r: HTMLTableRowElement) => r.dataset[sort?.attr ?? "idx"] ?? "";
    const cmp = (a: HTMLTableRowElement, b: HTMLTableRowElement) => {
      if (!sort) return byIdx(a, b);
      const x = val(a);
      const y = val(b);
      const nx = Number(x);
      const ny = Number(y);
      const r = x !== "" && y !== "" && !Number.isNaN(nx) && !Number.isNaN(ny) ? nx - ny : x.localeCompare(y, "vi");
      return r * sort.dir || byIdx(a, b);
    };
    let ordered: HTMLTableRowElement[];
    if (f.view === "flat") ordered = [...all.filter((r) => r.dataset.lvl === "u" || r.dataset.lvl === "n").sort(cmp), ...all.filter((r) => r.dataset.lvl === "p" || r.dataset.lvl === "g").sort(byIdx)];
    else {
      const products = all.filter((r) => r.dataset.lvl === "p").sort(cmp);
      ordered = products.flatMap((p) => [p, ...all.filter((r) => r.dataset.lvl !== "p" && r.dataset.p === p.dataset.p).sort(byIdx)]);
    }
    for (const r of [...ordered, ...tail]) tbody.appendChild(r);
  }, [sort, f.view, batchId]);

  // header sort buttons live in the server-rendered <thead>
  useEffect(() => {
    const head = document.querySelector<HTMLElement>(`#btable-${batchId} thead`);
    if (!head) return;
    const onClick = (e: Event) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>("[data-sort]");
      if (!b) return;
      const attr = b.dataset.sort!;
      setSort((cur) => (!cur || cur.attr !== attr ? { attr, dir: 1 } : cur.dir === 1 ? { attr, dir: -1 } : null));
    };
    head.addEventListener("click", onClick);
    return () => head.removeEventListener("click", onClick);
  }, [batchId]);
  useEffect(() => {
    for (const b of document.querySelectorAll<HTMLElement>(`#btable-${batchId} thead [data-sort]`)) b.dataset.dir = sort && sort.attr === b.dataset.sort ? (sort.dir === 1 ? "asc" : "desc") : "";
  }, [sort, batchId]);

  const onQ = (v: string) => {
    setQInput(v);
    if (debounce.current) window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => update((cur) => ({ ...cur, q: v })), 200);
  };
  const clear = () => {
    setQInput("");
    setF({ ...EMPTY, view: f.view });
  };
  const sel = "!mb-0 !w-auto !py-1 !text-[13px]";
  const pick = (k: keyof Filter) => (e: { target: { value: string } }) => update((cur) => ({ ...cur, [k]: e.target.value }));
  return (
    <div className="mb-2 grid gap-2 rounded-md border border-[#e5e7eb] bg-white px-3 py-2 text-[13px]" data-testid={`batch-filter-${batchId}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex overflow-hidden rounded-md border border-[#d1d5db]" role="group" aria-label="Cách hiển thị">
          {(
            [
              ["tree", "Theo sản phẩm"],
              ["flat", "Từng mã"],
            ] as const
          ).map(([v, label]) => (
            <button key={v} type="button" onClick={() => update((cur) => ({ ...cur, view: v }))} className={cn("px-2.5 py-1 text-[12px] font-semibold", f.view === v ? "bg-lien-blue text-white" : "bg-white text-lien-heading hover:bg-[#f3f4f6]")} aria-pressed={f.view === v} data-testid={`view-${v}`}>
              {label}
            </button>
          ))}
        </span>
        <input value={qInput} onChange={(e) => onQ(e.target.value)} placeholder="Tìm sản phẩm / SKU / mã H… / #đơn / khách…" className={cn(adminInput, "!mb-0 !w-[260px] !py-1 !text-[13px]")} aria-label="Tìm trong đợt" data-testid="batch-q" />
        <select value={f.kind} onChange={pick("kind")} className={cn(adminInput, sel)} aria-label="Loại hàng" data-testid="batch-kind" title="Hàng theo đơn = đang giữ cho đơn khách; Lưu kho = chưa có khách; Cần mua = đơn trong đợt chưa có hàng">
          <option value="">Loại: tất cả</option>
          <option value="line">Hàng theo đơn</option>
          <option value="stock">Lưu kho (chưa có khách)</option>
          <option value="need">Cần mua</option>
        </select>
        {orders.length ? (
          <select value={f.order} onChange={pick("order")} className={cn(adminInput, sel)} aria-label="Đơn hàng" data-testid="batch-order">
            <option value="">Đơn: tất cả</option>
            {orders.map((o) => (
              <option key={o.number} value={String(o.number)}>
                #{o.number}
                {o.customer ? ` · ${o.customer}` : ""}
              </option>
            ))}
          </select>
        ) : null}
        <select value={f.ch} onChange={pick("ch")} className={cn(adminInput, sel)} aria-label="Kênh mua" data-testid="batch-channel">
          <option value="">Kênh: tất cả</option>
          <option value="online">Đặt mua online</option>
          <option value="store">Mua tại cửa hàng</option>
          <option value="other">Khác</option>
        </select>
        <select value={f.src} onChange={pick("src")} className={cn(adminInput, sel)} aria-label="Mua ở" data-testid="batch-src">
          <option value="">Mua ở: tất cả</option>
          {sources.map((s) => (
            <option key={s.key} value={s.key}>
              {s.name}
            </option>
          ))}
        </select>
        <input type="date" value={f.date} onChange={(e) => update((cur) => ({ ...cur, date: e.target.value.trim() }))} className={cn(adminInput, "!mb-0 !w-[150px] !py-1 !text-[13px]")} aria-label="Ngày mua" title="Gõ ngày (2026-09-27) hoặc tháng (2026-09)" data-testid="batch-date" />
        <select value={f.bill} onChange={pick("bill")} className={cn(adminInput, sel)} aria-label="Bill" data-testid="batch-bill">
          <option value="">Bill: tất cả</option>
          {bills.map((b) => (
            <option key={b.id} value={b.code}>
              {b.code}
            </option>
          ))}
          <option value="—">chưa có bill</option>
        </select>
        <select value={f.status} onChange={pick("status")} className={cn(adminInput, sel)} aria-label="Trạng thái" data-testid="batch-status">
          <option value="">Trạng thái: tất cả</option>
          {statuses.map((x) => (
            <option key={x.key} value={x.key}>
              {x.label}
            </option>
          ))}
        </select>
        <span className="ml-auto text-[12px] text-lien-muted" data-testid="batch-count">
          Đang hiện <span ref={countRef} className="font-semibold text-lien-heading" />
        </span>
        {!isEmpty(f) ? (
          <button type="button" onClick={clear} className={cn(btnSecondary, "!px-2 !py-0.5 !text-[12px]")}>
            <Fa name="times" /> Xoá lọc
          </button>
        ) : null}
      </div>
    </div>
  );
}
