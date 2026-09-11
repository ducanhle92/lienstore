import type { Metadata } from "next";
import { t } from "@/lib/i18n";
import { getLang } from "@/lib/lang-server";
import { ShipPolicyCard } from "@/components/sites/lienstore/shop/ShipPolicyCard";
import { ShippingQuoteTab } from "@/components/sites/lienstore/shop/ShippingQuotePanel";
import { FullWidthShell, SiteChrome } from "@/components/sites/lienstore/shop/SiteChrome";
import { PageBand } from "@/components/sites/lienstore/ui2/HomeBlocks";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { jaText } from "@/components/sites/lienstore/shop/ShippingTable";
import { getShipPolicy, getShippingNotes } from "@/lib/db";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Chi phí vận chuyển – LienStore",
  description: "Cước giao hàng nội địa Việt Nam của LienStore được báo theo địa chỉ nhận, khối lượng và kích thước kiện hàng.",
};

/** Shipping page: address → per-carrier quotes for the current cart (no nationwide zone table). */
export default async function ShippingPage() {
  const lang = await getLang();
  const [notes, policy] = await Promise.all([getShippingNotes(), getShipPolicy()]);
  return (
    <SiteChrome>
      <PageBand title={t(lang, "shippingTitle")} crumbs={[{ label: t(lang, "shippingTitle") }]} description={t(lang, "shippingDesc")} />
      <FullWidthShell>
        <div className="mx-auto max-w-[1000px] space-y-8">
          <ShipPolicyCard policy={policy} />
          <section aria-labelledby="ship-quote-heading">
            <h2 id="ship-quote-heading" className="m-0 mb-3 text-[20px] font-bold uppercase tracking-[0.3px] text-lien-heading">
              <Fa name="truck" className="mr-2 text-lien-blue" />
              {t(lang, "leg_vn_domestic")}
            </h2>
            <ShippingQuoteTab useCart compact={false} />
          </section>
          {notes.length ? (
            <section aria-labelledby="ship-notes">
              <h3 id="ship-notes" className="m-0 mb-2 text-[15px] font-bold text-lien-success">
                {t(lang, "shipNotes")}
              </h3>
              <ul className="m-0 list-disc space-y-1 pl-5 text-[13px] leading-5 text-lien-text">
                {notes.map((n, i) => (
                  <li key={i}>{jaText(n, lang)}</li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </FullWidthShell>
    </SiteChrome>
  );
}
