"use client";

import { useLang } from "@/components/sites/lienstore/shared/LangProvider";

import Image from "next/image";
import Link from "next/link";
import { formatAmount } from "@/lib/format";
import { useCart } from "./CartProvider";

/** WooCommerce "Sản phẩm vừa được xem" sidebar widget (shown on cart / checkout / account pages). */
export function RecentlyViewedWidget({ className }: { className?: string } = {}) {
  const { recentlyViewed, hydrated } = useCart();
  const { t } = useLang();
  if (!hydrated || recentlyViewed.length === 0) return null;

  return (
    <section className={"widget woocommerce widget_recently_viewed_products " + (className ?? "")}>
      <h2 className="m-0 mb-3 border-b-2 border-lien-blue pb-2 text-[14px] font-bold uppercase tracking-[0.3px] text-lien-heading">
        {t("recentlyViewed")}
      </h2>
      <ul className="product_list_widget m-0 list-none p-0">
        {recentlyViewed.slice(0, 5).map((p) => (
          <li key={p.id} className="flex items-start gap-3 border-b border-lien-line py-3 last:border-0">
            <Link href={`/product/${p.slug}/`} className="shrink-0">
              <Image src={p.image} alt="" width={300} height={300} className="block h-[54px] w-[54px] rounded border border-lien-line object-contain" />
            </Link>
            <div className="min-w-0 text-[13px] leading-5">
              <Link href={`/product/${p.slug}/`} className="product-title line-clamp-2 block font-medium text-lien-text no-underline hover:text-lien-blue">
                {p.name}
              </Link>
              <span className="woocommerce-Price-amount amount font-semibold text-lien-price">
                {formatAmount(p.price)}
                <span>đ</span>
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
