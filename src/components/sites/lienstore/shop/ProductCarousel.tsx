"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { cn } from "@/lib/utils";

/**
 * Horizontal product strip: cards passed as children (server-rendered <li>s with their own width classes),
 * arrows on both sides, mouse drag on desktop, native swipe with scroll-snap on touch.
 */
export function ProductCarousel({ children, className, ariaLabel }: { children: ReactNode; className?: string; ariaLabel?: string }) {
  const ref = useRef<HTMLUListElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      setCanPrev(el.scrollLeft > 4);
      setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    };
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      el.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, []);

  const page = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: "smooth" });
  };

  return (
    <div className={cn("relative", className)}>
      <ul
        ref={ref}
        aria-label={ariaLabel}
        className="m-0 flex list-none snap-x snap-mandatory gap-3 overflow-x-auto p-0 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:gap-4 [@media(hover:hover)]:cursor-grab [@media(hover:hover)]:active:cursor-grabbing"
        onDragStart={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          if (e.pointerType !== "mouse" || !ref.current) return;
          e.preventDefault();
          drag.current = { x: e.clientX, left: ref.current.scrollLeft, moved: false };
          ref.current.classList.remove("snap-x", "scroll-smooth");
        }}
        onPointerMove={(e) => {
          if (!drag.current || !ref.current) return;
          const dx = e.clientX - drag.current.x;
          if (Math.abs(dx) > 4) drag.current.moved = true;
          ref.current.scrollLeft = drag.current.left - dx;
        }}
        onPointerUp={() => {
          if (ref.current) ref.current.classList.add("snap-x");
          window.setTimeout(() => {
            drag.current = null;
          }, 0);
        }}
        onPointerLeave={() => {
          if (ref.current) ref.current.classList.add("snap-x");
          drag.current = null;
        }}
        onClickCapture={(e) => {
          // a drag must not open the product under the cursor
          if (drag.current?.moved) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
      >
        {children}
      </ul>
      <button
        type="button"
        aria-label="Trước"
        onClick={() => page(-1)}
        disabled={!canPrev}
        className="absolute top-[38%] -left-3 hidden h-10 w-10 items-center justify-center rounded-full border border-lien-line bg-white text-[16px] text-lien-heading shadow-[0_4px_14px_-4px_rgba(0,0,0,0.35)] hover:text-lien-blue disabled:opacity-0 md:flex"
      >
        <Fa name="angle-left" />
      </button>
      <button
        type="button"
        aria-label="Tiếp"
        onClick={() => page(1)}
        disabled={!canNext}
        className="absolute top-[38%] -right-3 hidden h-10 w-10 items-center justify-center rounded-full border border-lien-line bg-white text-[16px] text-lien-heading shadow-[0_4px_14px_-4px_rgba(0,0,0,0.35)] hover:text-lien-blue disabled:opacity-0 md:flex"
      >
        <Fa name="angle-right" />
      </button>
    </div>
  );
}
