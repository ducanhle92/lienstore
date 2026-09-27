/**
 * "Khách quen" — customers the shop trusts to pay on delivery. Accounts carry the flag themselves
 * (customers.is_regular); walk-in customers are remembered by phone number (regular_phones), so the next order with
 * the same number counts as a regular customer too. Pure helpers here; the DB side lives in lib/db.ts.
 */

/** Digits only; a Vietnamese number written with +84 / 84 becomes the local 0… form so both spellings match. */
export function normalizePhone(raw: string | null | undefined): string {
  const d = (raw ?? "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("84") && d.length >= 11) return `0${d.slice(2)}`;
  return d;
}

/** Whether an order's customer is a regular: account flag, or the phone is on the trusted list. */
export function isRegularBy(flags: { accountRegular?: boolean | null; phone?: string | null; regularPhones: ReadonlySet<string> }): boolean {
  if (flags.accountRegular) return true;
  const p = normalizePhone(flags.phone);
  return !!p && flags.regularPhones.has(p);
}
