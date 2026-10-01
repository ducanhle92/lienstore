import "server-only";
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { NO_EMAIL_DOMAIN } from "./customer-email";
import { normalizePhone } from "./regular-customers";

/**
 * Customer profiles (hồ sơ khách): every buyer — web account or not — has one row in `customers`, keyed by the
 * normalised phone number (`phone_key`). Web accounts are kind "account"; buyers created from an order (storefront
 * guest checkout or an admin-typed order) are kind "guest" (no password, cannot log in). Tiers (Bạc / Vàng / Kim cương)
 * are derived from delivered orders with thresholds the owner can change (setting `customer_tiers`), or set by hand.
 * Pure helpers over a DatabaseSync so the migration and the request-time code share them.
 */

export type { CustomerTier } from "./customer-tiers";
export { TIER_CLASS, TIER_LABEL, isTier } from "./customer-tiers";
import { type CustomerTier, isTier } from "./customer-tiers";
export const TIERS: ReadonlyArray<Exclude<CustomerTier, "">> = ["silver", "gold", "diamond"];

export interface TierRules {
  /** Bạc: at least this many delivered orders … */
  silverOrders: number;
  /** … or this much spent on delivered orders (VND). */
  silverSpend: number;
  goldSpend: number;
  diamondSpend: number;
}
export const TIER_DEFAULTS: TierRules = { silverOrders: 2, silverSpend: 2_000_000, goldSpend: 5_000_000, diamondSpend: 15_000_000 };
const SETTING_KEY = "customer_tiers";

export function loadTierRules(db: DatabaseSync): TierRules {
  const raw = (db.prepare("SELECT value FROM settings WHERE key = ?").get(SETTING_KEY) as { value: string } | undefined)?.value;
  if (!raw) return TIER_DEFAULTS;
  try {
    const v = JSON.parse(raw) as Partial<TierRules>;
    const n = (x: unknown, d: number) => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : d);
    return { silverOrders: n(v.silverOrders, TIER_DEFAULTS.silverOrders), silverSpend: n(v.silverSpend, TIER_DEFAULTS.silverSpend), goldSpend: n(v.goldSpend, TIER_DEFAULTS.goldSpend), diamondSpend: n(v.diamondSpend, TIER_DEFAULTS.diamondSpend) };
  } catch {
    return TIER_DEFAULTS;
  }
}
export function saveTierRules(db: DatabaseSync, rules: TierRules): void {
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(SETTING_KEY, JSON.stringify(rules));
}

/** The tier the figures earn (delivered, non-cancelled orders). */
export function tierFor(spentDelivered: number, deliveredOrders: number, rules: TierRules): CustomerTier {
  if (spentDelivered >= rules.diamondSpend) return "diamond";
  if (spentDelivered >= rules.goldSpend) return "gold";
  if (spentDelivered >= rules.silverSpend || (rules.silverOrders > 0 && deliveredOrders >= rules.silverOrders)) return "silver";
  return "";
}

export interface CustomerStats {
  orders: number;
  delivered: number;
  /** Total of every non-cancelled order. */
  spent: number;
  /** Total of delivered orders — what the tier is based on. */
  spentDelivered: number;
  lastOrderAt: string | null;
}
const STATS_SQL = `SELECT customer_id,
    COUNT(*) AS orders,
    SUM(CASE WHEN status <> 'cancelled' AND ship_stage = 'delivered' THEN 1 ELSE 0 END) AS delivered,
    SUM(CASE WHEN status <> 'cancelled' THEN total ELSE 0 END) AS spent,
    SUM(CASE WHEN status <> 'cancelled' AND ship_stage = 'delivered' THEN total ELSE 0 END) AS spent_delivered,
    MAX(created_at) AS last_at
  FROM orders WHERE customer_id IS NOT NULL`;
type StatsRow = { customer_id: string; orders: number; delivered: number | null; spent: number | null; spent_delivered: number | null; last_at: string | null };
const toStats = (r: StatsRow | undefined): CustomerStats => ({ orders: r?.orders ?? 0, delivered: r?.delivered ?? 0, spent: r?.spent ?? 0, spentDelivered: r?.spent_delivered ?? 0, lastOrderAt: r?.last_at ?? null });

export function customerStatsSync(db: DatabaseSync, customerId: string): CustomerStats {
  return toStats(db.prepare(`${STATS_SQL} AND customer_id = ? GROUP BY customer_id`).get(customerId) as StatsRow | undefined);
}
export function allCustomerStatsSync(db: DatabaseSync): Map<string, CustomerStats> {
  const out = new Map<string, CustomerStats>();
  for (const r of db.prepare(`${STATS_SQL} GROUP BY customer_id`).all() as StatsRow[]) out.set(r.customer_id, toStats(r));
  return out;
}

/** Re-derive the automatic tier of one customer (the manual override, if any, stays). Returns the effective tier. */
export function recomputeTierSync(db: DatabaseSync, customerId: string, rules = loadTierRules(db)): CustomerTier {
  const row = db.prepare("SELECT tier, tier_manual FROM customers WHERE id = ?").get(customerId) as { tier: string; tier_manual: string } | undefined;
  if (!row) return "";
  const s = customerStatsSync(db, customerId);
  const auto = tierFor(s.spentDelivered, s.delivered, rules);
  if (auto !== row.tier) db.prepare("UPDATE customers SET tier = ?, tier_since = ?, updated_at = ? WHERE id = ?").run(auto, new Date().toISOString(), new Date().toISOString(), customerId);
  return (isTier(row.tier_manual) && row.tier_manual ? row.tier_manual : auto) as CustomerTier;
}
export function recomputeAllTiersSync(db: DatabaseSync): number {
  const rules = loadTierRules(db);
  const stats = allCustomerStatsSync(db);
  const now = new Date().toISOString();
  const upd = db.prepare("UPDATE customers SET tier = ?, tier_since = ?, updated_at = ? WHERE id = ?");
  let changed = 0;
  for (const r of db.prepare("SELECT id, tier FROM customers").all() as Array<{ id: string; tier: string }>) {
    const s = stats.get(r.id);
    const auto = s ? tierFor(s.spentDelivered, s.delivered, rules) : "";
    if (auto !== (r.tier ?? "")) {
      upd.run(auto, now, now, r.id);
      changed++;
    }
  }
  return changed;
}

// ---------------------------------------------------------------------------------------------------------------------
// one profile per buyer

/** The customer owning this phone number: a web account first, then the oldest profile. */
export function findCustomerByPhoneSync(db: DatabaseSync, phone: string | null | undefined): { id: string; kind: string } | undefined {
  const key = normalizePhone(phone);
  if (!key) return undefined;
  return db.prepare("SELECT id, kind FROM customers WHERE phone_key = ? ORDER BY CASE kind WHEN 'account' THEN 0 ELSE 1 END, created_at LIMIT 1").get(key) as { id: string; kind: string } | undefined;
}

export interface OrderContact {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  address: string;
}

/**
 * The profile an order belongs to: by phone, else by a typed e-mail, else a new "guest" profile (no login). Returns
 * null only when neither a phone nor an e-mail is known.
 */
export function ensureCustomerForOrderSync(db: DatabaseSync, c: OrderContact, now = new Date().toISOString()): string | null {
  const key = normalizePhone(c.phone);
  const email = c.email.trim().toLowerCase();
  const byPhone = findCustomerByPhoneSync(db, c.phone);
  if (byPhone) return byPhone.id;
  if (email) {
    const byEmail = db.prepare("SELECT id FROM customers WHERE LOWER(email) = ?").get(email) as { id: string } | undefined;
    if (byEmail) {
      // the account had no phone yet: remember this one so the next order by phone lands here too
      if (key) db.prepare("UPDATE customers SET phone_key = CASE WHEN phone_key = '' THEN ? ELSE phone_key END, phone = CASE WHEN phone = '' THEN ? ELSE phone END WHERE id = ?").run(key, c.phone.trim(), byEmail.id);
      return byEmail.id;
    }
  }
  if (!key && !email) return null;
  let mail = email;
  if (!mail || db.prepare("SELECT 1 FROM customers WHERE LOWER(email) = ?").get(mail)) mail = `g${key || randomUUID().slice(0, 8)}@${NO_EMAIL_DOMAIN}`;
  if (db.prepare("SELECT 1 FROM customers WHERE email = ?").get(mail)) mail = `g${key}-${randomUUID().slice(0, 6)}@${NO_EMAIL_DOMAIN}`;
  const id = randomUUID();
  const nextNo = (db.prepare("SELECT COALESCE(MAX(customer_no), 10000) + 1 AS n FROM customers").get() as { n: number }).n;
  db.prepare(
    `INSERT INTO customers (id, email, password_hash, salt, first_name, last_name, phone, address, role, permissions, active, username, customer_no, kind, phone_key, created_at, updated_at)
     VALUES (?, ?, '', '', ?, ?, ?, ?, 'customer', '[]', 0, NULL, ?, 'guest', ?, ?, ?)`,
  ).run(id, mail, c.firstName.trim().slice(0, 120), c.lastName.trim().slice(0, 120), c.phone.trim().slice(0, 30), c.address.trim().slice(0, 400), nextNo, key, now, now);
  return id;
}

/** Migration step: phone keys for every profile, a profile for every order that has none, tiers for all. */
export function backfillCustomersSync(db: DatabaseSync): { created: number; linked: number } {
  for (const r of db.prepare("SELECT id, phone FROM customers").all() as Array<{ id: string; phone: string }>) {
    db.prepare("UPDATE customers SET phone_key = ? WHERE id = ?").run(normalizePhone(r.phone), r.id);
  }
  const before = (db.prepare("SELECT COUNT(*) AS n FROM customers").get() as { n: number }).n;
  let linked = 0;
  const rows = db
    .prepare("SELECT id, first_name, last_name, phone, email, address, created_at FROM orders WHERE customer_id IS NULL OR customer_id NOT IN (SELECT id FROM customers) ORDER BY created_at")
    .all() as Array<{ id: string; first_name: string; last_name: string; phone: string; email: string; address: string; created_at: string }>;
  const link = db.prepare("UPDATE orders SET customer_id = ? WHERE id = ?");
  for (const o of rows) {
    const cid = ensureCustomerForOrderSync(db, { firstName: o.first_name, lastName: o.last_name, phone: o.phone, email: o.email, address: o.address }, o.created_at);
    if (cid) {
      link.run(cid, o.id);
      linked++;
    }
  }
  recomputeAllTiersSync(db);
  const after = (db.prepare("SELECT COUNT(*) AS n FROM customers").get() as { n: number }).n;
  return { created: after - before, linked };
}

// ---------------------------------------------------------------------------------------------------------------------
// admin lists

export interface CustomerDirectoryRow {
  id: string;
  customerNo: number | null;
  kind: "account" | "guest";
  name: string;
  phone: string;
  /** Empty for ID-only profiles (no real e-mail). */
  email: string;
  address: string;
  note: string;
  tier: CustomerTier;
  tierManual: CustomerTier;
  /** Manual override when set, else the automatic tier. */
  tierEffective: CustomerTier;
  isRegular: boolean;
  createdAt: string;
  stats: CustomerStats;
}
type DirRow = { id: string; customer_no: number | null; kind: string; first_name: string; last_name: string; phone: string; email: string; address: string; note: string | null; tier: string | null; tier_manual: string | null; is_regular: number | null; created_at: string };
const dirRow = (r: DirRow, stats: Map<string, CustomerStats>): CustomerDirectoryRow => {
  const tier = (isTier(r.tier) ? r.tier : "") as CustomerTier;
  const tierManual = (isTier(r.tier_manual) ? r.tier_manual : "") as CustomerTier;
  return {
    id: r.id,
    customerNo: r.customer_no,
    kind: r.kind === "guest" ? "guest" : "account",
    name: `${r.last_name} ${r.first_name}`.trim(),
    phone: r.phone,
    email: r.email.endsWith(`@${NO_EMAIL_DOMAIN}`) ? "" : r.email,
    address: r.address,
    note: r.note ?? "",
    tier,
    tierManual,
    tierEffective: tierManual || tier,
    isRegular: (r.is_regular ?? 0) === 1,
    createdAt: r.created_at,
    stats: stats.get(r.id) ?? { orders: 0, delivered: 0, spent: 0, spentDelivered: 0, lastOrderAt: null },
  };
};

/** Every buyer profile (staff / admin accounts excluded), newest activity first. */
export function listCustomerDirectorySync(db: DatabaseSync): CustomerDirectoryRow[] {
  const stats = allCustomerStatsSync(db);
  const rows = (db.prepare("SELECT id, customer_no, kind, first_name, last_name, phone, email, address, note, tier, tier_manual, is_regular, created_at FROM customers WHERE role = 'customer'").all() as DirRow[]).map((r) => dirRow(r, stats));
  return rows.sort((a, b) => (b.stats.lastOrderAt ?? b.createdAt).localeCompare(a.stats.lastOrderAt ?? a.createdAt));
}
export function getCustomerDirectoryRowSync(db: DatabaseSync, id: string): CustomerDirectoryRow | null {
  const r = db.prepare("SELECT id, customer_no, kind, first_name, last_name, phone, email, address, note, tier, tier_manual, is_regular, created_at FROM customers WHERE id = ?").get(id) as DirRow | undefined;
  if (!r) return null;
  return dirRow(r, new Map([[id, customerStatsSync(db, id)]]));
}

/** What the admin order form offers while typing: profile + the last delivery address (2-level codes when known). */
export interface CustomerPick {
  id: string;
  customerNo: number | null;
  name: string;
  phone: string;
  email: string;
  tier: CustomerTier;
  orders: number;
  lastOrderAt: string | null;
  note: string;
  /** Last delivery address: the storefront's 2-level codes when the order was quoted, else just the text. */
  address: { provinceCode: string; wardCode: string; street: string; text: string } | null;
}
export function customerPickListSync(db: DatabaseSync): CustomerPick[] {
  const dir = listCustomerDirectorySync(db);
  const last = new Map<string, { provinceCode: string; wardCode: string; street: string; text: string }>();
  for (const o of db.prepare("SELECT customer_id, address, ship_quote_json FROM orders WHERE customer_id IS NOT NULL AND status <> 'cancelled' AND delivery = 'ship' ORDER BY created_at DESC").all() as Array<{ customer_id: string; address: string; ship_quote_json: string | null }>) {
    if (last.has(o.customer_id)) continue;
    let codes = { provinceCode: "", wardCode: "", street: "" };
    if (o.ship_quote_json) {
      try {
        const d = (JSON.parse(o.ship_quote_json) as { destination?: { provinceCode?: string; wardCode?: string; street?: string } }).destination;
        if (d?.provinceCode && d.wardCode) codes = { provinceCode: String(d.provinceCode), wardCode: String(d.wardCode), street: String(d.street ?? "") };
      } catch {
        /* old row */
      }
    }
    last.set(o.customer_id, { ...codes, text: o.address });
  }
  return dir.map((c) => ({ id: c.id, customerNo: c.customerNo, name: c.name, phone: c.phone, email: c.email, tier: c.tierEffective, orders: c.stats.orders, lastOrderAt: c.stats.lastOrderAt, note: c.note, address: last.get(c.id) ?? (c.address ? { provinceCode: "", wardCode: "", street: "", text: c.address } : null) }));
}

/** Admin › Khách hàng › Sửa / Thêm khách. */
export function upsertCustomerProfileSync(db: DatabaseSync, input: { id?: string; name: string; phone: string; email: string; address: string; note: string; tierManual: CustomerTier }): { ok: true; id: string } | { ok: false; message: string } {
  const now = new Date().toISOString();
  const key = normalizePhone(input.phone);
  const name = input.name.trim();
  if (!name) return { ok: false, message: "Nhập tên khách." };
  if (input.phone && !key) return { ok: false, message: "Số điện thoại không hợp lệ." };
  const email = input.email.trim().toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, message: "Email không hợp lệ." };
  if (key) {
    const other = db.prepare("SELECT id, customer_no FROM customers WHERE phone_key = ? AND id <> ? ORDER BY created_at LIMIT 1").get(key, input.id ?? "") as { id: string; customer_no: number | null } | undefined;
    if (other) return { ok: false, message: `Số điện thoại này đã thuộc khách #${other.customer_no ?? other.id}.` };
  }
  if (email) {
    const other = db.prepare("SELECT customer_no FROM customers WHERE LOWER(email) = ? AND id <> ?").get(email, input.id ?? "") as { customer_no: number | null } | undefined;
    if (other) return { ok: false, message: `Email này đã thuộc khách #${other.customer_no ?? ""}.` };
  }
  if (input.id) {
    const cur = db.prepare("SELECT email FROM customers WHERE id = ?").get(input.id) as { email: string } | undefined;
    if (!cur) return { ok: false, message: "Không tìm thấy khách." };
    const keepMail = cur.email.endsWith(`@${NO_EMAIL_DOMAIN}`) ? (email || cur.email) : email || cur.email;
    db.prepare("UPDATE customers SET first_name = ?, last_name = '', phone = ?, phone_key = ?, email = ?, address = ?, note = ?, tier_manual = ?, updated_at = ? WHERE id = ?").run(name.slice(0, 120), input.phone.trim().slice(0, 30), key, keepMail, input.address.trim().slice(0, 400), input.note.trim().slice(0, 1000), input.tierManual, now, input.id);
    return { ok: true, id: input.id };
  }
  if (!key && !email) return { ok: false, message: "Cần số điện thoại (hoặc email) để nhận diện khách." };
  const id = ensureCustomerForOrderSync(db, { firstName: name, lastName: "", phone: input.phone, email, address: input.address }, now);
  if (!id) return { ok: false, message: "Không tạo được hồ sơ khách." };
  db.prepare("UPDATE customers SET note = ?, tier_manual = ?, updated_at = ? WHERE id = ?").run(input.note.trim().slice(0, 1000), input.tierManual, now, id);
  return { ok: true, id };
}
