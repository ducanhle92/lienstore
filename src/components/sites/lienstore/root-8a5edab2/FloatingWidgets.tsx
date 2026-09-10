"use client";

import { useEffect, useState } from "react";
import { SocialIcon } from "@/components/sites/lienstore/shared/BrandIcons";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { cn } from "@/lib/utils";
import type { ContactInfo } from "@/types/lienstore";

interface FloatingWidgetsProps {
  contact: ContactInfo;
  /** Scroll offset (px) after which the back-to-top button appears. */
  threshold?: number;
  className?: string;
}

/**
 * Right-edge contact dock: round Facebook / Zalo / Messenger / phone buttons (always visible), plus a back-to-top
 * button once the page is scrolled.
 */
export function FloatingWidgets({ contact, threshold = 300, className }: FloatingWidgetsProps) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);

  const phone = contact.phones[0];
  const btn = "flex h-11 w-11 items-center justify-center rounded-full text-white shadow-[0_4px_14px_-4px_rgba(0,0,0,0.45)] transition-transform hover:scale-110 no-underline";
  const colour: Record<string, string> = { facebook: "bg-[#1877f2]", zalo: "bg-[#0068ff]", messenger: "bg-gradient-to-br from-[#00b2ff] to-[#a033ff]" };

  return (
    <div className={cn("fixed right-3 bottom-3 z-[9000] flex flex-col items-center gap-2.5 sm:right-4 sm:bottom-4", className)} aria-label="Liên hệ nhanh">
      {contact.socials.map((s) => (
        <a key={s.kind} href={s.href} target="_blank" rel="noreferrer" aria-label={s.label} title={s.label} className={cn(btn, colour[s.kind] ?? "bg-lien-blue")}>
          {s.kind === "zalo" ? <span className="text-[13px] font-extrabold tracking-tight">Zalo</span> : <SocialIcon kind={s.kind} className="text-[20px]" />}
        </a>
      ))}
      {phone ? (
        <a href={phone.href} aria-label={`Gọi ${phone.number}`} title={`Gọi ${phone.number}`} className={cn(btn, "bg-lien-success")}>
          <Fa name="phone" className="text-[18px]" />
        </a>
      ) : null}
      <button
        type="button"
        aria-label="Lên đầu trang"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className={cn(btn, "bg-lien-heading transition-opacity", scrolled ? "opacity-100" : "pointer-events-none opacity-0")}
      >
        <Fa name="arrow-up" className="text-[18px]" />
      </button>
    </div>
  );
}
