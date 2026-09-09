import Link from "next/link";
import type { ContactInfo } from "@/types/lienstore";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { LANGS, t, type Lang } from "@/lib/i18n";
import { LangSwitch } from "./LangSwitch";

/** Slim utility bar: hotlines + email on the left, register call-to-action in the middle, language switch on the right. */
export function TopBar2({ contact, lang = "vi", loggedIn = false }: { contact: ContactInfo; lang?: Lang; loggedIn?: boolean }) {
  return (
    <div className="hidden border-b border-lien-line bg-lien-cream text-[13px] leading-5 text-lien-text md:block">
      <div className="mx-auto flex h-10 max-w-[1300px] items-center gap-6 px-4">
        <ul className="m-0 flex list-none items-center gap-5 p-0">
          {contact.phones.map((p) => (
            <li key={p.label} className="flex items-center gap-1.5 whitespace-nowrap">
              <Fa name="phone" className="text-lien-muted" />
              <span>
                {t(lang, "hotline")} {p.label}:{" "}
                {p.href ? (
                  <a href={p.href} className="font-medium text-lien-text no-underline hover:text-lien-blue">
                    {p.number}
                  </a>
                ) : (
                  <span className="text-lien-muted">{p.number}</span>
                )}
              </span>
            </li>
          ))}
          <li className="hidden items-center gap-1.5 lg:flex">
            <Fa name="envelope" className="text-lien-muted" />
            <a href={`mailto:${contact.email}`} className="text-lien-text no-underline hover:text-lien-blue">
              {contact.email}
            </a>
          </li>
        </ul>
        <div className="mx-auto flex items-center gap-2">
          {!loggedIn ? (
            <>
              <Link
                href="/my-account/"
                className="rounded-[3px] bg-lien-amber px-2.5 py-0.5 text-[12px] font-semibold uppercase tracking-wide text-lien-heading no-underline hover:brightness-95"
              >
                {t(lang, "registerCta")}
              </Link>
              <span className="hidden text-lien-muted lg:inline">{t(lang, "registerHint")}</span>
              <Fa name="gift" className="hidden text-lien-muted lg:inline" />
            </>
          ) : null}
        </div>
        <LangSwitch lang={lang} langs={LANGS} label={t(lang, "language")} />
      </div>
    </div>
  );
}
