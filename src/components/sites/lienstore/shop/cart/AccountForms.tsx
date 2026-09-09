"use client";

import { useActionState } from "react";
import Link from "next/link";
import { customerLogin, customerRegister, lostPassword, updateAccountDetails, type AccountFormState } from "@/app/my-account/actions";
import type { PublicCustomer } from "@/lib/db";
import { displayEmail } from "@/lib/customer-email";
import { cn } from "@/lib/utils";
import { Required, WooHeading, WooNotice, wooButtonClass, wooInputClass } from "./WooUi";

const BOX = "woocommerce-form mb-8 rounded-[5px] border border-lien-blue p-5";
const LABEL = "mb-2 block text-[16px] font-semibold leading-8 text-lien-input-text";

/** WooCommerce "Đăng nhập" + "Đăng ký" boxes shown to guests on /my-account/. */
export function LoginRegisterForms() {
  const [loginState, loginAction, loginPending] = useActionState<AccountFormState, FormData>(customerLogin, null);
  const [regState, regAction, regPending] = useActionState<AccountFormState, FormData>(customerRegister, null);

  return (
    <div className="woocommerce">
      <WooHeading as="h3">Đăng nhập</WooHeading>
      {loginState?.error ? <WooNotice kind="error">{loginState.error}</WooNotice> : null}
      <form action={loginAction} className={cn(BOX, "woocommerce-form-login login")}>
        <p className="form-row mb-4">
          <label htmlFor="username" className={LABEL}>
            Tên đăng nhập (ID) hoặc email <Required />
          </label>
          <input id="username" name="username" type="text" autoComplete="username" required className={wooInputClass} />
        </p>
        <p className="form-row mb-4">
          <label htmlFor="password" className={LABEL}>
            Mật khẩu <Required />
          </label>
          <input id="password" name="password" type="password" autoComplete="current-password" required className={wooInputClass} />
        </p>
        <p className="form-row mb-3 flex flex-wrap items-center gap-4">
          <button type="submit" disabled={loginPending} className={cn(wooButtonClass, "font-arial")}>
            {loginPending ? "Đang đăng nhập…" : "Đăng nhập"}
          </button>
          <label className="inline-flex items-center gap-2 text-[16px] font-semibold text-lien-input-text">
            <input type="checkbox" name="rememberme" className="h-4 w-4" /> Ghi nhớ mật khẩu
          </label>
        </p>
        <p className="woocommerce-LostPassword">
          <Link href="/my-account/lost-password/" className="text-lien-muted hover:text-lien-blue">
            Quên mật khẩu?
          </Link>
        </p>
      </form>

      <WooHeading as="h3">Đăng ký</WooHeading>
      {regState?.error ? <WooNotice kind="error">{regState.error}</WooNotice> : null}
      <form action={regAction} className={cn(BOX, "woocommerce-form-register register")}>
        <div className="flex flex-wrap justify-between">
          <p className="form-row mb-4 w-full sm:w-[47%]">
            <label htmlFor="reg_first_name" className={LABEL}>
              Tên đệm &amp; tên
            </label>
            <input id="reg_first_name" name="first_name" autoComplete="given-name" className={wooInputClass} />
          </p>
          <p className="form-row mb-4 w-full sm:w-[47%]">
            <label htmlFor="reg_last_name" className={LABEL}>
              Họ
            </label>
            <input id="reg_last_name" name="last_name" autoComplete="family-name" className={wooInputClass} />
          </p>
        </div>
        <p className="form-row mb-4">
          <label htmlFor="reg_username" className={LABEL}>
            Tên đăng nhập (ID) <Required />
          </label>
          <input id="reg_username" name="username" autoComplete="username" required pattern="[A-Za-z0-9._-]{3,30}" title="3–30 ký tự: chữ không dấu, số, dấu chấm, gạch dưới" className={wooInputClass} />
          <span className="mt-1 block text-[13px] text-lien-muted">3–30 ký tự: chữ không dấu, số, dấu chấm, gạch ngang, gạch dưới. Dùng để đăng nhập.</span>
        </p>
        <p className="form-row mb-4">
          <label htmlFor="reg_email" className={LABEL}>
            Địa chỉ email <span className="font-normal text-lien-muted">(không bắt buộc)</span>
          </label>
          <input id="reg_email" name="email" type="email" autoComplete="email" className={wooInputClass} />
        </p>
        <p className="form-row mb-4">
          <label htmlFor="reg_password" className={LABEL}>
            Mật khẩu <Required />
          </label>
          <input id="reg_password" name="password" type="password" autoComplete="new-password" required minLength={6} className={wooInputClass} />
        </p>
        <p className="mb-4 text-[16px] leading-6 text-lien-text">
          Thông tin cá nhân của bạn chỉ được dùng để hỗ trợ trải nghiệm mua hàng và quản lý tài khoản trên website này, theo{" "}
          <Link href="/privacy-policy/" className="text-lien-muted hover:text-lien-blue">
            chính sách bảo mật
          </Link>
          .
        </p>
        <p className="form-row">
          <button type="submit" disabled={regPending} className={cn(wooButtonClass, "font-arial")}>
            {regPending ? "Đang tạo tài khoản…" : "Đăng ký"}
          </button>
        </p>
      </form>
    </div>
  );
}

export function LostPasswordForm() {
  const [state, action, pending] = useActionState<AccountFormState, FormData>(lostPassword, null);
  return (
    <div className="woocommerce">
      {state?.error ? <WooNotice kind="error">{state.error}</WooNotice> : null}
      {state?.message ? <WooNotice kind="message">{state.message}</WooNotice> : null}
      <form action={action} className={cn(BOX, "woocommerce-ResetPassword lost_reset_password")}>
        <p className="mb-4 text-[16px] leading-6">Quên mật khẩu? Vui lòng nhập tên tài khoản hoặc địa chỉ email. Bạn sẽ nhận được một liên kết tạo mật khẩu mới qua email.</p>
        <p className="form-row mb-4">
          <label htmlFor="user_login" className={LABEL}>
            Tên tài khoản hoặc email <Required />
          </label>
          <input id="user_login" name="user_login" type="text" required className={wooInputClass} />
        </p>
        <p className="form-row">
          <button type="submit" disabled={pending} className={cn(wooButtonClass, "font-arial")}>
            Đặt lại mật khẩu
          </button>
        </p>
      </form>
    </div>
  );
}

export function AccountDetailsForm({ customer }: { customer: PublicCustomer }) {
  const [state, action, pending] = useActionState<AccountFormState, FormData>(updateAccountDetails, null);
  return (
    <form action={action} className="woocommerce-EditAccountForm edit-account">
      {state?.error ? <WooNotice kind="error">{state.error}</WooNotice> : null}
      {state?.message ? <WooNotice kind="message">{state.message}</WooNotice> : null}
      <div className="flex flex-wrap justify-between">
        <p className="form-row mb-4 w-full sm:w-[47%]">
          <label htmlFor="account_first_name" className={LABEL}>
            Tên <Required />
          </label>
          <input id="account_first_name" name="account_first_name" defaultValue={customer.firstName} required className={wooInputClass} />
        </p>
        <p className="form-row mb-4 w-full sm:w-[47%]">
          <label htmlFor="account_last_name" className={LABEL}>
            Họ <Required />
          </label>
          <input id="account_last_name" name="account_last_name" defaultValue={customer.lastName} required className={wooInputClass} />
        </p>
      </div>
      <p className="form-row mb-4">
        <label htmlFor="account_email" className={LABEL}>
          Địa chỉ email
        </label>
        <input id="account_email" value={displayEmail(customer.email) || "(chưa có email · đăng nhập bằng ID " + customer.username + ")"} readOnly className={cn(wooInputClass, "bg-[#f7f6f7]")} />
      </p>
      <p className="form-row mb-4">
        <label htmlFor="account_phone" className={LABEL}>
          Số điện thoại
        </label>
        <input id="account_phone" name="account_phone" type="tel" defaultValue={customer.phone} className={wooInputClass} />
      </p>
      <p className="form-row mb-6">
        <label htmlFor="account_address" className={LABEL}>
          Địa chỉ
        </label>
        <input id="account_address" name="account_address" defaultValue={customer.address} className={wooInputClass} />
      </p>
      <fieldset className="mb-6 rounded-[5px] border border-lien-input-border p-4">
        <legend className="px-2 font-semibold">Thay đổi mật khẩu</legend>
        <p className="form-row mb-4">
          <label htmlFor="password_current" className={LABEL}>
            Mật khẩu hiện tại (để trống nếu không đổi)
          </label>
          <input id="password_current" name="password_current" type="password" autoComplete="current-password" className={wooInputClass} />
        </p>
        <p className="form-row mb-4">
          <label htmlFor="password_1" className={LABEL}>
            Mật khẩu mới (để trống nếu không đổi)
          </label>
          <input id="password_1" name="password_1" type="password" autoComplete="new-password" className={wooInputClass} />
        </p>
        <p className="form-row">
          <label htmlFor="password_2" className={LABEL}>
            Xác nhận mật khẩu mới
          </label>
          <input id="password_2" name="password_2" type="password" autoComplete="new-password" className={wooInputClass} />
        </p>
      </fieldset>
      <button type="submit" disabled={pending} className={cn(wooButtonClass, "font-arial")}>
        {pending ? "Đang lưu…" : "Lưu thay đổi"}
      </button>
    </form>
  );
}
