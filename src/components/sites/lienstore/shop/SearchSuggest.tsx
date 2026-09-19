"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { useLang } from "@/components/sites/lienstore/shared/LangProvider";
import { cn } from "@/lib/utils";

interface Suggestions {
  trending: string[];
  brands: string[];
}
let cached: Suggestions | null = null;
let pending: Promise<Suggestions> | null = null;
function load(): Promise<Suggestions> {
  if (cached) return Promise.resolve(cached);
  pending ??= fetch("/api/search/suggest/")
    .then((r) => (r.ok ? r.json() : { trending: [], brands: [] }))
    .then((d: Suggestions) => (cached = { trending: d.trending ?? [], brands: d.brands ?? [] }))
    .catch(() => ({ trending: [], brands: [] }));
  return pending;
}

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d");

/**
 * Wraps a search form: while its input is focused, a panel underneath shows "Xu hướng tìm kiếm" (chips with a flame)
 * and "Thương hiệu nổi bật" (grey chips). Typing filters the chips; a click searches for that term.
 */
export function SearchSuggest({ children, className, panelClassName }: { children: ReactNode; className?: string; panelClassName?: string }) {
  const { t } = useLang();
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Suggestions | null>(cached);
  const [q, setQ] = useState("");

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const input = el.querySelector<HTMLInputElement>('input[name="s"]');
    if (!input) return;
    const onFocus = () => {
      setOpen(true);
      load().then(setData);
    };
    const onInput = () => setQ(input.value);
    input.addEventListener("focus", onFocus);
    input.addEventListener("input", onInput);
    return () => {
      input.removeEventListener("focus", onFocus);
      input.removeEventListener("input", onInput);
    };
  }, []);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const go = (term: string) => {
    setOpen(false);
    const input = box.current?.querySelector<HTMLInputElement>('input[name="s"]');
    if (input) input.value = term;
    router.push(`/shop/?s=${encodeURIComponent(term)}`);
  };
  const needle = fold(q.trim());
  const pick = (list: string[]) => (needle ? list.filter((x) => fold(x).includes(needle)) : list);
  const trending = pick(data?.trending ?? []);
  const brands = pick(data?.brands ?? []);
  const show = open && (trending.length > 0 || brands.length > 0);

  return (
    <div ref={box} className={cn("relative", className)}>
      {children}
      {show ? (
        <div className={cn("absolute top-full left-0 z-[60] mt-2 w-full min-w-[320px] rounded-2xl border border-[#e5e7eb] bg-white p-4 text-left shadow-[0_18px_40px_-16px_rgba(0,0,0,0.35)]", panelClassName)} data-testid="search-suggest" role="listbox">
          {trending.length ? (
            <section>
              <h3 className="m-0 mb-2 text-[12px] font-bold uppercase tracking-wide text-lien-heading">{t("trendingSearches")}</h3>
              <div className="flex flex-wrap gap-2">
                {trending.map((term) => (
                  <button key={term} type="button" role="option" aria-selected={false} onClick={() => go(term)} className="inline-flex items-center gap-1.5 rounded-full bg-[#fff1ea] px-3 py-1.5 text-[13px] font-medium text-[#c2410c] transition-colors hover:bg-[#ffe0d0]">
                    <Fa name="fire" className="text-[11px] text-lien-sale" /> {term}
                  </button>
                ))}
              </div>
            </section>
          ) : null}
          {brands.length ? (
            <section className={trending.length ? "mt-4 border-t border-[#f0f0f0] pt-4" : ""}>
              <h3 className="m-0 mb-2 text-[12px] font-bold uppercase tracking-wide text-lien-heading">{t("featuredBrands")}</h3>
              <div className="flex flex-wrap gap-2">
                {brands.map((b) => (
                  <button key={b} type="button" role="option" aria-selected={false} onClick={() => go(b)} className="rounded-full bg-[#f3f4f6] px-3 py-1.5 text-[12px] font-semibold uppercase tracking-wide text-lien-heading transition-colors hover:bg-[#e5e7eb]">
                    {b}
                  </button>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
