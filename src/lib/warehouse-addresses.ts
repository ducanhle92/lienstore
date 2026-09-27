/**
 * Extra warehouse / pick-up addresses beyond the four fixed points of the Japan → shop chain
 * (Admin › Kho hàng › Địa chỉ kho › "Địa chỉ khác"): a second VN shop warehouse, a temporary store room, a
 * friend's place in Japan that gathers parcels… Stored as one JSON setting; pure helpers so the editor and the
 * node:test suite share them.
 */

export type ExtraAddressKind = "jp" | "jp_carrier" | "vn_carrier" | "vn" | "other";

export interface ExtraAddress {
  id: string;
  /** Short name shown in lists ("Kho Hà Nội", "Nhà chị Mận"). */
  label: string;
  kind: ExtraAddressKind;
  address: string;
  note: string;
}

export const EXTRA_ADDRESSES_KEY = "wh_extra_addresses";
export const MAX_EXTRA_ADDRESSES = 20;

export const EXTRA_KIND_LABEL: Record<ExtraAddressKind, string> = {
  jp: "Kho / điểm gom tại Nhật",
  jp_carrier: "ĐVVC tại Nhật",
  vn_carrier: "ĐVVC tại Việt Nam",
  vn: "Kho shop tại Việt Nam",
  other: "Khác",
};
export const EXTRA_KINDS = Object.keys(EXTRA_KIND_LABEL) as ExtraAddressKind[];

export function isExtraKind(v: unknown): v is ExtraAddressKind {
  return typeof v === "string" && (EXTRA_KINDS as string[]).includes(v);
}

/** Tolerant parse of the stored JSON: bad entries are dropped, blank addresses too. */
export function parseExtraAddresses(raw: string | null | undefined): ExtraAddress[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    const out: ExtraAddress[] = [];
    for (const x of arr) {
      if (!x || typeof x !== "object") continue;
      const o = x as Record<string, unknown>;
      const address = typeof o.address === "string" ? o.address.trim().slice(0, 300) : "";
      if (!address) continue;
      out.push({
        id: typeof o.id === "string" && o.id ? o.id.slice(0, 40) : `a${out.length + 1}`,
        label: typeof o.label === "string" ? o.label.trim().slice(0, 60) : "",
        kind: isExtraKind(o.kind) ? o.kind : "other",
        address,
        note: typeof o.note === "string" ? o.note.trim().slice(0, 200) : "",
      });
      if (out.length >= MAX_EXTRA_ADDRESSES) break;
    }
    return out;
  } catch {
    return [];
  }
}

/** Rows posted by the editor (parallel arrays) → clean list; rows without an address are skipped. */
export function extraAddressesFromForm(rows: Array<{ id: string; label: string; kind: string; address: string; note: string }>): ExtraAddress[] {
  return parseExtraAddresses(JSON.stringify(rows.map((r, i) => ({ ...r, id: r.id || `a${Date.now().toString(36)}${i}` }))));
}
