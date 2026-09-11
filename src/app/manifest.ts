import type { MetadataRoute } from "next";
import { getSiteTheme } from "@/lib/db";

// PWA manifest: name, colour and icon follow Admin › Sales › Giao diện & Logo.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const theme = await getSiteTheme();
  return {
    name: theme.shopName,
    short_name: theme.shopName,
    description: theme.slogan || "Chuyên hàng Nhật nội địa",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: theme.colors.header,
    lang: "vi",
    icons: [
      { src: theme.icon, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: theme.icon, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: theme.icon, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
