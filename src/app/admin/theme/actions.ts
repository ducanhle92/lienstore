"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getSiteTheme, setSiteTheme } from "@/lib/db";
import { DEFAULT_THEME, normalizeHex, type SiteTheme, THEME_COLOR_LABELS, THEME_PRESETS, type ThemeColorKey, type ThemeColors } from "@/lib/theme";
import { saveUpload } from "@/lib/uploads";

const PAGE = "/admin/theme/";
const text = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const back = (key: "saved" | "error", msg: string): never => redirect(`${PAGE}?${key}=${encodeURIComponent(msg)}`);
const isRedirect = (e: unknown) => e instanceof Error && e.message.includes("NEXT_REDIRECT");
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif", "image/svg+xml"]);
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif", "image/svg+xml": "svg" };

/** Store an uploaded picture under uploads/theme and return its URL; null when nothing was chosen. */
async function pickImage(fd: FormData, field: string, prefix: string): Promise<string | null> {
  const file = fd.get(field);
  if (!(file instanceof File) || file.size === 0) return null;
  if (!IMAGE_TYPES.has(file.type)) back("error", `Ảnh "${prefix}" phải là PNG, JPG, WebP, GIF, AVIF hoặc SVG.`);
  if (file.size > 5 * 1024 * 1024) back("error", `Ảnh "${prefix}" tối đa 5 MB.`);
  const saved = await saveUpload("theme", `${prefix}-${Date.now()}.${EXT[file.type]}`, Buffer.from(await file.arrayBuffer()));
  return saved.url;
}

/** Save name, slogan, logos and palette. A preset radio other than "custom" replaces the colour fields wholesale. */
export async function saveThemeAction(formData: FormData): Promise<void> {
  await requireAdmin("theme");
  try {
    const current = await getSiteTheme();
    const presetRaw = text(formData, "preset");
    let colors: ThemeColors;
    let preset: SiteTheme["preset"];
    if (presetRaw === "red" || presetRaw === "green") {
      colors = { ...THEME_PRESETS[presetRaw].colors };
      preset = presetRaw;
    } else {
      colors = { ...current.colors };
      for (const k of Object.keys(THEME_COLOR_LABELS) as ThemeColorKey[]) {
        const raw = text(formData, `color_${k}`);
        if (!raw) continue;
        const hex = normalizeHex(raw);
        if (!hex) back("error", `Mã màu "${THEME_COLOR_LABELS[k]}" không hợp lệ: ${raw}. Dùng dạng #rrggbb.`);
        colors[k] = hex ?? colors[k];
      }
      const same = (Object.keys(THEME_PRESETS) as Array<"red" | "green">).find((p) => (Object.keys(colors) as ThemeColorKey[]).every((k) => THEME_PRESETS[p].colors[k] === colors[k]));
      preset = same ?? "custom";
    }
    const pathOr = (field: string, fallback: string) => {
      const v = text(formData, field);
      if (!v) return fallback;
      if (!/^(\/|https?:\/\/)/.test(v)) back("error", "Đường dẫn ảnh phải bắt đầu bằng / hoặc https://.");
      return v;
    };
    const theme: SiteTheme = {
      shopName: text(formData, "shopName").slice(0, 60) || DEFAULT_THEME.shopName,
      slogan: text(formData, "slogan").slice(0, 80),
      logoHeader: (await pickImage(formData, "logoHeaderFile", "logo-header")) ?? pathOr("logoHeader", current.logoHeader),
      logoLight: (await pickImage(formData, "logoLightFile", "logo-light")) ?? pathOr("logoLight", current.logoLight),
      icon: (await pickImage(formData, "iconFile", "icon")) ?? pathOr("icon", current.icon),
      ogImage: (await pickImage(formData, "ogImageFile", "og-image")) ?? pathOr("ogImage", current.ogImage),
      preset,
      colors,
    };
    await setSiteTheme(theme);
    revalidatePath("/", "layout");
    back("saved", "Đã lưu giao diện. Tải lại trang cửa hàng để xem.");
  } catch (e) {
    if (isRedirect(e)) throw e;
    back("error", e instanceof Error ? e.message : "Không lưu được giao diện.");
  }
}

/** Back to the shipped defaults (Store Lienanh logo, red palette). */
export async function resetThemeAction(): Promise<void> {
  await requireAdmin("theme");
  await setSiteTheme({ ...DEFAULT_THEME, colors: { ...DEFAULT_THEME.colors } });
  revalidatePath("/", "layout");
  back("saved", "Đã khôi phục giao diện mặc định.");
}
