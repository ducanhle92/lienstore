import type { ReactNode } from "react";
import { CartDrawer } from "@/components/sites/lienstore/shop/CartDrawer";
import { FacebookChat } from "@/components/sites/lienstore/shop/FacebookChat";
import { SalesPopup } from "@/components/sites/lienstore/shop/SalesPopup";
import { FloatingWidgets } from "@/components/sites/lienstore/root-8a5edab2/FloatingWidgets";
import { branding, contact, footerCopyright } from "@/components/sites/lienstore/root-8a5edab2/data";
import { PageBand } from "@/components/sites/lienstore/ui2/HomeBlocks";
import { Footer2 } from "@/components/sites/lienstore/ui2/Footer2";
import { Header2, type HeaderCategory, type HeaderLink } from "@/components/sites/lienstore/ui2/Header2";
import { TopBar2 } from "@/components/sites/lienstore/ui2/TopBar2";
import { displayEmail, getAllProducts, getCategories } from "@/lib/db";
import { getCurrentCustomer } from "@/lib/customer-auth";
import { getLang } from "@/lib/lang-server";
import { LangProvider } from "@/components/sites/lienstore/shared/LangProvider";

export const SUPPORT_LINKS: HeaderLink[] = [
  { label: "Hướng dẫn đặt hàng", href: "/huong-dan-dat-hang/" },
  { label: "Chi phí vận chuyển", href: "/van-chuyen/" },
  { label: "Chính sách đổi trả", href: "/chinh-sach-doi-tra/" },
  { label: "Tra cứu đơn hàng", href: "/my-account/" },
  { label: "Chính sách bảo mật", href: "/privacy-policy/" },
  { label: "Liên hệ", href: "/ve-chung-toi/#lien-he" },
];

/** "Tin tức" dropdown. */
export const NEWS_LINKS: HeaderLink[] = [
  { label: "Hàng mới về", href: "/shop/?orderby=date" },
  { label: "Sản phẩm bán chạy", href: "/shop/?orderby=rating" },
  { label: "Hướng dẫn đặt hàng & mua hộ", href: "/huong-dan-dat-hang/" },
  { label: "Cài LienStore lên điện thoại", href: "/them-ung-dung-lien-vao-mobile/" },
];

export const ACCOUNT_LINKS: HeaderLink[] = [
  { label: "Đăng nhập", href: "/my-account/" },
  { label: "Đăng kí tài khoản", href: "/my-account/" },
  { label: "Đơn hàng của tôi", href: "/my-account/?tab=orders" },
  { label: "Tra cứu đơn hàng", href: "/my-account/" },
  { label: "Danh sách yêu thích", href: "/wishlist/" },
  { label: "Giỏ hàng", href: "/cart/" },
];

/** Categories with a representative image, shared by header mega-menu, home tiles and footer. */
export async function getHeaderCategories(): Promise<HeaderCategory[]> {
  const [categories, all] = await Promise.all([getCategories(), getAllProducts()]);
  return categories.map((c) => ({
    name: c.name,
    slug: c.slug,
    count: c.count,
    image: c.image ?? all.find((p) => p.categories.includes(c.slug))?.thumb ?? null,
    parentSlug: c.parentSlug,
  }));
}

/** Header + footer + floating widgets shared by every storefront page (sesofoods-style UI v2). */
export async function SiteChrome({ children }: { children: ReactNode }) {
  const [categories, me, lang] = await Promise.all([getHeaderCategories(), getCurrentCustomer(), getLang()]);
  const logo = { src: branding.logo, width: branding.logoWidth, height: branding.logoHeight, alt: branding.siteTitle };
  const customer = me ? { firstName: me.firstName, lastName: me.lastName, username: me.username, email: displayEmail(me.email) } : null;
  return (
    <LangProvider lang={lang}>
    <div id="page" className="relative flex min-h-screen flex-col">
      <TopBar2 contact={contact} lang={lang} loggedIn={!!customer} />
      <Header2 logo={logo} categories={categories} supportLinks={SUPPORT_LINKS} newsLinks={NEWS_LINKS} aboutHref="/ve-chung-toi/" newsHref="/category/goc-chia-se/" customer={customer} />
      <div className="flex-1">{children}</div>
      <Footer2 logo={logo} contact={contact} categories={categories} accountLinks={ACCOUNT_LINKS} supportLinks={SUPPORT_LINKS} copyright={footerCopyright} lang={lang} />
      <CartDrawer />
      <SalesPopup />
      <FloatingWidgets contact={contact} />
      {process.env.NEXT_PUBLIC_FB_PAGE_ID ? <FacebookChat pageId={process.env.NEXT_PUBLIC_FB_PAGE_ID} /> : null}
    </div>
    </LangProvider>
  );
}

/** Single full-width content column (max 1300px). */
export function FullWidthShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div id="content" className="overflow-x-clip">
      <div className={"mx-auto max-w-[1300px] px-4 py-6 " + (className ?? "")}>
        <div id="primary" className="relative w-full">
          <main id="main">{children}</main>
        </div>
      </div>
    </div>
  );
}

/** Content + right-hand sidebar (shown from lg). Used by cart / checkout / account / static pages. */
export function TwoColumnShell({ sidebar, children, title }: { sidebar: ReactNode; children: ReactNode; title?: string }) {
  return (
    <div id="content" className="overflow-x-clip">
      {title ? <PageBand title={title} crumbs={[{ label: title }]} /> : null}
      <div className="mx-auto max-w-[1300px] px-4 py-6 lg:flex lg:gap-8">
        <div id="primary" className="relative min-w-0 flex-1">
          <main id="main">{children}</main>
        </div>
        <aside className="mt-8 w-full lg:mt-0 lg:w-[300px] lg:shrink-0">{sidebar}</aside>
      </div>
    </div>
  );
}
