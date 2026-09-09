"use client";

import { useLang } from "@/components/sites/lienstore/shared/LangProvider";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useCart } from "@/components/sites/lienstore/shop/CartProvider";
import { cn } from "@/lib/utils";
import { Price, shopTableClass, shopTdClass, shopTdResponsiveClass, shopThClass, WooHeading, WooNotice, wooButtonClass, wooInputClass } from "./WooUi";

/** WooCommerce cart page (`/cart/`): cart table + coupon row + totals + checkout button. */
export function CartPage() {
  const { t } = useLang();
  const { items, hydrated, subtotal, update, remove } = useCart();
  const [coupon, setCoupon] = useState("");
  const [couponError, setCouponError] = useState<string | null>(null);

  if (!hydrated) return <div className="min-h-[240px]" aria-busy="true" />;

  if (items.length === 0) {
    return (
      <div className="woocommerce">
        <WooNotice kind="info" role="status">
          {t("cartEmptyLong")}
        </WooNotice>
        <p className="return-to-shop">
          <Link href="/shop/" className={wooButtonClass}>
            {t("backToShop")}
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="woocommerce">
      {couponError ? <WooNotice kind="error">{couponError}</WooNotice> : null}

      <form
        className="woocommerce-cart-form"
        onSubmit={(e) => {
          e.preventDefault();
          setCouponError(coupon.trim() ? `Mã ưu đãi “${coupon.trim()}” không tồn tại!` : "Vui lòng nhập mã ưu đãi.");
        }}
      >
        <table className={cn(shopTableClass, "cart shop_table_responsive")}>
          <thead className="hidden sm:table-header-group">
            <tr>
              <th className={cn(shopThClass, "w-12")} scope="col">
                <span className="sr-only">{t("remove")}</span>
              </th>
              <th className={cn(shopThClass, "w-12")} scope="col">
                <span className="sr-only">{t("image")}</span>
              </th>
              <th className={shopThClass} scope="col">
                {t("product")}
              </th>
              <th className={shopThClass} scope="col">
                {t("price")}
              </th>
              <th className={shopThClass} scope="col">
                {t("quantity")}
              </th>
              <th className={shopThClass} scope="col">
                {t("subtotal")}
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.productId} className="cart_item block border-b border-lien-line sm:table-row">
                <td className={cn(shopTdClass, "block text-right sm:table-cell sm:text-left")}>
                  <button
                    type="button"
                    onClick={() => remove(it.productId)}
                    aria-label={`Xoá ${it.name} khỏi giỏ hàng`}
                    className="remove ml-auto block h-6 w-6 rounded-full text-center text-[24px] font-bold leading-6 text-[#ff0000] hover:bg-[#ff0000] hover:text-white sm:ml-0"
                  >
                    ×
                  </button>
                </td>
                <td className={cn(shopTdClass, "hidden sm:table-cell")}>
                  <Link href={`/product/${it.slug}/`}>
                    <Image src={it.image} alt="" width={300} height={300} className="block h-[60px] w-[60px]" />
                  </Link>
                </td>
                <td className={cn(shopTdClass, shopTdResponsiveClass)} data-title="Sản phẩm">
                  <Link href={`/product/${it.slug}/`} className="text-lien-muted no-underline hover:text-lien-blue">
                    {it.name}
                  </Link>
                </td>
                <td className={cn(shopTdClass, shopTdResponsiveClass)} data-title="Giá">
                  <Price value={it.price} />
                </td>
                <td className={cn(shopTdClass, shopTdResponsiveClass)} data-title="Số lượng">
                  <div className="quantity inline-block">
                    <label className="sr-only" htmlFor={`qty-${it.productId}`}>
                      {it.name} số lượng
                    </label>
                    <input
                      id={`qty-${it.productId}`}
                      type="number"
                      min={1}
                      max={99}
                      step={1}
                      value={it.quantity}
                      onChange={(e) => {
                        const v = Number.parseInt(e.target.value, 10);
                        if (!Number.isNaN(v)) update(it.productId, Math.min(99, Math.max(1, v)));
                      }}
                      className="qty h-9 w-[58px] rounded-[3px] border border-lien-input-border bg-white p-[5px] text-center font-arial text-[16px] leading-6 text-lien-input-text"
                    />
                  </div>
                </td>
                <td className={cn(shopTdClass, shopTdResponsiveClass)} data-title="Tạm tính">
                  <Price value={it.price * it.quantity} />
                </td>
              </tr>
            ))}
            <tr>
              <td colSpan={6} className={cn(shopTdClass, "actions block text-right sm:table-cell")}>
                <div className="coupon mb-3 flex items-center gap-1 sm:float-left sm:mb-0">
                  <label htmlFor="coupon_code" className="sr-only">
                    {t("coupon")}:
                  </label>
                  <input
                    id="coupon_code"
                    type="text"
                    value={coupon}
                    onChange={(e) => setCoupon(e.target.value)}
                    placeholder={t("coupon")}
                    className={cn(wooInputClass, "h-[37px] w-[80px] px-1.5 py-[5px] border-[#d3ced2] sm:w-[110px]")}
                  />
                  <button type="submit" className={cn(wooButtonClass, "font-arial")}>
                    {t("apply")}
                  </button>
                </div>
                <button type="button" disabled className={cn(wooButtonClass, "font-arial")} title="Giỏ hàng được cập nhật tự động">
                  {t("updateCart")}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </form>

      <div className="cart-collaterals flow-root">
        <div className="cart_totals sm:float-right sm:w-[360px]">
          <WooHeading as="h2">{t("cartTotals")}</WooHeading>
          <table className={cn(shopTableClass, "mb-1.5")}>
            <tbody>
              <tr className="cart-subtotal">
                <th className={cn(shopTdClass, "w-[125px] border-t-0 font-bold align-top")} scope="row">
                  {t("subtotal")}
                </th>
                <td className={cn(shopTdClass, "border-t-0 align-top")}>
                  <Price value={subtotal} />
                </td>
              </tr>
              <tr className="order-total">
                <th className={cn(shopTdClass, "border-t border-lien-widget-border font-bold align-top")} scope="row">
                  {t("total")}
                </th>
                <td className={cn(shopTdClass, "border-t border-lien-widget-border align-top")}>
                  <strong>
                    <Price value={subtotal} />
                  </strong>
                </td>
              </tr>
            </tbody>
          </table>
          <div className="wc-proceed-to-checkout py-4">
            <Link
              href="/checkout/"
              className="checkout-button mb-5 block w-full rounded-[3px] bg-lien-blue p-5 text-center font-sans text-[20px] font-bold leading-5 text-white no-underline hover:bg-lien-blue-hover"
            >
              {t("proceedCheckout")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
