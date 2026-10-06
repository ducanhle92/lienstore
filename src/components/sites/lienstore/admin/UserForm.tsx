"use client";

import { useState } from "react";
import { adminInput, adminLabel } from "./ui";
import { ADMIN_MODULES, effectivePermissions, PERMISSION_PRESETS, PERMISSION_TABS, ROLE_LABELS, type UserRole } from "@/lib/permissions";
import { cn } from "@/lib/utils";

interface Props {
  /** Existing user (edit) or undefined (create). */
  user?: { id: string; email: string; username: string; firstName: string; lastName: string; phone: string; address: string; role: UserRole; permissions: string[]; active: boolean };
  /** The signed-in admin edits themselves → role/active locked. */
  isSelf?: boolean;
  /** Roles the signed-in account may assign (owner: customer/staff/admin; admin: customer/staff). */
  assignable?: UserRole[];
}

/** Shared fields of the create / edit user forms (no <form> element; the page supplies the action and buttons). */
export function UserFields({ user, isSelf = false, assignable = ["staff"] }: Props) {
  const [role, setRole] = useState<UserRole>(user?.role ?? "staff");
  // ticks start from what the account can do today (a pre-2.25 "Kho hàng" grant shows as every warehouse screen)
  const [perms, setPerms] = useState<Set<string>>(() => new Set(user ? effectivePermissions("staff", user.permissions).filter((p) => p !== "inventory") : []));
  const toggle = (k: string) => setPerms((p) => {
    const n = new Set(p);
    if (n.has(k)) n.delete(k);
    else n.add(k);
    return n;
  });
  const moduleOf = Object.fromEntries(ADMIN_MODULES.map((m) => [m.key, m]));
  const lockedRole = isSelf || user?.role === "owner";
  const roleOptions = Array.from(new Set<UserRole>([...(user ? [user.role] : []), ...assignable]));
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
          <label className={adminLabel} htmlFor="username">
            Tên đăng nhập (ID) {role === "customer" ? "" : "*"}
          </label>
          <input id="username" name="username" defaultValue={user?.username} placeholder="vd: lan.nv" pattern="[A-Za-z0-9._-]{3,32}" required={role !== "customer"} autoComplete="off" className={adminInput} />
          <p className="mt-1 text-[12px] text-lien-muted">Nhân viên / quản trị viên đăng nhập bằng ID này + mật khẩu.</p>
        </div>
        <div>
          <label className={adminLabel} htmlFor="email">
            Email {role === "customer" ? "*" : "(tuỳ chọn)"}
          </label>
          <input id="email" name="email" type="email" defaultValue={user && !user.email.endsWith("@no-email.lienstore.local") ? user.email : ""} autoComplete="off" className={adminInput} />
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
          {roleOptions.map((r) => (
            <label key={r} className={cn("inline-flex items-center gap-2 text-[14px]", lockedRole && r !== user?.role && "opacity-50")}>
              <input type="radio" name="role" value={r} checked={role === r} disabled={lockedRole && r !== user?.role} onChange={() => setRole(r)} className="h-4 w-4" />
              {ROLE_LABELS[r]}
            </label>
          ))}
        </div>
        <p className="mt-2 text-[12px] leading-5 text-lien-muted">
          Nhân viên: chỉ vào được các màn được tick bên dưới, và chỉ thấy tiền khi tick nhóm “Xem tiền”. Quản trị viên: toàn quyền với cửa hàng, quản lý nhân viên và khách hàng. Chủ sở hữu: như quản trị viên và là người duy nhất thêm / sửa / xoá quản trị viên.
        </p>
        <div className={cn("mt-3 space-y-3", role !== "staff" && "pointer-events-none opacity-40")} data-testid="perm-picker">
          <div className="flex flex-wrap items-center gap-2 text-[12px]">
            <span className="font-semibold text-[#374151]">Mẫu nhanh:</span>
            {PERMISSION_PRESETS.map((p) => (
              <button key={p.key} type="button" onClick={() => setPerms(new Set(p.keys))} disabled={role !== "staff"} title={p.hint} className="rounded-full border border-lien-blue px-2.5 py-0.5 font-semibold text-lien-blue hover:bg-lien-blue hover:text-white" data-testid={`preset-${p.key}`}>
                {p.label}
              </button>
            ))}
            <button type="button" onClick={() => setPerms(new Set())} disabled={role !== "staff"} className="rounded-full border border-[#d1d5db] px-2.5 py-0.5 text-lien-muted hover:border-lien-heart hover:text-lien-heart">
              Bỏ hết
            </button>
          </div>
          {PERMISSION_TABS.map((tab) => (
            <div key={tab.label} className={cn("rounded-md border px-3 py-2", tab.label === "Xem tiền" ? "border-amber-300 bg-amber-50/50" : "border-[#e5e7eb]")}>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-[13px] font-bold text-lien-heading">{tab.label}</span>
                <button type="button" onClick={() => setPerms((p) => { const n = new Set(p); const all = tab.keys.every((k) => n.has(k)); for (const k of tab.keys) { if (all) n.delete(k); else n.add(k); } return n; })} disabled={role !== "staff"} className="text-[11px] text-lien-blue hover:underline">
                  {tab.keys.every((k) => perms.has(k)) ? "bỏ cả tab" : "chọn cả tab"}
                </button>
              </div>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {tab.keys.map((k) => {
                  const m = moduleOf[k];
                  if (!m) return null;
                  return (
                    <label key={k} className="flex items-start gap-2 text-[13px]">
                      <input type="checkbox" name="permissions" value={k} checked={perms.has(k)} onChange={() => toggle(k)} disabled={role !== "staff"} className="mt-0.5 h-4 w-4" data-testid={`perm-${k}`} />
                      <span>
                        <span className="font-semibold text-lien-heading">{m.label}</span>
                        <span className="block text-[11px] leading-4 text-lien-muted">{m.description}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <label className={cn("mt-4 inline-flex items-center gap-2 text-[14px]", isSelf && "opacity-50")}>
          <input type="checkbox" name="active" defaultChecked={user?.active ?? true} disabled={lockedRole} className="h-4 w-4" /> Đang hoạt động (bỏ tick để khoá đăng nhập mà không xoá)
        </label>
        {isSelf ? <p className="mt-1 text-[12px] text-lien-muted">Bạn đang sửa chính tài khoản của mình nên không thể tự hạ quyền hoặc tự khoá.</p> : null}
      </fieldset>
    </div>
  );
}
