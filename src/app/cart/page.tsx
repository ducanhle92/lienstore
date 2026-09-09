import type { Metadata } from "next";
import { t } from "@/lib/i18n";
import { getLang } from "@/lib/lang-server";
import { CartPage } from "@/components/sites/lienstore/shop/cart/CartPage";
import { StoreSidebar } from "@/components/sites/lienstore/shop/cart/StoreSidebar";
import { SiteChrome, TwoColumnShell } from "@/components/sites/lienstore/shop/SiteChrome";

export const metadata: Metadata = { title: "Giỏ hàng – LienStore" };

export default async function Cart() {
  return (
    <SiteChrome>
      <TwoColumnShell sidebar={<StoreSidebar />} title={t(await getLang(), "cart")}>
        <article className="entry-content">
          <CartPage />
        </article>
      </TwoColumnShell>
    </SiteChrome>
  );
}
