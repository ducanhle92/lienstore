import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/**
 * The original site renders every icon with the Font Awesome 4.7 icon font.
 * The exact font file is self-hosted under /sites/lienstore/shared/fonts
 * and exposed through the `font-fa` utility, so glyphs match pixel for pixel.
 */
const GLYPHS = {
  phone: "",
  envelope: "",
  "map-marker": "",
  "clock-o": "",
  facebook: "",
  search: "",
  heart: "",
  "shopping-bag": "",
  "align-left": "",
  bars: "",
  close: "",
  "user-circle": "",
  "arrow-up": "",
  "heart-o": "",
  "refresh": "",
  "check-circle": "",
  "trash": "",
  "pencil": "",
  "plus": "",
  "sign-out": "",
  "list": "",
  "shopping-cart": "",
  "user": "",
  "angle-right": "",
  "angle-left": "",
  "star": "",
  "star-o": "",
  "cog": "",
  "tachometer": "",
  "exclamation-circle": "",
  "arrow-left": "",
  "eye": "",
  "eye-slash": "",
  "picture-o": "",
  "times": "",
  "minus": "",
  "info-circle": "",
  "instagram": "",
  "youtube-play": "",
  "hand-o-right": "",
  "tag": "",
  "building": "",
  "cube": "",
  "cubes": "",
  "truck": "",
  "users": "",
  "paperclip": "",
  "download": "",
  "upload": "",
  "archive": "",
  "file-text-o": "",
  "file-pdf-o": "",
  "file-image-o": "",
  "external-link": "",
  "shopping-basket": "",
  "line-chart": "",
  "sticky-note-o": "",
  "angle-down": "",
  "angle-up": "",
  "th-large": "",
  "gift": "",
  "shield": "",
  "chevron-right": "",
  "chevron-left": "",
  "fire": "",
  "credit-card": "",
  "comments-o": "",
  "bolt": "",
  "plane": "",
  "share-alt": "",
  "tags": "",
  "check": "",
  "cart-plus": "",
  "money": "",
  "globe": "",
  "newspaper-o": "",
  "calendar": "",
} as const;

export type FaName = keyof typeof GLYPHS;

interface FaProps {
  name: FaName;
  className?: string;
  style?: CSSProperties;
  label?: string;
}

export function Fa({ name, className, style, label }: FaProps) {
  return (
    <span
      aria-hidden={label ? undefined : "true"}
      aria-label={label}
      role={label ? "img" : undefined}
      className={cn("font-fa inline-block not-italic leading-none antialiased", className)}
      style={style}
    >
      {GLYPHS[name]}
    </span>
  );
}
