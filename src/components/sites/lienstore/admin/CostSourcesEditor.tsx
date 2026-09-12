"use client";

import { useEffect, useState } from "react";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { COST_SOURCE_LABEL, COST_SOURCES, type CostSourceKind, sourceFromUrl } from "@/lib/cost-sources";
import { cn } from "@/lib/utils";
import { adminInput } from "./ui";

export interface CostSourceDraft {
  source: string;
  priceJpy: string;
  url: string;
}

interface Props {
  initial: CostSourceDraft[];
  primaryIndex: number;
  defaultSource: string;
  error?: string;
  /** Primary quote (¥ + link) whenever it changes, for the live cost / price hints. */
  onPrimaryChange?: (primary: { priceJpy: number | null; url: string; source: string } | null) => void;
}

const priceOf = (r: CostSourceDraft | undefined) => {
  const v = Number.parseInt((r?.priceJpy ?? "").replace(/[^\d]/g, ""), 10);
  return Number.isFinite(v) && v > 0 ? v : null;
};

/**
 * "Giá vốn (円) — nguồn mua": one row per purchase source (nguồn · ¥ · link); the radio marks the quote used as giá vốn,
 * "Chọn nguồn rẻ nhất" moves it to the cheapest row. Plain repeated inputs (cs_source / cs_price / cs_url + cs_primary)
 * so the server action reads them in order with formData.getAll.
 */
export function CostSourcesEditor({ initial, primaryIndex, defaultSource, error, onPrimaryChange }: Props) {
  const [rows, setRows] = useState<CostSourceDraft[]>(initial.length ? initial : [{ source: defaultSource, priceJpy: "", url: "" }]);
  const [primary, setPrimary] = useState(Math.min(Math.max(0, primaryIndex), Math.max(0, initial.length - 1)));
  useEffect(() => {
    const r = rows[primary];
    onPrimaryChange?.(r ? { priceJpy: priceOf(r), url: r.url, source: r.source } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, primary]);
  const update = (i: number, patch: Partial<CostSourceDraft>) => {
    const next = rows.map((r, k) => (k === i ? { ...r, ...patch } : r));
    // a pasted link fills the source automatically
    if (patch.url !== undefined && patch.url && (rows[i].source === defaultSource || rows[i].source === "manual")) next[i].source = sourceFromUrl(patch.url);
    setRows(next);
  };
  const remove = (i: number) => {
    const next = rows.filter((_, k) => k !== i);
    setRows(next);
    setPrimary(primary >= next.length ? Math.max(0, next.length - 1) : primary > i ? primary - 1 : primary);
  };
  const cheapestIdx = rows.reduce<number>((best, r, i) => {
    const p = priceOf(r);
    if (p === null) return best;
    const b = best >= 0 ? priceOf(rows[best]) : null;
    return b === null || p < b ? i : best;
  }, -1);
  const priced = rows.filter((r) => priceOf(r) !== null).length;
  return (
    <div>
      <input type="hidden" name="cs_primary" value={rows.length ? String(primary) : ""} readOnly />
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className={cn("rounded-md border p-2", i === primary ? "border-lien-blue bg-lien-blue-soft/40" : "border-[#e5e7eb]")} data-testid="cost-source-row">
            <div className="flex items-center gap-2">
              <label className="flex shrink-0 items-center gap-1 text-[12px] text-lien-muted" title="Dùng giá này làm giá vốn">
                <input type="radio" name="cs_primary_pick" checked={i === primary} onChange={() => setPrimary(i)} className="h-4 w-4" />
                Giá vốn
              </label>
              <select name="cs_source" value={r.source} onChange={(e) => update(i, { source: e.target.value })} className={cn(adminInput, "!mb-0 min-w-0 flex-1")} aria-label="Nguồn mua">
                {COST_SOURCES.map((s: CostSourceKind) => (
                  <option key={s} value={s}>
                    {COST_SOURCE_LABEL[s]}
                  </option>
                ))}
              </select>
              <input name="cs_price" value={r.priceJpy} onChange={(e) => update(i, { priceJpy: e.target.value })} inputMode="numeric" placeholder="¥" className={cn(adminInput, "!mb-0 !w-[96px] shrink-0", error && i === primary && "border-red-500")} aria-label="Giá ¥" />
              <button type="button" onClick={() => remove(i)} className="shrink-0 rounded-md border border-[#d1d5db] px-2 py-1.5 text-[12px] text-red-600 hover:bg-red-50" title="Bỏ nguồn này" aria-label="Bỏ nguồn">
                <Fa name="trash" />
              </button>
            </div>
            <input name="cs_url" type="url" value={r.url} onChange={(e) => update(i, { url: e.target.value })} placeholder="Link sản phẩm tại nguồn này (Amazon JP, trang hãng…)" className={cn(adminInput, "!mb-0 mt-1.5 !text-[12px]")} aria-label="Link nguồn mua" />
            {i === cheapestIdx && priced > 1 ? <span className="mt-1 inline-block rounded bg-green-100 px-1.5 text-[11px] font-semibold text-green-800">rẻ nhất</span> : null}
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setRows([...rows, { source: defaultSource, priceJpy: "", url: "" }])} className="inline-flex items-center gap-1 text-[13px] font-semibold text-lien-blue hover:underline">
          <Fa name="plus" /> Thêm nguồn mua
        </button>
        {priced > 1 ? (
          <button type="button" onClick={() => setPrimary(cheapestIdx)} disabled={cheapestIdx === primary} className="inline-flex items-center gap-1 rounded-md border border-lien-blue px-2 py-1 text-[12px] font-semibold text-lien-blue hover:bg-lien-blue-soft disabled:opacity-50" data-testid="pick-cheapest">
            <Fa name="refresh" /> {cheapestIdx === primary ? "Đang dùng nguồn rẻ nhất" : "Tối ưu: chọn nguồn rẻ nhất"}
          </button>
        ) : null}
      </div>
      {error ? <p className="mt-1 text-[12px] leading-4 text-red-600">{error}</p> : null}
    </div>
  );
}
