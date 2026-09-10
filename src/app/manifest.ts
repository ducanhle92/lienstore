import type { MetadataRoute } from "next";

// PWA manifest for LienStore.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LienStore",
    short_name: "LienStore",
    description: "Chuyên Sản Phẩm Nhật Nội Địa",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#458500",
    lang: "vi",
    icons: [
      { src: "/sites/lienstore/brand/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/sites/lienstore/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/sites/lienstore/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
