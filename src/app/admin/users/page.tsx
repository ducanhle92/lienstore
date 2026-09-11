import Link from "next/link";
import { createUserAction } from "@/app/admin/users/actions";
import { UserFields } from "@/components/sites/lienstore/admin/UserForm";
import { btnPrimary, Card, Flash, PageHeader, tableClass, tdClass, thClass } from "@/components/sites/lienstore/admin/ui";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { requireAdmin, usingDefaultCredentials } from "@/lib/auth";
import { listCustomers } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { ADMIN_MODULES, ROLE_LABELS, type UserRole } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

const ROLE_BADGE: Record<UserRole, string> = {
  admin: "bg-red-100 text-red-800",
  staff: "bg-amber-100 text-amber-800",
  customer: "bg-gray-100 text-gray-700",
};

export default async function AdminUsers({ searchParams }: Props) {
  const me = await requireAdmin("users");
  const sp = await searchParams;
  const q = first(sp.q).trim().toLowerCase();
  const role = first(sp.role) as UserRole | "";
  const users = (await listCustomers()).filter((u) => (!role || u.role === role) && (!q || `${u.username} ${u.email} ${u.firstName} ${u.lastName} ${u.phone} ${u.address}`.toLowerCase().includes(q)));
  const showEmail = (e: string) => (e.endsWith("@no-email.lienstore.local") ? "" : e);
  const counts = { admin: 0, staff: 0, customer: 0 } as Record<UserRole, number>;
  for (const u of await listCustomers()) counts[u.role]++;
  const moduleLabel = Object.fromEntries(ADMIN_MODULES.map((m) => [m.key, m.label]));

  return (
    <>
      <PageHeader
        title="Người dùng"
        subtitle={`${counts.admin} quản trị viên · ${counts.staff} nhân viên · ${counts.customer} khách hàng có tài khoản`}
      />
      {first(sp.saved) ? <Flash>{first(sp.saved)}</Flash> : null}
      {first(sp.error) ? <Flash kind="error">{first(sp.error)}</Flash> : null}
      <Flash kind="warning">
        Tài khoản chủ cửa hàng <strong>{process.env.ADMIN_USER || "admin"}</strong> (đặt trong biến môi trường ADMIN_USER / ADMIN_PASSWORD của app) có toàn quyền thêm, sửa, xoá mọi tài khoản và không hiện trong bảng
        này. Nhân viên / quản trị viên khác đăng nhập bằng <strong>tên đăng nhập (ID) + mật khẩu</strong>, hoặc email nếu có. {usingDefaultCredentials ? "Nó đang dùng mật khẩu mặc định — hãy đổi trong YAML app trên TrueNAS." : "Đổi mật khẩu của nó trong YAML app trên TrueNAS."}
      </Flash>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <Card title="Danh sách tài khoản">
          <form method="get" className="mb-4 flex flex-wrap gap-2">
            <input name="q" defaultValue={first(sp.q)} placeholder="Tìm email, tên, điện thoại, địa chỉ…" className="min-w-[220px] flex-1 rounded-md border border-[#d1d5db] px-3 py-2 text-[14px]" />
            <select name="role" defaultValue={role} className="rounded-md border border-[#d1d5db] bg-white px-3 py-2 text-[14px]">
              <option value="">Mọi vai trò</option>
              <option value="admin">Quản trị viên</option>
              <option value="staff">Nhân viên</option>
              <option value="customer">Khách hàng</option>
            </select>
            <button type="submit" className={btnPrimary}>
              Lọc
            </button>
          </form>
          <div className="overflow-x-auto">
            <table className={tableClass}>
              <thead>
                <tr>
                  <th className={thClass}>Tài khoản</th>
                  <th className={thClass}>Liên hệ</th>
                  <th className={thClass}>Vai trò / quyền</th>
                  <th className={thClass}>Tạo lúc</th>
                  <th className={thClass} />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const name = `${u.lastName} ${u.firstName}`.trim();
                  return (
                    <tr key={u.id} className={cn(!u.active && "opacity-60")}>
                      <td className={tdClass}>
                        <Link href={`/admin/users/${u.id}/`} className="font-semibold text-lien-blue hover:underline">
                          {u.username || showEmail(u.email) || "(không có ID)"}
                        </Link>
                        <div className="text-[12px] text-lien-muted">{name || "—"}{showEmail(u.email) && u.username ? ` · ${showEmail(u.email)}` : ""}</div>
                        {u.customerNo ? <div className="text-[12px] font-semibold text-lien-heading">Mã KH: {u.customerNo}</div> : null}
                        <div className="font-mono text-[11px] text-[#9ca3af]">{u.id}</div>
                        {!u.active ? <span className="mt-1 inline-block rounded-full bg-gray-200 px-2 text-[11px] text-gray-700">Đã khoá</span> : null}
                      </td>
                      <td className={tdClass}>
                        <div>{u.phone || "—"}</div>
                        <div className="max-w-[240px] text-[12px] text-lien-muted">{u.address || "—"}</div>
                      </td>
                      <td className={tdClass}>
                        <span className={cn("inline-block rounded-full px-2.5 py-0.5 text-[12px] font-semibold", ROLE_BADGE[u.role])}>{ROLE_LABELS[u.role]}</span>
                        {u.role === "staff" ? (
                          <div className="mt-1 text-[12px] text-lien-muted">{u.permissions.length ? u.permissions.map((p) => moduleLabel[p] ?? p).join(", ") : "chưa có quyền nào"}</div>
                        ) : null}
                      </td>
                      <td className={cn(tdClass, "whitespace-nowrap text-[13px] text-lien-muted")}>{formatDateTime(u.createdAt)}</td>
                      <td className={cn(tdClass, "text-right whitespace-nowrap")}>
                        <Link href={`/admin/users/${u.id}/`} className="text-[13px] text-lien-blue hover:underline">
                          <Fa name="pencil" /> Sửa
                        </Link>
                      </td>
                    </tr>
                  );
                })}
                {users.length === 0 ? (
                  <tr>
                    <td className={tdClass} colSpan={5}>
                      Không có tài khoản nào khớp.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Tạo tài khoản mới">
          <form action={createUserAction} className="space-y-4">
            <UserFields />
            <button type="submit" className={btnPrimary}>
              <Fa name="plus" /> Tạo tài khoản
            </button>
          </form>
        </Card>
      </div>
    </>
  );
}
