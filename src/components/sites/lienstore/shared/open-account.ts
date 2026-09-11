/** Any "Đăng nhập" button on the site opens the account drawer in the header instead of a separate page. */
export const OPEN_ACCOUNT_EVENT = "lien:open-account";

export function openAccountDrawer(view: "login" | "register" = "login"): void {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(OPEN_ACCOUNT_EVENT, { detail: { view } }));
}
