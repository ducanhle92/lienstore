import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // optimised images are immutable per (url, w, q): let browsers and Cloudflare keep them for a month
  images: { minimumCacheTTL: 2592000 },
  // The original WordPress site uses trailing slashes everywhere (/shop/, /product/<slug>/).
  trailingSlash: true,
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
