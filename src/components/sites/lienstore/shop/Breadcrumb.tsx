import Link from "next/link";
import { T } from "@/components/sites/lienstore/shared/LangProvider";
import { cn } from "@/lib/utils";

export interface Crumb {
  label: string;
  href?: string;
}

/** WooCommerce breadcrumb: 14.72px grey text, blue links, " / " separators, 1px #f2efef rule below. */
export function Breadcrumb({ items, className }: { items: Crumb[]; className?: string }) {
  return (
    <nav
      aria-label="Breadcrumb"
      className={cn("mb-[14.72px] border-b border-[#f2efef] pb-[7.36px] pl-[14.72px] text-[14.72px] leading-[22.08px] text-[#777777]", className)}
    >
      <Link href="/" className="text-lien-blue hover:underline">
        <T k="home" />
      </Link>
      {items.map((c) => (
        <span key={`${c.label}-${c.href ?? ""}`}>
          {" / "}
          {c.href ? (
            <Link href={c.href} className="text-lien-blue hover:underline">
              {c.label}
            </Link>
          ) : (
            c.label
          )}
        </span>
      ))}
    </nav>
  );
}
