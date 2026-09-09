import type { Metadata } from "next";
import { t } from "@/lib/i18n";
import { getLang } from "@/lib/lang-server";
import { WishlistPage } from "@/components/sites/lienstore/shop/cart/WishlistPage";
import { PageBand } from "@/components/sites/lienstore/ui2/HomeBlocks";
import { FullWidthShell, SiteChrome } from "@/components/sites/lienstore/shop/SiteChrome";

export const metadata: Metadata = { title: "Wishlist – LienStore" };

export default async function Wishlist() {
  const lang = await getLang();
  return (
    <SiteChrome>
      <PageBand title={t(lang, "wishlistTitle")} crumbs={[{ label: t(lang, "wishlistTitle") }]} />
      <FullWidthShell>
        <WishlistPage />
      </FullWidthShell>
    </SiteChrome>
  );
}
