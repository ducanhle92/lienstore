import { Sidebar } from "@/components/sites/lienstore/root-8a5edab2/Sidebar";
import { sidebarTitle } from "@/components/sites/lienstore/root-8a5edab2/data";
import { RecentlyViewedWidget } from "@/components/sites/lienstore/shop/RecentlyViewedWidget";
import { getCategories } from "@/lib/db";
import { t } from "@/lib/i18n";
import { getLang } from "@/lib/lang-server";
import { localizeCategories } from "@/lib/localize";

/** The store sidebar (category list from the database + recently viewed). The price filter was retired (owner's call). */
export async function StoreSidebar(_props: { priceFilter?: boolean } = {}) {
  void _props;
  const lang = await getLang();
  const categories = localizeCategories(await getCategories(), lang);
  const items = categories.map((c) => ({ name: c.name, count: c.count, href: `/product-category/${c.slug}/` }));
  return (
    <>
      <Sidebar title={lang === "ja" ? t(lang, "productCategories") : sidebarTitle} categories={items} />
      <RecentlyViewedWidget className="mb-4 rounded-md border border-lien-line bg-white p-4" />
    </>
  );
}
