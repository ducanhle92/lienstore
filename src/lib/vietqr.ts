/**
 * VietQR (NAPAS 247, EMVCo merchant-presented QR) payload built locally — no third-party image service. Scanning the
 * code in any Vietnamese banking app pre-fills bank, account, amount and transfer note. Pure module (unit-tested).
 * Spec: EMVCo QRCPS + NAPAS "QR IBFT to account" (GUID A000000727, service code QRIBFTTA).
 */

/** Bank name → NAPAS BIN (acquirer id used in field 38). */
export const BANK_BINS: Record<string, { bin: string; name: string }> = {
  BIDV: { bin: "970418", name: "BIDV" },
  VCB: { bin: "970436", name: "Vietcombank" },
  VIETCOMBANK: { bin: "970436", name: "Vietcombank" },
  TCB: { bin: "970407", name: "Techcombank" },
  TECHCOMBANK: { bin: "970407", name: "Techcombank" },
  CTG: { bin: "970415", name: "VietinBank" },
  VIETINBANK: { bin: "970415", name: "VietinBank" },
  MB: { bin: "970422", name: "MB Bank" },
  MBBANK: { bin: "970422", name: "MB Bank" },
  ACB: { bin: "970416", name: "ACB" },
  TPB: { bin: "970423", name: "TPBank" },
  TPBANK: { bin: "970423", name: "TPBank" },
  STB: { bin: "970403", name: "Sacombank" },
  SACOMBANK: { bin: "970403", name: "Sacombank" },
  VPB: { bin: "970432", name: "VPBank" },
  VPBANK: { bin: "970432", name: "VPBank" },
  AGRIBANK: { bin: "970405", name: "Agribank" },
  VBA: { bin: "970405", name: "Agribank" },
  HDB: { bin: "970437", name: "HDBank" },
  HDBANK: { bin: "970437", name: "HDBank" },
  SHB: { bin: "970443", name: "SHB" },
  OCB: { bin: "970448", name: "OCB" },
  MSB: { bin: "970426", name: "MSB" },
  VIB: { bin: "970441", name: "VIB" },
  SEAB: { bin: "970440", name: "SeABank" },
  SEABANK: { bin: "970440", name: "SeABank" },
  EIB: { bin: "970431", name: "Eximbank" },
  LPB: { bin: "970449", name: "LPBank" },
  NAB: { bin: "970428", name: "Nam A Bank" },
  BAB: { bin: "970409", name: "Bac A Bank" },
  VIETABANK: { bin: "970427", name: "VietABank" },
  PVCB: { bin: "970412", name: "PVcomBank" },
  ABB: { bin: "970425", name: "ABBANK" },
  CAKE: { bin: "546034", name: "CAKE by VPBank" },
  TIMO: { bin: "963388", name: "Timo" },
};

/** BIN for a bank given by short code or BIN itself; null when unknown. */
export function bankBin(codeOrBin: string): string | null {
  const k = codeOrBin.trim().toUpperCase().replace(/\s+/g, "");
  if (/^\d{6}$/.test(k)) return k;
  return BANK_BINS[k]?.bin ?? null;
}

const tlv = (id: string, value: string) => `${id}${String(value.length).padStart(2, "0")}${value}`;

/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) over the UTF-8 bytes — EMVCo field 63. */
export function crc16(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let crc = 0xffff;
  for (const b of bytes) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Transfer notes must be plain ASCII for every bank app: strip diacritics, keep letters/digits/space, ≤ 25 chars. */
export function sanitizeMemo(memo: string): string {
  return memo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 25);
}

export interface VietQrInput {
  /** Bank short code ("BIDV") or 6-digit BIN. */
  bank: string;
  accountNumber: string;
  /** VND, whole number; omit / 0 for a static (amount-less) code. */
  amount?: number;
  memo?: string;
}

/** Full EMVCo payload string to encode into the QR image. */
export function vietQrPayload(input: VietQrInput): string {
  const bin = bankBin(input.bank);
  if (!bin) throw new Error(`Không biết mã BIN của ngân hàng "${input.bank}"`);
  const account = input.accountNumber.replace(/\s+/g, "");
  const amount = input.amount && input.amount > 0 ? Math.round(input.amount) : 0;
  const memo = input.memo ? sanitizeMemo(input.memo) : "";
  const merchant = tlv("00", "A000000727") + tlv("01", tlv("00", bin) + tlv("01", account)) + tlv("02", "QRIBFTTA");
  let s = tlv("00", "01") + tlv("01", amount ? "12" : "11") + tlv("38", merchant) + tlv("53", "704");
  if (amount) s += tlv("54", String(amount));
  s += tlv("58", "VN");
  if (memo) s += tlv("62", tlv("08", memo));
  s += "6304";
  return s + crc16(s);
}

/** Decode a payload's top-level TLV fields (for tests / debugging). */
export function parseTlv(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  let i = 0;
  while (i + 4 <= s.length) {
    const id = s.slice(i, i + 2);
    const len = Number.parseInt(s.slice(i + 2, i + 4), 10);
    out[id] = s.slice(i + 4, i + 4 + len);
    i += 4 + len;
  }
  return out;
}
