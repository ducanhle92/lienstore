"use client";

import { type ReactNode, useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface Props {
  kind: "success" | "error" | "warning";
  children: ReactNode;
}

const STACK_ID = "lien-toasts";
const AUTO_HIDE_MS = 7000;

function stack(): HTMLElement {
  let el = document.getElementById(STACK_ID);
  if (!el) {
    el = document.createElement("div");
    el.id = STACK_ID;
    el.className = "pointer-events-none fixed bottom-[calc(var(--admin-bar-h,0px)+16px)] right-4 z-[70] flex w-[min(440px,calc(100vw-32px))] flex-col gap-2";
    document.body.appendChild(el);
  }
  return el;
}

/**
 * Admin flash messages as floating toasts (bottom-right) so they take no room above the tables. Success fades out on
 * its own; errors and warnings stay until closed. Several messages stack in order.
 */
export function FlashToast({ kind, children }: Props) {
  // the portal target exists only in the browser; on hydration the server snapshot (null) is used first
  const host = useSyncExternalStore(
    () => () => {},
    () => stack(),
    () => null,
  );
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (kind !== "success") return;
    const t = window.setTimeout(() => setOpen(false), AUTO_HIDE_MS);
    return () => window.clearTimeout(t);
  }, [kind]);
  if (!host || !open) return null;
  const cls = {
    success: "border-green-200 bg-green-50 text-green-800",
    error: "border-red-200 bg-red-50 text-red-800",
    warning: "border-amber-200 bg-amber-50 text-amber-800",
  }[kind];
  return createPortal(
    <div role={kind === "error" ? "alert" : "status"} className={cn("pointer-events-auto flex items-start gap-3 rounded-md border px-4 py-3 text-[14px] leading-5 shadow-lg", cls)} data-testid={`flash-${kind}`}>
      <div className="min-w-0 flex-1">{children}</div>
      <button type="button" onClick={() => setOpen(false)} className="shrink-0 text-[16px] leading-none opacity-60 hover:opacity-100" aria-label="Đóng thông báo" title="Đóng">
        ×
      </button>
    </div>,
    host,
  );
}
