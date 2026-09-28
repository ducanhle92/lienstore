"use client";

import { Fa } from "@/components/sites/lienstore/shared/icons";
import { btnSecondary } from "./ui";

interface Props {
  /** id of the form the lot checkboxes / qty boxes belong to. */
  formId: string;
  /** Scope: rows with this data attribute value are the ones this picker drives. */
  scope: string;
}

/**
 * Kho hàng › Kho Nhật: "chọn tất cả" and "Tự chọn theo đơn" — ticks the lots that hold units for paid / COD orders and
 * fills the partial-quantity box with exactly those units (FEFO order is the table order), so one click prepares the
 * shipment for what customers already paid for. Unpaid orders are left for the admin to tick by hand.
 */
export function LotPicker({ formId, scope }: Props) {
  const rows = () => Array.from(document.querySelectorAll<HTMLTableRowElement>(`tr[data-lot-scope="${scope}"]`));
  const setAll = (on: boolean) => {
    for (const r of rows()) {
      if (r.classList.contains("hidden")) continue;
      const box = r.querySelector<HTMLInputElement>('input[type="checkbox"][name="uids"]');
      if (box) box.checked = on;
    }
  };
  const byOrders = () => {
    let n = 0;
    for (const r of rows()) {
      const committed = Number(r.dataset.committed ?? 0);
      const box = r.querySelector<HTMLInputElement>('input[type="checkbox"][name="uids"]');
      const qty = r.querySelector<HTMLInputElement>('input[name^="qty_"]');
      if (!box) continue;
      if (committed > 0) {
        // the row is exactly the paid order's units: tick it whole
        box.checked = true;
        if (qty) qty.value = "";
        n++;
      } else {
        box.checked = false;
        if (qty) qty.value = "";
      }
    }
    const note = document.getElementById(`picker-note-${scope}`);
    if (note) note.textContent = n ? `Đã tick ${n} dòng hàng của đơn đã thanh toán / COD.` : "Không có hàng nào của đơn đã thanh toán ở đây.";
  };
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-[12px]">
      <label className="inline-flex items-center gap-1.5">
        <input type="checkbox" onChange={(e) => setAll(e.target.checked)} className="h-4 w-4" aria-label="Chọn tất cả dòng đang hiện" /> chọn tất cả
      </label>
      <button type="button" onClick={byOrders} className={`${btnSecondary} !py-1 !text-[12px]`} title="Tick đúng hàng của các đơn đã thanh toán hoặc COD">
        <Fa name="truck" /> Tự chọn theo đơn
      </button>
      <span id={`picker-note-${scope}`} className="text-lien-muted" />
      <span className="sr-only">{formId}</span>
    </span>
  );
}
