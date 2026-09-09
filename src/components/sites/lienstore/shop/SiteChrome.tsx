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
import type { Lang } from "@/lib/i18n";
import { localizeCategories } from "@/lib/localize";

type L2 = HeaderLink & { ja: string };
const SUPPORT: L2[] = [
  { label: "Hướng dẫn đặt hàng", ja: "ご注文方法", href: "/huong-dan-dat-hang/" },
  { label: "Chi phí vận chuyển", ja: "配送料", href: "/van-chuyen/" },
  { label: "Chính sách đổi trả", ja: "返品・交換ポリシー", href: "/chinh-sach-doi-tra/" },
  { label: "Tra cứu đơn hàng", ja: "注文を確認", href: "/my-account/" },
  { label: "Chính sách bảo mật", ja: "プライバシーポリシー", href: "/privacy-policy/" },
  { label: "Liên hệ", ja: "お問い合わせ", href: "/ve-chung-toi/#lien-he" },
];
const NEWS: L2[] = [
  { label: "Hàng mới về", ja: "新着商品", href: "/shop/?orderby=date" },
  { label: "Sản phẩm bán chạy", ja: "人気商品", href: "/shop/?orderby=rating" },
  { label: "Hướng dẫn đặt hàng & mua hộ", ja: "ご注文・購入代行ガイド", href: "/huong-dan-dat-hang/" },
  { label: "Cài LienStore lên điện thoại", ja: "スマホにLienStoreを追加", href: "/them-ung-dung-lien-vao-mobile/" },
];
const ACCOUNT: L2[] = [
  { label: "Đăng nhập", ja: "ログイン", href: "/my-account/" },
  { label: "Đăng kí tài khoản", ja: "会員登録", href: "/my-account/" },
  { label: "Đơn hàng của tôi", ja: "注文履歴", href: "/my-account/?tab=orders" },
  { label: "Tra cứu đơn hàng", ja: "注文を確認", href: "/my-account/" },
  { label: "Danh sách yêu thích", ja: "お気に入りリスト", href: "/wishlist/" },
  { label: "Giỏ hàng", ja: "カート", href: "/cart/" },
];
const pickLang = (links: L2[], lang: Lang): HeaderLink[] => links.map((l) => ({ label: lang === "ja" ? l.ja : l.label, href: l.href }));
export const SUPPORT_LINKS: HeaderLink[] = pickLang(SUPPORT, "vi");
export const NEWS_LINKS: HeaderLink[] = pickLang(NEWS, "vi");
export const ACCOUNT_LINKS: HeaderLink[] = pickLang(ACCOUNT, "vi");

/** Categories with a representative image, shared by header mega-menu, home tiles and footer. */
export async function getHeaderCategories(lang: Lang = "vi"): Promise<HeaderCategory[]> {
  const [cats, all] = await Promise.all([getCategories(), getAllProducts()]);
  const categories = localizeCategories(cats, lang);
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
  const lang = await getLang();
  const [categories, me] = await Promise.all([getHeaderCategories(lang), getCurrentCustomer()]);
  const logo = { src: branding.logo, width: branding.logoWidth, height: branding.logoHeight, alt: branding.siteTitle };
  const customer = me ? { firstName: me.firstName, lastName: me.lastName, username: me.username, email: displayEmail(me.email) } : null;
  return (
    <LangProvider lang={lang}>
    <div id="page" className="relative flex min-h-screen flex-col">
      <TopBar2 contact={contact} lang={lang} loggedIn={!!customer} />
      <Header2 logo={logo} categories={categories} supportLinks={pickLang(SUPPORT, lang)} newsLinks={pickLang(NEWS, lang)} aboutHref="/ve-chung-toi/" newsHref="/category/goc-chia-se/" customer={customer} />
      <div className="flex-1">{children}</div>
      <Footer2 logo={logo} contact={contact} categories={categories} accountLinks={pickLang(ACCOUNT, lang)} supportLinks={pickLang(SUPPORT, lang)} copyright={footerCopyright} lang={lang} />
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
