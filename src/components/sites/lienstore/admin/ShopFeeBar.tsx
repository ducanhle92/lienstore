"use client";

import { useEffect, useState } from "react";
import { BarTools } from "@/components/sites/lienstore/admin/BulkBar";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { cn } from "@/lib/utils";

const openDialog = (id: number) => {
  const d = document.getElementById(`shopfee-${id}`);
  if (d instanceof HTMLDialogElement && !d.open) d.showModal();
};

/**
 * ⑤ Vận chuyển JP-VN: the run the admin last clicked (a card with `data-run-id`) is "active" — it gets a ring, and the
 * bottom bar shows "Nhập phí ship ĐVVC → shop VN" for it (right side), which opens the run's fee dialog.
 * After a save the page lands on #shipment-<id>, which re-selects that run.
 */
export function ShopFeeBar({ runs }: { runs: Array<{ id: number; code: string; fee: number | null }> }) {
  const [active, setActive] = useState<number | null>(null);
  useEffect(() => {
    const m = /^#shipment-(\d+)$/.exec(window.location.hash);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time pick-up of the anchor after a redirect
    if (m) setActive(Number(m[1]));
    const onClick = (e: MouseEvent) => {
      const el = e.target instanceof Element ? e.target.closest("[data-run-id]") : null;
      if (el) setActive(Number(el.getAttribute("data-run-id")));
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  useEffect(() => {
    for (const el of document.querySelectorAll("[data-run-id]")) {
      if (Number(el.getAttribute("data-run-id")) === active) el.setAttribute("data-run-active", "1");
      else el.removeAttribute("data-run-active");
    }
  }, [active]);
  const run = runs.find((r) => r.id === active);
  if (!run) return null;
  return (
    <BarTools end>
      <button type="button" onClick={() => openDialog(run.id)} className="inline-flex items-center gap-1.5 rounded-md border border-sky-700 bg-sky-700 px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-sky-800" data-testid="shopfee-open">
        <Fa name="money" /> {run.fee !== null ? "Sửa" : "Nhập"} phí ship ĐVVC → shop VN · {run.code}
        {run.fee !== null ? <span className="rounded bg-white/20 px-1.5 text-[12px]">{run.fee.toLocaleString("vi-VN")}đ</span> : null}
      </button>
    </BarTools>
  );
}

/** A button that opens the fee dialog of a run (the chip in the run header, the row of the cost table). */
export function OpenShopFee({ id, className, children, testId }: { id: number; className?: string; children: React.ReactNode; testId?: string }) {
  return (
    <button type="button" onClick={() => openDialog(id)} className={cn(className)} data-testid={testId}>
      {children}
    </button>
  );
}

/** "Huỷ" inside a <dialog>: closes it without saving. */
export function CloseDialog({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <button type="button" onClick={(e) => (e.currentTarget.closest("dialog") as HTMLDialogElement | null)?.close()} className={className}>
      {children}
    </button>
  );
}
