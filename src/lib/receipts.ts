import { foldVi } from "./tags";

/**
 * Purchase receipts ("phiếu mua hàng", Quản lý mua hàng): one receipt per shopping run at one source — an auto code
 * (PM-YYMMDD-NN), the purchase date, the source's order number, what was bought (product × qty × ¥) and, later, when
 * the parcel left for the carrier (tracking). Order lines and warehouse-lot purchases link to the receipt, so the
 * logistics status of every item in every order can be followed per receipt. Pure helpers (no DB).
 */
export type ReceiptStatus = "draft" | "bought" | "shipped";
export const RECEIPT_STATUS_LABEL: Record<ReceiptStatus, string> = { draft: "Nháp (từ bill, chờ xác nhận)", bought: "Đã mua", shipped: "Đã gửi ĐVVC" };

/** "2026-09-17", 3 → "PM-260917-03". */
export function receiptCode(boughtAt: string, seq: number): string {
  const d = /^(\d{4})-(\d{2})-(\d{2})/.exec(boughtAt);
  const ymd = d ? `${d[1].slice(2)}${d[2]}${d[3]}` : "000000";
  return `PM-${ymd}-${String(Math.max(1, seq)).padStart(2, "0")}`;
}

export interface BillItem {
  name: string;
  qty: number;
  unitJpy: number | null;
  /** Amazon ASIN when the text carried one near the line. */
  asin: string | null;
}
export interface ParsedBill {
  orderRef: string;
  /** YYYY-MM-DD or "" when not found. */
  boughtAt: string;
  items: BillItem[];
}

const toIso = (y: number, m: number, d: number) => (m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` : "");
const money = (s: string) => Number.parseInt(s.replace(/[,，.\s]/g, ""), 10);

/**
 * Pull items out of a pasted purchase bill — an Amazon.co.jp / Rakuten order mail, a receipt photo transcribed, or a
 * hand-typed list. Understood per line: a quantity ("数量: 2", "x2", "×2", "Qty 2", "SL 2", "2 x Name"), a ¥ price
 * ("¥1,234", "1,234円", "1234 yen"), an ASIN (B0…) on the line, the line before or after (Amazon mails put the link
 * under the title). A line with only a quantity belongs to the previous named line.
 */
export function parseBillText(text: string): ParsedBill {
  const raw = text.replace(/\r/g, "").split("\n").map((l) => l.trim());
  const all = raw.join("\n");
  const orderRef = /(\d{3}-\d{7}-\d{7})/.exec(all)?.[1] ?? /(?:注文番号|order(?:\s*(?:number|no\.?|#))?|mã đơn|đơn hàng)\s*[:：#]?\s*([A-Z0-9][A-Z0-9-]{5,})/i.exec(all)?.[1] ?? "";
  let boughtAt = "";
  const d1 = /(\d{4})[\/年.\-](\d{1,2})[\/月.\-](\d{1,2})/.exec(all);
  const d2 = /(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})/.exec(all);
  if (d1 && (!d2 || d1.index <= d2.index)) boughtAt = toIso(+d1[1], +d1[2], +d1[3]);
  else if (d2) boughtAt = toIso(+d2[3], +d2[2], +d2[1]);

  const items: BillItem[] = [];
  const asinAt = (i: number) => {
    for (const k of [i, i + 1, i - 1]) {
      const m = k >= 0 && k < raw.length ? /\b(B0[A-Z0-9]{8})\b/.exec(raw[k]) : null;
      if (m) return m[1];
    }
    return null;
  };
  const isNoise = (l: string) => !l || /^(小計|合計|送料|注文合計|ご注文|お届け|配送|支払|subtotal|total|shipping|tax|thanh toán|tổng|phí|http)/i.test(l) || /^[\d\s¥￥,.円-]+$/.test(l);
  for (let i = 0; i < raw.length; i++) {
    const line = raw[i];
    if (isNoise(line)) continue;
    let qty: number | null = null;
    let name = line;
    let m: RegExpExecArray | null;
    if ((m = /(?:数量|qty|quantity|sl|số lượng)\s*[:：]?\s*(\d+)/i.exec(line))) qty = +m[1];
    else if ((m = /^(\d{1,3})\s*[x×]\s+(.+)$/i.exec(line))) {
      qty = +m[1];
      name = m[2];
    } else if ((m = /[x×]\s?(\d{1,3})(?:\s|$|[^\d,])/i.exec(line)) && !/^\s*[x×]/.test(line)) qty = +m[1];
    if (qty === null) continue;
    name = name
      .replace(/(?:数量|qty|quantity|sl|số lượng)\s*[:：]?\s*\d+/i, "")
      .replace(/[x×]\s?\d{1,3}(?=\s|$|[^\d,])/i, "")
      .replace(/[¥￥]\s?[\d,，.]+|[\d,，.]+\s?(?:円|yen|jpy)/gi, "")
      .replace(/\b(B0[A-Z0-9]{8})\b/, "")
      .replace(/[|｜\-–—:：]+$/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    // "数量: 2" alone → the item is the previous meaningful line
    if (name.length < 3) {
      for (let k = i - 1; k >= 0; k--) {
        if (!isNoise(raw[k]) && !/(?:数量|qty|quantity|sl)/i.test(raw[k])) {
          name = raw[k].replace(/[¥￥]\s?[\d,，.]+|[\d,，.]+\s?(?:円|yen)/gi, "").replace(/\b(B0[A-Z0-9]{8})\b/, "").trim();
          break;
        }
      }
    }
    const price = /[¥￥]\s?([\d,，.]{2,})|([\d,，.]{2,})\s?(?:円|yen|jpy)/i.exec(`${line} ${raw[i + 1] ?? ""}`);
    const total = price ? money(price[1] ?? price[2]) : NaN;
    const unitJpy = Number.isFinite(total) && total > 0 ? Math.round(/(?:単価|unit|đơn giá)/i.test(line) ? total : total / (qty || 1)) : null;
    if (name.length >= 3 && qty > 0 && qty < 1000) items.push({ name, qty, unitJpy, asin: asinAt(i) });
  }
  return { orderRef, boughtAt, items };
}

export interface MatchCandidate {
  id: number;
  name: string;
  nameJa: string;
  /** Any known purchase URLs (cost sources, supplier link) — ASINs are read from them. */
  urls: string[];
}

const bigrams = (s: string) => {
  const t = s.replace(/\s+/g, "");
  const out = new Set<string>();
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
  return out;
};
const overlap = (a: Set<string>, b: Set<string>) => {
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n / Math.min(a.size, b.size);
};

/** Best catalogue match for a bill line: exact ASIN in a known purchase URL wins; else name similarity (Vietnamese or Japanese). */
export function matchBillItem(item: BillItem, candidates: MatchCandidate[]): { id: number; score: number } | null {
  if (item.asin) {
    const hit = candidates.find((c) => c.urls.some((u) => u.toUpperCase().includes(item.asin as string)));
    if (hit) return { id: hit.id, score: 1 };
  }
  const q = item.name.toLowerCase();
  const qVi = foldVi(item.name);
  const qb = bigrams(q);
  let best: { id: number; score: number } | null = null;
  for (const c of candidates) {
    const sVi = overlap(new Set(qVi.split(" ")), new Set(foldVi(c.name).split(" ")));
    const sJa = c.nameJa ? overlap(qb, bigrams(c.nameJa.toLowerCase())) : 0;
    const sName = overlap(qb, bigrams(c.name.toLowerCase()));
    const score = Math.max(sVi, sJa, sName);
    if (score > (best?.score ?? 0)) best = { id: c.id, score };
  }
  return best && best.score >= 0.45 ? best : null;
}
