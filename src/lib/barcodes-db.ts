import "server-only";
import type { DatabaseSync } from "node:sqlite";
import { linkableCode, parseScannedCode, type ParsedCode } from "@/lib/barcodes";
import { recordAudit } from "@/lib/api-tokens";
import { DomainError } from "@/lib/service-error";
import { getDb, withTransaction } from "@/lib/sqlite";
import { purchaseIndex, PURCHASE_LABEL, type PurchaseStatus } from "@/lib/purchase";
import { expiryEnd, unitInHand } from "@/lib/units";
import { getUnitByCode, listUnits, type UnitView } from "@/lib/units-db";
import { describeLocation, locationForStatus, WAREHOUSE_LABEL, type Warehouse } from "@/lib/warehouses";

/**
 * Barcodes linked to products (migration 74 `product_barcodes`) and code resolution for the scan screen / API / CLI.
 * A code resolves through (1) an active barcode link — a deliberate admin decision, it wins — then (2) an exact
 * `products.sku` match. Several products for one code without a link = CONFLICT (never "the first one").
 */

export interface ProductBrief {
  id: number;
  name: string;
  sku: string | null;
  thumb: string;
  status: "publish" | "draft";
  saleStatus: "instock" | "discontinued";
  adminUrl: string;
  stockUrl: string;
}

export interface BarcodeLink {
  id: number;
  code: string;
  symbology: string;
  productId: number;
  packQty: number;
  packLabel: string;
  active: boolean;
  source: string;
  note: string;
  createdBy: string;
  createdAt: string;
}

export interface UnitBrief {
  code: string;
  status: PurchaseStatus;
  statusLabel: string;
  place: string;
  warehouse: Warehouse | null;
  removed: string | null;
  expiry: string | null;
  orderNumber: number | null;
  orderId: string | null;
  committed: boolean;
  shipmentCode: string;
  receiptCode: string;
  url: string;
}

export type Resolution =
  | { kind: "product"; input: string; code: string; symbology: string; note?: string; via: "barcode" | "sku" | "qr"; product: ProductBrief; packQty: number; packLabel: string; barcodeId: number | null; warnings: string[] }
  | { kind: "unit"; input: string; code: string; symbology: "unit"; product: ProductBrief; unit: UnitBrief; packQty: 1; packLabel: ""; warnings: string[] }
  | { kind: "conflict"; input: string; code: string; symbology: string; candidates: ProductBrief[]; message: string }
  | { kind: "unknown"; input: string; code: string; symbology: string; message: string }
  | { kind: "invalid"; input: string; message: string }
  | { kind: "unsupported_qr"; input: string; message: string };

interface ProductRowLite {
  id: number;
  name: string;
  sku: string | null;
  thumb: string;
  status: "publish" | "draft";
  stock_status: string;
}
const briefOf = (r: ProductRowLite): ProductBrief => ({
  id: r.id,
  name: r.name,
  sku: r.sku,
  thumb: r.thumb,
  status: r.status,
  saleStatus: r.stock_status === "outofstock" || r.stock_status === "discontinued" ? "discontinued" : "instock",
  adminUrl: `/admin/products/${r.id}/`,
  stockUrl: `/admin/inventory/lots/${r.id}/`,
});
const PRODUCT_LITE = "SELECT id, name, sku, thumb, status, stock_status FROM products";

export function productBriefSync(db: DatabaseSync, id: number): ProductBrief | null {
  const r = db.prepare(`${PRODUCT_LITE} WHERE id = ?`).get(id) as ProductRowLite | undefined;
  return r ? briefOf(r) : null;
}

export function unitBrief(u: UnitView): UnitBrief {
  const loc = locationForStatus(u.status);
  return {
    code: u.code,
    status: u.status,
    statusLabel: PURCHASE_LABEL[u.status],
    place: loc ? describeLocation(loc.warehouse, loc.inTransit) : PURCHASE_LABEL[u.status],
    warehouse: loc && !loc.inTransit && unitInHand(u.status) ? loc.warehouse : null,
    removed: u.removed,
    expiry: u.expiry,
    orderNumber: u.orderNumber,
    orderId: u.orderId,
    committed: u.committed,
    shipmentCode: u.shipmentCode,
    receiptCode: u.receiptCode,
    url: `/admin/inventory/units/${u.code}/`,
  };
}

interface BarcodeRow {
  id: number;
  code: string;
  symbology: string;
  product_id: number;
  pack_qty: number;
  pack_label: string;
  active: number;
  source: string;
  note: string;
  created_by: string;
  created_at: string;
}
const linkOf = (r: BarcodeRow): BarcodeLink => ({ id: r.id, code: r.code, symbology: r.symbology, productId: r.product_id, packQty: r.pack_qty, packLabel: r.pack_label, active: r.active === 1, source: r.source, note: r.note, createdBy: r.created_by, createdAt: r.created_at });

/** SKU spellings that mean the same GS1 number (UPC-A typed without / with the EAN-13 leading 0). */
function skuForms(code: string): string[] {
  const out = new Set([code]);
  if (/^0\d{12}$/.test(code)) out.add(code.slice(1));
  if (/^\d{13}$/.test(code)) out.add(`0${code}`);
  return [...out];
}

function skuMatchesSync(db: DatabaseSync, code: string): ProductRowLite[] {
  const forms = skuForms(code);
  return db.prepare(`${PRODUCT_LITE} WHERE TRIM(sku) COLLATE NOCASE IN (${forms.map(() => "?").join(",")}) ORDER BY id`).all(...forms) as unknown as ProductRowLite[];
}

export function resolveParsedSync(db: DatabaseSync, p: ParsedCode): Resolution {
  const input = p.raw;
  if (p.kind === "invalid") return { kind: "invalid", input, message: p.reason };
  if (p.kind === "unsupported_qr") return { kind: "unsupported_qr", input, message: p.reason };
  if (p.kind === "product_ref") {
    const product = productBriefSync(db, p.productId);
    if (!product) return { kind: "unknown", input, code: `LS1:P:${p.productId}`, symbology: "qr", message: `QR trỏ tới sản phẩm #${p.productId} không còn tồn tại.` };
    return { kind: "product", input, code: `LS1:P:${p.productId}`, symbology: "qr", via: "qr", product, packQty: 1, packLabel: "", barcodeId: null, warnings: [] };
  }
  if (p.kind === "unit") {
    const u = getUnitByCode(db, p.code);
    if (!u) return { kind: "unknown", input, code: p.code, symbology: "unit", message: `Mã ${p.code} đúng dạng nhưng không có trong sổ kho.` };
    const product = productBriefSync(db, u.productId)!;
    const warnings = [u.removed ? `Cái này đã bị loại khỏi kho (${u.removed}).` : "", purchaseIndex(u.status) > purchaseIndex("at_shop") ? "Cái này đã giao cho khách." : ""].filter(Boolean);
    return { kind: "unit", input, code: p.code, symbology: "unit", product, unit: unitBrief(u), packQty: 1, packLabel: "", warnings };
  }
  const link = db.prepare("SELECT * FROM product_barcodes WHERE code = ? COLLATE NOCASE AND active = 1").get(p.code) as BarcodeRow | undefined;
  const bySku = skuMatchesSync(db, p.code);
  const note = p.kind === "gtin" ? p.note : undefined;
  if (link) {
    const product = productBriefSync(db, link.product_id)!;
    const others = bySku.filter((r) => r.id !== link.product_id);
    const warnings = others.length ? [`SKU của sản phẩm #${others.map((r) => r.id).join(", #")} cũng là mã này — mã đã được liên kết với #${link.product_id}.`] : [];
    return { kind: "product", input, code: p.code, symbology: link.symbology, ...(note ? { note } : {}), via: "barcode", product, packQty: link.pack_qty, packLabel: link.pack_label, barcodeId: link.id, warnings };
  }
  if (bySku.length === 1) return { kind: "product", input, code: p.code, symbology: p.symbology, ...(note ? { note } : {}), via: "sku", product: briefOf(bySku[0]), packQty: 1, packLabel: "", barcodeId: null, warnings: [] };
  if (bySku.length > 1) {
    return { kind: "conflict", input, code: p.code, symbology: p.symbology, candidates: bySku.map(briefOf), message: `Mã ${p.code} là SKU của ${bySku.length} sản phẩm — liên kết mã với đúng sản phẩm để hết nhập nhằng.` };
  }
  return { kind: "unknown", input, code: p.code, symbology: p.symbology, message: "Chưa liên kết sản phẩm." };
}

export function resolveCode(raw: string): Resolution {
  return resolveParsedSync(getDb(), parseScannedCode(raw));
}

export function listBarcodes(productId: number, includeInactive = false): BarcodeLink[] {
  return (getDb().prepare(`SELECT * FROM product_barcodes WHERE product_id = ?${includeInactive ? "" : " AND active = 1"} ORDER BY active DESC, id`).all(productId) as unknown as BarcodeRow[]).map(linkOf);
}

export interface LinkInput {
  productId: number;
  code: string;
  packQty?: number;
  packLabel?: string;
  note?: string;
  /** Link even though another product carries this code as its SKU (the link then wins when scanning). */
  force?: boolean;
}

/** Link a code to a product. Idempotent for the same product; refused when the code serves another one. */
export function linkBarcode(input: LinkInput, ctx: { actor: string; tokenId?: number | null; requestId?: string; ip?: string }): { status: "created" | "updated" | "unchanged"; link: BarcodeLink } {
  const norm = linkableCode(input.code);
  if ("error" in norm) throw new DomainError(422, "INVALID_CODE", norm.error, { fields: { code: norm.error } });
  const packQty = input.packQty ?? 1;
  if (!Number.isInteger(packQty) || packQty < 1 || packQty > 1000) throw new DomainError(422, "VALIDATION_FAILED", "Quy cách: số cái mỗi mã phải là số nguyên 1–1000.", { fields: { packQty: "1–1000" } });
  const packLabel = (input.packLabel ?? "").trim().slice(0, 30);
  const db = getDb();
  return withTransaction(db, () => {
    const product = productBriefSync(db, input.productId);
    if (!product) throw new DomainError(404, "NOT_FOUND", `Không có sản phẩm #${input.productId}.`);
    const cur = db.prepare("SELECT * FROM product_barcodes WHERE code = ? COLLATE NOCASE AND active = 1").get(norm.code) as BarcodeRow | undefined;
    const ts = new Date().toISOString();
    if (cur && cur.product_id !== input.productId) {
      const other = productBriefSync(db, cur.product_id);
      throw new DomainError(409, "CODE_LINKED_ELSEWHERE", `Mã ${norm.code} đang dùng cho sản phẩm #${cur.product_id} ${other?.name ?? ""} — gỡ liên kết đó trước.`, { existingProductId: cur.product_id, barcodeId: cur.id });
    }
    if (cur) {
      if (cur.pack_qty === packQty && cur.pack_label === packLabel) return { status: "unchanged" as const, link: linkOf(cur) };
      db.prepare("UPDATE product_barcodes SET pack_qty = ?, pack_label = ?, updated_at = ? WHERE id = ?").run(packQty, packLabel, ts, cur.id);
      recordAudit({ actor: ctx.actor, tokenId: ctx.tokenId, action: "barcodes.update", target: `product:${input.productId}`, changes: { code: norm.code, packQty: { before: cur.pack_qty, after: packQty }, packLabel: { before: cur.pack_label, after: packLabel } }, requestId: ctx.requestId, ip: ctx.ip });
      return { status: "updated" as const, link: linkOf(db.prepare("SELECT * FROM product_barcodes WHERE id = ?").get(cur.id) as unknown as BarcodeRow) };
    }
    const skuOthers = skuMatchesSync(db, norm.code).filter((r) => r.id !== input.productId);
    if (skuOthers.length && !input.force) {
      throw new DomainError(409, "CODE_IS_SKU_OF_OTHER", `Mã ${norm.code} đang là SKU của sản phẩm #${skuOthers.map((r) => r.id).join(", #")}. Kiểm tra lại; nếu đúng là mã của sản phẩm này, gửi lại với force=true.`, { productIds: skuOthers.map((r) => r.id) });
    }
    const r = db.prepare("INSERT INTO product_barcodes (code, symbology, product_id, pack_qty, pack_label, active, source, note, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)").run(norm.code, norm.symbology, input.productId, packQty, packLabel, ctx.tokenId ? "api" : "manual", (input.note ?? "").slice(0, 200), ctx.actor.slice(0, 120), ts, ts);
    recordAudit({ actor: ctx.actor, tokenId: ctx.tokenId, action: "barcodes.link", target: `product:${input.productId}`, changes: { code: norm.code, symbology: norm.symbology, packQty, packLabel, force: !!input.force }, requestId: ctx.requestId, ip: ctx.ip });
    return { status: "created" as const, link: linkOf(db.prepare("SELECT * FROM product_barcodes WHERE id = ?").get(Number(r.lastInsertRowid)) as unknown as BarcodeRow) };
  });
}

/** Stop using a link (kept for history). */
export function unlinkBarcode(id: number, ctx: { actor: string; tokenId?: number | null; requestId?: string; ip?: string }): BarcodeLink {
  const db = getDb();
  const cur = db.prepare("SELECT * FROM product_barcodes WHERE id = ?").get(id) as BarcodeRow | undefined;
  if (!cur) throw new DomainError(404, "NOT_FOUND", `Không có liên kết mã #${id}.`);
  if (cur.active === 1) {
    db.prepare("UPDATE product_barcodes SET active = 0, updated_at = ? WHERE id = ?").run(new Date().toISOString(), id);
    recordAudit({ actor: ctx.actor, tokenId: ctx.tokenId, action: "barcodes.unlink", target: `product:${cur.product_id}`, changes: { code: cur.code }, requestId: ctx.requestId, ip: ctx.ip });
  }
  return linkOf(db.prepare("SELECT * FROM product_barcodes WHERE id = ?").get(id) as unknown as BarcodeRow);
}

// ---------------------------------------------------------------------------------------------------------------------
// Stock of one product as the scan screen shows it (read-only)

export interface StockPlace {
  warehouse: Warehouse;
  label: string;
  /** Every unit there (free + held for orders + boxed in a packing run). */
  total: number;
  free: number;
  held: number;
  boxed: number;
  byExpiry: Array<{ expiry: string | null; qty: number; expired: boolean }>;
}

export interface ProductStock {
  product: ProductBrief;
  /** Storefront numbers (lib/units-db.syncProductStockSync): free units in hand / free at Kho VN; null = "hàng order". */
  stock: number | null;
  stockVn: number | null;
  minStock: number | null;
  inHand: number;
  heldForOrders: number;
  incoming: number;
  notYetBought: number;
  places: StockPlace[];
  transit: Array<{ status: PurchaseStatus; label: string; qty: number }>;
  barcodes: BarcodeLink[];
  price?: { price: number; regularPrice: number | null };
}

export function getProductStock(productId: number, opts: { seePrices?: boolean } = {}): ProductStock {
  const db = getDb();
  const product = productBriefSync(db, productId);
  if (!product) throw new DomainError(404, "NOT_FOUND", `Không có sản phẩm #${productId}.`);
  const p = db.prepare("SELECT stock, stock_vn, min_stock, price, regular_price FROM products WHERE id = ?").get(productId) as { stock: number | null; stock_vn: number | null; min_stock: number | null; price: number; regular_price: number | null };
  const units = listUnits(db, { productId });
  const today = new Date().toISOString().slice(0, 10);
  const places: StockPlace[] = (["vn", "jp"] as const).map((w) => {
    const here = units.filter((u) => u.status === (w === "vn" ? "at_shop" : "bought"));
    const exp = new Map<string | null, number>();
    for (const u of here) exp.set(u.expiry, (exp.get(u.expiry) ?? 0) + 1);
    return {
      warehouse: w,
      label: WAREHOUSE_LABEL[w],
      total: here.length,
      free: here.filter((u) => !u.itemId && !u.shipmentId).length,
      held: here.filter((u) => !!u.itemId).length,
      boxed: here.filter((u) => !u.itemId && !!u.shipmentId).length,
      byExpiry: [...exp].map(([expiry, qty]) => ({ expiry, qty, expired: !!expiry && expiryEnd(expiry) < today })).sort((a, b) => (a.expiry ?? "9999").localeCompare(b.expiry ?? "9999")),
    };
  });
  const transitStatuses: PurchaseStatus[] = ["to_carrier_jp", "shipped_jp_vn", "at_carrier_vn", "to_shop"];
  return {
    product,
    stock: p.stock,
    stockVn: p.stock_vn,
    minStock: p.min_stock,
    inHand: units.filter((u) => unitInHand(u.status)).length,
    heldForOrders: units.filter((u) => unitInHand(u.status) && !!u.itemId).length,
    incoming: units.filter((u) => transitStatuses.includes(u.status)).length,
    notYetBought: units.filter((u) => u.status === "not_bought" || u.status === "ordered").length,
    places,
    transit: transitStatuses.map((s) => ({ status: s, label: PURCHASE_LABEL[s], qty: units.filter((u) => u.status === s).length })).filter((t) => t.qty > 0),
    barcodes: listBarcodes(productId),
    ...(opts.seePrices ? { price: { price: p.price, regularPrice: p.regular_price } } : {}),
  };
}
