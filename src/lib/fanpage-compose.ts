import { structureDescription } from "./description";
import { formatAmount } from "./format";
import { displayTags, foldVi } from "./tags";
import type { CatalogProduct } from "@/types/shop";

/**
 * Facebook caption for a product (Tổng quan › Đăng bài fanpage): hook line, 3–4 benefit bullets pulled from the
 * description, price, order link, hotline and hashtags — the shape of the page's existing posts. Three wordings,
 * chosen by `variant`, so consecutive auto-posts do not read identical. Pure (no DB, no network).
 */
export interface ComposeOptions {
  /** Absolute product URL put in the caption. */
  link: string;
  shopName: string;
  hotline: string;
  /** Extra hashtags always appended (without or with #). */
  hashtags?: string[];
  variant?: number;
}

const stripTags = (html: string) =>
  html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|div|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

const lines = (html: string) =>
  stripTags(html)
    .split("\n")
    .map((l) => l.replace(/^[\s•\-–—►✔✓*]+/, "").trim())
    .filter((l) => l.length > 2);

/** "sữa rửa mặt" → "#suaruamat"; drops anything that is not a word character. */
export function toHashtag(s: string): string {
  const t = foldVi(s).replace(/[^a-z0-9]+/g, "");
  return t ? `#${t}` : "";
}

const HOOKS = [
  (name: string) => `🌿 ${name.toUpperCase()} — hàng Nhật nội địa, mua tận tay tại Nhật, có bill từng đơn.`,
  (name: string) => `✨ ${name.toUpperCase()} vừa về kho! Chính hãng nội địa Nhật, giá rõ ràng.`,
  (name: string) => `🇯🇵 ${name.toUpperCase()} — món được hỏi nhiều nhất tuần này đã có sẵn để đặt.`,
];
const BULLET = ["👉", "🍀", "✅"];
const CTA = ["Đặt ngay tại web hoặc nhắn Zalo, shop tư vấn ngay nhé!", "Inbox / Zalo để được tư vấn đúng loại phù hợp với bạn.", "Số lượng có hạn theo từng đợt gom hàng — đặt sớm để có hàng sớm nha."];

export function composeFanpagePost(p: Pick<CatalogProduct, "name" | "shortDescription" | "description" | "price" | "regularPrice" | "tags" | "categories">, opts: ComposeOptions): string {
  const v = Math.abs(opts.variant ?? 0) % 3;
  const d = structureDescription(p.description || "", p.name);
  const benefits = d.sections.find((s) => s.key === "benefits");
  const usage = d.sections.find((s) => s.key === "usage");
  let bullets = benefits ? lines(benefits.html) : [];
  if (bullets.length < 2) bullets = [...bullets, ...lines(d.introHtml)];
  if (bullets.length < 2 && p.shortDescription) bullets = [...bullets, ...lines(p.shortDescription)];
  bullets = Array.from(new Set(bullets.map((b) => b.replace(/\s+/g, " ")))).slice(0, 4);
  const use = usage ? lines(usage.html)[0] : "";

  const out: string[] = [HOOKS[v](p.name), ""];
  if (bullets.length) {
    out.push(v === 1 ? "Vì sao nên có một tuýp trong nhà:" : "Điểm cộng:");
    for (const b of bullets) out.push(`${BULLET[v]} ${b.length > 140 ? `${b.slice(0, 137).trimEnd()}…` : b}`);
    out.push("");
  }
  if (use) out.push(`🧴 Cách dùng: ${use.length > 160 ? `${use.slice(0, 157).trimEnd()}…` : use}`, "");
  if (p.price > 0) {
    out.push(p.regularPrice && p.regularPrice > p.price ? `💰 Giá: ${formatAmount(p.price)}đ (giá gốc ${formatAmount(p.regularPrice)}đ — giảm ${Math.round(100 - (p.price / p.regularPrice) * 100)}%)` : `💰 Giá: ${formatAmount(p.price)}đ`);
  } else out.push("💰 Giá: inbox để shop báo giá nhé");
  out.push(`🛒 Đặt hàng: ${opts.link}`, `📞 Zalo/Hotline: ${opts.hotline}`, "", CTA[v], "");
  const tags = displayTags(p.tags, p.name).map(toHashtag);
  const extra = (opts.hashtags ?? []).map((h) => (h.startsWith("#") ? h.replace(/\s+/g, "") : toHashtag(h)));
  const fixed = [toHashtag(opts.shopName), "#hangnoidianhat", "#myphamnhatban", "#hangnhatnoidia"];
  out.push(Array.from(new Set([...tags, ...extra, ...fixed].filter(Boolean))).slice(0, 12).join(" "));
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** "09:00, 20:30" → ["09:00","20:30"] (valid HH:MM only, sorted, unique). */
export function parseTimes(raw: string): string[] {
  const out = new Set<string>();
  for (const part of raw.split(/[,\s;]+/)) {
    const m = /^(\d{1,2})[:h](\d{2})$/.exec(part.trim());
    if (!m) continue;
    const h = Number(m[1]);
    const mi = Number(m[2]);
    if (h > 23 || mi > 59) continue;
    out.add(`${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`);
  }
  return [...out].sort();
}

/**
 * Which of today's auto slots are due now and not yet planned: `nowHm` is the shop-local "HH:MM", `planned` the HH:MM
 * slots that already have a post for today. A slot is due once the clock passed it (catch-up after a restart included),
 * but never more than `graceMinutes` late — a slot missed by hours is skipped rather than posted at a random time.
 */
export function dueSlots(times: string[], nowHm: string, planned: string[], graceMinutes = 90): string[] {
  const toMin = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
  const now = toMin(nowHm);
  return times.filter((t) => !planned.includes(t) && toMin(t) <= now && now - toMin(t) <= graceMinutes);
}
