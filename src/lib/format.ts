/** Format an integer VND amount the way WooCommerce does on linconnn.io.vn: "1.090.000". */
export function formatAmount(value: number): string {
  return Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Short money for KPI tiles: 16.773.500 → "16,77 tr", 1.234.000.000 → "1,23 tỷ"; below 1 triệu the full amount. */
export function formatCompactVnd(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  const fmt = (n: number, unit: string) => `${sign}${n.toLocaleString("vi-VN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${unit}`;
  if (abs >= 1e9) return fmt(abs / 1e9, "tỷ");
  if (abs >= 1e6) return fmt(abs / 1e6, "tr");
  return `${sign}${abs.toLocaleString("vi-VN")}đ`;
}

export function formatPrice(value: number, currency = "VNĐ"): string {
  return `${formatAmount(value)}${currency}`;
}

/** "890.000" → 890000 */
export function parseAmount(text: string): number {
  const digits = text.replace(/[^\d]/g, "");
  return digits ? Number.parseInt(digits, 10) : 0;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Shop-local time zone: dates render the same on the server (UTC container) and in the customer's browser, so client components hydrate cleanly. */
export const SHOP_TIME_ZONE = "Asia/Ho_Chi_Minh";

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: SHOP_TIME_ZONE });
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: SHOP_TIME_ZONE });
}
