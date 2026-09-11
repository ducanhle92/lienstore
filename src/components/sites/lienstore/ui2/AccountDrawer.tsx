"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { customerLogin, customerLogout, customerRegister, type AccountFormState } from "@/app/my-account/actions";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { PasswordInput } from "@/components/sites/lienstore/shared/PasswordInput";
import { useLang } from "@/components/sites/lienstore/shared/LangProvider";
import { cn } from "@/lib/utils";

/** What the header needs to know about the signed-in customer (nothing sensitive). */
export interface HeaderCustomer {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  customer: HeaderCustomer | null;
}

const input = "block h-11 w-full rounded-md border border-[#111] bg-white px-3 text-[15px] text-lien-text outline-none focus:border-lien-blue focus:ring-2 focus:ring-lien-blue/20";
const label = "mb-1.5 block text-[14px] text-lien-text";
const primary = "flex h-11 w-full items-center justify-center rounded-full bg-lien-blue text-[13px] font-bold uppercase tracking-[1px] text-white hover:bg-lien-blue-hover disabled:opacity-60";
const Req = () => <span className="text-lien-heart"> *</span>;

/**
 * Right-hand account panel opened from the header user icon: login (ID or email) · register (ID required,
 * email optional) · or, when signed in, a short menu. Stays on the current page after a successful submit.
 */
export function AccountDrawer({ open, onClose, customer }: Props) {
  const { t } = useLang();
  const pathname = usePathname();
  const [view, setView] = useState<"login" | "register">("login");
  const [loginState, loginAction, loginPending] = useActionState<AccountFormState, FormData>(customerLogin, null);
  const [regState, regAction, regPending] = useActionState<AccountFormState, FormData>(customerRegister, null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  const title = customer ? t("myAccount") : view === "login" ? t("login") : t("register");
  const name = customer ? `${customer.lastName} ${customer.firstName}`.trim() || customer.username || customer.email : "";

  return (
    <div className="fixed inset-0 z-[9600]" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label={t("close")} onClick={onClose} className="absolute inset-0 bg-black/50" />
      <aside className="absolute top-0 right-0 flex h-full w-[92%] max-w-[360px] flex-col bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-lien-line px-5 py-4">
          <h2 className="m-0 text-[16px] font-bold uppercase tracking-[0.5px] text-lien-heading">{title}</h2>
          <button type="button" onClick={onClose} aria-label={t("close")} className="flex h-9 w-9 items-center justify-center rounded-full text-[18px] text-lien-heading hover:bg-lien-cream">
            <Fa name="times" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {customer ? (
            <div className="space-y-1 text-[15px]">
              <p className="mb-4 text-lien-text">
                {t("hello")}, <strong className="text-lien-heading">{name}</strong>
                {customer.username ? <span className="block text-[13px] text-lien-muted">ID: {customer.username}</span> : null}
              </p>
              {[
                { href: "/my-account/", label: t("myAccount"), icon: "user-circle" as const },
                { href: "/my-account/?tab=orders", label: t("myOrders"), icon: "shopping-bag" as const },
                { href: "/wishlist/", label: t("wishlist"), icon: "heart-o" as const },
                { href: "/cart/", label: t("cart"), icon: "shopping-cart" as const },
              ].map((l) => (
                <Link key={l.href} href={l.href} onClick={onClose} className="flex items-center gap-3 rounded-md px-2 py-2.5 text-lien-text no-underline hover:bg-lien-cream hover:text-lien-blue">
                  <Fa name={l.icon} className="w-5 text-center text-lien-muted" />
                  {l.label}
                </Link>
              ))}
              <form action={customerLogout} className="mt-4 border-t border-lien-line pt-4">
                <input type="hidden" name="redirect_to" value={pathname} />
                <button type="submit" className="flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left text-lien-text hover:bg-lien-cream hover:text-lien-blue">
                  <Fa name="sign-out" className="w-5 text-center text-lien-muted" />
                  {t("logout")}
                </button>
              </form>
            </div>
          ) : view === "login" ? (
            <form action={loginAction} className="space-y-4">
              <input type="hidden" name="redirect_to" value={pathname} />
              {loginState?.error ? <p className="m-0 rounded-md border border-[#f5c2c7] bg-[#fde8ea] px-3 py-2 text-[13px] text-[#842029]">{loginState.error}</p> : null}
              <div>
                <label htmlFor="drawer-login" className={label}>
                  {t("loginId")}
                  <Req />
                </label>
                <input id="drawer-login" name="username" autoComplete="username" required className={input} />
              </div>
              <div>
                <label htmlFor="drawer-password" className={label}>
                  {t("password")}
                  <Req />
                </label>
                <PasswordInput id="drawer-password" name="password" autoComplete="current-password" required className={input} />
              </div>
              <button type="submit" disabled={loginPending} className={primary}>
                {loginPending ? t("loggingIn") : t("login")}
              </button>
              <p className="m-0 pt-2 text-[14px] text-lien-text">
                {t("newCustomer")}{" "}
                <button type="button" onClick={() => setView("register")} className="font-medium text-lien-heading underline-offset-2 hover:underline">
                  {t("createAccount")}
                </button>
              </p>
              <p className="m-0 text-[14px] text-lien-text">
                {t("forgot")}{" "}
                <Link href="/my-account/lost-password/" onClick={onClose} className="font-medium text-lien-heading no-underline underline-offset-2 hover:underline">
                  {t("recover")}
                </Link>
              </p>
            </form>
          ) : (
            <form action={regAction} className="space-y-4">
              <input type="hidden" name="redirect_to" value={pathname} />
              {regState?.error ? <p className="m-0 rounded-md border border-[#f5c2c7] bg-[#fde8ea] px-3 py-2 text-[13px] text-[#842029]">{regState.error}</p> : null}
              <div>
                <label htmlFor="drawer-first" className={label}>
                  {t("firstName")}
                </label>
                <input id="drawer-first" name="first_name" autoComplete="given-name" className={input} />
              </div>
              <div>
                <label htmlFor="drawer-last" className={label}>
                  {t("lastName")}
                </label>
                <input id="drawer-last" name="last_name" autoComplete="family-name" className={input} />
              </div>
              <div>
                <label htmlFor="drawer-username" className={label}>
                  {t("loginIdOnly")}
                  <Req />
                </label>
                <input id="drawer-username" name="username" autoComplete="username" required pattern="[A-Za-z0-9._-]{3,30}" title={t("loginIdHint")} className={input} />
                <span className="mt-1 block text-[12px] text-lien-muted">{t("loginIdHint")}</span>
              </div>
              <div>
                <label htmlFor="drawer-email" className={label}>
                  {t("emailOptional")}
                </label>
                <input id="drawer-email" name="email" type="email" autoComplete="email" className={input} />
              </div>
              <div>
                <label htmlFor="drawer-reg-password" className={label}>
                  {t("password")}
                  <Req />
                </label>
                <PasswordInput id="drawer-reg-password" name="password" autoComplete="new-password" required minLength={6} className={input} />
              </div>
              <div>
                <label htmlFor="drawer-reg-password2" className={label}>
                  {t("passwordConfirm")}
                  <Req />
                </label>
                <PasswordInput id="drawer-reg-password2" name="password_confirm" autoComplete="new-password" required minLength={6} className={input} />
              </div>
              <p className="m-0 text-[13px] leading-6 text-lien-text">
                {t("privacyNote")}{" "}
                <Link href="/privacy-policy/" onClick={onClose} className="font-semibold text-lien-heading no-underline hover:underline">
                  【{t("privacyPolicy")}】
                </Link>
              </p>
              <button type="submit" disabled={regPending} className={primary}>
                {regPending ? t("creating") : t("register")}
              </button>
              <p className="m-0 pt-2 text-[14px] text-lien-text">
                {t("haveAccount")}{" "}
                <button type="button" onClick={() => setView("login")} className={cn("font-medium text-lien-heading underline-offset-2 hover:underline")}>
                  {t("login")}
                </button>
              </p>
              <p className="m-0 text-[14px] text-lien-text">
                {t("forgot")}{" "}
                <Link href="/my-account/lost-password/" onClick={onClose} className="font-medium text-lien-heading no-underline underline-offset-2 hover:underline">
                  {t("recover")}
                </Link>
              </p>
            </form>
          )}
        </div>
      </aside>
    </div>
  );
}
