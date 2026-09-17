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
        <ul className="m-0 flex list-none items-center gap-2 p-0" data-testid="topbar-contact">
          {contact.phones.map((p) => (
            <li key={p.label}>
              <a href={p.href || undefined} className="inline-flex h-7 items-center gap-1.5 rounded-full bg-white pr-2.5 pl-1 text-[12px] text-lien-text no-underline shadow-sm ring-1 ring-lien-line hover:ring-lien-blue" title={`${t(lang, "hotline")} ${p.label}`}>
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-lien-blue text-[10px] text-white">
                  <Fa name="phone" />
                </span>
                <span className="font-bold text-lien-blue">{p.label}</span>
                <span className="font-semibold">{p.number}</span>
              </a>
            </li>
          ))}
          <li className="hidden lg:block">
            <a href={`mailto:${contact.email}`} className="inline-flex h-7 items-center gap-1.5 rounded-full bg-white pr-2.5 pl-1 text-[12px] text-lien-text no-underline shadow-sm ring-1 ring-lien-line hover:ring-lien-blue">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-lien-heading text-[10px] text-white">
                <Fa name="envelope" />
              </span>
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
