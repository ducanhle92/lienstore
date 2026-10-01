"use client";

import { useEffect, useRef } from "react";
import { formatPrice } from "@/lib/format";
import { StatChip, StatChips } from "./StatChip";

export interface OrdersTotalsInit {
  orders: number;
  revenue: number;
  cogs: number;
  ship: number;
  voucher: number;
  promo: number;
  profit: number;
  missing: number;
}

const signedText = (n: number) => `${n < 0 ? "−" : ""}${formatPrice(Math.abs(n))}`;

/**
 * "Tổng theo bộ lọc" of the orders list: server-rendered figures that then follow the screen — the rows left after the
 * ▾ filters, or, once any are ticked, just the ticked rows. Rows carry data-rev / data-cogs / data-ship / data-voucher /
 * data-promo / data-profit / data-missing (cancelled orders carry none → not counted).
 */
export function OrdersTotals({ target, initial }: { target: string; initial: OrdersTotalsInit }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const table = document.querySelector<HTMLTableElement>(target);
    const root = box.current;
    if (!table || !root) return;
    const set = (k: string, v: string, show = true, tone?: "green" | "red") => {
      const chip = root.querySelector<HTMLElement>(`[data-k="${k}"]`);
      if (!chip) return;
      chip.classList.toggle("hidden", !show);
      const b = chip.querySelector("b");
      if (b) b.textContent = v;
      if (tone) {
        chip.classList.toggle("border-green-200", tone === "green");
        chip.classList.toggle("bg-green-50", tone === "green");
        chip.classList.toggle("text-green-900", tone === "green");
        chip.classList.toggle("border-red-200", tone === "red");
        chip.classList.toggle("bg-red-50", tone === "red");
        chip.classList.toggle("text-red-900", tone === "red");
      }
    };
    const compute = () => {
      const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>("tbody tr")).filter((r) => !r.classList.contains("hidden") && r.offsetParent !== null);
      const ticked = rows.filter((r) => r.querySelector<HTMLInputElement>("td input[type=checkbox]")?.checked);
      const use = (ticked.length ? ticked : rows).filter((r) => r.dataset.rev !== undefined);
      const num = (r: HTMLTableRowElement, k: string) => Number(r.dataset[k] || 0);
      const t = { orders: use.length, revenue: 0, cogs: 0, ship: 0, voucher: 0, promo: 0, profit: 0, missing: 0 };
      for (const r of use) {
        t.revenue += num(r, "rev");
        t.cogs += num(r, "cogs");
        t.ship += num(r, "ship");
        t.voucher += num(r, "voucher");
        t.promo += num(r, "promo");
        t.profit += num(r, "profit");
        t.missing += num(r, "missing");
      }
      const scope = root.querySelector<HTMLElement>("[data-k='scope']");
      if (scope) scope.textContent = ticked.length ? `đã tick ${ticked.length} đơn` : "";
      set("orders", String(t.orders));
      set("revenue", formatPrice(t.revenue));
      set("cogs", formatPrice(t.cogs));
      set("ship", formatPrice(t.ship));
      set("voucher", formatPrice(t.voucher), t.voucher > 0);
      set("promo", formatPrice(t.promo), t.promo > 0);
      set("profit", signedText(t.profit), true, t.profit >= 0 ? "green" : "red");
      set("missing", String(t.missing), t.missing > 0);
    };
    const later = () => window.requestAnimationFrame(compute);
    compute();
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
  const i = initial;
  return (
    <div ref={box} className="mb-3" data-testid="orders-totals" title="Tính theo các đơn đang hiện (sau khi lọc ▾), trừ đơn đã huỷ; tick đơn thì chỉ tính các đơn đã tick">
      <StatChips caption="Tổng theo bộ lọc">
        <span className="text-[12px] text-lien-muted" data-k="scope" />
        <StatChip icon="shopping-cart" value={i.orders} label="đơn" dataKey="orders" title="Đơn trong bộ lọc, trừ đơn đã huỷ" />
        <StatChip icon="money" value={formatPrice(i.revenue)} label="doanh thu" tone="green" dataKey="revenue" title="Tiền hàng sau voucher + ship khách trả shop" />
        <StatChip icon="tags" value={formatPrice(i.cogs)} label="giá vốn" dataKey="cogs" />
        <StatChip icon="truck" value={formatPrice(i.ship)} label="vận chuyển" dataKey="ship" title="Phí vận chuyển shop chịu: nhập 3 chặng + giao VN trả hãng − ship khách trả shop" />
        <StatChip icon="gift" value={formatPrice(i.voucher)} label="voucher" tone="amber" hidden={!i.voucher} dataKey="voucher" />
        <StatChip icon="tag" value={formatPrice(i.promo)} label="giảm giá SP" tone="amber" hidden={!i.promo} dataKey="promo" />
        <StatChip icon="line-chart" value={signedText(i.profit)} label="lãi / lỗ" tone={i.profit >= 0 ? "green" : "red"} dataKey="profit" />
        <StatChip value={i.missing} label="dòng chưa có giá vốn" tone="red" hidden={!i.missing} dataKey="missing" />
      </StatChips>
    </div>
  );
}
