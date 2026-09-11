"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { formatAmount } from "@/lib/format";
import type { CatalogProduct } from "@/types/shop";
import { AddToCartButton } from "../AddToCartButton";
import { toCartProduct } from "../ShopProductCard";
import { WishlistButton } from "../WishlistButton";

interface ProductSummaryProps {
  product: CatalogProduct;
  /** Slug of the first category; used for the "Compare" link. */
  compareCategory?: string;
  /** Rendered `ProductMeta` (server component passed down from the page). */
  children?: ReactNode;
}

function Amount({ value, currency }: { value: number; currency: string }) {
  return (
    <span className="amount">
      {formatAmount(value)}
      <span>{currency}</span>
    </span>
  );
}

/**
 * `div.summary.entry-summary`: title, price, stock, quantity + "Mua hàng", wishlist, compare and
 * product meta. 48% of the row floated right at ≥768px, full width below.
 */
export function ProductSummary({ product, compareCategory, children }: ProductSummaryProps) {
  const out = product.stockStatus === "discontinued";
  const max = product.stock ?? 99;
  const [qty, setQty] = useState(1);
  const regular = product.regularPrice !== null && product.regularPrice > product.price ? product.regularPrice : null;

  const clamp = (n: number) => Math.min(max, Math.max(1, Number.isFinite(n) ? Math.floor(n) : 1));

  return (
    <div className="summary entry-summary mb-8 w-full overflow-hidden sm:float-right sm:w-[48%]">
      <h1 className="product_title entry-title mb-[18.76px] font-oswald text-[28px] font-light leading-[39.2px] text-lien-heading">
        {product.name}
      </h1>

      <p className="price mb-5 text-[20px] leading-[30px] text-[#77a464]">
        {regular !== null ? (
          <>
            <del aria-hidden="true" className="opacity-50">
              <Amount value={regular} currency={product.currency} />
            </del>
            <span className="sr-only">
              Giá gốc là: {formatAmount(regular)}
              {product.currency}.
            </span>{" "}
            <ins className="no-underline">
              <Amount value={product.price} currency={product.currency} />
            </ins>
            <span className="sr-only">
              Giá hiện tại là: {formatAmount(product.price)}
              {product.currency}.
            </span>
          </>
        ) : (
          <Amount value={product.price} currency={product.currency} />
        )}
      </p>

      {out ? (
        <p className="stock out-of-stock mb-[14.72px] text-[14.72px] leading-[22.08px] text-[#e2401c]">Hết hàng</p>
      ) : product.stock !== null && product.stock > 0 ? (
        <p className="stock in-stock mb-[14.72px] text-[14.72px] leading-[22.08px] text-[#77a464]">còn {product.stock} hàng</p>
      ) : null}

      <form className="cart mb-4 flex items-start" onSubmit={(e) => e.preventDefault()}>
        <div className="quantity mr-1">
          <label htmlFor={`quantity_${product.id}`} className="sr-only">
            Số lượng {product.name}
          </label>
          <input
            id={`quantity_${product.id}`}
            type="number"
            name="quantity"
            inputMode="numeric"
            min={1}
            max={max}
            step={1}
            value={qty}
            disabled={out}
            onChange={(e) => setQty(clamp(e.target.valueAsNumber))}
            className="box-border h-9 w-[58.09px] rounded-[3px] border border-lien-input-border bg-white p-[5px] text-center font-arial text-[16px] leading-6 text-lien-input-text disabled:opacity-50"
          />
        </div>
        <div>
          <AddToCartButton
            product={toCartProduct(product)}
            quantity={qty}
            variant="square"
            label="Mua hàng"
            disabled={out}
            showViewCart
            className="font-arial"
          />
        </div>
      </form>

      <div className="yith-wcwl-add-to-wishlist mb-[15px] h-[43px]">
        <WishlistButton product={toCartProduct(product)} variant="button" />
      </div>

      <Link
        href={compareCategory ? `/shop/?product_cat=${compareCategory}` : "/shop/"}
        title="So sánh"
        className="compare button mb-[15px] inline-block rounded-[3px] bg-lien-blue px-4 py-[9.888px] text-[16px] leading-4 font-bold text-white no-underline transition-[background] duration-200 hover:bg-lien-blue-hover"
      >
        Compare
      </Link>

      {children}
    </div>
  );
}
