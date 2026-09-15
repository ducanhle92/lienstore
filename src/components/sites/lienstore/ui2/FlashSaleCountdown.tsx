"use client";

import { useEffect, useState } from "react";
import { Fa } from "@/components/sites/lienstore/shared/icons";

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * HH:MM:SS to `endsAt`, ticking every second. Renders nothing until mounted — the server can't compute "now" precisely
 * enough to match the client's first tick, so starting blank avoids a hydration mismatch. Once it reaches zero it just
 * shows 00:00:00; the section itself disappears on the next page load, when the server re-checks the campaign.
 */
export function FlashSaleCountdown({ endsAt, compact = false }: { endsAt: string; compact?: boolean }) {
  const [msLeft, setMsLeft] = useState<number | null>(null);
  useEffect(() => {
    const target = new Date(endsAt).getTime();
    const tick = () => setMsLeft(Math.max(0, target - Date.now()));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [endsAt]);
  if (msLeft === null) return null;
  const h = Math.floor(msLeft / 3600000);
  const m = Math.floor((msLeft % 3600000) / 60000);
  const s = Math.floor((msLeft % 60000) / 1000);
  const text = h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  if (compact) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded bg-orange-600 px-1 py-0.5 font-mono text-[10px] font-bold tabular-nums leading-4 text-white sm:px-1.5 sm:text-[11px]" aria-label={`Kết thúc sau ${h} giờ ${m} phút ${s} giây`}>
        <Fa name="bolt" className="text-[9px]" />
        {text}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 font-mono text-[13px] font-bold tabular-nums text-white" aria-label={`Kết thúc sau ${h} giờ ${m} phút ${s} giây`}>
      <Fa name="clock-o" className="text-[12px]" />
      {pad(h)}:{pad(m)}:{pad(s)}
    </span>
  );
}
