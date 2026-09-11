"use client";

import { useEffect, useRef, useState } from "react";
import { Be_Vietnam_Pro } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { OPEN_ACCOUNT_EVENT } from "@/components/sites/lienstore/shared/open-account";
import { useCart } from "@/components/sites/lienstore/shop/CartProvider";
import { useLang } from "@/components/sites/lienstore/shared/LangProvider";
import { buildCategoryTree, shortName } from "@/lib/categories";
import { cn } from "@/lib/utils";
import { AccountDrawer, type HeaderCustomer } from "./AccountDrawer";

/** Slogan under the logo uses the same heavy geometric style as the artwork; Be Vietnam Pro carries the Vietnamese diacritics. */
const sloganFont = Be_Vietnam_Pro({ subsets: ["latin", "vietnamese"], weight: ["800"], display: "swap" });

export interface HeaderCategory {
  name: string;
  slug: string;
  count: number;
  image: string | null;
  parentSlug: string | null;
}

export interface HeaderLink {
  label: string;
  href: string;
}

interface Header2Props {
  logo: { src: string; width: number; height: number; alt: string };
  /** Tagline under the logo ("Chuyên hàng Nhật nội địa"); empty hides it. */
  slogan?: string;
  categories: HeaderCategory[];
  supportLinks: HeaderLink[];
  newsLinks: HeaderLink[];
  aboutHref: string;
  newsHref: string;
  customer?: HeaderCustomer | null;
}

function Badge({ n }: { n: number }) {
  return (
    <span className="absolute -top-1.5 -right-2 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-lien-sale px-1 text-[11px] font-bold leading-none text-white">
      {n}
    </span>
  );
}

/**
 * Main header (sesofoods-style): logo · inline menu with "Danh mục" mega dropdown · pill search · account/wishlist/cart.
 * Collapses to a hamburger + drawer below 992px. Becomes compact and sticky after scrolling.
 */
export function Header2({ logo, slogan = "", categories, supportLinks, newsLinks, aboutHref, newsHref, customer = null }: Header2Props) {
  const { t } = useLang();
  const { items, wishlist, hydrated, openDrawer } = useCart();
  // The drawer remembers who it was opened for, so it closes by itself once login/register/logout changes the customer.
  const customerKey = customer ? `c:${customer.username || customer.email}` : "guest";
  const [accountFor, setAccountFor] = useState<string | null>(null);
  const account = accountFor === customerKey;
  const setAccount = (v: boolean) => setAccountFor(v ? customerKey : null);
  useEffect(() => {
    const open = () => setAccountFor(customerKey);
    window.addEventListener(OPEN_ACCOUNT_EVENT, open);
    if (new URLSearchParams(window.location.search).get("login") === "1") open();
    return () => window.removeEventListener(OPEN_ACCOUNT_EVENT, open);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const cartCount = hydrated ? items.reduce((s, i) => s + i.quantity, 0) : 0;
  const wishCount = hydrated ? wishlist.length : 0;
  const [open, setOpen] = useState<null | "cat" | "support" | "news">(null);
  const [drawer, setDrawer] = useState(false);
  const [stuck, setStuck] = useState(false);
  const navRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 140);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const tree = buildCategoryTree(categories);
  const navItem = "inline-flex h-[44px] items-center gap-1 whitespace-nowrap rounded-md px-2 text-[13px] font-semibold uppercase tracking-[0.2px] text-white no-underline hover:bg-white/15 xl:px-3 xl:text-[14px]";

  return (
    <header className={cn("sticky top-0 z-[9000] bg-lien-header text-white transition-shadow", stuck && "shadow-[0_4px_16px_-8px_rgba(0,0,0,0.35)]")}>
      <div className="mx-auto flex max-w-[1300px] items-center gap-4 px-4 py-2 lg:gap-6" ref={navRef}>
        <button type="button" onClick={() => setDrawer(true)} aria-label={t("openMenu")} className="flex h-10 w-10 items-center justify-center rounded-full text-[20px] text-white hover:bg-white/15 lg:hidden">
          <Fa name="bars" />
        </button>

        <Link href="/" className="flex shrink-0 flex-col items-start no-underline" aria-label={logo.alt}>
          <Image src={logo.src} alt={logo.alt} width={logo.width} height={logo.height} priority unoptimized className={cn("h-auto w-[112px] transition-[width] sm:w-[132px]", stuck && "sm:w-[112px]")} />
          {slogan ? <span className={cn(sloganFont.className, "mt-0.5 whitespace-nowrap text-[10.5px] font-extrabold leading-3 tracking-[-0.01em] text-white sm:text-[12px]", stuck && "sm:hidden")}>{slogan}</span> : null}
        </Link>

        <nav aria-label="Menu chính" className="hidden items-center lg:flex">
          <div className="relative">
            <button type="button" onClick={() => setOpen(open === "cat" ? null : "cat")} className={cn(navItem, open === "cat" && "bg-white/15")} aria-expanded={open === "cat"}>
              <Fa name="th-large" className="mr-1 text-[13px]" />
              {t("categories")}
              <Fa name="angle-down" className="text-[12px]" />
            </button>
            {open === "cat" ? (
              <div className="absolute top-full left-0 z-50 mt-1 w-[860px] rounded-md border border-lien-line bg-white p-5 shadow-[0_12px_32px_-8px_rgba(0,0,0,0.25)]">
                <div className="grid grid-cols-3 gap-x-8 gap-y-5">
                  {tree.map((g) => (
                    <div key={g.category.slug} className="min-w-0">
                      <Link href={`/product-category/${g.category.slug}/`} onClick={() => setOpen(null)} className="flex items-center justify-between gap-2 border-b border-lien-line pb-1.5 text-[13px] font-bold uppercase tracking-[0.2px] text-lien-heading no-underline hover:text-lien-blue">
                        <span className="truncate">{shortName(g.category.name)}</span>
                        <span className="text-[11px] font-normal text-lien-muted">({g.total})</span>
                      </Link>
                      {g.children.length ? (
                        <ul className="m-0 mt-1.5 list-none space-y-0.5 p-0">
                          {g.children.map((c) => (
                            <li key={c.category.slug}>
                              <Link href={`/product-category/${c.category.slug}/`} onClick={() => setOpen(null)} className="flex items-center gap-1.5 rounded px-1 py-1 text-[13px] leading-5 text-lien-text no-underline hover:bg-lien-blue-soft hover:text-lien-blue">
                                <Fa name="angle-right" className="text-[10px] text-lien-blue" />
                                <span className="flex-1 truncate">{shortName(c.category.name)}</span>
                                <span className="text-[11px] text-lien-muted">({c.total})</span>
                              </Link>
                              {c.children.length ? (
                                <div className="ml-5 flex flex-wrap gap-x-2 text-[12px] leading-5 text-lien-muted">
                                  {c.children.map((gc) => (
                                    <Link key={gc.category.slug} href={`/product-category/${gc.category.slug}/`} onClick={() => setOpen(null)} className="text-lien-muted no-underline hover:text-lien-blue">
                                      {shortName(gc.category.name)}
                                    </Link>
                                  ))}
                                </div>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-lien-line pt-3 text-[13px]">
                  <Link href="/shop/?orderby=popularity" onClick={() => setOpen(null)} className="inline-flex items-center gap-1.5 font-bold uppercase text-lien-heading no-underline hover:text-lien-blue">
                    <Fa name="fire" className="text-lien-sale" />
                    {t("menuBest")}
                  </Link>
                  <Link href="/shop/?onsale=1" onClick={() => setOpen(null)} className="inline-flex items-center gap-1.5 font-bold uppercase text-lien-sale no-underline hover:underline">
                    <Fa name="tag" />
                    {t("menuSaleCat")}
                  </Link>
                  <Link href="/shop/?orderby=date" onClick={() => setOpen(null)} className="inline-flex items-center gap-1.5 font-bold uppercase text-lien-info no-underline hover:underline">
                    <Fa name="bolt" />
                    {t("newArrivals")}
                  </Link>
                  <Link href="/shop/" onClick={() => setOpen(null)} className="ml-auto font-semibold text-lien-blue no-underline hover:underline">
                    {t("viewAll")}
                  </Link>
                </div>
              </div>
            ) : null}
          </div>
          <div className="relative">
            <button type="button" onClick={() => setOpen(open === "support" ? null : "support")} className={cn(navItem, open === "support" && "bg-white/15")} aria-expanded={open === "support"}>
              {t("support")}
              <Fa name="angle-down" className="text-[12px]" />
            </button>
            {open === "support" ? (
              <div className="absolute top-full left-0 z-50 mt-1 w-[240px] rounded-md border border-lien-line bg-white py-2 shadow-[0_12px_32px_-8px_rgba(0,0,0,0.25)]">
                {supportLinks.map((l) => (
                  <Link key={l.href} href={l.href} onClick={() => setOpen(null)} className="block px-4 py-2 text-[13px] leading-5 text-lien-text no-underline hover:bg-lien-blue-soft hover:text-lien-blue">
                    {l.label}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
          <div className="relative">
            <button type="button" onClick={() => setOpen(open === "news" ? null : "news")} className={cn(navItem, open === "news" && "bg-white/15")} aria-expanded={open === "news"}>
              {t("news")}
              <Fa name="angle-down" className="text-[12px]" />
            </button>
            {open === "news" ? (
              <div className="absolute top-full left-0 z-50 mt-1 w-[260px] rounded-md border border-lien-line bg-white py-2 shadow-[0_12px_32px_-8px_rgba(0,0,0,0.25)]">
                {newsLinks.map((l) => (
                  <Link key={l.href} href={l.href} onClick={() => setOpen(null)} className="block px-4 py-2.5 text-[13px] leading-5 text-lien-text no-underline hover:bg-lien-blue-soft hover:text-lien-blue">
                    {l.label}
                  </Link>
                ))}
                <Link href={newsHref} onClick={() => setOpen(null)} className="block border-t border-lien-line px-4 py-2.5 text-[13px] leading-5 text-lien-muted no-underline hover:bg-lien-blue-soft hover:text-lien-blue">
                  {t("otherNews")}
                </Link>
              </div>
            ) : null}
          </div>
          <Link href={aboutHref} className={navItem}>
            <Fa name="user-circle" className="mr-1 text-[13px]" />
            {t("about")}
          </Link>
        </nav>

        <form action="/shop/" method="get" role="search" className="ml-auto hidden h-[42px] w-[300px] shrink items-center overflow-hidden rounded-full border border-white/40 bg-white focus-within:border-white md:flex lg:w-[240px] xl:w-[340px] 2xl:w-[380px]">
          <input name="s" placeholder={t("searchPlaceholder")} aria-label={t("searchPlaceholder")} className="h-full flex-1 bg-transparent pl-4 text-[14px] text-lien-text outline-none placeholder:text-lien-muted" />
          <button type="submit" aria-label={t("search")} className="flex h-full w-11 items-center justify-center text-[16px] text-lien-blue hover:text-lien-blue-hover">
            <Fa name="search" />
          </button>
        </form>

        <div className="flex items-center gap-1 sm:gap-2">
          <button
            type="button"
            onClick={() => setAccount(true)}
            aria-label={customer ? `${t("account")} · ${customer.username || customer.firstName}` : t("login")}
            title={customer ? `${customer.lastName} ${customer.firstName}`.trim() || customer.username : t("login")}
            className={cn("relative flex h-10 w-10 items-center justify-center rounded-full text-[20px] text-white hover:bg-white/15")}
          >
            {customer?.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element -- customer upload served from /api/files
              <img src={customer.avatar} alt="" className="h-8 w-8 rounded-full border-2 border-white/80 object-cover" />
            ) : (
              <Fa name={customer ? "user-circle" : "user"} />
            )}
            {customer ? <span className="absolute right-1 bottom-1 h-2.5 w-2.5 rounded-full border-2 border-lien-header bg-lien-amber" aria-hidden="true" /> : null}
          </button>
          <Link href="/wishlist/" aria-label={t("wishlist")} className="relative flex h-10 w-10 items-center justify-center rounded-full text-[20px] text-white no-underline hover:bg-white/15">
            <Fa name="heart-o" />
            {wishCount ? <Badge n={wishCount} /> : null}
          </Link>
          <button type="button" onClick={openDrawer} aria-label={t("cart")} className="relative flex h-10 w-10 items-center justify-center rounded-full text-[20px] text-white hover:bg-white/15" data-cart-count={cartCount}>
            <Fa name="shopping-cart" />
            <Badge n={cartCount} />
          </button>
        </div>
      </div>

      {/* mobile search row */}
      <form action="/shop/" method="get" role="search" className="mx-4 mb-2 flex h-[40px] items-center overflow-hidden rounded-full border border-white/40 bg-white md:hidden">
        <input name="s" placeholder={t("searchPlaceholder")} aria-label={t("searchPlaceholder")} className="h-full flex-1 bg-transparent pl-4 text-[14px] text-lien-text outline-none placeholder:text-lien-muted" />
        <button type="submit" aria-label={t("search")} className="flex h-full w-11 items-center justify-center text-[16px] text-lien-blue">
          <Fa name="search" />
        </button>
      </form>

      {/* mobile drawer */}
      {drawer ? (
        <div className="fixed inset-0 z-[9500] lg:hidden" role="dialog" aria-modal="true">
          <button type="button" aria-label="Đóng menu" onClick={() => setDrawer(false)} className="absolute inset-0 bg-black/40" />
          <div className="absolute top-0 left-0 flex h-full w-[55%] min-w-[240px] max-w-[340px] flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-lien-line px-4 py-3">
              <span className="text-[15px] font-semibold uppercase text-lien-heading">{t("menu")}</span>
              <button type="button" onClick={() => setDrawer(false)} aria-label={t("close")} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-lien-cream">
                <Fa name="times" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <div className="border-b border-lien-line px-4 py-3">
                <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-lien-muted">{t("categories")}</p>
                <ul className="m-0 list-none p-0">
                  {tree.map((g) => (
                    <li key={g.category.slug} className="py-1">
                      <Link href={`/product-category/${g.category.slug}/`} className="flex items-center justify-between py-1.5 text-[14px] font-semibold text-lien-heading no-underline">
                        <span>{shortName(g.category.name)}</span>
                        <span className="text-[12px] font-normal text-lien-muted">{g.total}</span>
                      </Link>
                      {g.children.map((c) => (
                        <Link key={c.category.slug} href={`/product-category/${c.category.slug}/`} className="flex items-center justify-between py-1 pl-4 text-[13px] text-lien-text no-underline">
                          <span>{shortName(c.category.name)}</span>
                          <span className="text-[12px] text-lien-muted">{c.total}</span>
                        </Link>
                      ))}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="px-4 py-3">
                {[{ label: t("allProducts"), href: "/shop/" }, { label: t("menuBest"), href: "/shop/?orderby=popularity" }, { label: t("menuSaleCat"), href: "/shop/?onsale=1" }, ...supportLinks, ...newsLinks, { label: t("news"), href: newsHref }, { label: t("aboutContact"), href: aboutHref }, { label: t("account"), href: "/my-account/" }].map((l) => (
                  <Link key={l.href + l.label} href={l.href} className="block py-2 text-[14px] font-medium text-lien-heading no-underline">
                    {l.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <AccountDrawer open={account} onClose={() => setAccount(false)} customer={customer} />
    </header>
  );
}
