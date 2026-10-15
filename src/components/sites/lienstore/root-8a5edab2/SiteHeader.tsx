import Image from "@/components/sites/lienstore/shared/SmartImage";
import Link from "next/link";
import type { ContactInfo, MenuLink } from "@/types/lienstore";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { cn } from "@/lib/utils";
import { CartBadge } from "@/components/sites/lienstore/shop/CartBadge";
import { MainNav } from "./MainNav";
import { TopBar } from "./TopBar";

interface SiteHeaderProps {
  contact: ContactInfo;
  branding: {
    logo: string;
    logoWidth: number;
    logoHeight: number;
    tagline: string;
    siteTitle: string;
    homeHref: string;
  };
  searchCategories: { label: string; value: string }[];
  searchPlaceholder: string;
  selectArrow: string;
  categoriesLabel: string;
  categoriesDropdown: MenuLink[];
  mainMenu: MenuLink[];
  className?: string;
}

export function SiteHeader({
  contact,
  branding,
  searchCategories,
  searchPlaceholder,
  selectArrow,
  categoriesLabel,
  categoriesDropdown,
  mainMenu,
  className,
}: SiteHeaderProps) {
  return (
    <header
      id="masthead"
      className={cn("relative z-[9999] border-b border-lien-header-border bg-white", className)}
    >
      <TopBar contact={contact} />

      {/* Logo / search / cart row */}
      <div className="mx-auto max-w-[1200px] px-[15px]">
        <div className="sm:flex sm:items-center">
          {/* Branding */}
          <div className="relative z-[3] my-2.5 px-[15px] pb-[5px] text-center sm:my-0 sm:w-1/3 sm:py-[5px] sm:text-left">
            <Link href={branding.homeHref} className="block p-2.5 sm:inline-block sm:p-0 sm:pr-[5px]">
              <Image
                src={branding.logo}
                alt=""
                width={branding.logoWidth}
                height={branding.logoHeight}
                priority
                unoptimized
                className="inline-block h-auto max-w-full align-middle"
              />
            </Link>
            {/* mt-2 reproduces the collapsed 8px top margin of the (empty) h1.site-title */}
            <div className="mt-2 block sm:inline-block sm:align-middle">
              <h1 className="sr-only">{branding.siteTitle}</h1>
              <p className="text-[13px] leading-[14.95px] text-lien-tagline sm:text-[14px] sm:leading-[21px]">
                {branding.tagline}
              </p>
            </div>
          </div>

          {/* Search + cart */}
          <div className="relative px-[15px] sm:flex sm:w-2/3 sm:items-center">
            <div className="relative px-[15px] sm:flex-1">
              <div id="search-category" className="overflow-hidden py-[30px]">
                <form
                  action="/shop/"
                  method="get"
                  role="search"
                  className="relative z-[100] h-11 overflow-hidden rounded-[24px] border border-lien-widget-border bg-white"
                >
                  <div
                    className="absolute top-0 left-0 h-[42px] w-[150px] border-r border-lien-widget-border bg-[length:13px_7px] bg-[position:right_20px_center] bg-no-repeat font-bold capitalize"
                    style={{ backgroundImage: `url(${selectArrow})` }}
                  >
                    <label htmlFor="search-product-cat" className="sr-only">
                      Category
                    </label>
                    <select
                      id="search-product-cat"
                      name="product_cat"
                      defaultValue=""
                      className="absolute z-[9999] h-[42px] w-[150px] appearance-none border-0 bg-transparent pr-[35px] pl-[15px] font-arial text-[13px] leading-[42px] text-lien-input-text outline-none"
                    >
                      {searchCategories.map((c) => (
                        <option key={c.value || "all"} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <label htmlFor="search" className="sr-only">
                    Search for
                  </label>
                  <input
                    id="search"
                    type="search"
                    name="s"
                    placeholder={searchPlaceholder}
                    className="block h-[42px] w-full rounded-[3px] border-0 bg-transparent pr-[55px] pl-[160px] font-arial text-[14px] leading-[42px] text-lien-input-text outline-none placeholder:italic placeholder:text-[#999999]"
                  />
                  <button
                    type="submit"
                    aria-label="Search"
                    className="absolute top-0 right-0 z-[99] h-[42px] w-14 bg-lien-blue text-center text-white transition-[background] duration-200"
                  >
                    <Fa name="search" className="relative -top-[1.3px] inline-block align-middle text-[21px] leading-[21px]" />
                  </button>
                </form>
              </div>
            </div>

            <div className="relative z-[3] my-2.5 px-[15px] pb-[5px] text-center sm:my-0 sm:w-[154px] sm:py-[5px]">
              <div id="cart-wishlist-container" className="flex items-center justify-center">
                <div className="py-[6.4px] pr-[6.4px]">
                  <Link href="/wishlist/" aria-label="Wishlist" className="inline-block text-[15px] leading-[22.5px] transition-opacity duration-200">
                    <Fa name="heart" className="text-[16px] leading-4 text-lien-heart" />
                  </Link>
                </div>
                <div className="py-[6.4px] pl-[6.4px]">
                  <Link href="/cart/" aria-label="Cart" className="relative inline-block text-[16px] leading-6 transition-opacity duration-200">
                    <Fa name="shopping-bag" className="text-[16px] leading-4 text-lien-input-text" />
                    <CartBadge className="absolute -top-3.5 left-3.5 h-[18px] min-w-[18px] rounded-full bg-lien-blue px-1 text-center font-sans text-[12px] leading-[18px] text-white" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <MainNav categoriesLabel={categoriesLabel} categories={categoriesDropdown} items={mainMenu} searchHref="#search" />
    </header>
  );
}
