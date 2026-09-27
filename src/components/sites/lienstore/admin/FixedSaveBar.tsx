"use client";

import { useEffect, useState } from "react";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { cn } from "@/lib/utils";
import { btnPrimary, btnSecondary } from "./ui";

interface Props {
  /** ids of the forms whose inputs this bar saves (inputs bind with form=…). */
  forms: string[];
  label?: string;
  resetLabel?: string;
  hint?: string;
  /** Show the bar even before anything changed (default: always visible). */
  alwaysVisible?: boolean;
}

/**
 * One save bar fixed to the bottom of the window (like the product page): it watches every input bound to the given
 * forms, counts what changed, and on click submits the form that was edited last (each form is one server action).
 * "Huỷ" resets all of them. Works for table screens where the inputs sit in many rows / cards.
 */
export function FixedSaveBar({ forms, label = "Lưu thay đổi", resetLabel = "Huỷ", hint, alwaysVisible = true }: Props) {
  const [dirty, setDirty] = useState<Record<string, number>>({});
  const [last, setLast] = useState<string | null>(null);
  useEffect(() => {
    const ids = new Set(forms);
    const initial = new WeakMap<HTMLElement, string>();
    const valueOf = (el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) => (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio") ? String(el.checked) : el.value);
    const controls = () => Array.from(document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea")).filter((el) => ids.has(el.getAttribute("form") ?? el.form?.id ?? ""));
    for (const el of controls()) initial.set(el, valueOf(el));
    const recount = () => {
      const next: Record<string, number> = {};
      for (const el of controls()) {
        const fid = el.getAttribute("form") ?? el.form?.id ?? "";
        if (!initial.has(el)) initial.set(el, valueOf(el));
        if (initial.get(el) !== valueOf(el)) next[fid] = (next[fid] ?? 0) + 1;
      }
      setDirty(next);
    };
    const onChange = (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      const fid = t.getAttribute("form") ?? (t as HTMLInputElement).form?.id ?? "";
      if (ids.has(fid)) setLast(fid);
      recount();
    };
    document.addEventListener("input", onChange);
    document.addEventListener("change", onChange);
    document.addEventListener("reset", () => setTimeout(recount, 0), true);
    return () => {
      document.removeEventListener("input", onChange);
      document.removeEventListener("change", onChange);
    };
  }, [forms]);
  const total = Object.values(dirty).reduce((n, v) => n + v, 0);
  const dirtyForms = Object.keys(dirty);
  const target = last && dirty[last] ? last : (dirtyForms[0] ?? forms[0]);
  const save = () => {
    const f = document.getElementById(target) as HTMLFormElement | null;
    f?.requestSubmit();
  };
  const reset = () => {
    for (const id of forms) (document.getElementById(id) as HTMLFormElement | null)?.reset();
    setDirty({});
  };
  if (!alwaysVisible && !total) return null;
  return (
    <>
      {/* room so the last rows are not hidden behind the bar */}
      <div className="h-16" aria-hidden />
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#e5e7eb] bg-white/95 shadow-[0_-6px_16px_-10px_rgba(0,0,0,0.35)] backdrop-blur md:left-60" data-testid="fixed-savebar" data-dirty={total}>
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-2 px-4 py-2.5 xl:max-w-[1400px] 2xl:max-w-[1600px]">
          <button type="button" onClick={save} className={cn(btnPrimary, "!px-5 !py-2 !text-[14px]")} title={dirtyForms.length > 1 ? "Có thay đổi ở nhiều khối — lưu khối vừa sửa trước, rồi bấm lại cho khối còn lại" : undefined}>
            <Fa name="check" /> {label}
            {total ? ` (${total} ô)` : ""}
          </button>
          <button type="button" onClick={reset} className={btnSecondary} title="Trả mọi ô về giá trị đang lưu">
            {resetLabel}
          </button>
          {dirtyForms.length > 1 ? <span className="text-[12px] text-amber-800">Đã sửa ở {dirtyForms.length} khối — mỗi lần lưu ghi một khối (khối vừa sửa trước).</span> : hint ? <span className="text-[12px] text-lien-muted">{hint}</span> : null}
        </div>
      </div>
    </>
  );
}
