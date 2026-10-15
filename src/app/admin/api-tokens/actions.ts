"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import { expiryFromDays, sanitizeScopes } from "@/lib/api-token-format";
import { createApiToken, revokeApiToken } from "@/lib/api-tokens";

/** Owner and admin accounts manage API tokens (staff never see the page). */
async function guard() {
  const s = await getAdminSession();
  if (!s) redirect("/admin/login/");
  if (s.role !== "owner" && s.role !== "admin") redirect("/admin/?denied=users");
  return s;
}

export type CreateTokenState = { error?: string; token?: string; prefix?: string; name?: string } | null;

/** Returns the raw token ONCE in the action result (never in a URL, never stored). */
export async function createApiTokenAction(_prev: CreateTokenState, formData: FormData): Promise<CreateTokenState> {
  const s = await guard();
  const days = Number.parseInt(String(formData.get("days") ?? ""), 10);
  try {
    const { token, info } = await createApiToken({
      name: String(formData.get("name") ?? ""),
      scopes: sanitizeScopes(formData.getAll("scopes").map(String)),
      ownerId: s.id,
      createdBy: s.label,
      expiresAt: expiryFromDays(Number.isFinite(days) ? days : 0),
    });
    revalidatePath("/admin/api-tokens/");
    return { token, prefix: info.prefix, name: info.name };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Không tạo được token." };
  }
}

export async function revokeApiTokenAction(formData: FormData): Promise<void> {
  const s = await guard();
  const id = Number.parseInt(String(formData.get("id") ?? ""), 10);
  const ok = Number.isInteger(id) && (await revokeApiToken(id, s.label));
  revalidatePath("/admin/api-tokens/");
  redirect(`/admin/api-tokens/?${ok ? "saved" : "error"}=${encodeURIComponent(ok ? "Đã thu hồi token." : "Token không tồn tại hoặc đã thu hồi.")}`);
}
