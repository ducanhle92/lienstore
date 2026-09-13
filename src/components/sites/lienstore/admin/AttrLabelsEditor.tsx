"use client";

import { useState } from "react";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { MAX_VARIANT_ATTRS } from "@/lib/variants";
import { adminInput, btnSecondary } from "./ui";

interface Props {
  initial: string[];
  /** Field name; repeated once per label (order = level: first = parent, next = child…). */
  name?: string;
}

/**
 * Ordered list of variant attributes ("Loại" → "Số viên" …): add / remove / move. The order is the parent→child
 * hierarchy the storefront picker follows — the customer picks level 1 first, level 2 only offers what exists
 * under the chosen level 1.
 */
export function AttrLabelsEditor({ initial, name = "attrLabels" }: Props) {
  const [labels, setLabels] = useState<string[]>(initial.length ? initial : ["Loại"]);
  const set = (i: number, v: string) => setLabels((l) => l.map((x, j) => (j === i ? v : x)));
  const move = (i: number, d: -1 | 1) =>
    setLabels((l) => {
      const j = i + d;
      if (j < 0 || j >= l.length) return l;
      const c = [...l];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });
  return (
    <div className="grid gap-2" data-testid="attr-labels">
      {labels.map((label, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <span className="w-[52px] shrink-0 text-[12px] text-lien-muted">{i === 0 ? "Cấp 1" : `Cấp ${i + 1}`}</span>
          <input name={name} value={label} onChange={(e) => set(i, e.target.value)} placeholder={i === 0 ? "VD: Loại / Vị" : "VD: Số viên / Khối lượng"} maxLength={30} className={`${adminInput} !mb-0 !py-1.5 !text-[13px]`} aria-label={`Thuộc tính cấp ${i + 1}`} />
          <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="rounded border border-[#d1d5db] px-1.5 py-1 text-[11px] text-lien-muted disabled:opacity-30" title="Lên một cấp" aria-label="Lên">
            <Fa name="angle-up" />
          </button>
          <button type="button" onClick={() => move(i, 1)} disabled={i === labels.length - 1} className="rounded border border-[#d1d5db] px-1.5 py-1 text-[11px] text-lien-muted disabled:opacity-30" title="Xuống một cấp" aria-label="Xuống">
            <Fa name="angle-down" />
          </button>
          <button type="button" onClick={() => setLabels((l) => l.filter((_, j) => j !== i))} disabled={labels.length <= 1} className="rounded border border-[#d1d5db] px-1.5 py-1 text-[11px] text-lien-heart disabled:opacity-30" title="Bỏ thuộc tính này" aria-label="Bỏ">
            <Fa name="times" />
          </button>
        </div>
      ))}
      {labels.length < MAX_VARIANT_ATTRS ? (
        <button type="button" onClick={() => setLabels((l) => [...l, ""])} className={`${btnSecondary} justify-self-start !py-1 !text-[12px]`} data-testid="add-attr">
          <Fa name="plus" /> Thêm thuộc tính (cấp con)
        </button>
      ) : null}
      <p className="m-0 text-[12px] leading-5 text-lien-muted">
        Thứ tự = cấp cha → cấp con. Ví dụ cấp 1 “Loại” (A / White), cấp 2 “Số viên” (420 / 840): khách chọn Loại trước, Số viên chỉ hiện những mức có của Loại đó. Tối đa {MAX_VARIANT_ATTRS} cấp.
      </p>
    </div>
  );
}
