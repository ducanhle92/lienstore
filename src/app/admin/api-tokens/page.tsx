import { redirect } from "next/navigation";
import { revokeApiTokenAction } from "@/app/admin/api-tokens/actions";
import { ApiTokenCreateForm } from "@/components/sites/lienstore/admin/ApiTokenCreateForm";
import { ConfirmSubmit } from "@/components/sites/lienstore/admin/ConfirmSubmit";
import { Card, Flash, PageHeader, tableClass, tdClass, thClass } from "@/components/sites/lienstore/admin/ui";
import { requireAdmin } from "@/lib/auth";
import { listApiTokens, listAudit } from "@/lib/api-tokens";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const STATE_LABEL = { active: "Đang dùng", expired: "Hết hạn", revoked: "Đã thu hồi" } as const;
const STATE_CLASS = { active: "bg-green-100 text-green-800", expired: "bg-gray-100 text-gray-700", revoked: "bg-red-100 text-red-800" } as const;

/** Admin › Cài đặt web › API tokens — Bearer tokens for the Admin API v1 / CLI `lienstore` (owner & admin only). */
export default async function ApiTokensPage({ searchParams }: Props) {
  const me = await requireAdmin("users");
  if (me.role !== "owner" && me.role !== "admin") redirect("/admin/?denied=users");
  const sp = await searchParams;
  const tokens = await listApiTokens();
  const audit = (await listAudit({ limit: 30 })).filter((a) => !a.action.startsWith("token."));
  return (
    <>
      <PageHeader title="API tokens" subtitle="Cho agent / CLI `lienstore` thao tác sản phẩm qua /api/admin/v1 mà không cần mở trình duyệt. Token hoạt động với quyền của tài khoản đã cấp nó." />
      {first(sp.saved) ? <Flash>{first(sp.saved)}</Flash> : null}
      {first(sp.error) ? <Flash kind="error">{first(sp.error)}</Flash> : null}
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card title="Token đã cấp">
            <div className="overflow-x-auto">
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th className={thClass}>Tên / mã đầu</th>
                    <th className={thClass}>Quyền</th>
                    <th className={thClass}>Của</th>
                    <th className={thClass}>Hết hạn</th>
                    <th className={thClass}>Dùng lần cuối</th>
                    <th className={thClass}>Trạng thái</th>
                    <th className={thClass} />
                  </tr>
                </thead>
                <tbody>
                  {tokens.length === 0 ? (
                    <tr>
                      <td className={tdClass} colSpan={7}>
                        Chưa có token nào.
                      </td>
                    </tr>
                  ) : null}
                  {tokens.map((t) => (
                    <tr key={t.id}>
                      <td className={tdClass}>
                        <div className="font-medium">{t.name}</div>
                        <code className="text-[12px] text-lien-muted">{t.prefix}…</code>
                      </td>
                      <td className={tdClass}>
                        <div className="flex flex-col gap-0.5 text-[12px]">
                          {t.scopes.map((s) => (
                            <code key={s}>{s}</code>
                          ))}
                        </div>
                      </td>
                      <td className={tdClass}>
                        <div className="text-[13px]">{t.ownerLabel}</div>
                        <div className="text-[12px] text-lien-muted">cấp {formatDateTime(t.createdAt)}</div>
                      </td>
                      <td className={tdClass}>{t.expiresAt ? formatDateTime(t.expiresAt) : "Không"}</td>
                      <td className={tdClass}>{t.lastUsedAt ? formatDateTime(t.lastUsedAt) : "—"}</td>
                      <td className={tdClass}>
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${STATE_CLASS[t.state]}`}>{STATE_LABEL[t.state]}</span>
                        {t.revokedAt ? <div className="text-[12px] text-lien-muted">{t.revokedBy}</div> : null}
                      </td>
                      <td className={tdClass}>
                        {t.state !== "revoked" ? (
                          <form action={revokeApiTokenAction}>
                            <input type="hidden" name="id" value={t.id} />
                            <ConfirmSubmit message={`Thu hồi token “${t.name}”? Agent/CLI dùng token này sẽ bị từ chối ngay.`} className="text-[13px] text-lien-heart hover:underline">
                              Thu hồi
                            </ConfirmSubmit>
                          </form>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Card title="Nhật ký ghi qua API (30 gần nhất)">
            <div className="overflow-x-auto">
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th className={thClass}>Lúc</th>
                    <th className={thClass}>Ai</th>
                    <th className={thClass}>Thao tác</th>
                    <th className={thClass}>Đối tượng</th>
                    <th className={thClass}>Trường đổi</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.map((a) => (
                    <tr key={a.id}>
                      <td className={tdClass}>{formatDateTime(a.at)}</td>
                      <td className={tdClass}>{a.actor}</td>
                      <td className={tdClass}>
                        <code className="text-[12px]">{a.action}</code>
                      </td>
                      <td className={tdClass}>{a.target}</td>
                      <td className={tdClass}>
                        <span className="text-[12px]">{a.changes && typeof a.changes === "object" ? Object.keys(a.changes).join(", ") : ""}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
        <Card title="Cấp token mới">
          <ApiTokenCreateForm />
          <p className="mt-4 text-[12px] leading-5 text-lien-muted">
            Chỉ lưu bản băm (SHA-256) của token. Mất token thì thu hồi và cấp lại. Hướng dẫn CLI: <code>docs/ADMIN_API.md</code>.
          </p>
        </Card>
      </div>
    </>
  );
}
