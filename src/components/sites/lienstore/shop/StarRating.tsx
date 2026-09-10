import { Fa } from "@/components/sites/lienstore/shared/icons";
import { cn } from "@/lib/utils";

interface StarRatingProps {
  rating: number;
  size?: number;
  className?: string;
}

/** Five stars, filled according to `rating` (0–5). The original uses the WooCommerce "star" font; we use FontAwesome. */
export function StarRating({ rating, size = 13.712, className }: StarRatingProps) {
  const full = Math.round(Math.min(5, Math.max(0, rating)));
  return (
    <span
      role="img"
      aria-label={`Được xếp hạng ${rating.toFixed(2)} 5 sao`}
      className={cn("inline-flex items-center gap-px text-lien-muted", className)}
      style={{ fontSize: size || undefined, lineHeight: 1 }}
    >
      {Array.from({ length: 5 }, (_, i) => (
        <Fa key={i} name={i < full ? "star" : "star-o"} />
      ))}
    </span>
  );
}
