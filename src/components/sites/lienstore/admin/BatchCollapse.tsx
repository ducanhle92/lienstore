"use client";

import { type ReactNode, useSyncExternalStore } from "react";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { cn } from "@/lib/utils";

const EVENT = "lien-batch-collapse";
const key = (id: number) => `lien-batch-collapsed:${id}`;
const read = (id: number) => {
  try {
    return window.localStorage.getItem(key(id)) === "1";
  } catch {
    return false;
  }
};
const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
};
const useCollapsed = (id: number) => useSyncExternalStore(subscribe, () => read(id), () => false);

/** "Ẩn đợt" / "Hiện đợt" in the header of a purchase trip: only the header (totals, Sửa, trạng thái) stays; remembered per browser. */
export function BatchToggle({ id, className }: { id: number; className?: string }) {
  const collapsed = useCollapsed(id);
  const toggle = () => {
    try {
      if (collapsed) window.localStorage.removeItem(key(id));
      else window.localStorage.setItem(key(id), "1");
    } catch {
      /* private window: the toggle just does nothing */
    }
    window.dispatchEvent(new Event(EVENT));
  };
  return (
    <button type="button" onClick={toggle} className={className} aria-expanded={!collapsed} data-testid={`batch-toggle-${id}`}>
      <Fa name={collapsed ? "angle-down" : "angle-up"} /> {collapsed ? "Hiện đợt" : "Ẩn đợt"}
    </button>
  );
}

/** Body of the trip card; hidden while the trip is collapsed (the card's padding goes too — see globals.css). */
export function BatchBody({ id, children }: { id: number; children: ReactNode }) {
  const collapsed = useCollapsed(id);
  return (
    <div data-batch-collapsed={collapsed ? "1" : "0"} className={cn(collapsed && "hidden")}>
      {children}
    </div>
  );
}
