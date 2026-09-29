"use client";

import { useEffect, useRef } from "react";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { cn } from "@/lib/utils";

interface Props {
  /** CSS selector of the table whose `tbody tr[data-qty]` rows are summed. */
  target: string;
  className?: string;
}

const kg = (g: number) => (g >= 1000 ? `${(g / 1000).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} kg` : `${Math.round(g)} g`);

/**
 * "Tổng cộng" line of a stock table that follows what is on screen: the rows left after the ▾ filters, or — as soon as
 * some are ticked — just the ticked rows. Rows carry data-qty, data-jpy (¥ of the row), data-g (net grams of the row,
 * empty when the product has no weight) and data-held (pieces held for orders).
 */
export function LiveTotals({ target, className }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const table = document.querySelector<HTMLTableElement>(target);
    const el = ref.current;
    if (!table || !el) return;
    const compute = () => {
      const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>("tbody tr[data-qty]")).filter((r) => !r.classList.contains("hidden") && r.offsetParent !== null);
      const ticked = rows.filter((r) => r.querySelector<HTMLInputElement>("td input[type=checkbox]")?.checked);
      const use = ticked.length ? ticked : rows;
      let qty = 0;
      let jpy = 0;
      let jpyKnown = false;
      let g = 0;
      let gMissing = 0;
      let held = 0;
      for (const r of use) {
        const q = Number(r.dataset.qty || 0);
        qty += q;
        if (r.dataset.jpy) {
          jpy += Number(r.dataset.jpy);
          jpyKnown = true;
        }
        if (r.dataset.g) g += Number(r.dataset.g);
        else gMissing += q;
        held += Number(r.dataset.held || 0);
      }
      el.textContent = `${ticked.length ? `đã tick ${ticked.length} dòng` : `${use.length} dòng đang hiện`}: ${qty} cái${held ? ` · ${held} cái cho đơn` : ""}${jpyKnown ? ` · ≈ ¥${Math.round(jpy).toLocaleString("ja-JP")}` : ""} · ≈ ${kg(g)} hàng${gMissing ? ` (${gMissing} cái chưa rõ cân)` : ""}`;
      el.dataset.mode = ticked.length ? "ticked" : "shown";
    };
    const later = () => window.requestAnimationFrame(compute);
    compute();
    // rows hidden by the ▾ filters (class), ticks in the table, and ticks made from elsewhere (select-all, "Bỏ tick")
    const mo = new MutationObserver(later);
    mo.observe(table, { attributes: true, subtree: true, attributeFilter: ["class", "hidden", "style"] });
    document.addEventListener("change", later);
    document.addEventListener("click", later);
    return () => {
      mo.disconnect();
      document.removeEventListener("change", later);
      document.removeEventListener("click", later);
    };
  }, [target]);
  return (
    <p className={cn("m-0 mb-2 flex flex-wrap items-center gap-x-1.5 rounded-md border border-[#e5e7eb] bg-[#f9fafb] px-3 py-1.5 text-[13px] text-lien-heading", className)} data-testid="live-totals" title="Tính theo các dòng đang hiện (sau khi lọc ▾); tick dòng thì chỉ tính các dòng đã tick. Cân nặng = cân nặng sản phẩm × số cái, chưa gồm thùng, lót.">
      <Fa name="balance-scale" /> <b>Tổng cộng</b> <span ref={ref} />
    </p>
  );
}
