import Image from "next/image";
import { resetThemeAction, saveThemeAction } from "@/app/admin/theme/actions";
import { ColorField } from "@/components/sites/lienstore/admin/ColorField";
import { FilePicker } from "@/components/sites/lienstore/admin/FilePicker";
import { adminInput, adminLabel, btnPrimary, btnSecondary, Card, Flash, PageHeader } from "@/components/sites/lienstore/admin/ui";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { requireAdmin } from "@/lib/auth";
import { getSiteTheme } from "@/lib/db";
import { LOGO_RATIO, THEME_COLOR_LABELS, THEME_PRESETS, type ThemeColorKey } from "@/lib/theme";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

function ImageField({ name, label, hint, value, wide, dark }: { name: string; label: string; hint: string; value: string; wide?: boolean; dark?: boolean }) {
  return (
    <div className="rounded-md border border-[#e5e7eb] p-3">
      <p className={adminLabel}>{label}</p>
      <div className="flex flex-wrap items-start gap-4">
        <div className={`flex h-[72px] ${wide ? "w-[150px]" : "w-[72px]"} items-center justify-center rounded p-1 ${dark ? "bg-lien-header" : "bg-[repeating-conic-gradient(#f3f4f6_0_25%,#fff_0_50%)] bg-[length:16px_16px]"}`}>
          <Image src={value} alt="" width={wide ? 140 : 64} height={wide ? 68 : 64} unoptimized className="max-h-full w-auto max-w-full object-contain" />
        </div>
        <div className="min-w-[240px] flex-1 space-y-2">
          <FilePicker name={`${name}File`} accept="image/*" label="Chọn ảnh từ máy" />
          <input name={name} defaultValue={value} className={`${adminInput} font-mono !text-[12px]`} aria-label={`Đường dẫn ${label}`} />
          <p className="m-0 text-[12px] leading-4 text-lien-muted">{hint}</p>
        </div>
      </div>
    </div>
  );
}

/** Sales › Giao diện & Logo: brand name, slogan, logo files and colour palette for the storefront and the web app. */
export default async function AdminTheme({ searchParams }: Props) {
  await requireAdmin("theme");
  const sp = await searchParams;
  const theme = await getSiteTheme();
  const c = theme.colors;
  return (
    <>
      <PageHeader
        title="Giao diện & Logo"
        subtitle="Tên shop, slogan, logo, icon ứng dụng và bảng màu. Áp dụng cho web, web app (PWA) và trang admin."
        actions={
          <form action={resetThemeAction}>
            <button type="submit" className={btnSecondary}>
              <Fa name="refresh" /> Khôi phục mặc định
            </button>
          </form>
        }
      />
      {first(sp.saved) ? <Flash>{first(sp.saved)}</Flash> : null}
      {first(sp.error) ? <Flash kind="error">{first(sp.error)}</Flash> : null}

      <form action={saveThemeAction} className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <div className="space-y-6">
          <Card title="Tên & slogan">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={adminLabel} htmlFor="shopName">
                  Tên shop
                </label>
                <input id="shopName" name="shopName" defaultValue={theme.shopName} maxLength={60} className={adminInput} />
              </div>
              <div>
                <label className={adminLabel} htmlFor="slogan">
                  Slogan (hiện dưới logo trên thanh menu)
                </label>
                <input id="slogan" name="slogan" defaultValue={theme.slogan} maxLength={80} placeholder="Chuyên hàng Nhật nội địa" className={adminInput} />
              </div>
            </div>
          </Card>

          <Card title="Logo & icon">
            <div className="grid gap-3">
              <ImageField name="logoHeader" label="Logo trên thanh menu (nền màu)" hint={`Ảnh PNG nền trong suốt, chữ sáng. Tỷ lệ ${LOGO_RATIO.width}×${LOGO_RATIO.height}; nên ≥ 800 px ngang.`} value={theme.logoHeader} wide dark />
              <ImageField name="logoLight" label="Logo trên nền sáng (chân trang, e-mail, hoá đơn)" hint="Ảnh PNG nền trong suốt, chữ màu." value={theme.logoLight} wide />
              <ImageField name="icon" label="Icon ứng dụng / favicon" hint="PNG vuông ≥ 512 px. Dùng cho tab trình duyệt, màn hình chính điện thoại (web app)." value={theme.icon} />
              <ImageField name="ogImage" label="Ảnh chia sẻ mạng xã hội" hint="1200×630 px, hiện khi dán link shop lên Facebook / Zalo." value={theme.ogImage} wide />
            </div>
          </Card>

          <Card title="Bảng màu">
            <div className="mb-4 space-y-2">
              {(Object.keys(THEME_PRESETS) as Array<"red" | "green">).map((p) => (
                <label key={p} className="flex items-center gap-3 rounded-md border border-[#e5e7eb] px-3 py-2">
                  <input type="radio" name="preset" value={p} defaultChecked={theme.preset === p} className="h-4 w-4" />
                  <span className="flex gap-1">
                    {(["header", "primary", "accent", "soft", "footer"] as ThemeColorKey[]).map((k) => (
                      <span key={k} className="h-5 w-5 rounded border border-black/10" style={{ background: THEME_PRESETS[p].colors[k] }} />
                    ))}
                  </span>
                  <span className="text-[14px]">{THEME_PRESETS[p].label}</span>
                </label>
              ))}
              <label className="flex items-center gap-3 rounded-md border border-[#e5e7eb] px-3 py-2">
                <input type="radio" name="preset" value="custom" defaultChecked={theme.preset === "custom"} className="h-4 w-4" />
                <span className="text-[14px]">Tự chọn từng màu bên dưới</span>
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {(Object.keys(THEME_COLOR_LABELS) as ThemeColorKey[]).map((k) => (
                <ColorField key={k} name={`color_${k}`} label={THEME_COLOR_LABELS[k]} defaultValue={c[k]} />
              ))}
            </div>
            <p className="mt-3 text-[12px] leading-5 text-lien-muted">Chọn một bộ màu có sẵn thì các ô màu bên dưới bị bỏ qua. Chọn &quot;Tự chọn&quot; rồi bấm ô màu hoặc nhập mã #rrggbb.</p>
          </Card>

          <button type="submit" className={btnPrimary}>
            <Fa name="check" /> Lưu giao diện
          </button>
        </div>

        <div className="space-y-4">
          <p className="m-0 text-[13px] font-semibold text-lien-heading">Xem trước thanh menu</p>
          <div className="overflow-hidden rounded-md border border-[#e5e7eb]">
            <div style={{ background: c.topbar }} className="h-2" />
            <div style={{ background: c.header }} className="flex items-center gap-4 px-4 py-2 text-white">
              <span className="flex flex-col items-center">
                <Image src={theme.logoHeader} alt={theme.shopName} width={110} height={Math.round((110 * LOGO_RATIO.height) / LOGO_RATIO.width)} unoptimized className="h-auto w-[110px]" />
                {theme.slogan ? <span className="mt-0.5 text-[10px] font-semibold tracking-wide">{theme.slogan}</span> : null}
              </span>
              <span className="text-[12px] font-bold uppercase">Danh mục ▾</span>
              <span className="rounded bg-[#ffd93b] px-1.5 py-0.5 text-[10px] font-black leading-tight text-[#c1121f]">
                HOT
                <br />
                SALE
              </span>
              <span className="text-[12px] font-bold uppercase">Hỗ trợ ▾</span>
            </div>
            <div className="space-y-3 bg-white p-4">
              <div className="flex gap-2">
                <span style={{ background: c.primary }} className="rounded px-3 py-1.5 text-[12px] font-bold text-white">
                  THÊM VÀO GIỎ
                </span>
                <span style={{ background: c.soft, color: c.primary, borderColor: c.accent }} className="rounded border px-3 py-1.5 text-[12px] font-semibold">
                  Tab / ô thông tin
                </span>
              </div>
              <p className="m-0 text-[14px]">
                Giá bán: <strong style={{ color: c.price }}>1.250.000đ</strong> · <a style={{ color: c.primary }}>Đường link</a>
              </p>
            </div>
            <div style={{ background: c.footer }} className="px-4 py-3 text-[12px] text-white">
              <Image src={theme.logoLight} alt="" width={90} height={Math.round((90 * LOGO_RATIO.height) / LOGO_RATIO.width)} unoptimized className="mb-1 h-auto w-[90px] rounded bg-white p-1" />
              Chân trang · <span style={{ color: c.accent }}>link hover</span>
            </div>
          </div>
          <div className="rounded-md border border-[#e5e7eb] bg-white p-3">
            <p className="m-0 mb-2 text-[13px] font-semibold text-lien-heading">Icon ứng dụng</p>
            <div className="flex items-center gap-3">
              <Image src={theme.icon} alt="" width={64} height={64} unoptimized className="h-16 w-16 rounded-[14px]" />
              <Image src={theme.icon} alt="" width={32} height={32} unoptimized className="h-8 w-8 rounded-[7px]" />
              <Image src={theme.icon} alt="" width={16} height={16} unoptimized className="h-4 w-4 rounded-[3px]" />
              <span className="text-[12px] text-lien-muted">Màn hình chính · tab trình duyệt</span>
            </div>
          </div>
          <p className="m-0 text-[12px] leading-5 text-lien-muted">
            Bên thiết kế chỉ cần tải ảnh mới lên ở đây, không cần sửa mã nguồn. Ảnh gốc hiện tại nằm trong <code>public/sites/lienstore/brand/</code>.
          </p>
        </div>
      </form>
    </>
  );
}
