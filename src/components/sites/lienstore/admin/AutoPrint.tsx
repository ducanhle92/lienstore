"use client";

import { useEffect } from "react";

/** The print dialog opens once per page load (React dev runs effects twice). */
let opened = false;

/** Print toolbar of /print/orders/: opens the print dialog once the sheets (and the logo) have loaded. */
export function AutoPrint({ count }: { count: number }) {
  useEffect(() => {
    if (!count || opened) return;
    opened = true;
    const go = () => window.setTimeout(() => window.print(), 300);
    if (document.readyState === "complete") go();
    else window.addEventListener("load", go, { once: true });
  }, [count]);
  return (
    <div className="no-print sticky top-0 z-10 mx-auto mb-4 flex w-[148mm] items-center justify-between gap-3 rounded bg-white px-4 py-2 shadow">
      <span className="text-[13px]">{count} hoá đơn · khổ A5, mỗi đơn một trang · muốn lưu PDF: chọn máy in “Lưu dưới dạng PDF”, khổ A5, lề Không</span>
      <span className="flex gap-2">
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
