"use client";

import { type ReactNode, useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { ADMIN_BAR_ID, BAR_BULK_ID, BAR_END_ID, BAR_LEAD_ID, BAR_READY_EVENT, BAR_TOOLS_ID, barState } from "./AdminBar";

const onBarReady = (cb: () => void) => {
  window.addEventListener(BAR_READY_EVENT, cb);
  return () => window.removeEventListener(BAR_READY_EVENT, cb);
};
/** The bottom-bar slot with that id once on the client (null while server-rendering, and until the bar mounts). */
const useSlot = (id: string) => useSyncExternalStore(onBarReady, () => (barState.ready ? document.getElementById(id) : null), () => null);

/** Row checkboxes of a bulk form (bound with form=… or inside it), not the options shown in the bar itself. */
function rowBoxes(scope: string): HTMLInputElement[] {
  const form = document.getElementById(scope) as HTMLFormElement | null;
  const bar = document.getElementById(ADMIN_BAR_ID);
  const els = form ? Array.from(form.elements) : Array.from(document.querySelectorAll(`[form="${scope}"]`));
  return els.filter((el): el is HTMLInputElement => el instanceof HTMLInputElement && el.type === "checkbox" && !bar?.contains(el));
}

/**
 * Actions for the ticked rows of one table (`scope` = id of its bulk form): shown in the fixed bottom bar only while
 * at least one row is ticked, with the count and "Bỏ tick". Children are the buttons / options, bound with form={scope}.
 */
export function BulkBar({ scope, label, children }: { scope: string; label?: string; children: ReactNode }) {
  const [n, setN] = useState(0);
  const slot = useSlot(BAR_BULK_ID);
  useEffect(() => {
    const sync = () => setN(rowBoxes(scope).filter((b) => b.checked).length);
    const onReset = () => window.setTimeout(sync, 0);
    sync();
    document.addEventListener("change", sync);
    document.addEventListener("reset", onReset, true);
    return () => {
      document.removeEventListener("change", sync);
      document.removeEventListener("reset", onReset, true);
    };
  }, [scope]);
  const clear = () => {
    for (const b of rowBoxes(scope)) {
      if (!b.checked) continue;
      b.checked = false;
      b.dispatchEvent(new Event("change", { bubbles: true }));
    }
  };
  return (
    <>
      <span hidden data-tick-scope={scope} />
      {slot && n > 0
        ? createPortal(
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-lien-blue/30 bg-lien-blue-soft/60 px-2 py-1 text-[13px]" data-testid={`bulk-${scope}`}>
              <span className="font-semibold text-lien-heading">
                Đã tick {n}
                {label ? ` · ${label}` : ""} →
              </span>
              {children}
              <button type="button" onClick={clear} className="text-[12px] text-lien-muted hover:text-lien-heading hover:underline">
                Bỏ tick
              </button>
            </div>,
            slot,
          )
        : null}
    </>
  );
}

/**
 * Screen tools that live in the fixed bottom bar for as long as the screen is open (filters, "+ Thêm vào chuyến"…);
 * `lead` puts them first, left of "Lưu thay đổi"; `end` pins them to the right edge.
 */
export function BarTools({ children, lead = false, end = false }: { children: ReactNode; lead?: boolean; end?: boolean }) {
  const slot = useSlot(lead ? BAR_LEAD_ID : end ? BAR_END_ID : BAR_TOOLS_ID);
  return slot ? createPortal(<div className="contents">{children}</div>, slot) : null;
}
