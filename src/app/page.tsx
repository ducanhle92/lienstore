import Link from "next/link";
import { HeroSlider } from "@/components/sites/lienstore/root-8a5edab2/HeroSlider";
import { sliderAssets, slides } from "@/components/sites/lienstore/root-8a5edab2/data";
import { ShopProductGrid } from "@/components/sites/lienstore/shop/ShopProductCard";
import { FullWidthShell, getHeaderCategories, SiteChrome } from "@/components/sites/lienstore/shop/SiteChrome";
import { NewsCards, SectionHeader2, UspStrip } from "@/components/sites/lienstore/ui2/HomeBlocks";
import { CategoryCarousel } from "@/components/sites/lienstore/ui2/CategoryCarousel";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { buildCategoryTree, shortName } from "@/lib/categories";
import { t } from "@/lib/i18n";
import { getLang } from "@/lib/lang-server";
import { localizeProducts } from "@/lib/localize";
import { getPosts, queryProducts } from "@/lib/db";

export const dynamic = "force-dynamic";

/** How many category rows the home page shows (largest categories first). */
const CATEGORY_ROWS = 6;

export default async function Home() {
  const lang = await getLang();
  const categories = await getHeaderCategories(lang);
  const [fresh, popular, sale, posts] = await Promise.all([
    queryProducts({ orderby: "date", perPage: 12 }),
    queryProducts({ orderby: "rating", perPage: 12 }),
    queryProducts({ orderby: "popularity", perPage: 60 }),
    getPosts(),
  ]);
  const onSale = localizeProducts(sale.items.filter((p) => p.regularPrice && p.regularPrice > p.price).slice(0, 6), lang);
  const freshItems = localizeProducts(fresh.items, lang);
  const popularItems = localizeProducts(popular.items, lang);
  const topCategories = buildCategoryTree(categories)
    .filter((n) => n.total > 0)
    .slice(0, CATEGORY_ROWS)
    .map((n) => ({ ...n.category, count: n.total }));
  const rows = await Promise.all(
    topCategories.map(async (c) => ({ cat: c, products: localizeProducts((await queryProducts({ category: c.slug, orderby: "date", perPage: 6 })).items, lang) })),
  );

  return (
    <SiteChrome>
      <FullWidthShell className="pt-4">
        <HeroSlider slides={slides} arrowSprite={sliderAssets.directionNav} className="overflow-hidden rounded-md" />

        <CategoryCarousel categories={categories} />

        {onSale.length >= 3 ? (
          <section className="mt-10" aria-label="Giảm giá">
            <SectionHeader2 title={t(lang, "saleTitle")} icon="fire" tone="sale" href="/shop/?orderby=popularity" />
            <ShopProductGrid products={onSale} cols={6} />
          </section>
        ) : null}

        <section className="mt-10" aria-label="Sản phẩm mới">
          <SectionHeader2 title={t(lang, "newTitle")} icon="bolt" href="/shop/?orderby=date" />
          <ShopProductGrid products={freshItems} cols={6} />
        </section>

        <section className="mt-10" aria-label="Bán chạy">
          <SectionHeader2 title={t(lang, "bestTitle")} icon="star" href="/shop/?orderby=rating" />
          <ShopProductGrid products={popularItems.slice(0, 6)} cols={6} />
        </section>

        <div className="my-10 grid gap-4 md:grid-cols-2">
          <Link href="/my-account/" className="flex items-center gap-4 rounded-md bg-lien-blue p-5 text-white no-underline hover:bg-lien-blue-hover">
            <Fa name="gift" className="text-[34px]" />
            <span>
              <span className="block text-[16px] font-bold uppercase">{t(lang, "regTileTitle")}</span>
              <span className="block text-[13px] opacity-90">{t(lang, "regTileText")}</span>
            </span>
          </Link>
          <a href="https://zalo.me/0964839769" target="_blank" rel="noreferrer" className="flex items-center gap-4 rounded-md bg-lien-heading p-5 text-white no-underline hover:opacity-90">
            <Fa name="comments-o" className="text-[34px]" />
            <span>
              <span className="block text-[16px] font-bold uppercase">{t(lang, "zaloTileTitle")}</span>
              <span className="block text-[13px] opacity-90">{t(lang, "zaloTileText")}</span>
            </span>
          </a>
        </div>

        {rows.map(({ cat, products }) =>
          products.length ? (
            <section key={cat.slug} className="mt-10" aria-label={cat.name}>
              <SectionHeader2 title={shortName(cat.name)} href={`/product-category/${cat.slug}/`} />
              <ShopProductGrid products={products} cols={6} />
              <p className="mt-3 text-center">
                <Link href={`/product-category/${cat.slug}/`} className="inline-flex items-center gap-1 rounded-full border border-lien-blue px-5 py-2 text-[13px] font-semibold text-lien-blue no-underline hover:bg-lien-blue hover:text-white">
                  {t(lang, "viewAllPrefix")} {cat.count} {t(lang, "productsUnit")} <Fa name="angle-right" />
                </Link>
              </p>
            </section>
          ) : null,
        )}

        <UspStrip />
        <NewsCards posts={posts} />
      </FullWidthShell>
    </SiteChrome>
  );
}
