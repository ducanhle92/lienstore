"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { formatAmount } from "@/lib/format";
import { useLang } from "@/components/sites/lienstore/shared/LangProvider";
import { cn } from "@/lib/utils";
import { useCart } from "./CartProvider";
import { QuickViewButton, type QuickViewProduct } from "./QuickView";

/**
 * Slide-in mini cart (sesofoods style): opens from the right after "Thêm vào giỏ" or the header cart icon.
 * Lists items with a quantity stepper, a "Thường được mua cùng với" carousel and the subtotal + checkout CTAs.
 */
export function CartDrawer() {
  const { t } = useLang();
  const { drawerOpen, closeDrawer, items, update, remove, subtotal, hydrated } = useCart();
  const panel = useRef<HTMLDivElement>(null);

  // Esc closes; lock page scroll while open.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDrawer();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [drawerOpen, closeDrawer]);

  const count = items.reduce((n, it) => n + it.quantity, 0);

  return (
    <div className={cn("fixed inset-0 z-[100000]", drawerOpen ? "" : "pointer-events-none")} aria-hidden={!drawerOpen}>
      <button
        type="button"
        aria-label="Đóng giỏ hàng"
        onClick={closeDrawer}
        tabIndex={drawerOpen ? 0 : -1}
        className={cn("absolute inset-0 bg-black/45 transition-opacity duration-300", drawerOpen ? "opacity-100" : "opacity-0")}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Giỏ hàng"
        tabIndex={-1}
        data-cart-drawer={drawerOpen ? "open" : "closed"}
        className={cn(
          "absolute top-0 right-0 flex h-full w-full max-w-[400px] flex-col bg-white shadow-[-8px_0_32px_-12px_rgba(0,0,0,0.4)] transition-transform duration-300 ease-out outline-none",
          drawerOpen ? "translate-x-0" : "translate-x-full",
        )}
      >
        <header className="flex items-center justify-between border-b border-lien-line px-5 py-4">
          <h2 className="m-0 text-[16px] font-bold uppercase tracking-[0.3px] text-lien-heading">
            Giỏ hàng {hydrated && count ? <span className="ml-1 text-[13px] font-medium text-lien-muted">({count})</span> : null}
          </h2>
          <button type="button" onClick={closeDrawer} aria-label="Đóng" className="flex h-9 w-9 items-center justify-center rounded-full text-[18px] text-lien-heading hover:bg-lien-cream">
            <Fa name="times" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <Fa name="shopping-basket" className="text-[42px] text-lien-line" />
              <p className="mt-3 mb-4 text-[14px] text-lien-muted">{t("cartEmpty")}</p>
              <button type="button" onClick={closeDrawer} className="inline-flex items-center justify-center rounded-full bg-lien-blue px-6 py-2.5 text-[13px] font-bold uppercase tracking-[0.5px] text-white hover:bg-lien-blue-hover">
                Tiếp tục mua sắm
              </button>
            </div>
          ) : (
            <ul className="m-0 list-none p-0">
              {items.map((it) => (
                <li key={it.productId} className="flex gap-4 border-b border-lien-line px-5 py-4">
                  <Link href={`/product/${it.slug}/`} onClick={closeDrawer} className="shrink-0">
                    <Image src={it.image} alt="" width={90} height={90} className="h-[90px] w-[90px] rounded border border-lien-line object-contain" />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <Link href={`/product/${it.slug}/`} onClick={closeDrawer} className="line-clamp-2 text-[14px] leading-5 font-medium text-lien-heading no-underline hover:text-lien-blue">
                      {it.name}
                    </Link>
                    <p className="m-0 mt-1 text-[14px] font-bold text-lien-sale-text">{formatAmount(it.price)}đ</p>
                    <div className="mt-2 flex items-center gap-3">
                      <div className="inline-flex h-9 items-center overflow-hidden rounded-full border border-lien-heading/60">
                        <button
                          type="button"
                          aria-label={it.quantity <= 1 ? "Xoá sản phẩm" : "Giảm"}
                          onClick={() => (it.quantity <= 1 ? remove(it.productId) : update(it.productId, it.quantity - 1))}
                          className="flex h-full w-9 items-center justify-center text-[12px] text-lien-heading hover:bg-lien-cream"
                        >
                          <Fa name={it.quantity <= 1 ? "trash" : "minus"} />
                        </button>
                        <span className="w-8 text-center text-[14px] font-semibold text-lien-heading" data-qty={it.quantity}>
                          {it.quantity}
                        </span>
                        <button type="button" aria-label="Tăng" onClick={() => update(it.productId, it.quantity + 1)} className="flex h-full w-9 items-center justify-center text-[12px] text-lien-heading hover:bg-lien-cream">
                          <Fa name="plus" />
                        </button>
                      </div>
                      <span className="text-[13px] text-lien-muted">= {formatAmount(it.price * it.quantity)}đ</span>
                    </div>
                    <button type="button" onClick={() => remove(it.productId)} className="mt-2 inline-flex items-center gap-1 text-[12px] text-lien-muted hover:text-lien-sale-text">
                      <Fa name="trash" /> Xoá
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {drawerOpen ? <Suggestions ids={items.map((i) => i.productId)} /> : null}
        </div>

        <footer className="border-t border-lien-line px-5 py-4">
          <div className="flex items-baseline justify-between">
            <span className="text-[16px] font-bold text-lien-heading">{t("subtotal")} :</span>
            <span className="text-[18px] font-bold text-lien-heading">{formatAmount(subtotal)}đ</span>
          </div>
          <p className="m-0 mt-1 mb-3 text-[12px] leading-5 text-lien-muted">
            <strong className="text-lien-heading">{t("feesNote")}</strong> {t("feesNoteTail")}
          </p>
          <Link href="/cart/" onClick={closeDrawer} className="flex h-11 w-full items-center justify-center rounded-full bg-lien-blue text-[13px] font-bold uppercase tracking-[2px] text-white no-underline hover:bg-lien-blue-hover">
            {t("viewCart")}
          </Link>
          <Link href="/checkout/" onClick={closeDrawer} className={cn("mt-2 flex h-11 w-full items-center justify-center rounded-full bg-lien-heading text-[13px] font-bold uppercase tracking-[2px] text-white no-underline hover:opacity-90", items.length === 0 && "pointer-events-none opacity-40")}>
            {t("checkout")}
          </Link>
        </footer>
      </div>
    </div>
  );
}

/** "Thường được mua cùng với :" — one suggestion at a time with arrows + dots, like the reference site. */
function Suggestions({ ids }: { ids: number[] }) {
  const key = ids.join(",");
  const [list, setList] = useState<QuickViewProduct[]>([]);
  const [i, setI] = useState(0);
  const { add, openDrawer } = useCart();

  useEffect(() => {
    let alive = true;
    fetch(`/api/cart/suggest/?ids=${key}`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d: { items: QuickViewProduct[] }) => {
        if (!alive) return;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch result
        setList(d.items ?? []);
        setI(0);
      })
      .catch(() => alive && setList([]));
    return () => {
      alive = false;
    };
  }, [key]);

  if (list.length === 0) return null;
  const pages = Math.min(list.length, 5);
  const p = list[i % list.length];
  const pct = p.regularPrice && p.regularPrice > p.price ? Math.round((1 - p.price / p.regularPrice) * 100) : 0;
  const cartProduct = { id: p.id, slug: p.slug, name: p.name, price: p.price, image: p.thumb || p.image };

  return (
    <section className="mx-5 my-4 rounded-md border border-lien-line bg-lien-footer2" aria-label="Thường được mua cùng với">
      <h3 className="m-0 border-b border-lien-line px-4 py-2.5 text-center text-[13px] font-bold text-lien-heading">Thường được mua cùng với :</h3>
      <div className="flex items-center gap-3 bg-white px-3 py-3">
        <Link href={`/product/${p.slug}/`} className="shrink-0">
          <Image src={p.thumb || p.image} alt="" width={64} height={64} className="h-16 w-16 rounded border border-lien-line object-contain" />
        </Link>
        <div className="min-w-0 flex-1">
          <Link href={`/product/${p.slug}/`} className="line-clamp-1 text-[13px] font-medium text-lien-heading no-underline hover:text-lien-blue">
            {p.name}
          </Link>
          <p className="m-0 mt-0.5 flex flex-wrap items-center gap-1.5 text-[13px]">
            {p.regularPrice && p.regularPrice > p.price ? <del className="text-[11px] text-lien-muted">{formatAmount(p.regularPrice)}đ</del> : null}
            <span className="font-bold text-lien-sale-text">{formatAmount(p.price)}đ</span>
            {pct ? <span className="rounded bg-lien-sale px-1 text-[10px] font-bold text-white">-{pct}%</span> : null}
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-1.5">
          <button
            type="button"
            onClick={() => {
              add(cartProduct, 1);
              openDrawer();
            }}
            aria-label="Thêm vào giỏ"
            title="Thêm vào giỏ"
            className="flex h-9 w-9 items-center justify-center rounded-md bg-lien-success text-[14px] text-white hover:opacity-90"
          >
            <Fa name="cart-plus" />
          </button>
          <QuickViewButton product={p} iconOnly className="flex h-9 w-9 items-center justify-center rounded-md border border-lien-line bg-white text-[13px] text-lien-heading hover:bg-lien-blue hover:text-white" />
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-lien-line px-3 py-2">
        <button type="button" aria-label="Trước" onClick={() => setI((i - 1 + list.length) % list.length)} className="flex h-8 w-8 items-center justify-center rounded-full text-lien-heading hover:bg-lien-cream">
          <Fa name="angle-left" />
        </button>
        <div className="flex items-center gap-1.5">
          {Array.from({ length: pages }, (_, k) => (
            <button key={k} type="button" aria-label={`Gợi ý ${k + 1}`} onClick={() => setI(k)} className={cn("h-2 w-2 rounded-full border border-lien-muted", i % list.length === k ? "bg-lien-heading border-lien-heading" : "bg-white")} />
          ))}
        </div>
        <button type="button" aria-label="Sau" onClick={() => setI((i + 1) % list.length)} className="flex h-8 w-8 items-center justify-center rounded-full text-lien-heading hover:bg-lien-cream">
          <Fa name="angle-right" />
        </button>
      </div>
    </section>
  );
}
