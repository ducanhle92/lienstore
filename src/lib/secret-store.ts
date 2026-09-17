/**
 * Secrets kept in the `settings` table (carrier tokens, the Facebook Page token) are sealed with AES-256-GCM so a copy
 * of the database file alone does not leak them. The key is derived from ADMIN_SESSION_SECRET (the same server secret
 * that signs admin sessions); values written before this existed are plain text and still open — `sealStoredSecrets`
 * re-seals them at start-up. Sealed values look like `enc:v1:<iv>.<tag>.<ciphertext>` (base64url).
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { getSetting, setSetting } from "./sqlite";

const PREFIX = "enc:v1:";

function keyFor(secret = process.env.ADMIN_SESSION_SECRET ?? "lien-dev-secret-change-me"): Buffer {
  return createHash("sha256").update(`lien-secret-store:${secret}`).digest();
}

export const isSealed = (v: string | null | undefined): boolean => !!v && v.startsWith(PREFIX);

/** Encrypt a plain value; empty stays empty (nothing to protect). */
export function sealSecret(plain: string, secret?: string): string {
  const v = plain.trim();
  if (!v) return "";
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFor(secret), iv);
  const ct = Buffer.concat([cipher.update(v, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64url")}.${tag.toString("base64url")}.${ct.toString("base64url")}`;
}

/**
 * Decrypt a stored value. Plain (legacy) values pass through unchanged; a sealed value that cannot be opened (server
 * secret changed, tampered row) yields "" so the integration shows "chưa có" instead of using garbage.
 */
export function openSecret(stored: string | null | undefined, secret?: string): string {
  if (!stored) return "";
  if (!isSealed(stored)) return stored.trim();
  try {
    const [iv, tag, ct] = stored.slice(PREFIX.length).split(".");
    const decipher = createDecipheriv("aes-256-gcm", keyFor(secret), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}

export function getSecretSetting(db: DatabaseSync, key: string): string {
  return openSecret(getSetting(db, key));
}
export function setSecretSetting(db: DatabaseSync, key: string, value: string): void {
  setSetting(db, key, sealSecret(value));
}

/** Every secret the admin can store, with where it is entered — the owner's "Khóa API đã lưu" card lists these. */
export interface SecretSettingDef {
  key: string;
  label: string;
  where: string;
  href: string;
}
export const SECRET_SETTINGS: SecretSettingDef[] = [
  { key: "goship_token", label: "Goship — Access Token", where: "Vận chuyển › ④ › Kết nối Goship", href: "/admin/shipping/?leg=vn_domestic" },
  { key: "ghn_token", label: "GHN — Token API", where: "Vận chuyển › ④ › Kết nối GHN", href: "/admin/shipping/?leg=vn_domestic" },
  { key: "vtp_token", label: "Viettel Post — Token API", where: "Vận chuyển › ④ › Kết nối Viettel Post", href: "/admin/shipping/?leg=vn_domestic" },
  { key: "spx_secret_key", label: "SPX Express — Secret Key", where: "Vận chuyển › ④ › Kết nối SPX Express", href: "/admin/shipping/?leg=vn_domestic" },
  { key: "fb_page_token", label: "Facebook Page — Access Token", where: "Fanpage › Kết nối", href: "/admin/fanpage/" },
];

/** Start-up: seal any secret still stored as plain text (idempotent). Returns how many rows were re-sealed. */
export function sealStoredSecrets(db: DatabaseSync): number {
  let n = 0;
  for (const s of SECRET_SETTINGS) {
    const raw = getSetting(db, s.key);
    if (raw && raw.trim() && !isSealed(raw)) {
      setSetting(db, s.key, sealSecret(raw));
      n++;
    }
  }
  return n;
}

/** "••••abcd" for display; never the full value. */
export const maskSecret = (v: string): string => (v ? `••••${v.slice(-4)}` : "");
