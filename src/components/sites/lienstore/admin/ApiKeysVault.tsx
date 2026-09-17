import Link from "next/link";
import { hideApiKeysAction, revealApiKeysAction } from "@/app/admin/shipping/carrier-actions";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { getAdminSession, secretRevealActive } from "@/lib/auth";
import { getSecretSetting, maskSecret, SECRET_SETTINGS } from "@/lib/secret-store";
import { getDb } from "@/lib/sqlite";
import { adminInput, adminLabel, btnPrimary, btnSecondary, Card } from "./ui";

/**
 * Owner-only: every API key the shop has stored (sealed in the database), masked by default; the full values show for
 * a few minutes after the owner re-enters their login password, so the keys never have to live in a text file.
 */
export async function ApiKeysVault() {
  const session = await getAdminSession();
  if (!session || session.role !== "owner") return null;
  const db = getDb();
  const rows = SECRET_SETTINGS.map((s) => ({ ...s, value: getSecretSetting(db, s.key) }));
  const revealed = await secretRevealActive();
  return (
    <Card className="mb-6" title="Khóa API đã lưu (chỉ chủ cửa hàng thấy thẻ này)" actions={revealed ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">đang hiện đầy đủ · tự ẩn sau 3 phút</span> : null}>
      <div id="api-keys" className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]" data-testid="api-keys-table">
          <thead>
            <tr className="bg-[#f9fafb] text-left text-[11px] font-bold uppercase tracking-wide text-lien-muted">
              <th className="border-b border-[#e5e7eb] px-2 py-2">Khóa</th>
              <th className="border-b border-[#e5e7eb] px-2 py-2">Giá trị</th>
              <th className="border-b border-[#e5e7eb] px-2 py-2">Nhập / sửa ở</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="align-middle" data-testid={`api-key-${r.key}`}>
                <td className="border-b border-[#f3f4f6] px-2 py-2 font-semibold text-lien-heading">{r.label}</td>
                <td className="border-b border-[#f3f4f6] px-2 py-2">
                  {!r.value ? (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">chưa có</span>
                  ) : revealed ? (
                    <input readOnly value={r.value} className={`${adminInput} !py-1 font-mono !text-[12px]`} aria-label={`${r.label} (đầy đủ)`} />
                  ) : (
                    <span className="font-mono text-lien-text">{maskSecret(r.value)}</span>
                  )}
                </td>
                <td className="border-b border-[#f3f4f6] px-2 py-2">
                  <Link href={r.href} className="text-lien-blue">
                    {r.where}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {revealed ? (
        <form action={hideApiKeysAction} className="mt-3">
          <button type="submit" className={btnSecondary}>
            <Fa name="eye-slash" /> Ẩn lại
          </button>
        </form>
      ) : (
        <form action={revealApiKeysAction} className="mt-3 flex flex-wrap items-end gap-2" data-testid="reveal-form">
          <div className="min-w-[240px]">
            <label className={adminLabel} htmlFor="reveal-pass">
              Mật khẩu đăng nhập của bạn
            </label>
            <input id="reveal-pass" name="password" type="password" autoComplete="current-password" required className={adminInput} placeholder="nhập lại để hiện khóa đầy đủ" />
          </div>
          <button type="submit" className={btnPrimary}>
            <Fa name="eye" /> Hiện khóa đầy đủ
          </button>
        </form>
      )}
      <p className="mt-2 text-[12px] leading-5 text-lien-muted">Khóa được mã hóa (AES-256-GCM) trong cơ sở dữ liệu máy chủ và chỉ giải mã khi gọi hãng vận chuyển / Facebook. Bình thường chỉ hiện 4 ký tự cuối; cần sao chép lại thì nhập mật khẩu đăng nhập — khóa hiện đầy đủ 3 phút rồi tự ẩn. Tài khoản quản trị khác không thấy thẻ này.</p>
    </Card>
  );
}
