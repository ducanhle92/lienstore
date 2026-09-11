import type { Metadata } from "next";
import { t } from "@/lib/i18n";
import { getLang } from "@/lib/lang-server";
import { CheckoutForm } from "@/components/sites/lienstore/shop/cart/CheckoutForm";
import { StoreSidebar } from "@/components/sites/lienstore/shop/cart/StoreSidebar";
import { SiteChrome, TwoColumnShell } from "@/components/sites/lienstore/shop/SiteChrome";
import { getCurrentCustomer } from "@/lib/customer-auth";
import { displayEmail, getAllProducts, getJpyRate, getPickupAddress, getShippingMethods, getShippingPricingMode, listAddresses } from "@/lib/db";
import { billableProductWeightG, buildQuoteConfig } from "@/lib/shipping";
import { parseAddressToCodes } from "@/lib/vn-address";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Thanh toán – LienStore" };

export default async function Checkout() {
  const lang = await getLang();
  const [customer, methods, pickupAddress, products, mode, jpyRate] = await Promise.all([getCurrentCustomer(), getShippingMethods(), getPickupAddress(), getAllProducts(), getShippingPricingMode(), getJpyRate()]);
  const quote = buildQuoteConfig(methods, mode, jpyRate);
  // Products bought to order (no tracked stock or currently 0) must be prepaid in full.
  const preorderIds = products.filter((p) => p.fulfillment === "order" || p.stock === null || p.stock <= 0).map((p) => p.id);
  // Billable grams per product: max(actual, volumetric) × safety factor by confidence (500 g × 2 when unknown) — for the JP legs.
  const weights: Record<number, number> = {};
  for (const p of products) weights[p.id] = billableProductWeightG(p.weightG, p.dimsCm, p.dimsConfidence);
  const regularPrices: Record<number, number> = {};
  for (const p of products) if (p.regularPrice && p.regularPrice > p.price) regularPrices[p.id] = p.regularPrice;
  // The VN-domestic fee is quoted per carrier for the exact address (POST /api/shipping/quote) — no zone tables here.
  return (
    <SiteChrome>
      <TwoColumnShell sidebar={<StoreSidebar />} title={t(lang, "checkoutTitle")}>
        <article className="entry-content">
          <CheckoutForm
            loggedIn={!!customer}
            pickupAddress={pickupAddress}
            preorderIds={preorderIds}
            weights={weights}
            regularPrices={regularPrices}
            quote={quote}
            defaults={
              customer
                ? { firstName: customer.firstName, lastName: customer.lastName, address: customer.address, addressCodes: parseAddressToCodes(customer.address), phone: customer.phone, email: displayEmail(customer.email) }
                : undefined
            }
            savedAddresses={customer ? (await listAddresses(customer.id)).map((a) => ({ id: a.id, label: a.label, name: a.name, phone: a.phone, address: a.address, isDefault: a.isDefault, codes: parseAddressToCodes(a.address) })) : []}
          />
        </article>
      </TwoColumnShell>
    </SiteChrome>
  );
}
