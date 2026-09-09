import type { Metadata } from "next";
import { CheckoutForm, type CheckoutZone } from "@/components/sites/lienstore/shop/cart/CheckoutForm";
import { StoreSidebar } from "@/components/sites/lienstore/shop/cart/StoreSidebar";
import { SiteChrome, TwoColumnShell } from "@/components/sites/lienstore/shop/SiteChrome";
import { getCurrentCustomer } from "@/lib/customer-auth";
import { getAllProducts, getPickupAddress, getShippingMethods } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Thanh toán – LienStore" };

export default async function Checkout() {
  const [customer, methods, pickupAddress, products] = await Promise.all([getCurrentCustomer(), getShippingMethods(), getPickupAddress(), getAllProducts()]);
  // Domestic delivery options = zones of the active "VN domestic" methods.
  const zones: CheckoutZone[] = methods
    .filter((m) => m.leg === "vn_domestic")
    .flatMap((m) =>
      m.zones
        .filter((z) => z.active)
        .map((z) => ({ id: z.id, label: `${z.name}${m.carrierName ? ` · ${m.carrierName}` : ""}`, fee: z.fee, unit: z.unit, freeOver: z.freeOver, eta: z.eta, areas: z.areas })),
    );
  // Products bought to order (no tracked stock or currently 0) must be prepaid in full.
  const preorderIds = products.filter((p) => p.stock === null || p.stock <= 0).map((p) => p.id);
  return (
    <SiteChrome>
      <TwoColumnShell sidebar={<StoreSidebar />} title="Thanh toán">
        <article className="entry-content">
          <CheckoutForm
            loggedIn={!!customer}
            zones={zones}
            pickupAddress={pickupAddress}
            preorderIds={preorderIds}
            defaults={
              customer
                ? { firstName: customer.firstName, lastName: customer.lastName, address: customer.address, phone: customer.phone, email: customer.email }
                : undefined
            }
          />
        </article>
      </TwoColumnShell>
    </SiteChrome>
  );
}
