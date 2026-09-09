// Shop / commerce types for the linconnn.io.vn clone.

export type StockStatus = "instock" | "outofstock";

export interface CatalogProduct {
  id: number;
  slug: string;
  name: string;
  /** Price in VND (integer, e.g. 890000). */
  price: number;
  regularPrice: number | null;
  /** Purchase/cost price in VND used for profit reporting in admin; null = unknown. */
  costPrice: number | null;
  /** Where to buy it (Amazon JP / brand page) — admin only, used by the purchase list. */
  supplierUrl: string | null;
  /** Reorder threshold for tracked stock; null = store default. */
  minStock: number | null;
  /** Packed weight in grams (for shipping estimates); null = unknown. */
  weightG: number | null;
  /** Packed size "DxRxC" in cm, e.g. "12x8x5"; null = unknown. */
  dimsCm: string | null;
  currency: string;
  sku: string | null;
  /** Units in stock; null = not tracked. */
  stock: number | null;
  stockStatus: StockStatus;
  /** Category slugs. */
  categories: string[];
  tags: string[];
  /** Full-size gallery image paths (local). */
  images: string[];
  /** 300×300 listing thumbnail path (local). */
  thumb: string;
  shortDescription: string;
  /** Sanitised HTML from the original product page. */
  description: string;
  /** Slugs of related products. */
  related: string[];
  rating: number | null;
  reviewCount: number;
  status: "publish" | "draft";
  createdAt: string;
  updatedAt: string;
}

export interface ShopCategory {
  slug: string;
  name: string;
  /** Products directly in this category (not descendants). */
  count: number;
  image: string | null;
  description: string;
  /** Parent category slug for nested categories; null = top level. */
  parentSlug: string | null;
}

export interface CartItem {
  productId: number;
  slug: string;
  name: string;
  price: number;
  image: string;
  quantity: number;
}

export type OrderStatus = "pending" | "processing" | "completed" | "cancelled";

export type PaymentMethod = "bacs" | "cod";

export interface OrderCustomer {
  firstName: string;
  lastName: string;
  address: string;
  phone: string;
  email: string;
  note: string;
}

export type UserRole = "admin" | "staff" | "customer";

export interface Customer {
  id: string;
  email: string;
  passwordHash: string;
  salt: string;
  firstName: string;
  lastName: string;
  phone: string;
  address: string;
  /** Login ID for the admin area (staff/admin); empty for plain customers. Email works too. */
  username: string;
  /** Storefront customer by default; admin/staff may sign in to /admin. */
  role: UserRole;
  /** Admin module keys granted to a staff account (see lib/permissions.ts). */
  permissions: string[];
  /** false = login blocked without deleting the account. */
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Order {
  id: string;
  number: number;
  /** Set when the order was placed by a logged-in customer. */
  customerId?: string;
  createdAt: string;
  updatedAt: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  customer: OrderCustomer;
  items: CartItem[];
  subtotal: number;
  total: number;
  currency: string;
  /** Internal note, admin only. */
  adminNote: string;
}

export type OrderFileKind = "receipt" | "other";

/** A file attached to an order by the admin (e.g. the Japanese purchase receipt sent back to the customer). */
export interface OrderFile {
  id: number;
  orderId: string;
  kind: OrderFileKind;
  fileName: string;
  /** Storage path relative to the uploads dir, e.g. orders/<orderId>/<file>. */
  path: string;
  mime: string;
  size: number;
  note: string;
  amountJpy: number | null;
  createdAt: string;
}

export interface StaticPage {
  slug: string;
  title: string;
  content: string;
  date: string;
}

export interface BlogPost {
  slug: string;
  title: string;
  content: string;
  excerpt: string;
  date: string;
}

export interface Database {
  products: CatalogProduct[];
  categories: ShopCategory[];
  orders: Order[];
  customers: Customer[];
  pages: StaticPage[];
  posts: BlogPost[];
  meta: { nextOrderNumber: number; seededAt: string };
}

export type ProductOrderBy = "popularity" | "rating" | "date" | "price" | "price-desc";

export interface ProductQuery {
  category?: string;
  tag?: string;
  search?: string;
  orderby?: ProductOrderBy;
  page?: number;
  perPage?: number;
  includeDrafts?: boolean;
}

export interface ProductQueryResult {
  items: CatalogProduct[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

/** One column of the shipping-fee table (a destination group / delivery lane). */
export interface ShippingZone {
  id: number;
  methodId: number;
  name: string;
  /** Base fee in VND. */
  fee: number;
  /** Fee unit suffix shown after the amount, e.g. "/kg" (empty = per order). */
  unit: string;
  /** Order value from which the base fee is waived; null = never. */
  freeOver: number | null;
  /** Surcharge (see ShippingMethod.extraLabel); null = not applicable. */
  extraFee: number | null;
  extraFreeOver: number | null;
  /** Provinces / cities covered, free text. */
  areas: string;
  /** Delivery time, free text. */
  eta: string;
  position: number;
  active: boolean;
}

export interface ShippingCarrier {
  id: number;
  name: string;
  phone: string;
  website: string;
  note: string;
  position: number;
}

/** A shipping method (one fee table) within a leg: JP domestic, JP→VN or VN domestic. */
export interface ShippingMethod {
  id: number;
  name: string;
  description: string;
  /** Row label for the surcharge line; empty = no surcharge row. */
  extraLabel: string;
  currency: string;
  position: number;
  active: boolean;
  /** "jp_domestic" | "jp_vn" | "vn_domestic" */
  leg: "jp_domestic" | "jp_vn" | "vn_domestic";
  carrierId: number | null;
  carrierName: string | null;
  /** Price already covers domestic legs on both ends. */
  includesBothEnds: boolean;
  /** Warehouse / pick-up and drop-off locations, free text shown to customers. */
  warehouse: string;
  /** Delivered to the customer's door (else pick-up at warehouse/point). */
  homeDelivery: boolean;
  /** Method-specific notes, one per line. */
  notes: string;
  zones: ShippingZone[];
}
