import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSiteTheme } from "@/lib/db";
import { SiteChrome } from "@/components/sites/lienstore/shop/SiteChrome";
import { ShopListing, parsePageNumber, type SearchParams } from "../../_listing";

/** Same title as /shop/ — the slogan comes from Admin › Sales › Giao diện & Logo. */
export async function generateMetadata(): Promise<Metadata> {
  const theme = await getSiteTheme();
  return { title: `Shop – ${theme.slogan}` };
}

interface PageProps {
  params: Promise<{ n: string }>;
  searchParams: Promise<SearchParams>;
}

// Clone of https://linconnn.io.vn/shop/page/N/
export default async function Page({ params, searchParams }: PageProps) {
  const [{ n }, sp] = await Promise.all([params, searchParams]);
  const page = parsePageNumber(n);
  if (Number.isNaN(page) || page < 1) notFound();

  return (
    <SiteChrome>
        <ShopListing page={page} searchParams={sp} />
    </SiteChrome>
  );
}
