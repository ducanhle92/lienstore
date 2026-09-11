"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { cn } from "@/lib/utils";

interface Purchase {
  slug: string;
  name: string;
  image: string;
  city: string;
  status: "pending" | "processing" | "completed" | "cancelled";
  createdAt: string;
}

const SHOW_MS = 6000;
const GAP_MS = 20000;
const FIRST_DELAY_MS = 7000;
const DISMISS_KEY = "lienstore:sales-popup-off";

function timeAgo(iso: string): string {
  const diff = Math.max(0, Date.now() - Date.parse(iso));
  const m = Math.round(diff / 60000);
  if (m < 2) return "vừa xong";
  if (m < 60) return `${m} phút trước`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} giờ trước`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} ngày trước`;
  return `${Math.round(d / 30)} tháng trước`;
}

/**
 * Bottom-left "1 khách hàng (Tỉnh) đã mua …" toast built from real confirmed orders (see /api/social-proof).
 * Cycles through recent purchases; the close button hides it for the rest of the session.
 */
export function SalesPopup() {
  const [list, setList] = useState<Purchase[]>([]);
  const [i, setI] = useState(0);
  const [visible, setVisible] = useState(false);
  const [off, setOff] = useState(true);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = window.sessionStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      /* ignore */
    }
    if (dismissed) return;
    let alive = true;
    fetch("/api/social-proof/")
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d: { items: Purchase[] }) => {
        if (!alive || !d.items?.length) return;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch result
        setList(d.items);
        setOff(false);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (off || list.length === 0) return;
    let hide: number | undefined;
    let show = window.setTimeout(function tick() {
      setVisible(true);
      hide = window.setTimeout(() => {
        setVisible(false);
        setI((k) => (k + 1) % list.length);
        show = window.setTimeout(tick, GAP_MS);
      }, SHOW_MS);
    }, FIRST_DELAY_MS);
    return () => {
      window.clearTimeout(show);
      if (hide) window.clearTimeout(hide);
    };
  }, [off, list.length]);

  if (off || list.length === 0) return null;
  const p = list[i % list.length];

  const dismiss = () => {
    setVisible(false);
    setOff(true);
    try {
      window.sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "fixed bottom-4 left-4 z-[9000] hidden w-[calc(100vw-2rem)] max-w-[350px] items-center md:flex gap-3 rounded-lg border border-lien-line bg-white p-3 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.35)] transition-all duration-500",
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0",
      )}
    >
      <Link href={`/product/${p.slug}/`} className="shrink-0">
        <Image src={p.image} alt="" width={56} height={56} className="h-14 w-14 rounded border border-lien-line object-contain" />
      </Link>
      <div className="min-w-0 flex-1 text-[12px] leading-5 text-lien-muted">
        <p className="m-0">
          1 khách hàng{p.city ? ` (${p.city})` : ""} đã mua
        </p>
        <Link href={`/product/${p.slug}/`} className="line-clamp-1 text-[13px] font-semibold text-lien-heading no-underline hover:text-lien-blue">
          {p.name}
        </Link>
        <p className="m-0 flex items-center gap-1.5">
          <span>{timeAgo(p.createdAt)}</span>
          <Fa name="check-circle" className="text-lien-success" />
          <span className="text-lien-heading">{p.status === "completed" ? "đã giao" : "đã xác nhận"}</span>
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-center justify-between gap-2 self-stretch">
        <button type="button" onClick={dismiss} aria-label="Đóng thông báo" className="flex h-6 w-6 items-center justify-center rounded-full text-[12px] text-lien-muted hover:bg-lien-cream hover:text-lien-heading">
          <Fa name="times" />
        </button>
        <Link href={`/product/${p.slug}/`} aria-label="Xem sản phẩm" className="flex h-6 w-6 items-center justify-center text-[13px] text-lien-heading no-underline hover:text-lien-blue">
          <Fa name="eye" />
        </Link>
      </div>
    </div>
  );
}
