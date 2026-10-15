import Image from "@/components/sites/lienstore/shared/SmartImage";
import Link from "next/link";
import type { ContactInfo, FooterColumn } from "@/types/lienstore";
import { cn } from "@/lib/utils";
import { SOCIAL_COLORS, SocialIcon } from "@/components/sites/lienstore/shared/BrandIcons";
import { Fa } from "@/components/sites/lienstore/shared/icons";

export interface SiteFooterProps {
  columns: FooterColumn[];
  contact: ContactInfo;
  copyright: string;
  className?: string;
}

const paragraphClass = "mb-[14px] text-[14px] leading-[22.4px] text-white";

const footerLinkClass = "text-white no-underline transition-none hover:text-lien-footer-hover";

function ContactBlock({ contact }: { contact: ContactInfo }) {
  const row = "mb-[10px] flex items-start gap-2 text-[14px] leading-[22.4px] text-white";
  const icon = "mt-1 w-4 shrink-0 text-center text-[14px] leading-[14px] text-lien-footer-hover";
  return (
    <div>
      {contact.phones.map((p) => (
        <p key={p.label} className={row}>
          <Fa name="phone" className={icon} />
          <span>
            <span className="font-semibold">{p.label}:</span>{" "}
            {p.href ? (
              <a href={p.href} className={footerLinkClass}>
                {p.number}
              </a>
            ) : (
              <span className="text-lien-footer-hover">{p.number}</span>
            )}
          </span>
        </p>
      ))}
      <p className={row}>
        <Fa name="envelope" className={icon} />
        <a href={`mailto:${contact.email}`} className={footerLinkClass}>
          {contact.email}
        </a>
      </p>
      <p className={row}>
        <Fa name="map-marker" className={icon} />
        <span>{contact.address}</span>
      </p>
      <p className={row}>
        <Fa name="clock-o" className={icon} />
        <span>{contact.hours}</span>
      </p>
      <ul className="m-0 mt-3 flex list-none flex-wrap gap-2 p-0">
        {contact.socials.map((s) => (
          <li key={s.kind}>
            <a
              href={s.href}
              target="_blank"
              rel="noreferrer"
              aria-label={s.label}
              title={s.label}
              className="inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-white no-underline transition-opacity duration-300 hover:opacity-80"
              style={{ backgroundColor: SOCIAL_COLORS[s.kind] }}
            >
              <SocialIcon kind={s.kind} className="text-[15px]" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FooterWidgetBody({ column, contact }: { column: FooterColumn; contact: ContactInfo }) {
  if (column.contact) return <ContactBlock contact={contact} />;

  if (column.image) {
    return (
      <p className="mb-[14px] flow-root">
        <Image
          src={column.image.src}
          alt={column.image.alt}
          width={column.image.width}
          height={column.image.height}
          className="float-left mr-[21px] block h-[82px] w-[82px]"
        />
      </p>
    );
  }

  return (
    <>
      {column.links?.map((link) => (
        <p key={link.href} className={paragraphClass}>
          <Link href={link.href} className={footerLinkClass}>
            {link.label}
          </Link>
        </p>
      ))}
    </>
  );
}

/** Dark site footer: four text widgets, social circles and copyright bar. */
export function SiteFooter({ columns, contact, copyright, className }: SiteFooterProps) {
  return (
    <footer
      id="colophon"
      className={cn("min-h-[150px] bg-lien-footer pt-[15px] font-sans text-[14px] leading-[22.4px] text-white", className)}
    >
      <div className="footer-section">
        <div className="container mx-auto max-w-[1200px] px-[15px] pt-[7px]">
          <aside className="widget-area grid grid-cols-1 sm:grid-cols-4">
            {columns.map((column) => (
              <div key={column.title} className="footer-widget px-[15px]">
                <section className="widget pb-[42px]">
                  <h2 className="widget-title mt-[17.43px] mb-[21px] font-oswald text-[21px] font-medium uppercase leading-[29.4px] tracking-[3.8178px] text-white">
                    {column.title}
                  </h2>
                  <div className="textwidget">
                    <FooterWidgetBody column={column} contact={contact} />
                  </div>
                </section>
              </div>
            ))}
          </aside>

          <div className="-mx-[15px]">
            <div className="px-[15px]">
              <ul className="m-0 mb-[25px] flex h-[45px] list-none items-start justify-center p-0 text-center">
                {contact.socials.map((s) => (
                  <li key={s.kind} className="inline-block h-[45px] pt-[5px]">
                    <a
                      href={s.href}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={s.label}
                      title={s.label}
                      className="mx-[5px] inline-flex h-[40px] min-w-[40px] items-center justify-center rounded-[24px] px-2 text-center text-white no-underline transition-all duration-300 ease-in-out hover:opacity-80"
                      style={{ backgroundColor: SOCIAL_COLORS[s.kind] }}
                    >
                      <SocialIcon kind={s.kind} className="text-[18px]" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="-mx-[15px]">
            <div className="flex min-h-[55px] items-center border-t border-solid border-white">
              <div className="w-full px-[15px] py-[15px] text-center text-[15px] leading-[17.25px] text-white sm:leading-6">
                <p className="m-0">
                  <Link href="/" className={footerLinkClass}>
                    {copyright}
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
