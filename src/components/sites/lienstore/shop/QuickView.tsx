"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { formatAmount } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { AddToCartButton } from "./AddToCartButton";
import { WishlistButton } from "./WishlistButton";

/** Serialisable subset of a product for the quick-view modal. */
export interface QuickViewProduct {
  id: number;
  slug: string;
  name: string;
  price: number;
  regularPrice: number | null;
  currency: string;
  image: string;
  thumb: string;
  stock: number | null;
  stockStatus: "instock" | "discontinued";
  excerpt: string;
  categories: string[];
}

/** YITH-style "Quick View" button shown on card hover; opens a modal with the product summary. */
export function QuickViewButton({ product, className, iconOnly = false }: { product: QuickViewProduct; className?: string; iconOnly?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Xem nhanh"
        title="Xem nhanh"
        className={cn(
          className ??
            "yith-wcqv-button absolute top-[45%] left-1/2 z-[2] -translate-x-1/2 rounded-[3px] bg-lien-blue px-4 py-2 text-[14px] font-bold leading-4 text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100 focus:opacity-100",
        )}
      >
        {iconOnly ? <Fa name="eye" /> : "Quick View"}
      </button>
      {open ? <QuickViewModal product={product} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function QuickViewModal({ product, onClose }: { product: QuickViewProduct; onClose: () => void }) {
  const [qty, setQty] = useState(1);
  const out = product.stockStatus === "discontinued";
  const max = product.stock ?? 99;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const cartProduct = { id: product.id, slug: product.slug, name: product.name, price: product.price, image: product.thumb || product.image };

  return (
    <div id="yith-quick-view-modal" className="fixed inset-0 z-[100000] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={product.name}>
      <button type="button" aria-label="Đóng" onClick={onClose} className="yith-quick-view-overlay absolute inset-0 cursor-default bg-black/70" />
      <div className="yith-wcqv-main relative flex max-h-[90vh] w-full max-w-[1000px] flex-col overflow-auto bg-white shadow-2xl sm:flex-row">
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng"
          className="yith-wcqv-close absolute top-2 right-2 z-10 h-8 w-8 rounded-full bg-white text-[22px] leading-8 text-lien-text hover:bg-lien-line"
        >
          ×
        </button>
        <div className="w-full shrink-0 sm:w-1/2">
          <Image src={product.image || product.thumb} alt={product.name} width={600} height={600} className="block h-auto w-full" />
        </div>
        <div className="summary w-full p-6 sm:w-1/2 sm:p-8">
          <h1 className="mb-3 text-[22px] font-bold leading-8 text-lien-heading">{product.name}</h1>
          <p className="price mb-3 text-[20px] leading-[30px] text-[#77a464]">
            {product.regularPrice && product.regularPrice > product.price ? (
              <del className="mr-2 opacity-50">
                {formatAmount(product.regularPrice)}
                <span>{product.currency}</span>
              </del>
            ) : null}
            <span>
              {formatAmount(product.price)}
              <span>{product.currency}</span>
            </span>
          </p>
          {out ? (
            <p className="stock mb-3 text-[14.72px] text-[#e2401c]">Hết hàng</p>
          ) : product.stock !== null ? (
            <p className="stock mb-3 text-[14.72px] text-[#77a464]">còn {product.stock} hàng</p>
          ) : null}
          {product.excerpt ? <p className="mb-4 text-[15px] leading-6 text-lien-muted">{product.excerpt}</p> : null}
          <div className="mb-4 flex items-start gap-1">
            <input
              type="number"
              min={1}
              max={max}
              value={qty}
              disabled={out}
              aria-label="Số lượng"
              onChange={(e) => setQty(Math.min(max, Math.max(1, Math.floor(e.target.valueAsNumber || 1))))}
              className="h-9 w-[58px] rounded-[3px] border border-lien-input-border p-[5px] text-center font-arial text-[16px] leading-6 text-lien-input-text"
            />
            <AddToCartButton product={cartProduct} quantity={qty} variant="square" disabled={out} className="font-arial" />
          </div>
          <div className={cn("mb-4")}>
            <WishlistButton product={cartProduct} variant="button" />
          </div>
          <Link href={`/product/${product.slug}/`} className="text-[15px] text-lien-blue hover:underline">
            Xem chi tiết sản phẩm →
          </Link>
        </div>
      </div>
    </div>
  );
}
