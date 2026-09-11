import type { PurchaseStatus } from "@/lib/purchase";
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
  /** How reliable weight/dims are: high (seller data) · medium (inferred from a similar item) · low (guess). */
  dimsConfidence: "high" | "medium" | "low" | null;
  /** Where the numbers came from (Amazon page, inferred from the pack size…). */
  dimsSource: string;
  /** Japanese product name / copy (shown when the visitor switches the site to 日本語); empty = fall back to Vietnamese. */
  nameJa: string;
  shortDescriptionJa: string;
  descriptionJa: string;
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
  /** Japanese category name (empty = fall back to Vietnamese). */
  nameJa: string;
}

export interface CartItem {
  productId: number;
  slug: string;
  name: string;
  price: number;
  image: string;
  quantity: number;
  /** Order lines only: row id + purchase / logistics status (see lib/purchase.ts). */
  itemId?: number;
  purchaseStatus?: PurchaseStatus;
  purchaseNote?: string;
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

export type UserRole = "owner" | "admin" | "staff" | "customer";

export interface Customer {
  id: string;
  email: string;
  passwordHash: string;
  salt: string;
  firstName: string;
  lastName: string;
  phone: string;
  address: string;
  /** Back-office customer number (10001, 10002…), shown in admin and exports only. */
  customerNo: number | null;
  /** Login ID for the admin area (staff/admin); empty for plain customers. Email works too. */
  username: string;
  /** Storefront customer by default; admin/staff may sign in to /admin. */
  role: UserRole;
  /** Admin module keys granted to a staff account (see lib/permissions.ts). */
  permissions: string[];
  /** false = login blocked without deleting the account. */
  active: boolean;
  /** Profile picture URL (uploaded by the customer); empty = initial letter. */
  avatar: string;
  createdAt: string;
  updatedAt: string;
}

/** One saved delivery address of a customer (address book, picked at checkout). */
export interface CustomerAddress {
  id: number;
  customerId: string;
  label: string;
  name: string;
  phone: string;
  address: string;
  isDefault: boolean;
  createdAt: string;
}

export type ShipFeePayment = "prepaid" | "on_delivery";

/** One picture of the home-page slider, with the page it opens. */
export interface Banner {
  id: number;
  image: string;
  href: string;
  alt: string;
  position: number;
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
  /** Domestic delivery fee added on top of the subtotal (0 for pickup / free shipping). */
  shippingFee: number;
  /** Chosen delivery option, e.g. "Miền Bắc · Viettel Post" or "Nhận tại kho". */
  shippingLabel: string;
  delivery: "ship" | "pickup";
  /** True when the order contains made-to-order items (must be paid in full up front). */
  prepaidRequired: boolean;
  /** Voucher discount taken off the subtotal (0 when none). */
  discount: number;
  voucherCode: string;
  /** "prepaid": the fee is part of `total`; "on_delivery": paid to the courier, not included in `total`. */
  shipFeePayment: ShipFeePayment;
  /** Snapshot of a live carrier quote (JSON) when one was used. */
  shipQuote: string | null;
  /** Logistics progress shown to the customer (see SHIP_STAGES). */
  shipStage: "ordered" | "paid" | "in_transit" | "vn_warehouse" | "delivering" | "delivered";
  /** When each stage was reached (only filled for single-order loads). */
  stageLog: Array<{ stage: Order["shipStage"]; note: string; at: string }>;
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

/** A customer's star rating + comment on a product; shown once an admin approved it. */
export interface ProductReview {
  id: number;
  productId: number;
  productName: string;
  productSlug: string;
  customerId: string;
  /** Account name at the time of posting (masked on the storefront). */
  author: string;
  rating: number;
  comment: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

export interface ProductQuery {
  category?: string;
  tag?: string;
  search?: string;
  /** only products whose regular price is above the selling price */
  onSale?: boolean;
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
  /** Weight-step pricing: `fee` covers the first `baseG` grams, then `stepFee` per started `stepG` grams (all three set). */
  baseG: number | null;
  stepG: number | null;
  stepFee: number | null;
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

/** One message in the order conversation between the customer and the shop. */
export interface OrderMessage {
  id: number;
  orderId: string;
  sender: "customer" | "admin";
  senderName: string;
  body: string;
  readByCustomer: boolean;
  readByAdmin: boolean;
  createdAt: string;
}

/** Discount code redeemable at checkout. */
export interface Voucher {
  id: number;
  code: string;
  kind: "percent" | "fixed";
  /** Percent (1–100) or fixed amount in VNĐ. */
  value: number;
  minSubtotal: number;
  maxDiscount: number | null;
  startsAt: string | null;
  endsAt: string | null;
  usageLimit: number | null;
  usedCount: number;
  active: boolean;
  note: string;
  /** Listed in the home-page "Ưu đãi độc quyền website" strip (public vouchers only). */
  showHome: boolean;
  /** When non-empty, only these customer accounts may redeem the code. */
  customerIds: string[];
  /** Human labels of those accounts (customer no · login ID) for the admin form. */
  customerLabels: string[];
  createdAt: string;
  updatedAt: string;
}

/** Shipping arrangement of one order for one leg (internal logistics + cost tracking). */
export interface OrderLeg {
  orderId: string;
  leg: "jp_domestic" | "jp_vn" | "vn_transfer" | "vn_domestic";
  methodId: number | null;
  zoneId: number | null;
  label: string;
  fee: number;
  tracking: string;
  note: string;
  updatedAt: string;
}

export interface ShippingCarrier {
  id: number;
  name: string;
  phone: string;
  website: string;
  note: string;
  position: number;
  /** Legs this carrier serves (jp_domestic / jp_vn / vn_transfer / vn_domestic). */
  legs: Array<"jp_domestic" | "jp_vn" | "vn_transfer" | "vn_domestic">;
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
  /** "jp_domestic" | "jp_vn" | "vn_transfer" | "vn_domestic" */
  leg: "jp_domestic" | "jp_vn" | "vn_transfer" | "vn_domestic";
  carrierId: number | null;
  carrierName: string | null;
  /** Carrier's official price-check page, linked from the storefront tables. */
  carrierWebsite: string | null;
  /** Price already covers domestic legs on both ends. */
  includesBothEnds: boolean;
  /** Warehouse / pick-up and drop-off locations, free text shown to customers. */
  warehouse: string;
  /** Delivered to the customer's door (else pick-up at warehouse/point). */
  homeDelivery: boolean;
  /** The customer may pay the shipping fee to the courier on delivery (COD of the fee). */
  codShipFee: boolean;
  /** "ghn" = fee quoted live from the carrier API at checkout instead of the zone table. */
  liveQuote: "" | "ghn";
  /** Method-specific notes, one per line. */
  notes: string;
  zones: ShippingZone[];
}
