"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { formatAmount } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CatalogProduct } from "@/types/shop";
import { AddToCartButton } from "../AddToCartButton";
import { discountPercent, toCartProduct } from "../ShopProductCard";
import { WishlistButton } from "../WishlistButton";

interface Props {
  product: CatalogProduct;
  categoryNames: Record<string, string>;
  /** Rendered server components (meta, share) appended below. */
  children?: ReactNode;
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

/** Product summary column (sesofoods style): title, price + saving badge, stock, short description, qty stepper, CTA, info boxes. */
export function ProductInfo2({ product, categoryNames, children }: Props) {
  const out = product.stockStatus === "outofstock";
  const max = product.stock ?? 99;
  const [qty, setQty] = useState(1);
  const [more, setMore] = useState(false);
  const regular = product.regularPrice && product.regularPrice > product.price ? product.regularPrice : null;
  const pct = discountPercent(product);
  const short = stripHtml(product.shortDescription) || stripHtml(product.description).slice(0, 320);
  const clamp = (n: number) => Math.min(max, Math.max(1, Number.isFinite(n) ? Math.floor(n) : 1));
  const cats = product.categories.map((s) => ({ slug: s, name: categoryNames[s] ?? s }));

  return (
    <div className="summary entry-summary min-w-0">
      {cats.length ? (
        <p className="m-0 mb-2 flex flex-wrap gap-1 text-[12px]">
          {cats.map((c) => (
            <Link key={c.slug} href={`/product-category/${c.slug}/`} className="rounded-full bg-lien-blue-soft px-2 py-0.5 text-lien-blue no-underline hover:bg-lien-blue hover:text-white">
              {c.name}
            </Link>
          ))}
        </p>
      ) : null}
      <h1 className="m-0 text-[22px] font-bold leading-[30px] text-lien-heading sm:text-[26px] sm:leading-[34px]">{product.name}</h1>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {regular ? (
          <>
            <del className="text-[16px] text-lien-muted">{formatAmount(regular)}đ</del>
            <span className="text-[26px] font-bold leading-8 text-lien-sale-text">{formatAmount(product.price)}đ</span>
            <span className="rounded bg-lien-sale px-2 py-0.5 text-[12px] font-semibold text-white">Tiết kiệm {formatAmount(regular - product.price)}đ{pct ? ` (${pct}%)` : ""}</span>
          </>
        ) : (
          <span className="text-[26px] font-bold leading-8 text-lien-price">{formatAmount(product.price)}đ</span>
        )}
      </div>
      <p className="m-0 mt-1 text-[12px] text-lien-muted">Đã bao gồm phí mua hộ · chưa gồm phí vận chuyển</p>

      <p className="m-0 mt-3 text-[14px]">
        Tình trạng:{" "}
        {out ? (
          <span className="font-semibold text-lien-sale-text">Hết hàng</span>
        ) : product.stock !== null && product.stock > 0 ? (
          <span className="font-semibold text-lien-success">Còn hàng ({product.stock})</span>
        ) : (
          <span className="font-semibold text-lien-success">Đặt hàng theo yêu cầu, 7–14 ngày</span>
        )}
        {product.sku ? <span className="ml-3 text-lien-muted">SKU: {product.sku}</span> : null}
        {product.weightG ? <span className="ml-3 text-lien-muted">Khối lượng: {formatAmount(product.weightG)} g</span> : null}
        {product.dimsCm ? <span className="ml-3 text-lien-muted">Kích thước: {product.dimsCm.replace(/x/g, "×")} cm</span> : null}
      </p>

      {short ? (
        <div className="mt-3 text-[14px] leading-6 text-lien-text">
          <p className={cn("m-0", !more && "line-clamp-3")}>{short}</p>
          {short.length > 180 ? (
            <button type="button" onClick={() => setMore(!more)} className="mt-1 text-[13px] font-medium text-lien-blue hover:underline">
              {more ? "Thu gọn" : "【Xem thêm】"}
            </button>
          ) : null}
        </div>
      ) : null}

      <form className="cart mt-5 flex flex-wrap items-center gap-3" onSubmit={(e) => e.preventDefault()}>
        <div className="inline-flex h-11 items-center overflow-hidden rounded-full border border-lien-line">
          <button type="button" aria-label="Giảm" disabled={out || qty <= 1} onClick={() => setQty(clamp(qty - 1))} className="flex h-full w-10 items-center justify-center text-lien-heading hover:bg-lien-cream disabled:opacity-40">
            <Fa name="minus" className="text-[12px]" />
          </button>
          <input
            id={`quantity_${product.id}`}
            type="number"
            inputMode="numeric"
            min={1}
            max={max}
            value={qty}
            disabled={out}
            onChange={(e) => setQty(clamp(e.target.valueAsNumber))}
            aria-label={`Số lượng ${product.name}`}
            className="h-full w-12 border-x border-lien-line bg-white text-center text-[15px] font-semibold text-lien-heading outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <button type="button" aria-label="Tăng" disabled={out || qty >= max} onClick={() => setQty(clamp(qty + 1))} className="flex h-full w-10 items-center justify-center text-lien-heading hover:bg-lien-cream disabled:opacity-40">
            <Fa name="plus" className="text-[12px]" />
          </button>
        </div>
        <AddToCartButton product={toCartProduct(product)} quantity={qty} variant="primary" label={out ? "Hết hàng" : "Thêm vào giỏ"} disabled={out} showViewCart linkClassName="w-full basis-full" />
        <WishlistButton product={toCartProduct(product)} className="flex h-11 w-11 items-center justify-center rounded-full border border-lien-line text-[16px] text-lien-heading hover:border-lien-blue hover:text-lien-blue" />
      </form>

      <div className="mt-5 grid gap-2 rounded-md border border-lien-line bg-lien-footer2 p-3 text-[13px] leading-5 text-lien-text sm:grid-cols-2">
        <p className="m-0 flex items-start gap-2">
          <Fa name="credit-card" className="mt-1 text-lien-blue" /> Thanh toán COD hoặc chuyển khoản ngân hàng
        </p>
        <p className="m-0 flex items-start gap-2">
          <Fa name="plane" className="mt-1 text-lien-blue" /> Hàng mua tại Nhật, gom đơn hàng tuần, giao toàn quốc
        </p>
        <p className="m-0 flex items-start gap-2">
          <Fa name="shield" className="mt-1 text-lien-blue" /> Có bill mua hàng tại Nhật đính kèm đơn
        </p>
        <p className="m-0 flex items-start gap-2">
          <Fa name="comments-o" className="mt-1 text-lien-blue" /> Tư vấn Zalo: <a href="https://zalo.me/0964839769" className="font-medium text-lien-blue no-underline hover:underline">0964 839 769</a>
        </p>
      </div>

      <div className="mt-4 text-[13px] leading-6 text-lien-muted">{children}</div>
    </div>
  );
}
