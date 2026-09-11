/**
 * Storefront look & feel managed in Admin › Sales › Giao diện & Logo: shop name, slogan, logos and the colour palette.
 * Pure module (no server-only) so the admin form, the root layout and the manifest all read the same shape.
 * Colours are written as `--lien-*` CSS variables in the root layout, overriding the defaults in globals.css.
 */
export type ThemeColorKey = "primary" | "primaryHover" | "soft" | "accent" | "header" | "footer" | "topbar" | "price";

export type ThemeColors = Record<ThemeColorKey, string>;

export interface SiteTheme {
  /** Brand name shown in titles, alt text and the footer. */
  shopName: string;
  /** Tagline under the header logo ("Chuyên hàng Nhật nội địa"). */
  slogan: string;
  /** Logo on the coloured header bar (light artwork, transparent background). */
  logoHeader: string;
  /** Logo on light backgrounds (footer, e-mails, invoices). */
  logoLight: string;
  /** App icon / favicon (square PNG, ≥ 512 px). */
  icon: string;
  /** Social share picture (1200×630). */
  ogImage: string;
  /** Preset the palette came from; "custom" once a colour is edited by hand. */
  preset: "red" | "green" | "custom";
  colors: ThemeColors;
}

export const THEME_COLOR_LABELS: Record<ThemeColorKey, string> = {
  primary: "Màu chính (nút, link, giá)",
  primaryHover: "Màu chính khi di chuột",
  soft: "Nền nhạt (tab, ô thông tin)",
  accent: "Màu nhấn (hồng: viền, hover chân trang)",
  header: "Nền thanh menu trên",
  footer: "Nền chân trang tối / menu admin",
  topbar: "Nền dải trên cùng",
  price: "Màu giá bán",
};

export const THEME_PRESETS: Record<"red" | "green", { label: string; colors: ThemeColors }> = {
  red: {
    label: "Đỏ – trắng – hồng (logo Store Lienanh)",
    colors: { primary: "#d3322a", primaryHover: "#b3251f", soft: "#fdecee", accent: "#f6a2b6", header: "#d3322a", footer: "#7f1512", topbar: "#6a100e", price: "#b3251f" },
  },
  green: {
    label: "Xanh lá (giao diện cũ)",
    colors: { primary: "#458500", primaryHover: "#366800", soft: "#eef6e6", accent: "#8bc34a", header: "#458500", footer: "#1f3a08", topbar: "#17300a", price: "#2f5d00" },
  },
};

export const BRAND_DIR = "/sites/lienstore/brand";

export const DEFAULT_THEME: SiteTheme = {
  shopName: "Store Lienanh",
  slogan: "Chuyên hàng Nhật nội địa",
  logoHeader: `${BRAND_DIR}/logo-white-800.png`,
  logoLight: `${BRAND_DIR}/logo-transparent-800.png`,
  icon: `${BRAND_DIR}/icon-512.png`,
  ogImage: `${BRAND_DIR}/og-image-1200x630.png`,
  preset: "red",
  colors: { ...THEME_PRESETS.red.colors },
};

/** Logo artwork is 800×388 (owner's "Store Lienanh" files, see scripts/brand/original); the header scales it by width. */
export const LOGO_RATIO = { width: 800, height: 388 };

const HEX = /^#[0-9a-f]{6}$/i;

export function isHexColor(v: unknown): v is string {
  return typeof v === "string" && HEX.test(v);
}

/** Normalise "#ABC", "abc123" or "#abc123" to "#abc123"; null when it is not a colour. */
export function normalizeHex(v: string): string | null {
  const s = v.trim().replace(/^#?/, "#").toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(s)) return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  return HEX.test(s) ? s : null;
}

const isPath = (v: unknown): v is string => typeof v === "string" && /^(\/|https?:\/\/)/.test(v) && !/[\s"'<>]/.test(v);

/** Theme from the settings JSON; missing or broken fields fall back to the defaults. */
export function parseTheme(raw: string | null | undefined): SiteTheme {
  if (!raw) return { ...DEFAULT_THEME, colors: { ...DEFAULT_THEME.colors } };
  try {
    const o = JSON.parse(raw) as Partial<SiteTheme> & { colors?: Partial<ThemeColors> };
    const preset: SiteTheme["preset"] = o.preset === "green" || o.preset === "custom" || o.preset === "red" ? o.preset : "custom";
    // a saved preset follows the preset's current colours (so brand tweaks reach every deployment); only "custom" keeps stored values
    const colors: ThemeColors = preset === "custom" ? { ...DEFAULT_THEME.colors } : { ...THEME_PRESETS[preset].colors };
    if (preset === "custom") {
      for (const k of Object.keys(colors) as ThemeColorKey[]) {
        const v = o.colors?.[k];
        if (isHexColor(v)) colors[k] = v.toLowerCase();
      }
    }
    return {
      shopName: typeof o.shopName === "string" && o.shopName.trim() ? o.shopName.trim().slice(0, 60) : DEFAULT_THEME.shopName,
      slogan: typeof o.slogan === "string" ? o.slogan.trim().slice(0, 80) : DEFAULT_THEME.slogan,
      logoHeader: isPath(o.logoHeader) ? o.logoHeader : DEFAULT_THEME.logoHeader,
      logoLight: isPath(o.logoLight) ? o.logoLight : DEFAULT_THEME.logoLight,
      icon: isPath(o.icon) ? o.icon : DEFAULT_THEME.icon,
      ogImage: isPath(o.ogImage) ? o.ogImage : DEFAULT_THEME.ogImage,
      preset,
      colors,
    };
  } catch {
    return { ...DEFAULT_THEME, colors: { ...DEFAULT_THEME.colors } };
  }
}

/** CSS that maps the palette onto the `--lien-*` tokens used everywhere (storefront and admin). */
export function themeCss(theme: SiteTheme): string {
  const c = theme.colors;
  const vars: Record<string, string> = {
    "--lien-header": c.header,
    "--lien-blue": c.primary,
    "--lien-blue-hover": c.primaryHover,
    "--lien-blue-soft": c.soft,
    "--lien-blue-ring": c.accent,
    "--lien-price": c.price,
    "--lien-price-progress": c.primary,
    "--lien-price-track": c.soft,
    "--lien-hr": c.soft,
    "--lien-dark": c.footer,
    "--lien-footer": c.footer,
    "--lien-topbar": c.topbar,
    "--lien-footer-hover": c.accent,
    "--sidebar-primary": c.primary,
    "--sidebar-accent": c.soft,
    "--sidebar-border": c.soft,
    "--sidebar-ring": c.accent,
  };
  return `:root{${Object.entries(vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(";")}}`;
}
