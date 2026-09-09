/** Bank-transfer details and VietQR helpers (pure; safe for client components). */

export const BANK = {
  /** Display name */
  bank: "BIDV",
  /** Bank code understood by img.vietqr.io (BIN or short code). */
  code: "BIDV",
  accountNumber: "26010000748323",
  accountName: "LE THI LIEN",
  branch: "BIDV – CN Mỹ Đình",
};

/** Transfer memo the customer must use: "LIENSTORE <order number>". */
export function transferContent(orderNumber: number): string {
  return `LIENSTORE ${orderNumber}`;
}

/** VietQR image (quick-link API) pre-filled with amount and memo — scan with any Vietnamese banking app. */
export function vietQrUrl(amount: number, memo: string): string {
  const q = new URLSearchParams({ amount: String(Math.round(amount)), addInfo: memo, accountName: BANK.accountName });
  return `https://img.vietqr.io/image/${BANK.code}-${BANK.accountNumber}-compact2.png?${q.toString()}`;
}
