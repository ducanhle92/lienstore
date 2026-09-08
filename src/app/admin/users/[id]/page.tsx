import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteUserAction, updateUserAction } from "@/app/admin/users/actions";
import { ConfirmSubmit } from "@/components/sites/lienstore/admin/ConfirmSubmit";
import { UserFields } from "@/components/sites/lienstore/admin/UserForm";
import { btnDanger, btnPrimary, btnSecondary, Card, Flash, PageHeader } from "@/components/sites/lienstore/admin/ui";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { requireAdmin } from "@/lib/auth";
import { getCustomerById, getOrdersForCustomer } from "@/lib/db";
import { formatDateTime, formatPrice } from "@/lib/format";
import { ROLE_LABELS } from "@/lib/permissions";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function EditUser({ params, searchParams }: Props) {
  const me = await requireAdmin("users");
  const { id } = await params;
  const sp = await searchParams;
  const user = await getCustomerById(id);
  if (!user) notFound();
  const orders = await getOrdersForCustomer(user);
  const isSelf = me.id === user.id;
  const name = `${user.lastName} ${user.firstName}`.trim();

  return (
    <>
      <PageHeader
        title={name || user.email}
        subtitle={`${ROLE_LABELS[user.role]} · ${user.email} · tạo ${formatDateTime(user.createdAt)}`}
        back={{ href: "/admin/users/", label: "Người dùng" }}
        actions={
          orders.length ? (
            <Link href={`/admin/customers/${encodeURIComponent(`c:${user.id}`)}/`} className={btnSecondary}>
              <Fa name="shopping-cart" /> {orders.length} đơn · {formatPrice(orders.reduce((s, o) => s + o.total, 0))}
            </Link>
          ) : null
        }
      />
      {first(sp.saved) ? <Flash>{first(sp.saved)}</Flash> : null}
      {first(sp.error) ? <Flash kind="error">{first(sp.error)}</Flash> : null}

      <Card title="Thông tin tài khoản">
        <form action={updateUserAction} className="space-y-5">
          <input type="hidden" name="id" value={user.id} />
          <UserFields user={{ id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, phone: user.phone, address: user.address, role: user.role, permissions: user.permissions, active: user.active }} isSelf={isSelf} />
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" className={btnPrimary}>
              <Fa name="check" /> Lưu thay đổi
            </button>
            <Link href="/admin/users/" className={btnSecondary}>
              Huỷ
            </Link>
          </div>
        </form>
      </Card>

      {!isSelf ? (
        <form action={deleteUserAction} className="mt-8 border-t border-[#e5e7eb] pt-6">
          <input type="hidden" name="id" value={user.id} />
          <ConfirmSubmit message={`Xoá tài khoản ${user.email}? Đơn hàng đã đặt vẫn được giữ (không còn gắn với tài khoản). Không thể hoàn tác.`} className={btnDanger}>
            <Fa name="trash" /> Xoá tài khoản
          </ConfirmSubmit>
          <p className="mt-2 text-[12px] text-lien-muted">Muốn chặn đăng nhập tạm thời thì bỏ tick &quot;Đang hoạt động&quot; và lưu, thay vì xoá.</p>
        </form>
      ) : null}
    </>
  );
}
