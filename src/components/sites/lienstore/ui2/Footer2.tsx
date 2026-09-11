import Image from "next/image";
import Link from "next/link";
import type { ContactInfo } from "@/types/lienstore";
import { SOCIAL_COLORS, SocialIcon } from "@/components/sites/lienstore/shared/BrandIcons";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { t, type Lang } from "@/lib/i18n";
import type { HeaderCategory, HeaderLink } from "./Header2";

interface Footer2Props {
  logo: { src: string; width: number; height: number };
  shopName?: string;
  contact: ContactInfo;
  categories: HeaderCategory[];
  accountLinks: HeaderLink[];
  supportLinks: HeaderLink[];
  /** "Chính sách chung" column. */
  policyLinks?: HeaderLink[];
  copyright: string;
  lang?: Lang;
}

const colTitle = "mb-4 text-[14px] font-bold uppercase tracking-[0.5px] text-lien-heading";
const colLink = "block py-1 text-[14px] leading-6 text-lien-text no-underline hover:text-lien-blue";

/** Light-grey 5-column footer: store info · account · support · main categories · connect. */
export function Footer2({ logo, shopName = "LienStore", contact, accountLinks, supportLinks, policyLinks = [], copyright, lang = "vi" }: Footer2Props) {
  return (
    <footer className="mt-12 bg-lien-footer2 text-lien-text">
      <div className="mx-auto grid max-w-[1300px] gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-1">
          <Image src={logo.src} alt={shopName} width={logo.width} height={logo.height} unoptimized className="mb-4 h-auto w-[150px]" />
          <ul className="m-0 list-none space-y-2 p-0 text-[14px] leading-6">
            <li className="flex gap-2">
              <Fa name="map-marker" className="mt-1.5 w-4 text-center text-lien-muted" />
              <span>
                <strong>{shopName}</strong> · {t(lang, "fTagline")}
                <br />
                {lang === "ja" && contact.addressJa ? contact.addressJa : contact.address}
              </span>
            </li>
            {contact.phones.map((p) => (
              <li key={p.label} className="flex gap-2">
                <Fa name="phone" className="mt-1.5 w-4 text-center text-lien-muted" />
                <span>
                  {t(lang, "hotline")} {p.label}: {p.href ? <a href={p.href} className="text-lien-text no-underline hover:text-lien-blue">{p.number}</a> : p.number}
                </span>
              </li>
            ))}
            <li className="flex gap-2">
              <Fa name="envelope" className="mt-1.5 w-4 text-center text-lien-muted" />
              <a href={`mailto:${contact.email}`} className="text-lien-text no-underline hover:text-lien-blue">
                {contact.email}
              </a>
            </li>
            <li className="flex gap-2">
              <Fa name="clock-o" className="mt-1.5 w-4 text-center text-lien-muted" />
              <span>{contact.hours}</span>
            </li>
          </ul>
        </div>
        <div>
          <h3 className={colTitle}>{t(lang, "fAccount")}</h3>
          {accountLinks.map((l) => (
            <Link key={l.href + l.label} href={l.href} className={colLink}>
              {l.label}
            </Link>
          ))}
        </div>
        <div>
          <h3 className={colTitle}>{t(lang, "fSupport")}</h3>
          {supportLinks.map((l) => (
            <Link key={l.href + l.label} href={l.href} className={colLink}>
              {l.label}
            </Link>
          ))}
        </div>
        <div>
          <h3 className={colTitle}>{t(lang, "fPolicies")}</h3>
          {policyLinks.map((l) => (
            <Link key={l.href + l.label} href={l.href} className={colLink}>
              {l.label}
            </Link>
          ))}
        </div>
        <div>
          <h3 className={colTitle}>{t(lang, "fConnect")}</h3>
          <p className="mb-3 text-[14px] leading-6 text-lien-muted">{t(lang, "fConnectText")}</p>
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {contact.socials.map((s) => (
              <li key={s.kind}>
                <a
                  href={s.href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={s.label}
                  title={s.label}
                  className="flex h-11 w-11 items-center justify-center rounded-full text-white no-underline shadow-[0_4px_14px_-4px_rgba(0,0,0,0.35)] transition-transform hover:scale-110"
                  style={{ backgroundColor: SOCIAL_COLORS[s.kind] }}
                >
                  {s.kind === "zalo" ? <span className="text-[13px] font-extrabold tracking-tight">Zalo</span> : <SocialIcon kind={s.kind} className="text-[20px]" />}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="border-t border-lien-line">
        <div className="mx-auto max-w-[1300px] px-4 py-4 text-[13px] text-lien-muted">
          <span>{copyright}</span>
        </div>
      </div>
    </footer>
  );
}
