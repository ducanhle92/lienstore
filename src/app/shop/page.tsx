import type { Metadata } from "next";
import { getSiteTheme } from "@/lib/db";
import { SiteChrome } from "@/components/sites/lienstore/shop/SiteChrome";
import { ShopListing, type SearchParams } from "./_listing";

/** "Shop – <slogan> – <shop name>": the slogan comes from Admin › Sales › Giao diện & Logo. */
export async function generateMetadata(): Promise<Metadata> {
  const theme = await getSiteTheme();
  return { title: `Shop – ${theme.slogan}` };
}

interface PageProps {
  searchParams: Promise<SearchParams>;
}

// Clone of https://linconnn.io.vn/shop/ (also serves ?s= search results).
export default async function Page({ searchParams }: PageProps) {
  const sp = await searchParams;
  return (
    <SiteChrome>
        <ShopListing page={1} searchParams={sp} />
    </SiteChrome>
  );
}
