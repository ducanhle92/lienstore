"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { cn } from "@/lib/utils";

interface Props {
  /** Explanation shown in the popup — usually the exact numbers of the calculation, so admin can check it by hand. */
  children: ReactNode;
  className?: string;
}

/**
 * Small "ⓘ" button next to a figure; click reveals a popup with how that figure was computed. Click elsewhere, the
 * button again, or Escape closes it. Used on the price-breakdown rows (Kho hàng › Sản phẩm) so admin can verify every
 * step of "giá vốn tại Nhật → phí ship 3 chặng → giá vốn về VN → giá kỳ vọng" without redoing the maths by hand.
 */
export function InfoPopover({ children, className }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <span ref={ref} className={cn("relative inline-block align-middle", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn("ml-1 inline-flex h-[15px] w-[15px] items-center justify-center rounded-full text-[12px] leading-none", open ? "text-lien-blue" : "text-lien-blue/60 hover:text-lien-blue")}
        aria-label="Xem cách tính"
        aria-expanded={open}
        data-testid="info-popover-trigger"
      >
        <Fa name="info-circle" />
      </button>
      {open ? (
        <span
          role="tooltip"
          data-testid="info-popover-content"
          className="absolute left-1/2 top-full z-30 mt-1.5 w-[280px] -translate-x-1/2 rounded-md border border-lien-blue/30 bg-white p-2.5 text-left text-[11px] leading-[17px] whitespace-normal text-lien-text normal-case shadow-lg"
        >
          {children}
          <span className="absolute -top-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-t border-l border-lien-blue/30 bg-white" />
        </span>
      ) : null}
    </span>
  );
}
