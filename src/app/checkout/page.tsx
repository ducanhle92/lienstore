import type { Metadata } from "next";
import { t } from "@/lib/i18n";
import { getLang } from "@/lib/lang-server";
import { ghnConfigured } from "@/lib/ghn";
import { CheckoutForm, type CheckoutMethod, type CheckoutZone } from "@/components/sites/lienstore/shop/cart/CheckoutForm";
import { StoreSidebar } from "@/components/sites/lienstore/shop/cart/StoreSidebar";
import { SiteChrome, TwoColumnShell } from "@/components/sites/lienstore/shop/SiteChrome";
import { getCurrentCustomer } from "@/lib/customer-auth";
import { displayEmail, getAllProducts, getJpyRate, getPickupAddress, getShippingMethods, getShippingPricingMode } from "@/lib/db";
import { billableProductWeightG, buildQuoteConfig, isSpecialHandling } from "@/lib/shipping";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Thanh toán – LienStore" };

export default async function Checkout() {
  const lang = await getLang();
  const [customer, methods, pickupAddress, products, mode, jpyRate] = await Promise.all([getCurrentCustomer(), getShippingMethods(), getPickupAddress(), getAllProducts(), getShippingPricingMode(), getJpyRate()]);
  const quote = buildQuoteConfig(methods, mode, jpyRate);
  // Domestic delivery options = zones of the active "VN domestic" methods.
  const ghnLive = ghnConfigured();
  const vnMethods: CheckoutMethod[] = methods
    .filter((m) => m.leg === "vn_domestic" && m.active)
    .map((m) => ({
      id: m.id,
      name: m.name,
      carrier: m.carrierName,
      codShipFee: m.codShipFee,
      live: m.liveQuote === "ghn" && ghnLive,
      zones: m.zones.filter((z) => z.active).map((z) => ({ id: z.id, methodId: m.id, label: z.name, fee: z.fee, unit: z.unit, baseG: z.baseG, stepG: z.stepG, stepFee: z.stepFee, extraFee: z.extraFee, freeOver: z.freeOver, eta: z.eta, areas: z.areas })),
    }))
    .filter((m) => m.live || m.zones.length > 0);
  const zones: CheckoutZone[] = vnMethods.flatMap((m) => m.zones);
  // Products bought to order (no tracked stock or currently 0) must be prepaid in full.
  const preorderIds = products.filter((p) => p.stock === null || p.stock <= 0).map((p) => p.id);
  // Billable grams per product: max(actual, volumetric) × safety factor by confidence (500 g × 2 when unknown).
  const weights: Record<number, number> = {};
  for (const p of products) weights[p.id] = billableProductWeightG(p.weightG, p.dimsCm, p.dimsConfidence);
  // liquids / aerosols / bulky items (by tag) pay the carrier surcharge; regular prices feed the "you saved" line
  const specialIds = products.filter((p) => isSpecialHandling(p.tags)).map((p) => p.id);
  const regularPrices: Record<number, number> = {};
  for (const p of products) if (p.regularPrice && p.regularPrice > p.price) regularPrices[p.id] = p.regularPrice;
  return (
    <SiteChrome>
      <TwoColumnShell sidebar={<StoreSidebar />} title={t(lang, "checkoutTitle")}>
        <article className="entry-content">
          <CheckoutForm
            loggedIn={!!customer}
            zones={zones}
            methods={vnMethods}
            pickupAddress={pickupAddress}
            preorderIds={preorderIds}
            weights={weights}
            specialIds={specialIds}
            regularPrices={regularPrices}
            quote={quote}
            defaults={
              customer
                ? { firstName: customer.firstName, lastName: customer.lastName, address: customer.address, phone: customer.phone, email: displayEmail(customer.email) }
                : undefined
            }
          />
        </article>
      </TwoColumnShell>
    </SiteChrome>
  );
}
