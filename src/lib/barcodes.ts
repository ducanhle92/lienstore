import { parseUnitCode } from "./units";

/**
 * Scanned / typed codes → one normalised form. Pure (no DB), shared by the scan screen, the API and the tests.
 *
 * - Codes are STRINGS: leading zeros are kept, nothing is turned into a number.
 * - GTIN family (EAN-8, UPC-A, EAN-13, GTIN-14) is checked with the GS1 check digit; a wrong digit is rejected, not
 *   "fixed". UPC-A (12 digits) and EAN-13 with a leading 0 are the SAME GS1 number, so UPC-A is stored as its EAN-13
 *   form (`0` + 12 digits) and a GTIN-14 starting with `0` as its 13-digit form; EAN-8 stays 8 digits (own number space).
 * - Unit codes (từng cái, `H` + digits + Damm digit) go through `parseUnitCode`.
 * - Internal QR payloads: `LS1:U:<unit code>` and `LS1:P:<product id>` (namespace LS, version 1). Any other QR content —
 *   URLs included — is reported as unsupported and never opened.
 * - Anything else is an internal / Code 128 text code: trimmed, inner spaces kept, case kept (compared without case).
 */
export const MAX_CODE_LENGTH = 128;

export type Symbology = "ean13" | "ean8" | "itf14" | "unit" | "text";

export type ParsedCode =
  | { kind: "gtin"; code: string; symbology: "ean13" | "ean8" | "itf14"; raw: string; /** e.g. "UPC-A → EAN-13" */ note?: string }
  | { kind: "unit"; code: string; symbology: "unit"; raw: string }
  | { kind: "product_ref"; productId: number; raw: string }
  | { kind: "text"; code: string; symbology: "text"; raw: string }
  | { kind: "invalid"; raw: string; reason: string }
  | { kind: "unsupported_qr"; raw: string; reason: string };

/** GS1 check digit of the digits before it (works for 8, 12, 13, 14). */
export function gs1CheckDigit(body: string): number {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const d = body.charCodeAt(body.length - 1 - i) - 48;
    sum += i % 2 === 0 ? d * 3 : d;
  }
  return (10 - (sum % 10)) % 10;
}

export function isValidGtin(digits: string): boolean {
  if (!/^\d{8}$|^\d{12,14}$/.test(digits)) return false;
  return gs1CheckDigit(digits.slice(0, -1)) === Number(digits.slice(-1));
}

/** Canonical GTIN: UPC-A → EAN-13, GTIN-14 with leading 0 → EAN-13; null when not a valid GTIN. */
export function canonicalGtin(digits: string): { code: string; symbology: "ean13" | "ean8" | "itf14"; note?: string } | null {
  if (!isValidGtin(digits)) return null;
  if (digits.length === 8) return { code: digits, symbology: "ean8" };
  if (digits.length === 12) return { code: `0${digits}`, symbology: "ean13", note: "UPC-A → EAN-13" };
  if (digits.length === 13) return { code: digits, symbology: "ean13" };
  if (digits.startsWith("0")) return { code: digits.slice(1), symbology: "ean13", note: "GTIN-14 → EAN-13" };
  return { code: digits, symbology: "itf14" };
}

/** Strip what scanners add around a code (CR/LF/tab, GS1 group separators, AIM prefix like "]E0"). */
function clean(raw: string): string {
  return raw
    .replace(/^\][A-Za-z]\d/, "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
}

export function parseScannedCode(input: string): ParsedCode {
  const raw = String(input ?? "");
  const s = clean(raw);
  if (!s) return { kind: "invalid", raw, reason: "Mã trống." };
  if (s.length > MAX_CODE_LENGTH) return { kind: "invalid", raw: raw.slice(0, MAX_CODE_LENGTH), reason: `Mã dài quá ${MAX_CODE_LENGTH} ký tự.` };

  // internal QR (namespace + version); other QR payloads are never followed
  if (/^LS\d+:/i.test(s)) {
    const m = /^LS1:([UP]):(.+)$/i.exec(s);
    if (!m) return { kind: "unsupported_qr", raw, reason: "QR nội bộ phiên bản/loại không hỗ trợ." };
    if (m[1].toUpperCase() === "U") {
      const unit = parseUnitCode(m[2]);
      return unit ? { kind: "unit", code: unit, symbology: "unit", raw } : { kind: "invalid", raw, reason: "Mã từng cái trong QR sai số kiểm." };
    }
    const id = /^\d{1,9}$/.test(m[2]) ? Number.parseInt(m[2], 10) : 0;
    return id > 0 ? { kind: "product_ref", productId: id, raw } : { kind: "invalid", raw, reason: "Mã sản phẩm trong QR không hợp lệ." };
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s) || /^(www\.|mailto:|tel:|sms:|wifi:)/i.test(s)) {
    return { kind: "unsupported_qr", raw, reason: "QR này không phải mã của lienstore (đường dẫn/ liên kết) — không mở." };
  }

  // unit codes: H + digits (+ separators people type)
  if (/^h[\s-]*\d[\d\s-]*$/i.test(s)) {
    const unit = parseUnitCode(s);
    return unit ? { kind: "unit", code: unit, symbology: "unit", raw } : { kind: "invalid", raw, reason: "Mã từng cái sai (dạng H + 7 chữ số, chữ số cuối là số kiểm)." };
  }

  // GTIN family: 8 / 12 / 13 / 14 digits must carry a valid check digit
  const digits = s.replace(/[\s-]/g, "");
  if (/^\d+$/.test(digits) && [8, 12, 13, 14].includes(digits.length)) {
    const g = canonicalGtin(digits);
    if (!g) return { kind: "invalid", raw, reason: `Mã ${digits.length} số sai số kiểm tra (đọc lại hoặc gõ lại).` };
    return { kind: "gtin", code: g.code, symbology: g.symbology, raw, ...(g.note ? { note: g.note } : {}) };
  }

  if (!/^[\x20-\x7e]+$/.test(s)) return { kind: "invalid", raw, reason: "Mã chứa ký tự không hỗ trợ." };
  return { kind: "text", code: s, symbology: "text", raw };
}

/** Normalised code to store / look up for a product link (GTIN canonical form or text code); null when not linkable. */
export function linkableCode(input: string): { code: string; symbology: Exclude<Symbology, "unit"> } | { error: string } {
  const p = parseScannedCode(input);
  if (p.kind === "gtin") return { code: p.code, symbology: p.symbology };
  if (p.kind === "text") return { code: p.code, symbology: "text" };
  if (p.kind === "unit") return { error: "Mã H là mã từng cái (đã gắn sẵn với sản phẩm) — không liên kết thêm." };
  if (p.kind === "product_ref") return { error: "QR sản phẩm nội bộ đã trỏ sẵn tới sản phẩm." };
  return { error: p.reason };
}

/** QR payload for a unit label. */
export const unitQrPayload = (code: string) => `LS1:U:${code}`;
export const productQrPayload = (id: number) => `LS1:P:${id}`;
