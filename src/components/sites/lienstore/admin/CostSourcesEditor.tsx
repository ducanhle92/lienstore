"use client";

import { useState } from "react";
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
  /** Called with the primary price (¥) whenever it changes, for the live price hint. */
  onPrimaryChange?: (priceJpy: number | null) => void;
}

/**
 * "Giá vốn (円) — các nguồn mua": several Japanese price quotes per product (source · ¥ · link); the radio marks the one
 * used as giá vốn. Plain inputs (cs_source / cs_price / cs_url repeated + cs_primary) so the server action reads them
 * with formData.getAll in order.
 */
export function CostSourcesEditor({ initial, primaryIndex, defaultSource, error, onPrimaryChange }: Props) {
  const [rows, setRows] = useState<CostSourceDraft[]>(initial.length ? initial : [{ source: defaultSource, priceJpy: "", url: "" }]);
  const [primary, setPrimary] = useState(Math.min(Math.max(0, primaryIndex), Math.max(0, initial.length - 1)));
  const emit = (next: CostSourceDraft[], p: number) => {
    const v = Number.parseInt((next[p]?.priceJpy ?? "").replace(/[^\d]/g, ""), 10);
    onPrimaryChange?.(Number.isFinite(v) && v > 0 ? v : null);
  };
  const update = (i: number, patch: Partial<CostSourceDraft>) => {
    const next = rows.map((r, k) => (k === i ? { ...r, ...patch } : r));
    // a pasted link fills the source automatically
    if (patch.url !== undefined && patch.url && (rows[i].source === defaultSource || rows[i].source === "manual")) next[i].source = sourceFromUrl(patch.url);
    setRows(next);
    emit(next, primary);
  };
  const remove = (i: number) => {
    const next = rows.filter((_, k) => k !== i);
    const p = primary >= next.length ? Math.max(0, next.length - 1) : primary > i ? primary - 1 : primary;
    setRows(next);
    setPrimary(p);
    emit(next, p);
  };
  return (
    <div>
      <input type="hidden" name="cs_primary" value={rows.length ? String(primary) : ""} readOnly />
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className={cn("grid grid-cols-[auto_150px_120px_1fr_auto] items-center gap-2 rounded-md border p-2", i === primary ? "border-lien-blue bg-lien-blue-soft/40" : "border-[#e5e7eb]")} data-testid="cost-source-row">
            <label className="flex items-center gap-1 text-[12px] text-lien-muted" title="Dùng giá này làm giá vốn">
              <input
                type="radio"
                name="cs_primary_pick"
                checked={i === primary}
                onChange={() => {
                  setPrimary(i);
                  emit(rows, i);
                }}
                className="h-4 w-4"
              />
              Giá vốn
            </label>
            <select name="cs_source" value={r.source} onChange={(e) => update(i, { source: e.target.value })} className={cn(adminInput, "!mb-0")} aria-label="Nguồn mua">
              {COST_SOURCES.map((s: CostSourceKind) => (
                <option key={s} value={s}>
                  {COST_SOURCE_LABEL[s]}
                </option>
              ))}
            </select>
            <input name="cs_price" value={r.priceJpy} onChange={(e) => update(i, { priceJpy: e.target.value })} inputMode="numeric" placeholder="¥" className={cn(adminInput, "!mb-0", error && i === primary && "border-red-500")} aria-label="Giá ¥" />
            <input name="cs_url" type="url" value={r.url} onChange={(e) => update(i, { url: e.target.value })} placeholder="Link sản phẩm tại nguồn" className={cn(adminInput, "!mb-0")} aria-label="Link" />
            <button type="button" onClick={() => remove(i)} className="rounded-md border border-[#d1d5db] px-2 py-1.5 text-[12px] text-red-600 hover:bg-red-50" title="Bỏ nguồn này" aria-label="Bỏ nguồn">
              <Fa name="trash" />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => {
          const next = [...rows, { source: defaultSource, priceJpy: "", url: "" }];
          setRows(next);
        }}
        className="mt-2 inline-flex items-center gap-1 text-[13px] font-semibold text-lien-blue hover:underline"
      >
        <Fa name="plus" /> Thêm nguồn mua
      </button>
      {error ? <p className="mt-1 text-[12px] leading-4 text-red-600">{error}</p> : null}
    </div>
  );
}
