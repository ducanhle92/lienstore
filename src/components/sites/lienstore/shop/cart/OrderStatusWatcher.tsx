"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Keeps the order page fresh without a manual reload: every 15 s it asks the server for the order's status / stage
 * and re-renders the page when something changed (e.g. the admin confirmed the payment).
 */
export function OrderStatusWatcher({ orderId, stage, status, intervalMs = 15000 }: { orderId: string; stage: string; status: string; intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (status === "cancelled" || status === "completed") return;
    let stopped = false;
    const tick = async () => {
      try {
        const r = await fetch(`/api/orders/status/?id=${encodeURIComponent(orderId)}`, { cache: "no-store" });
        if (!r.ok) return;
        const j = (await r.json()) as { status?: string; shipStage?: string };
        if (!stopped && (j.shipStage !== stage || j.status !== status)) router.refresh();
      } catch {
        /* offline: try again next tick */
      }
    };
    const id = window.setInterval(tick, intervalMs);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [orderId, stage, status, intervalMs, router]);
  return null;
}
