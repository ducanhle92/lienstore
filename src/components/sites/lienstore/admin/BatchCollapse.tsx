"use client";

import { type ReactNode, useSyncExternalStore } from "react";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { cn } from "@/lib/utils";

const EVENT = "lien-batch-collapse";
const key = (id: number, ns: string) => `lien-${ns}-collapsed:${id}`;
const read = (id: number, ns: string, def = false) => {
  try {
    const v = window.localStorage.getItem(key(id, ns));
    return v === null ? def : v === "1";
  } catch {
    return def;
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
const useCollapsed = (id: number, ns: string, def = false) => useSyncExternalStore(subscribe, () => read(id, ns, def), () => def);

/** "Ẩn đợt" / "Hiện đợt" in the header of a purchase trip: only the header (totals, Sửa, trạng thái) stays; remembered per browser. */
export function BatchToggle({ id, className, ns = "batch", labels = ["Ẩn", "Hiện"], defaultCollapsed = false }: { id: number; className?: string; ns?: string; labels?: [string, string]; defaultCollapsed?: boolean }) {
  const collapsed = useCollapsed(id, ns, defaultCollapsed);
  const toggle = () => {
    try {
      window.localStorage.setItem(key(id, ns), collapsed ? "0" : "1");
    } catch {
      /* private window: the toggle just does nothing */
    }
    window.dispatchEvent(new Event(EVENT));
  };
  return (
    <button type="button" onClick={toggle} className={className} aria-expanded={!collapsed} data-testid={`${ns}-toggle-${id}`}>
      <Fa name={collapsed ? "angle-down" : "angle-up"} /> {collapsed ? labels[1] : labels[0]}
    </button>
  );
}

/** Body of the trip card; hidden while the trip is collapsed (the card's padding goes too — see globals.css). */
export function BatchBody({ id, children, ns = "batch", defaultCollapsed = false }: { id: number; children: ReactNode; ns?: string; defaultCollapsed?: boolean }) {
  const collapsed = useCollapsed(id, ns, defaultCollapsed);
  return (
    <div data-batch-collapsed={collapsed ? "1" : "0"} className={cn(collapsed && "hidden")}>
      {children}
    </div>
  );
}
