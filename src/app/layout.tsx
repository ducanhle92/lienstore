import type { Metadata } from "next";
import { CartProvider } from "@/components/sites/lienstore/shop/CartProvider";
import "./globals.css";
import { getLang } from "@/lib/lang-server";

export const metadata: Metadata = {
  title: "ĐẸP MỖI GIÂY – KHỎE MỖI NGÀY",
  description: "LienStore – Mỹ Phẩm Thực phẩm Chức Năng Nhật Tại Việt",
  icons: {
    icon: [
      { url: "/sites/lienstore/brand/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/sites/lienstore/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/sites/lienstore/brand/lienstore-icon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/sites/lienstore/brand/icon-192.png", sizes: "192x192" }],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const lang = await getLang();
  return (
    <html lang={lang} className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        <CartProvider>{children}</CartProvider>
      </body>
    </html>
  );
}
