"use client";

import { useEffect, useRef, useState } from "react";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { cn } from "@/lib/utils";
import { SearchSuggest } from "./SearchSuggest";

interface SearchModalProps {
  /** Class for the trigger link/button (styled by the caller to match the nav item). */
  triggerClassName?: string;
}

/** The theme's `#myModal` search overlay opened from the nav search icon (`#myBtn`). */
export function SearchModal({ triggerClassName }: SearchModalProps) {
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button type="button" id="myBtn" aria-label="Search" aria-haspopup="dialog" onClick={() => setOpen(true)} className={cn(triggerClassName)}>
        <Fa name="search" className="text-[18px] leading-[18px]" />
      </button>
      {open ? (
        <div id="myModal" className="modal fixed inset-0 z-[100000] bg-black/70" role="dialog" aria-modal="true" aria-label="Tìm kiếm">
          <button type="button" aria-label="Đóng" onClick={() => setOpen(false)} className="absolute inset-0 cursor-default" />
          <div className="modal-content relative mx-auto mt-[220px] w-[min(560px,92vw)]">
            <button
              type="button"
              id="search-close"
              onClick={() => setOpen(false)}
              aria-label="Đóng"
              className="close absolute -top-11 right-0 text-[34px] font-bold leading-none text-white hover:text-lien-line"
            >
              ×
            </button>
            <SearchSuggest panelClassName="!static !mt-3 !w-full !min-w-0 !shadow-none">
            <form role="search" method="get" action="/shop/" autoComplete="off" className="search-form flex rounded-[3px] border-2 border-lien-blue bg-white">
              <label htmlFor="main-search-form" className="sr-only">
                Search for:
              </label>
              <input
                ref={input}
                id="main-search-form"
                type="search"
                name="s"
                placeholder="Search …"
                className="search-field h-[46px] flex-1 border-0 bg-transparent px-3 font-arial text-[16px] text-lien-input-text outline-none"
              />
              <button type="submit" className="search-submit h-[46px] w-[60px] bg-lien-blue text-white hover:bg-lien-blue-hover" aria-label="Search">
                <Fa name="search" className="text-[21px] leading-[21px]" />
              </button>
            </form>
            </SearchSuggest>
          </div>
        </div>
      ) : null}
    </>
  );
}
