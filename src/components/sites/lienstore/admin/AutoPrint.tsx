"use client";

import { useEffect } from "react";

/** The print dialog opens once per page load (React dev runs effects twice). */
let opened = false;

// the browser's own "Headers and footers" prints the page URL / date / title in the margins — it is a print-dialog
// setting the page cannot switch off, so the toolbar says to untick it (margins "None" also leaves it no room)
const HINT = {
  a5: "khổ A5 dọc, mỗi trang một tờ A5 · hộp thoại in: khổ A5, lề Không, bỏ tick “Đầu trang và chân trang”",
  a4: "khổ A4 ngang, 2 trang A5 mỗi tờ, cắt đôi theo nét đứt · hộp thoại in: khổ A4, hướng Ngang, lề Không, bỏ tick “Đầu trang và chân trang”",
};

/** Print toolbar of /print/orders/: A5 / A4 switch, and opens the print dialog once the sheets (and the logo) have loaded. */
export function AutoPrint({ count, paper }: { count: number; paper: "a5" | "a4" }) {
  useEffect(() => {
    if (!count || opened) return;
    opened = true;
    const go = () => window.setTimeout(() => window.print(), 300);
    if (document.readyState === "complete") go();
    else window.addEventListener("load", go, { once: true });
  }, [count]);
  const switchTo = (p: "a5" | "a4") => {
    const u = new URL(window.location.href);
    u.searchParams.set("paper", p);
    window.location.assign(u.toString());
  };
  const tab = (p: "a5" | "a4", label: string) => (
    <button type="button" onClick={() => p !== paper && switchTo(p)} aria-pressed={p === paper} className={`px-2.5 py-1 text-[12px] font-semibold ${p === paper ? "bg-[#1f2a44] text-white" : "bg-white text-[#1f2a44]"}`} data-testid={`paper-${p}`}>
      {label}
    </button>
  );
  return (
    <div className={`no-print sticky top-0 z-10 mx-auto mb-4 flex items-center justify-between gap-3 rounded bg-white px-4 py-2 shadow ${paper === "a4" ? "w-[297mm]" : "w-[148mm]"}`}>
      <span className="text-[13px]">
        {count} hoá đơn · {HINT[paper]}
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <span className="flex overflow-hidden rounded border border-[#1f2a44]">
          {tab("a5", "A5")}
          {tab("a4", "A4 (2/tờ)")}
        </span>
        <button type="button" onClick={() => window.print()} className="rounded bg-[#c00] px-3 py-1.5 text-[13px] font-semibold text-white">
          In
        </button>
        <button type="button" onClick={() => window.close()} className="rounded border border-[#ccc] px-3 py-1.5 text-[13px]">
          Đóng
        </button>
      </span>
    </div>
  );
}
