import type { Metadata } from "next";
import { t } from "@/lib/i18n";
import { getLang } from "@/lib/lang-server";
import { ShippingTable } from "@/components/sites/lienstore/shop/ShippingTable";
import { FullWidthShell, SiteChrome } from "@/components/sites/lienstore/shop/SiteChrome";
import { PageBand } from "@/components/sites/lienstore/ui2/HomeBlocks";
import { getShippingMethods, getShippingNotes } from "@/lib/db";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Chi phí vận chuyển – LienStore",
  description: "Bảng phí vận chuyển hàng Nhật về Việt Nam và phí giao hàng nội địa của LienStore.",
};

export default async function ShippingPage() {
  const lang = await getLang();
  const [methods, notes] = await Promise.all([getShippingMethods(), getShippingNotes()]);
  return (
    <SiteChrome>
      <PageBand title={t(lang, "shippingTitle")} crumbs={[{ label: t(lang, "shippingTitle") }]} description={t(lang, "shippingDesc")} />
      <FullWidthShell>
        <div className="mx-auto max-w-[1000px]">
          <ShippingTable methods={methods} notes={notes} />
        </div>
      </FullWidthShell>
    </SiteChrome>
  );
}
