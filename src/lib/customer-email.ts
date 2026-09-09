/** Placeholder domain for accounts created without an email (they sign in with their login ID). Safe for client code. */
export const NO_EMAIL_DOMAIN = "no-email.lienstore.local";

/** Email shown to people: the synthetic placeholder of ID-only accounts is hidden. */
export function displayEmail(email: string): string {
  return email.endsWith(`@${NO_EMAIL_DOMAIN}`) ? "" : email;
}
