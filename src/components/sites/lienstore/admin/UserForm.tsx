"use client";

import { useState } from "react";
import { adminInput, adminLabel } from "./ui";
import { ADMIN_MODULES, ROLE_LABELS, type UserRole } from "@/lib/permissions";
import { cn } from "@/lib/utils";

interface Props {
  /** Existing user (edit) or undefined (create). */
  user?: { id: string; email: string; firstName: string; lastName: string; phone: string; address: string; role: UserRole; permissions: string[]; active: boolean };
  /** The signed-in admin edits themselves → role/active locked. */
  isSelf?: boolean;
}

/** Shared fields of the create / edit user forms (no <form> element; the page supplies the action and buttons). */
export function UserFields({ user, isSelf = false }: Props) {
  const [role, setRole] = useState<UserRole>(user?.role ?? "customer");
  const isEdit = !!user;
  return (
    <div className="grid gap-4">
      {isEdit ? (
        <div>
          <label className={adminLabel}>ID tài khoản (hệ thống tự sinh, không đổi được)</label>
          <input value={user.id} readOnly className={cn(adminInput, "bg-[#f9fafb] font-mono text-[12px] text-lien-muted")} onFocus={(e) => e.target.select()} />
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={adminLabel} htmlFor="email">
            Email (dùng để đăng nhập) *
          </label>
          <input id="email" name="email" type="email" required defaultValue={user?.email} autoComplete="off" className={adminInput} />
        </div>
        <div>
          <label className={adminLabel} htmlFor="password">
            {isEdit ? "Mật khẩu mới (để trống nếu không đổi)" : "Mật khẩu * (≥ 8 ký tự)"}
          </label>
          <input id="password" name="password" type="password" minLength={isEdit ? undefined : 8} required={!isEdit} autoComplete="new-password" className={adminInput} />
        </div>
        <div>
          <label className={adminLabel} htmlFor="lastName">
            Họ
          </label>
          <input id="lastName" name="lastName" defaultValue={user?.lastName} className={adminInput} />
        </div>
        <div>
          <label className={adminLabel} htmlFor="firstName">
            Tên
          </label>
          <input id="firstName" name="firstName" defaultValue={user?.firstName} className={adminInput} />
        </div>
        <div>
          <label className={adminLabel} htmlFor="phone">
            Điện thoại
          </label>
          <input id="phone" name="phone" defaultValue={user?.phone} className={adminInput} />
        </div>
        <div>
          <label className={adminLabel} htmlFor="address">
            Địa chỉ
          </label>
          <input id="address" name="address" defaultValue={user?.address} className={adminInput} />
        </div>
      </div>

      <fieldset className="rounded-md border border-[#e5e7eb] p-4">
        <legend className="px-1 text-[13px] font-semibold text-[#374151]">Vai trò & quyền</legend>
        <div className="flex flex-wrap gap-4">
          {(["customer", "staff", "admin"] as UserRole[]).map((r) => (
            <label key={r} className={cn("inline-flex items-center gap-2 text-[14px]", isSelf && r !== "admin" && "opacity-50")}>
              <input type="radio" name="role" value={r} checked={role === r} disabled={isSelf && r !== "admin"} onChange={() => setRole(r)} className="h-4 w-4" />
              {ROLE_LABELS[r]}
            </label>
          ))}
        </div>
        <p className="mt-2 text-[12px] leading-5 text-lien-muted">
          Khách hàng: chỉ mua hàng, không vào được trang quản trị. Nhân viên: vào các module được tick bên dưới. Quản trị viên: toàn quyền, kể cả quản lý người dùng.
        </p>
        <div className={cn("mt-3 grid gap-2 sm:grid-cols-2", role !== "staff" && "pointer-events-none opacity-40")}>
          {ADMIN_MODULES.filter((m) => m.key !== "users").map((m) => (
            <label key={m.key} className="flex items-start gap-2 rounded border border-[#e5e7eb] px-3 py-2 text-[13px]">
              <input type="checkbox" name="permissions" value={m.key} defaultChecked={user?.permissions.includes(m.key) ?? false} disabled={role !== "staff"} className="mt-0.5 h-4 w-4" />
              <span>
                <span className="font-semibold text-lien-heading">{m.label}</span>
                <span className="block text-[12px] text-lien-muted">{m.description}</span>
              </span>
            </label>
          ))}
        </div>
        <label className={cn("mt-4 inline-flex items-center gap-2 text-[14px]", isSelf && "opacity-50")}>
          <input type="checkbox" name="active" defaultChecked={user?.active ?? true} disabled={isSelf} className="h-4 w-4" /> Đang hoạt động (bỏ tick để khoá đăng nhập mà không xoá)
        </label>
        {isSelf ? <p className="mt-1 text-[12px] text-lien-muted">Bạn đang sửa chính tài khoản của mình nên không thể tự hạ quyền hoặc tự khoá.</p> : null}
      </fieldset>
    </div>
  );
}
