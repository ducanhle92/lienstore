"use client";

import { useState } from "react";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { useLang } from "@/components/sites/lienstore/shared/LangProvider";
import { cn } from "@/lib/utils";
import { useCart, type CartProduct } from "./CartProvider";

/**
 * Round orange add-to-cart button that floats over the product image with a "Thêm Vào Giỏ" label above it
 * (sesofoods style). Appears on hover on pointer devices, always on touch screens. Opens the cart drawer.
 */
export function CardCartButton({ product, disabled = false, className }: { product: CartProduct; disabled?: boolean; className?: string }) {
  const { t } = useLang();
  const { add, openDrawer } = useCart();
  const [done, setDone] = useState(false);

  const onClick = () => {
    if (disabled) return;
    add(product, 1);
    setDone(true);
    openDrawer();
    window.setTimeout(() => setDone(false), 1500);
  };

  return (
    <div
      className={cn(
        // pointer devices: label + big round button rise from the bottom centre on hover
        "absolute bottom-2 left-1/2 z-[2] flex origin-bottom -translate-x-1/2 scale-[0.82] flex-col items-center gap-1.5 transition-all duration-300 sm:bottom-3 sm:scale-100",
        "opacity-0 translate-y-2 group-hover:translate-y-0 group-hover:opacity-100 focus-within:translate-y-0 focus-within:opacity-100",
        // touch devices (no hover): a small always-visible cart button in the bottom-right corner, no label, image stays uncovered
        "[@media(hover:none)]:bottom-1.5 [@media(hover:none)]:left-auto [@media(hover:none)]:right-1.5 [@media(hover:none)]:translate-x-0 [@media(hover:none)]:translate-y-0 [@media(hover:none)]:scale-100 [@media(hover:none)]:opacity-100",
        className,
      )}
    >
      <span
        className={cn(
          "relative rounded px-2.5 py-1 text-[12px] font-semibold leading-4 whitespace-nowrap text-white shadow-sm [@media(hover:none)]:hidden",
          "after:absolute after:top-full after:left-1/2 after:-translate-x-1/2 after:border-x-[5px] after:border-t-[5px] after:border-x-transparent",
          disabled ? "bg-lien-muted after:border-t-lien-muted" : done ? "bg-lien-success after:border-t-lien-success" : "bg-lien-sale after:border-t-lien-sale",
        )}
      >
        {disabled ? t("outOfStock") : done ? t("added") : t("addToCart")}
      </span>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={disabled ? t("outOfStock") : `${t("addToCart")}: ${product.name}`}
        className={cn(
          "flex h-12 w-12 items-center justify-center rounded-full text-[19px] text-white shadow-[0_6px_16px_-6px_rgba(0,0,0,0.5)] transition-transform hover:scale-105 disabled:cursor-not-allowed [@media(hover:none)]:h-8 [@media(hover:none)]:w-8 [@media(hover:none)]:text-[14px]",
          disabled ? "bg-lien-muted" : done ? "bg-lien-success" : "bg-lien-sale",
        )}
      >
        <Fa name={done ? "check" : "shopping-cart"} />
      </button>
    </div>
  );
}
