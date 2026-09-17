import "server-only";
import type { CatalogProduct } from "@/types/shop";
import { getAllProducts, getProductById, getSiteTheme } from "./db";
import { composeFanpagePost, dueSlots, parseTimes } from "./fanpage-compose";
import { getDb, getSetting, setSetting, withTransaction } from "./sqlite";

/**
 * Tổng quan › Đăng bài fanpage: compose a caption from a product, post it (with the product photos and link) to the
 * shop's Facebook Page through the Graph API, now or at a scheduled time, and — in auto mode — plan one post per
 * configured time of day picking products that have not been posted yet. The Page access token lives in `settings`
 * and never leaves the server. The in-process scheduler (instrumentation.ts) calls `runFanpageScheduler` every minute.
 */
export type FanpagePostStatus = "draft" | "queued" | "posted" | "failed" | "cancelled";

export interface FanpagePost {
  id: number;
  productId: number | null;
  productName: string;
  productSlug: string;
  productThumb: string;
  message: string;
  images: string[];
  link: string;
  scheduledAt: string | null;
  status: FanpagePostStatus;
  fbPostId: string;
  error: string;
  auto: boolean;
  variant: number;
  createdAt: string;
  postedAt: string | null;
}

export interface FanpageConfig {
  pageId: string;
  /** Long-lived Page access token (pages_manage_posts, pages_read_engagement). */
  token: string;
  graphVersion: string;
  /** Public origin used to build absolute image / product links (Facebook fetches the photos itself). */
  origin: string;
  auto: { enabled: boolean; times: string[]; pick: "unposted" | "random" | "newest"; hashtags: string };
}

const KEYS = { pageId: "fb_page_id", token: "fb_page_token", version: "fb_graph_version", origin: "site_origin", auto: "fb_auto" } as const;
const DEFAULT_VERSION = "v23.0";
export const SHOP_TZ = "Asia/Ho_Chi_Minh";

export function getFanpageConfig(): FanpageConfig {
  const db = getDb();
  let auto: FanpageConfig["auto"] = { enabled: false, times: ["09:00", "20:00"], pick: "unposted", hashtags: "" };
  try {
    const raw = JSON.parse(getSetting(db, KEYS.auto) || "{}") as Partial<FanpageConfig["auto"]>;
    auto = { enabled: raw.enabled === true, times: Array.isArray(raw.times) && raw.times.length ? raw.times.map(String) : auto.times, pick: raw.pick === "random" || raw.pick === "newest" ? raw.pick : "unposted", hashtags: typeof raw.hashtags === "string" ? raw.hashtags : "" };
  } catch {
    /* defaults */
  }
  return {
    pageId: getSetting(db, KEYS.pageId) ?? "",
    token: getSetting(db, KEYS.token) ?? process.env.FB_PAGE_TOKEN ?? "",
    graphVersion: getSetting(db, KEYS.version) || DEFAULT_VERSION,
    origin: (getSetting(db, KEYS.origin) || process.env.SITE_URL || "").replace(/\/$/, ""),
    auto,
  };
}

export function saveFanpageConnection(input: { pageId: string; token?: string; graphVersion?: string }): void {
  const db = getDb();
  setSetting(db, KEYS.pageId, input.pageId.trim());
  if (input.token !== undefined && input.token.trim()) setSetting(db, KEYS.token, input.token.trim());
  if (input.graphVersion?.trim()) setSetting(db, KEYS.version, input.graphVersion.trim());
}
export function clearFanpageToken(): void {
  setSetting(getDb(), KEYS.token, "");
}
export function saveFanpageAuto(auto: FanpageConfig["auto"]): void {
  setSetting(getDb(), KEYS.auto, JSON.stringify(auto));
}
/** Remember the public origin (from the admin request) so the background scheduler can build absolute links. */
export function rememberSiteOrigin(origin: string): void {
  if (/^https?:\/\/[^/]+$/.test(origin) && !/localhost|127\.0\.0\.1/.test(origin)) setSetting(getDb(), KEYS.origin, origin);
}

// ---------------------------------------------------------------------------------------------------------------------
// Graph API

interface GraphError {
  error?: { message?: string; code?: number; type?: string };
}

async function graph<T>(cfg: FanpageConfig, path: string, body?: Record<string, string>): Promise<T> {
  const url = `https://graph.facebook.com/${cfg.graphVersion}/${path.replace(/^\//, "")}`;
  const form = new URLSearchParams({ ...(body ?? {}), access_token: cfg.token });
  const res = await fetch(body ? url : `${url}?${form.toString()}`, body ? { method: "POST", body: form, headers: { "Content-Type": "application/x-www-form-urlencoded" } } : { method: "GET" });
  const data = (await res.json().catch(() => ({}))) as T & GraphError;
  if (!res.ok || data.error) throw new Error(data.error?.message ? `Facebook: ${data.error.message}${data.error.code ? ` (mã ${data.error.code})` : ""}` : `Facebook trả về HTTP ${res.status}`);
  return data;
}

/** GET the page by id — proves the token works and returns the page name / link. */
export async function testFanpageConnection(): Promise<{ ok: true; name: string; link: string } | { ok: false; message: string }> {
  const cfg = getFanpageConfig();
  if (!cfg.pageId || !cfg.token) return { ok: false, message: "Chưa có Page ID hoặc access token." };
  try {
    const r = await graph<{ name?: string; link?: string }>(cfg, `${cfg.pageId}?fields=name,link`);
    return { ok: true, name: r.name ?? "", link: r.link ?? "" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Không kết nối được." };
  }
}

const absolute = (origin: string, u: string) => (/^https?:\/\//i.test(u) ? u : `${origin}${u.startsWith("/") ? "" : "/"}${u}`);

/** Publish: photos first (unpublished), then the feed post with the photos attached; without photos, message + link. */
async function publish(cfg: FanpageConfig, post: FanpagePost): Promise<string> {
  if (!cfg.pageId || !cfg.token) throw new Error("Chưa cấu hình Page ID / access token.");
  if (!cfg.origin && post.images.some((i) => !/^https?:\/\//i.test(i))) throw new Error("Chưa biết địa chỉ công khai của web để Facebook tải ảnh — mở trang Đăng bài fanpage một lần trên web thật, hoặc đặt SITE_URL.");
  const mediaIds: string[] = [];
  for (const img of post.images.slice(0, 10)) {
    const r = await graph<{ id: string }>(cfg, `${cfg.pageId}/photos`, { url: absolute(cfg.origin, img), published: "false" });
    if (r.id) mediaIds.push(r.id);
  }
  const body: Record<string, string> = { message: post.message };
  if (mediaIds.length) mediaIds.forEach((id, i) => (body[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id })));
  else if (post.link) body.link = post.link;
  const r = await graph<{ id: string; post_id?: string }>(cfg, `${cfg.pageId}/feed`, body);
  return r.post_id ?? r.id;
}

// ---------------------------------------------------------------------------------------------------------------------
// Posts table

interface Row {
  id: number;
  product_id: number | null;
  message: string;
  images: string;
  link: string;
  scheduled_at: string | null;
  status: string;
  fb_post_id: string;
  error: string;
  auto: number;
  variant: number;
  created_at: string;
  posted_at: string | null;
  name: string | null;
  slug: string | null;
  thumb: string | null;
}
const SELECT = "SELECT fp.*, p.name, p.slug, p.thumb FROM fanpage_posts fp LEFT JOIN products p ON p.id = fp.product_id";
const isStatus = (v: string): v is FanpagePostStatus => ["draft", "queued", "posted", "failed", "cancelled"].includes(v);
const rowToPost = (r: Row): FanpagePost => {
  let images: string[] = [];
  try {
    const v = JSON.parse(r.images || "[]");
    if (Array.isArray(v)) images = v.map(String);
  } catch {
    /* none */
  }
  return { id: r.id, productId: r.product_id, productName: r.name ?? "", productSlug: r.slug ?? "", productThumb: r.thumb ?? "", message: r.message, images, link: r.link, scheduledAt: r.scheduled_at, status: isStatus(r.status) ? r.status : "draft", fbPostId: r.fb_post_id ?? "", error: r.error ?? "", auto: r.auto === 1, variant: r.variant ?? 0, createdAt: r.created_at, postedAt: r.posted_at };
};

export function listFanpagePosts(limit = 60): FanpagePost[] {
  return (getDb().prepare(`${SELECT} ORDER BY CASE fp.status WHEN 'draft' THEN 0 WHEN 'queued' THEN 1 WHEN 'failed' THEN 2 ELSE 3 END, COALESCE(fp.scheduled_at, fp.created_at) DESC, fp.id DESC LIMIT ?`).all(limit) as unknown as Row[]).map(rowToPost);
}
export function getFanpagePost(id: number): FanpagePost | null {
  const r = getDb().prepare(`${SELECT} WHERE fp.id = ?`).get(id) as Row | undefined;
  return r ? rowToPost(r) : null;
}

/** Product URL on the storefront. */
export function productLink(cfg: FanpageConfig, slug: string): string {
  return `${cfg.origin || ""}/product/${slug}/`;
}

/** Caption + all product photos for a product, in the wording variant asked for. */
export async function composeForProduct(product: CatalogProduct, variant: number, cfg = getFanpageConfig()): Promise<{ message: string; images: string[]; link: string }> {
  const theme = await getSiteTheme();
  const { contact } = await import("@/components/sites/lienstore/root-8a5edab2/data");
  const link = productLink(cfg, product.slug);
  const message = composeFanpagePost(product, { link, shopName: theme.shopName, hotline: contact.phones[0]?.number ?? "", hashtags: cfg.auto.hashtags.split(/[,\s]+/).filter(Boolean), variant });
  const images = Array.from(new Set([product.thumb, ...product.images].filter(Boolean))).slice(0, 4);
  return { message, images, link };
}

export function createFanpagePost(input: { productId: number | null; message: string; images: string[]; link: string; scheduledAt: string | null; status: FanpagePostStatus; auto?: boolean; variant?: number }): FanpagePost {
  const db = getDb();
  const now = new Date().toISOString();
  const r = db.prepare("INSERT INTO fanpage_posts (product_id, message, images, link, scheduled_at, status, fb_post_id, error, auto, variant, created_at) VALUES (?, ?, ?, ?, ?, ?, '', '', ?, ?, ?)").run(input.productId, input.message, JSON.stringify(input.images), input.link, input.scheduledAt, input.status, input.auto ? 1 : 0, input.variant ?? 0, now);
  return getFanpagePost(Number(r.lastInsertRowid))!;
}
export function updateFanpagePost(id: number, patch: Partial<Pick<FanpagePost, "message" | "images" | "link" | "scheduledAt" | "status" | "variant" | "error">>): void {
  const cur = getFanpagePost(id);
  if (!cur) return;
  const n = { ...cur, ...patch };
  getDb().prepare("UPDATE fanpage_posts SET message = ?, images = ?, link = ?, scheduled_at = ?, status = ?, variant = ?, error = ? WHERE id = ?").run(n.message, JSON.stringify(n.images), n.link, n.scheduledAt, n.status, n.variant, n.error, id);
}
export function deleteFanpagePost(id: number): void {
  getDb().prepare("DELETE FROM fanpage_posts WHERE id = ? AND status <> 'posted'").run(id);
}

/** Post one queued/draft/failed row now; records the Facebook id or the error. */
export async function publishFanpagePost(id: number): Promise<{ ok: boolean; fbPostId?: string; message?: string }> {
  const post = getFanpagePost(id);
  if (!post) return { ok: false, message: "Không tìm thấy bài." };
  if (post.status === "posted") return { ok: true, fbPostId: post.fbPostId };
  const cfg = getFanpageConfig();
  const db = getDb();
  try {
    const fbId = await publish(cfg, post);
    db.prepare("UPDATE fanpage_posts SET status = 'posted', fb_post_id = ?, error = '', posted_at = ? WHERE id = ?").run(fbId, new Date().toISOString(), id);
    return { ok: true, fbPostId: fbId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    db.prepare("UPDATE fanpage_posts SET status = 'failed', error = ? WHERE id = ?").run(msg.slice(0, 500), id);
    return { ok: false, message: msg };
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Scheduler (called every minute)

export function shopNow(d = new Date()): { day: string; hm: string } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: SHOP_TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { day: `${get("year")}-${get("month")}-${get("day")}`, hm: `${get("hour").replace("24", "00")}:${get("minute")}` };
}
/** Shop-local "YYYY-MM-DD" + "HH:MM" → ISO instant (Vietnam has no DST: fixed +07:00). */
export const shopLocalToIso = (day: string, hm: string) => new Date(`${day}T${hm}:00+07:00`).toISOString();

/** Product for the next auto post: never posted first (oldest last-post), then random / newest. */
export async function pickProductForAuto(pick: FanpageConfig["auto"]["pick"]): Promise<CatalogProduct | null> {
  const products = (await getAllProducts(false)).filter((p) => p.status === "publish" && p.price > 0 && p.stockStatus !== "discontinued" && (p.thumb || p.images.length));
  if (!products.length) return null;
  if (pick === "newest") return [...products].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const posted = new Map<number, string>();
  for (const r of getDb().prepare("SELECT product_id, MAX(COALESCE(posted_at, scheduled_at, created_at)) AS t FROM fanpage_posts WHERE product_id IS NOT NULL AND status IN ('posted','queued') GROUP BY product_id").all() as unknown as Array<{ product_id: number; t: string }>) posted.set(r.product_id, r.t);
  const fresh = products.filter((p) => !posted.has(p.id));
  if (pick === "random") return (fresh.length ? fresh : products)[Math.floor(Math.random() * (fresh.length ? fresh.length : products.length))];
  if (fresh.length) return fresh[Math.floor(Math.random() * fresh.length)];
  return [...products].sort((a, b) => (posted.get(a.id) ?? "").localeCompare(posted.get(b.id) ?? ""))[0];
}

/** Plan today's due auto slots (one post each) and publish everything whose time has come. */
export async function runFanpageScheduler(now = new Date()): Promise<{ planned: number; posted: number; failed: number }> {
  const cfg = getFanpageConfig();
  const db = getDb();
  let planned = 0;
  if (cfg.auto.enabled && cfg.pageId && cfg.token) {
    const { day, hm } = shopNow(now);
    const times = parseTimes(cfg.auto.times.join(","));
    const todays = (db.prepare("SELECT scheduled_at FROM fanpage_posts WHERE auto = 1 AND scheduled_at >= ? AND scheduled_at < ?").all(shopLocalToIso(day, "00:00"), new Date(new Date(shopLocalToIso(day, "00:00")).getTime() + 86400000).toISOString()) as unknown as Array<{ scheduled_at: string }>).map((r) => shopNow(new Date(r.scheduled_at)).hm);
    for (const slot of dueSlots(times, hm, todays)) {
      const product = await pickProductForAuto(cfg.auto.pick);
      if (!product) break;
      const variant = Math.floor(Math.random() * 3);
      const c = await composeForProduct(product, variant, cfg);
      withTransaction(db, () => {
        createFanpagePost({ productId: product.id, message: c.message, images: c.images, link: c.link, scheduledAt: shopLocalToIso(day, slot), status: "queued", auto: true, variant });
      });
      planned++;
    }
  }
  let posted = 0;
  let failed = 0;
  const due = db.prepare("SELECT id FROM fanpage_posts WHERE status = 'queued' AND scheduled_at IS NOT NULL AND scheduled_at <= ? ORDER BY scheduled_at LIMIT 5").all(now.toISOString()) as unknown as Array<{ id: number }>;
  for (const d of due) {
    const r = await publishFanpagePost(d.id);
    if (r.ok) posted++;
    else failed++;
  }
  return { planned, posted, failed };
}

export { getProductById };
