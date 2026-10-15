"use client";

import { useEffect } from "react";

let opened = false;

/** Opens the print dialog once the page (labels / QR codes) has loaded; renders nothing. */
export function PrintOnLoad({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled || opened) return;
    opened = true;
    const go = () => window.setTimeout(() => window.print(), 300);
    if (document.readyState === "complete") go();
    else window.addEventListener("load", go, { once: true });
  }, [enabled]);
  return null;
}
