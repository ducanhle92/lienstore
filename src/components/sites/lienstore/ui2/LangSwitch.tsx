"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import type { Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface Props {
  lang: Lang;
  langs: Array<{ code: Lang; short: string; label: string }>;
  label: string;
  className?: string;
}

/** Pill "🌐 VI | JP": each entry links to /api/lang/ which stores the cookie and returns to the current page. */
export function LangSwitch({ lang, langs, label, className }: Props) {
  const pathname = usePathname();
  const search = useSearchParams();
  const qs = search.toString();
  const back = `${pathname}${qs ? `?${qs}` : ""}`;
  return (
    <nav aria-label={label} className={cn("inline-flex h-7 items-center gap-1 rounded-full border border-lien-line bg-white px-2.5 text-[12px] font-semibold text-lien-text", className)}>
      <Fa name="globe" className="mr-0.5 text-[13px] text-lien-muted" />
      {langs.map((l, i) => (
        <span key={l.code} className="inline-flex items-center">
          {i > 0 ? <span className="mx-1 text-lien-muted/60">|</span> : null}
          <a
            href={`/api/lang/?to=${l.code}&back=${encodeURIComponent(back)}`}
            aria-current={l.code === lang ? "true" : undefined}
            title={l.label}
            className={cn("no-underline", l.code === lang ? "text-lien-heading" : "text-lien-muted hover:text-lien-blue")}
          >
            {l.short}
          </a>
        </span>
      ))}
    </nav>
  );
}
