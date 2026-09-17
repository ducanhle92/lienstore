import type { Metadata } from "next";
import { LostPasswordForm } from "@/components/sites/lienstore/shop/cart/AccountForms";
import { StoreSidebar } from "@/components/sites/lienstore/shop/cart/StoreSidebar";
import { WooHeading } from "@/components/sites/lienstore/shop/cart/WooUi";
import { SiteChrome, TwoColumnShell } from "@/components/sites/lienstore/shop/SiteChrome";

export const metadata: Metadata = { title: "Quên mật khẩu" };

export default function LostPassword() {
  return (
    <SiteChrome>
      <TwoColumnShell sidebar={<StoreSidebar />} title="Quên mật khẩu">
        <article className="entry-content">
          <WooHeading as="h2">Quên mật khẩu</WooHeading>
          <LostPasswordForm />
        </article>
      </TwoColumnShell>
    </SiteChrome>
  );
}
