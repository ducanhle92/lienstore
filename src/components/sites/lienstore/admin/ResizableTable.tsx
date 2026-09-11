"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

/**
 * Excel-like wrapper for admin tables: always-visible horizontal scrollbar, draggable column widths (handle on the right
 * edge of every header cell), cells clip with an ellipsis instead of overlapping. Widths are remembered per table AND per
 * column set (a new column resets the layout); double-click a handle or use "Đặt lại cột" to reset.
 */
export function ResizableTable({ id, children, className = "" }: { id: string; children: ReactNode; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [reset, setReset] = useState(0);
  useEffect(() => {
    const table = box.current?.querySelector("table");
    if (!table) return;
    const ths = Array.from(table.querySelectorAll<HTMLTableCellElement>("thead th"));
    if (!ths.length) return;
    const signature = ths.map((th) => (th.textContent ?? "").trim().slice(0, 12)).join("|");
    const key = `lien-cols:${id}:${ths.length}:${hash(signature)}`;
    let saved: number[] | null = null;
    try {
      const raw = window.localStorage.getItem(key);
      saved = raw ? (JSON.parse(raw) as number[]) : null;
      if (saved && saved.length !== ths.length) saved = null;
    } catch {
      saved = null;
    }
    // freeze the current (auto) widths so a drag only moves one column
    table.style.tableLayout = "";
    table.style.width = "";
    ths.forEach((th) => {
      th.style.width = "";
      th.style.minWidth = "";
      th.style.maxWidth = "";
    });
    const widths = ths.map((th, i) => (saved && saved[i] ? saved[i] : Math.max(48, Math.round(th.getBoundingClientRect().width))));
    table.classList.add("lien-resizable");
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
      h.style.cssText = "position:absolute;top:0;right:-4px;width:9px;height:100%;cursor:col-resize;user-select:none;z-index:2;border-right:2px solid transparent";
      h.addEventListener("mouseenter", () => (h.style.borderRightColor = "#d3322a"));
      h.addEventListener("mouseleave", () => (h.style.borderRightColor = "transparent"));
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
        setReset((n) => n + 1);
      });
      th.appendChild(h);
      handles.push(h);
    });
    return () => handles.forEach((h) => h.remove());
  }, [id, reset]);
  return (
    <div className={className}>
      <div className="mb-1 flex items-center justify-end gap-3 text-[11px] text-lien-muted">
        <span>Kéo mép cột để đổi độ rộng · Shift + lăn chuột để cuộn ngang</span>
        <button
          type="button"
          onClick={() => {
            try {
              Object.keys(window.localStorage)
                .filter((k) => k.startsWith(`lien-cols:${id}:`))
                .forEach((k) => window.localStorage.removeItem(k));
            } catch {
              /* ignore */
            }
            setReset((n) => n + 1);
          }}
          className="rounded border border-[#d1d5db] bg-white px-2 py-0.5 hover:border-lien-blue hover:text-lien-blue"
        >
          Đặt lại cột
        </button>
      </div>
      <div ref={box} className="lien-table-scroll overflow-x-scroll pb-1 [&_table.lien-resizable_td]:overflow-hidden [&_table.lien-resizable_td]:text-ellipsis [&_table.lien-resizable_th]:overflow-hidden [&_table.lien-resizable_th]:text-ellipsis">
        {children}
      </div>
    </div>
  );
}

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
