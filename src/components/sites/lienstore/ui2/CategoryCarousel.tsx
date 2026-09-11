"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { useLang } from "@/components/sites/lienstore/shared/LangProvider";
import { buildCategoryTree, shortName } from "@/lib/categories";
import { cn } from "@/lib/utils";
import type { HeaderCategory } from "./Header2";

/**
 * Category tiles as a paged carousel (8 per page on desktop, scroll-snap on touch): soft grey tile, big illustration,
 * bold name, item count, dots underneath — like the reference grocery site.
 */
export function CategoryCarousel({ categories }: { categories: HeaderCategory[] }) {
  const { t } = useLang();
  const tree = buildCategoryTree(categories);
  // top-level groups only (Sức khỏe, Mỹ phẩm, Mẹ và bé…); sub-categories live in the menu and the shop sidebar
  const tiles = tree.map((n) => ({ ...n.category, count: n.total, image: n.image }));

  const ref = useRef<HTMLUListElement>(null);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(0);
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const p = Math.max(1, Math.ceil(el.scrollWidth / el.clientWidth - 0.01));
      setPages(p);
      setPage(Math.min(p - 1, Math.round(el.scrollLeft / el.clientWidth)));
    };
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      el.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [tiles.length]);

  const go = (i: number) => {
    const el = ref.current;
    if (!el) return;
    const target = Math.max(0, Math.min(pages - 1, i));
    el.scrollTo({ left: target * el.clientWidth, behavior: "smooth" });
  };

  return (
    <section aria-label="Danh mục sản phẩm" className="relative mt-6">
      <ul
        ref={ref}
        className="m-0 flex list-none snap-x snap-mandatory gap-3 overflow-x-auto p-0 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [@media(hover:hover)]:cursor-grab [@media(hover:hover)]:active:cursor-grabbing"
        onDragStart={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          if (e.pointerType !== "mouse" || !ref.current) return;
          e.preventDefault();
          drag.current = { x: e.clientX, left: ref.current.scrollLeft, moved: false };
          ref.current.classList.remove("snap-x");
        }}
        onPointerMove={(e) => {
          if (!drag.current || !ref.current) return;
          const dx = e.clientX - drag.current.x;
          if (Math.abs(dx) > 4) drag.current.moved = true;
          ref.current.scrollLeft = drag.current.left - dx;
        }}
        onPointerUp={() => {
          ref.current?.classList.add("snap-x");
          window.setTimeout(() => {
            drag.current = null;
          }, 0);
        }}
        onPointerLeave={() => {
          ref.current?.classList.add("snap-x");
          drag.current = null;
        }}
        onClickCapture={(e) => {
          if (drag.current?.moved) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
      >
        {tiles.map((c) => (
          <li key={c.slug} className="w-[calc((100%-0.75rem*2)/3)] shrink-0 snap-start sm:w-[calc((100%-0.75rem*3)/4)] md:w-[calc((100%-0.75rem*5)/6)] lg:w-[calc((100%-0.75rem*7)/8)]">
            <Link href={`/product-category/${c.slug}/`} className="group flex h-full flex-col items-center rounded-xl bg-lien-footer2 px-2 pt-4 pb-4 text-center no-underline transition-colors hover:bg-lien-blue-soft">
              <span className="mb-3 flex h-[84px] w-[84px] items-center justify-center">
                {c.image ? (
                  <Image src={c.image} alt="" width={84} height={84} className="h-[84px] w-[84px] object-contain drop-shadow-sm transition-transform group-hover:scale-105" />
                ) : (
                  <Fa name="tags" className="text-[30px] text-lien-blue" />
                )}
              </span>
              <span className="line-clamp-2 text-[14px] font-bold leading-5 text-lien-heading sm:text-[15px]">{shortName(c.name)}</span>
              <span className="mt-1 text-[12px] text-lien-muted">{c.count} {t("itemsUnit")}</span>
            </Link>
          </li>
        ))}
        <li className="w-[calc((100%-0.75rem*2)/3)] shrink-0 snap-start sm:w-[calc((100%-0.75rem*3)/4)] md:w-[calc((100%-0.75rem*5)/6)] lg:w-[calc((100%-0.75rem*7)/8)]">
          <Link href="/shop/" className="group flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-lien-blue/40 bg-white px-2 py-4 text-center no-underline hover:bg-lien-blue-soft">
            <span className="mb-3 flex h-[84px] w-[84px] items-center justify-center rounded-full bg-lien-blue-soft text-[28px] text-lien-blue">
              <Fa name="th-large" />
            </span>
            <span className="text-[14px] font-bold leading-5 text-lien-blue sm:text-[15px]">{t("allCategories")}</span>
            <span className="mt-1 text-[12px] text-lien-muted">{tiles.length} {t("categoriesUnit")}</span>
          </Link>
        </li>
      </ul>

      {pages > 1 ? (
        <>
          <button type="button" aria-label="Danh mục trước" onClick={() => go(page - 1)} disabled={page === 0} className="absolute top-1/2 -left-3 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-lien-line bg-white text-lien-heading shadow-sm hover:text-lien-blue disabled:opacity-30 lg:flex">
            <Fa name="angle-left" />
          </button>
          <button type="button" aria-label="Danh mục tiếp" onClick={() => go(page + 1)} disabled={page >= pages - 1} className="absolute top-1/2 -right-3 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-lien-line bg-white text-lien-heading shadow-sm hover:text-lien-blue disabled:opacity-30 lg:flex">
            <Fa name="angle-right" />
          </button>
          <div className="mt-3 flex justify-center gap-1.5" role="tablist" aria-label="Trang danh mục">
            {Array.from({ length: pages }, (_, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={i === page}
                aria-label={`Trang ${i + 1}`}
                onClick={() => go(i)}
                className={cn("h-1.5 rounded-full transition-all", i === page ? "w-6 bg-lien-blue" : "w-1.5 bg-[#d1d5db] hover:bg-lien-muted")}
              />
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
