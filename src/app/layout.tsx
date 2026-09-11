import type { Metadata, Viewport } from "next";
import { CartProvider } from "@/components/sites/lienstore/shop/CartProvider";
import "./globals.css";
import { getSiteTheme } from "@/lib/db";
import { getLang } from "@/lib/lang-server";
import { siteUrl } from "@/lib/site-url";
import { themeCss } from "@/lib/theme";

/** Title, icons and share picture follow the theme set in Admin › Sales › Giao diện & Logo. */
export async function generateMetadata(): Promise<Metadata> {
  const [theme, base] = await Promise.all([getSiteTheme(), siteUrl()]);
  return {
    metadataBase: new URL(base),
    title: theme.slogan ? `${theme.shopName} – ${theme.slogan}` : theme.shopName,
    description: `${theme.shopName} – Mỹ phẩm, thực phẩm chức năng, hàng tiêu dùng Nhật nội địa`,
    icons: {
      icon: [{ url: theme.icon, type: "image/png" }],
      apple: [{ url: theme.icon }],
    },
    openGraph: { images: [theme.ogImage], siteName: theme.shopName },
  };
}

/** Browser chrome / iOS status bar takes the header colour so the top of the app is one colour. */
export async function generateViewport(): Promise<Viewport> {
  const theme = await getSiteTheme();
  return { themeColor: theme.colors.header };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [lang, theme] = await Promise.all([getLang(), getSiteTheme()]);
  return (
    <html lang={lang} className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        {/* palette from the admin, overriding the --lien-* defaults in globals.css */}
        <style id="lien-theme" dangerouslySetInnerHTML={{ __html: themeCss(theme) }} />
        <CartProvider>{children}</CartProvider>
      </body>
    </html>
  );
}
