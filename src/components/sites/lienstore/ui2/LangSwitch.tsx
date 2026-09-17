"use client";

import { usePathname, useSearchParams } from "next/navigation";
import type { Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface Props {
  lang: Lang;
  langs: Array<{ code: Lang; short: string; label: string }>;
  label: string;
  className?: string;
}

/** Small square flags (inline SVG, no image request). */
function Flag({ code }: { code: Lang }) {
  if (code === "ja")
    return (
      <svg viewBox="0 0 12 12" className="h-3.5 w-3.5 rounded-[2px] ring-1 ring-black/10" aria-hidden>
        <rect width="12" height="12" fill="#fff" />
        <circle cx="6" cy="6" r="3.3" fill="#bc002d" />
      </svg>
    );
  return (
    <svg viewBox="0 0 12 12" className="h-3.5 w-3.5 rounded-[2px] ring-1 ring-black/10" aria-hidden>
      <rect width="12" height="12" fill="#da251d" />
      <polygon points="6,2.2 7.1,5 10.1,5 7.7,6.8 8.6,9.7 6,7.9 3.4,9.7 4.3,6.8 1.9,5 4.9,5" fill="#ffff00" />
    </svg>
  );
}

/** Flag pills "🇻🇳 VI · 🇯🇵 JP" (active one filled): plain links to /api/lang/, which stores the cookie and sends the browser back (full reload → <html lang> updates too). */
export function LangSwitch({ lang, langs, label, className }: Props) {
  const pathname = usePathname();
  const search = useSearchParams();
  const qs = search.toString();
  const back = `${pathname}${qs ? `?${qs}` : ""}`;
  return (
    <nav aria-label={label} className={cn("inline-flex h-7 items-center gap-0.5 rounded-full border border-lien-line bg-white p-0.5 text-[11px] font-bold", className)} data-testid="lang-switch">
      {langs.map((l) => (
        <a
          key={l.code}
          href={`/api/lang/?to=${l.code}&back=${encodeURIComponent(back)}`}
          aria-current={l.code === lang ? "true" : undefined}
          title={l.label}
          className={cn("inline-flex h-6 items-center gap-1 rounded-full px-2 no-underline transition-colors", l.code === lang ? "bg-lien-blue text-white shadow-sm" : "text-lien-muted hover:bg-lien-cream hover:text-lien-heading")}
        >
          <Flag code={l.code} />
          {l.short}
        </a>
      ))}
    </nav>
  );
}
