/**
 * Payment code printed in the transfer note and inside the VietQR: one per order, unique, UPPERCASE letters and digits
 * only (no spaces / diacritics / punctuation) so every banking app and SePay pass it through unchanged.
 * Shape: <PREFIX><order number><3 random chars>, e.g. "LS1034K7Q".
 */
export const PAY_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I to avoid mis-typing
export const DEFAULT_PAY_PREFIX = "LS";

export function normalizePayPrefix(v: string | null | undefined): string {
  const p = (v ?? "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6);
  return p || DEFAULT_PAY_PREFIX;
}

export function makePayCode(prefix: string, orderNumber: number, random: () => number = Math.random): string {
  let tail = "";
  for (let i = 0; i < 3; i++) tail += PAY_CODE_ALPHABET[Math.floor(random() * PAY_CODE_ALPHABET.length)];
  return `${normalizePayPrefix(prefix)}${orderNumber}${tail}`;
}

export const isPayCode = (v: string) => /^[A-Z]{1,6}\d{1,10}[A-Z0-9]{0,6}$/.test(v);

/** Find a payment code with the shop prefix inside free text (transfer content, SePay `code`). */
export function extractPayCode(text: string, prefix: string): string | null {
  const p = normalizePayPrefix(prefix);
  const m = new RegExp(`\\b${p}\\d{1,10}[A-Z0-9]{0,6}\\b`, "i").exec(text.toUpperCase().replace(/[^A-Z0-9]+/g, " "));
  return m ? m[0].toUpperCase() : null;
}
