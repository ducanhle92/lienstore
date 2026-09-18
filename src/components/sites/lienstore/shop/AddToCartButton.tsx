"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useCart, type CartProduct } from "./CartProvider";

type Variant = "pill" | "square" | "sticky" | "card" | "primary";

interface AddToCartButtonProps {
  product: CartProduct;
  quantity?: number;
  /** pill = dark rounded button used on the home page grids; square = WooCommerce blue button; sticky = red bar button. */
  variant?: Variant;
  label?: string;
  disabled?: boolean;
  /** Show the "Xem giỏ hàng" link WooCommerce appends after an AJAX add (default true for pill/square). */
  showViewCart?: boolean;
  className?: string;
  linkClassName?: string;
  /** No price yet: render a link (same shape, contact colour) that opens this URL — the shop's Zalo — instead of adding to cart. */
  contactHref?: string;
}

const VARIANT_CLASS: Record<Variant, string> = {
  pill: "inline-flex items-center justify-center rounded-full border-0 bg-lien-blue px-6 py-3 font-sans text-[15px] font-semibold leading-5 text-white no-underline hover:bg-lien-blue-hover",
  square:
    "relative inline-flex items-center justify-center rounded-full border-0 bg-lien-blue px-5 py-[10px] font-sans text-[14px] font-semibold uppercase leading-5 tracking-[0.3px] text-white no-underline transition-[background] duration-200 hover:bg-lien-blue-hover",
  sticky:
    "inline-flex items-center justify-center rounded-full bg-lien-blue px-5 py-2 font-sans text-[14px] font-semibold uppercase leading-5 text-white no-underline hover:bg-lien-blue-hover",
  card: "inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-lien-blue bg-white px-3 py-[7px] font-sans text-[13px] font-semibold leading-5 text-lien-blue no-underline transition-colors hover:bg-lien-blue hover:text-white",
  primary:
    "inline-flex h-11 items-center justify-center gap-2 rounded-full border-0 bg-lien-blue px-7 font-sans text-[14px] font-bold uppercase leading-5 tracking-[0.4px] text-white no-underline shadow-[0_6px_16px_-8px_rgba(28,127,158,0.8)] transition-[background] hover:bg-lien-blue-hover",
};

export function AddToCartButton({
  product,
  quantity = 1,
  variant = "square",
  label = "Mua hàng",
  disabled = false,
  showViewCart,
  className,
  linkClassName,
  contactHref,
}: AddToCartButtonProps) {
  const { add, openDrawer } = useCart();
  const [added, setAdded] = useState(false);
  const [busy, setBusy] = useState(false);
  const withLink = showViewCart ?? variant !== "sticky";

  const onClick = () => {
    if (disabled || busy) return;
    setBusy(true);
    add(product, quantity);
    openDrawer();
    // mimic WooCommerce's brief loading state
    window.setTimeout(() => {
      setBusy(false);
      setAdded(true);
      // cards have no "view cart" link: flash a confirmation on the button instead
      if (!withLink) window.setTimeout(() => setAdded(false), 1800);
    }, 250);
  };

  if (contactHref) {
    return (
      <a href={contactHref} target="_blank" rel="noreferrer" className={cn(VARIANT_CLASS[variant], "!bg-lien-contact hover:!brightness-95", className)} data-testid="contact-zalo">
        {label}
      </a>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-disabled={disabled}
        aria-live="polite"
        className={cn(VARIANT_CLASS[variant], busy && "opacity-70", disabled && "cursor-not-allowed opacity-50", className)}
      >
        {busy ? "Đang thêm…" : added && !withLink ? "✓ Đã thêm" : label}
      </button>
      {added && withLink ? (
        <Link
          href="/cart/"
          className={cn(
            "added_to_cart wc-forward mt-2 block text-[14px] leading-5 text-lien-muted hover:text-lien-blue",
            variant === "square" && "mt-2",
            linkClassName,
          )}
        >
          Xem giỏ hàng
        </Link>
      ) : null}
    </>
  );
}
