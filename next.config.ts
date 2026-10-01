import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Cloudflare compresses at the edge (brotli) for every public visitor; gzip in Node only costs CPU on the NAS and
  // triggers "11 drain listeners added to [Gzip]" warnings under streaming. LAN visitors get plain HTML (fine).
  compress: false,
  // optimised images are immutable per (url, w, q): let browsers and Cloudflare keep them for a month
  images: { minimumCacheTTL: 2592000 },
  // The original WordPress site uses trailing slashes everywhere (/shop/, /product/<slug>/).
  trailingSlash: true,
  // Static files under public/ otherwise go out as `max-age=0`, so Cloudflare revalidated every font / brand file with
  // the origin on every page view (REVALIDATED/EXPIRED). Fonts never change in place → a year; the rest a week at the
  // browser and a month at the edge (a redeploy that changes a file keeps its name only for brand/sprite files).
  async headers() {
    return [
      // later rules win for the same header → the generic one first, fonts after it
      { source: "/sites/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=604800, s-maxage=2592000, stale-while-revalidate=86400" }] },
      { source: "/sites/:site/shared/fonts/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
    ];
  },
  // "Về chúng tôi" and "Liên hệ" were merged into one page (UI v2).
  async redirects() {
    return [
      { source: "/gioi-thieu-ve-lienstore", destination: "/ve-chung-toi/", permanent: true },
      { source: "/lien-he", destination: "/ve-chung-toi/#lien-he", permanent: true },
    ];
  },
  // sqlite.ts opens LIEN_DB_PATH / LIEN_SEED_PATH at runtime, which makes Next trace "the whole project" into
  // .next/standalone. Nothing outside the bundled server code is needed there (Dockerfile copies public/ and
  // data/seed.json explicitly), so keep the standalone output small.
  outputFileTracingExcludes: {
    "*": ["./docs/**", "./scripts/**", "./deploy/**", "./data/**", "./public/**", "./src/**", "./*.md", "./.claude/**", "./.next/cache/**"],
  },
};

export default nextConfig;
