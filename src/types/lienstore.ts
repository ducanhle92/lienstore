// Content types for the linconnn.io.vn clone (site lienstore).

export interface MenuLink {
  label: string;
  href: string;
}

export interface Slide {
  image: string;
  href: string;
  alt: string;
}

export interface SidebarCategory {
  name: string;
  count: number;
  href: string;
}

export interface CategoryCard {
  name: string;
  count: number;
  href: string;
  image: string;
  alt: string;
}

export interface Product {
  title: string;
  /** Formatted amount without currency, e.g. "890.000" */
  price: string;
  currency: string;
  href: string;
  image: string;
  addToCartHref: string;
}

export interface ProductSection {
  key: string;
  title: string;
  href: string;
  products: Product[];
}

export type SocialKind = "facebook" | "zalo" | "messenger" | "instagram" | "tiktok" | "youtube";

export interface SocialLink {
  kind: SocialKind;
  label: string;
  href: string;
}

export interface PhoneEntry {
  /** Short label shown before the number, e.g. "VN" / "JP". */
  label: string;
  number: string;
  /** tel: link; omit for placeholders. */
  href?: string;
}

export interface ContactInfo {
  phones: PhoneEntry[];
  email: string;
  address: string;
  hours: string;
  /** Japanese rendering of the address (shown when the site is in 日本語). */
  addressJa?: string;
  socials: SocialLink[];
}

export interface FooterImage {
  src: string;
  alt: string;
  width: number;
  height: number;
}

export interface FooterColumn {
  title: string;
  links?: MenuLink[];
  /** Render the store contact block (phones, email, address, socials). */
  contact?: boolean;
  image?: FooterImage;
}
