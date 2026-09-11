"use client";

import { type ReactNode, useEffect, useRef } from "react";

/**
 * Wraps an admin `<table>`: horizontal scrolling plus draggable column widths (handle on the right edge of every header
 * cell). Widths are remembered per table in localStorage; double-click a handle to reset the table.
 */
export function ResizableTable({ id, children, className = "" }: { id: string; children: ReactNode; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const table = box.current?.querySelector("table");
    if (!table) return;
    const ths = Array.from(table.querySelectorAll<HTMLTableCellElement>("thead th"));
    if (!ths.length) return;
    const key = `lien-cols:${id}`;
    let saved: number[] | null = null;
    try {
      const raw = window.localStorage.getItem(key);
      saved = raw ? (JSON.parse(raw) as number[]) : null;
    } catch {
      saved = null;
    }
    // freeze the current (auto) widths so a drag only moves one column
    const widths = ths.map((th, i) => (saved && saved[i] ? saved[i] : Math.round(th.getBoundingClientRect().width)));
    const apply = () => {
      ths.forEach((th, i) => {
        th.style.width = `${widths[i]}px`;
        th.style.minWidth = `${widths[i]}px`;
        th.style.maxWidth = `${widths[i]}px`;
      });
      table.style.tableLayout = "fixed";
      table.style.width = `${widths.reduce((s, w) => s + w, 0)}px`;
    };
    apply();
    const persist = () => {
      try {
        window.localStorage.setItem(key, JSON.stringify(widths));
      } catch {
        /* storage blocked */
      }
    };
    const handles: HTMLSpanElement[] = [];
    ths.forEach((th, i) => {
      th.style.position = "relative";
      th.classList.add("select-none");
      const h = document.createElement("span");
      h.className = "lien-col-handle";
      h.title = "Kéo để đổi độ rộng · nhấp đôi để đặt lại";
      h.style.cssText = "position:absolute;top:0;right:-3px;width:7px;height:100%;cursor:col-resize;user-select:none;z-index:2";
      let startX = 0;
      let startW = 0;
      const onMove = (e: MouseEvent) => {
        widths[i] = Math.max(48, startW + (e.clientX - startX));
        apply();
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        persist();
      };
      h.addEventListener("mousedown", (e) => {
        e.preventDefault();
        startX = e.clientX;
        startW = widths[i];
        document.body.style.cursor = "col-resize";
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
      });
      h.addEventListener("dblclick", () => {
        try {
          window.localStorage.removeItem(key);
        } catch {
          /* ignore */
        }
        ths.forEach((t) => {
          t.style.width = "";
          t.style.minWidth = "";
          t.style.maxWidth = "";
        });
        table.style.tableLayout = "";
        table.style.width = "";
        ths.forEach((t, j) => (widths[j] = Math.round(t.getBoundingClientRect().width)));
        apply();
      });
      th.appendChild(h);
      handles.push(h);
    });
    return () => handles.forEach((h) => h.remove());
  }, [id]);
  return (
    <div ref={box} className={`overflow-x-auto pb-1 ${className}`}>
      {children}
    </div>
  );
}
