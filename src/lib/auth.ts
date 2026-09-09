import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCustomerById, verifyCustomerLogin } from "@/lib/db";
import { effectivePermissions, type UserRole } from "@/lib/permissions";

/**
 * Admin authentication.
 *  - Bootstrap account from env (ADMIN_USER / ADMIN_PASSWORD): always a full admin, cannot be edited in the UI.
 *  - Database users (table `customers`) with role `admin` or `staff` sign in with email + password; staff only see
 *    the modules granted in `permissions`.
 * The session is an HMAC-signed cookie: `<subject>.<expiry>.<signature>` where subject is "env" or the user id.
 */
const COOKIE = "lien_admin";
const SECRET = process.env.ADMIN_SESSION_SECRET ?? "lien-dev-secret-change-me";
const ADMIN_USER = process.env.ADMIN_USER ?? "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "admin123";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const ENV_SUBJECT = "env";

export const usingDefaultCredentials = !process.env.ADMIN_PASSWORD;

export interface AdminSession {
  /** "env" for the bootstrap account, otherwise the user id. */
  id: string;
  label: string;
  email: string;
  role: Exclude<UserRole, "customer">;
  permissions: string[];
  isEnv: boolean;
}

function sign(payload: string): string {
  return createHmac("sha256", SECRET).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** Returns the session subject to store, or null when the credentials are wrong / the account has no admin access. */
export async function verifyCredentials(user: string, password: string): Promise<string | null> {
  const u = user.trim();
  if (safeEqual(u, ADMIN_USER) && safeEqual(password, ADMIN_PASSWORD)) return ENV_SUBJECT;
  const c = await verifyCustomerLogin(u, password);
  if (c && c.active && (c.role === "admin" || c.role === "staff")) return c.id;
  return null;
}

/** HTTP Basic with the env admin credentials — for scripts such as scripts/sync-from-prod.mjs. */
export function authorizeBasic(header: string | null): boolean {
  if (!header || !header.startsWith("Basic ")) return false;
  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const i = decoded.indexOf(":");
  if (i < 0) return false;
  return safeEqual(decoded.slice(0, i), ADMIN_USER) && safeEqual(decoded.slice(i + 1), ADMIN_PASSWORD);
}

function makeToken(subject: string): string {
  const payload = `${subject}.${Date.now() + SESSION_TTL_MS}`;
  return `${payload}.${sign(payload)}`;
}

function parseToken(token: string | undefined): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [subject, exp, sig] = parts;
  if (!safeEqual(sign(`${subject}.${exp}`), sig)) return null;
  if (Number(exp) <= Date.now()) return null;
  return subject;
}

/** Current admin session with effective permissions, or null. Legacy tokens (subject = ADMIN_USER) still work. */
export async function getAdminSession(): Promise<AdminSession | null> {
  const jar = await cookies();
  const subject = parseToken(jar.get(COOKIE)?.value);
  if (!subject) return null;
  if (subject === ENV_SUBJECT || subject === ADMIN_USER) {
    return { id: ENV_SUBJECT, label: `${ADMIN_USER} (chủ cửa hàng)`, email: "", role: "admin", permissions: effectivePermissions("admin", []), isEnv: true };
  }
  const c = await getCustomerById(subject);
  if (!c || !c.active || (c.role !== "admin" && c.role !== "staff")) return null;
  const name = `${c.firstName} ${c.lastName}`.trim();
  return { id: c.id, label: name || c.username || c.email, email: c.email, role: c.role, permissions: effectivePermissions(c.role, c.permissions), isEnv: false };
}

export async function isAdmin(): Promise<boolean> {
  return (await getAdminSession()) !== null;
}

/** True when the current session may use the given module (`admin` role → everything). */
export async function can(module: string): Promise<boolean> {
  const s = await getAdminSession();
  return !!s && s.permissions.includes(module);
}

export async function canAny(modules: string[]): Promise<boolean> {
  const s = await getAdminSession();
  return !!s && modules.some((m) => s.permissions.includes(m));
}

/** Page guard: not signed in → login; signed in without the module → dashboard with a notice. */
export async function requireAdmin(module?: string): Promise<AdminSession> {
  const s = await getAdminSession();
  if (!s) redirect("/admin/login");
  if (module && !s.permissions.includes(module)) redirect(`/admin/?denied=${encodeURIComponent(module)}`);
  return s;
}

export async function startSession(subject: string = ENV_SUBJECT): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, makeToken(subject), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
    secure: process.env.NODE_ENV === "production",
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}
