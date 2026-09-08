"use client";

import { useActionState } from "react";
import { login, type LoginState } from "@/app/admin/actions";
import { adminInput, adminLabel, btnPrimary, Flash } from "./ui";

export function LoginForm({ showDefaultHint }: { showDefaultHint: boolean }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, null);
  return (
    <form action={action} className="w-full max-w-sm rounded-lg border border-[#e5e7eb] bg-white p-8 shadow-sm">
      <h1 className="mb-1 font-oswald text-[26px] leading-8 text-lien-heading">LienStore · Quản trị</h1>
      <p className="mb-6 text-[14px] leading-5 text-lien-muted">Đăng nhập để quản lý sản phẩm và đơn hàng.</p>
      {state?.error ? <Flash kind="error">{state.error}</Flash> : null}
      {showDefaultHint ? (
        <Flash kind="warning">
          Đang dùng tài khoản mặc định <strong>admin / admin123</strong>. Đặt ADMIN_USER và ADMIN_PASSWORD trong .env.local để đổi.
        </Flash>
      ) : null}
      <label className={adminLabel} htmlFor="user">
        Tên đăng nhập hoặc email
      </label>
      <input id="user" name="user" autoComplete="username" required className={`${adminInput} mb-4`} />
      <label className={adminLabel} htmlFor="password">
        Mật khẩu
      </label>
      <input id="password" name="password" type="password" autoComplete="current-password" required className={`${adminInput} mb-6`} />
      <button type="submit" disabled={pending} className={`${btnPrimary} w-full justify-center`}>
        {pending ? "Đang đăng nhập…" : "Đăng nhập"}
      </button>
    </form>
  );
}
