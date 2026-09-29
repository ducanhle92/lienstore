"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { StatChip, StatChips } from "./StatChip";

interface Props {
  /** CSS selector of the table whose `tbody tr[data-qty]` rows are summed. */
  target: string;
  className?: string;
}

const kg = (g: number) => (g >= 1000 ? `${(g / 1000).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} kg` : `${Math.round(g)} g`);

/**
 * "Tổng cộng" chips of a stock table that follow what is on screen: the rows left after the ▾ filters, or — as soon as
 * some are ticked — just the ticked rows. Rows carry data-qty, data-jpy (¥ of the row), data-g (net grams of the row,
 * empty when the product has no weight) and data-held (pieces held for orders). Figures are written straight into the
 * chips (no React state) so the line follows ticks and filters instantly.
 */
export function LiveTotals({ target, className }: Props) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const table = document.querySelector<HTMLTableElement>(target);
    const root = box.current;
    if (!table || !root) return;
    const set = (k: string, v: string, show = true) => {
      const chip = root.querySelector<HTMLElement>(`[data-k="${k}"]`);
      if (!chip) return;
      chip.classList.toggle("hidden", !show);
      const b = chip.querySelector("b");
      if (b) b.textContent = v;
    };
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
      const scope = root.querySelector<HTMLElement>("[data-k='scope']");
      if (scope) {
        scope.textContent = ticked.length ? `đã tick ${ticked.length} dòng` : `${use.length} dòng đang hiện`;
        scope.dataset.mode = ticked.length ? "ticked" : "shown";
      }
      set("qty", String(qty));
      set("held", String(held), held > 0);
      set("jpy", `≈ ¥${Math.round(jpy).toLocaleString("ja-JP")}`, jpyKnown);
      set("g", `≈ ${kg(g)}`);
      set("gmiss", String(gMissing), gMissing > 0);
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
    <div ref={box} className={cn("mb-2", className)} data-testid="live-totals" title="Tính theo các dòng đang hiện (sau khi lọc ▾); tick dòng thì chỉ tính các dòng đã tick. Cân nặng = cân nặng sản phẩm × số cái, chưa gồm thùng, lót.">
      <StatChips caption="Tổng cộng">
        <span className="text-[12px] text-lien-muted" data-k="scope" />
        <StatChip icon="cube" value="0" label="cái" tone="gray" dataKey="qty" />
        <StatChip icon="shopping-cart" value="0" label="cái cho đơn" tone="amber" hidden dataKey="held" />
        <StatChip icon="money" value="—" label="tiền hàng" tone="green" hidden dataKey="jpy" />
        <StatChip icon="balance-scale" value="—" label="hàng (chưa gồm thùng)" tone="blue" dataKey="g" />
        <StatChip value="0" label="cái chưa rõ cân" tone="red" hidden dataKey="gmiss" />
      </StatChips>
    </div>
  );
}
