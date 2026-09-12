import "server-only";
import { getDb, getSetting } from "@/lib/sqlite";

/**
 * SPX Express partner API credentials (Admin › Vận chuyển › ④): SPX gives merchants a "Mã user" (User ID, 15 digits) and
 * a "Secret Key" in spx.vn › Quản lý tài khoản › Hồ sơ shop. SPX's terms only hand the endpoint documentation to
 * authorised partners, so the fee call itself is wired once that document arrives (`spx_fee_url`); until then the
 * adapter quotes from the public rate card and says so on the card.
 */
export const SPX_SETTING_KEYS = { userId: "spx_user_id", secretKey: "spx_secret_key", feeUrl: "spx_fee_url" } as const;

function setting(key: string): string {
  try {
    return (getSetting(getDb(), key) ?? "").trim();
  } catch {
    return "";
  }
}

export function spxApiCredentials(): { userId: string; secretKey: string; feeUrl: string } {
  return {
    userId: setting(SPX_SETTING_KEYS.userId) || process.env.SPX_USER_ID?.trim() || "",
    secretKey: setting(SPX_SETTING_KEYS.secretKey) || process.env.SPX_SECRET_KEY?.trim() || "",
    feeUrl: setting(SPX_SETTING_KEYS.feeUrl) || process.env.SPX_FEE_URL?.trim() || "",
  };
}

/** Key stored (credentials present) — the card can say "đã lưu khóa". */
export function spxKeyStored(): boolean {
  return !!spxApiCredentials().secretKey;
}

/** Live quoting possible: credentials + the fee endpoint from SPX's partner documentation. */
export function spxApiConfigured(): boolean {
  const c = spxApiCredentials();
  return !!c.secretKey && !!c.userId && /^https:\/\//.test(c.feeUrl);
}
