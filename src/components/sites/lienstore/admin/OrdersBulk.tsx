"use client";

import { useEffect, useState } from "react";

export const BULK_FORM_ID = "orders-bulk";
const boxes = () => Array.from(document.querySelectorAll<HTMLInputElement>(`input[name="ids"][form="${BULK_FORM_ID}"]`));

/** Header checkbox: ticks / unticks every row checkbox (they belong to the bulk form via the `form` attribute). */
export function SelectAllOrders() {
  const [state, setState] = useState<"none" | "some" | "all">("none");
  useEffect(() => {
    const sync = () => {
      const all = boxes();
      const n = all.filter((b) => b.checked).length;
      setState(n === 0 ? "none" : n === all.length ? "all" : "some");
    };
    document.addEventListener("change", sync);
    sync();
    return () => document.removeEventListener("change", sync);
  }, []);
  return (
    <input
      type="checkbox"
      aria-label="Chọn tất cả đơn trong danh sách"
      className="h-4 w-4"
      checked={state === "all"}
      ref={(el) => {
        if (el) el.indeterminate = state === "some";
      }}
      onChange={(e) => {
        for (const b of boxes()) b.checked = e.target.checked;
        document.dispatchEvent(new Event("change"));
      }}
    />
  );
}

/** "Xóa đã chọn (n)" — disabled until a row is ticked; one row ticked deletes just that row. */
export function BulkDeleteButton({ className }: { className: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const sync = () => setN(boxes().filter((b) => b.checked).length);
    document.addEventListener("change", sync);
    sync();
    return () => document.removeEventListener("change", sync);
  }, []);
  return (
    <button
      type="submit"
      form={BULK_FORM_ID}
      disabled={n === 0}
      className={`${className} disabled:cursor-not-allowed disabled:opacity-40`}
      data-testid="bulk-delete"
      onClick={(e) => {
        const picked = boxes().filter((b) => b.checked);
        if (!picked.length) {
          e.preventDefault();
          return;
        }
        const label = picked.length === 1 ? `đơn #${picked[0].dataset.number ?? ""}` : `${picked.length} đơn đã chọn`;
        if (!window.confirm(`Xóa hẳn ${label}? Sản phẩm, chặng vận chuyển, tin nhắn và bill đính kèm sẽ bị xóa, không khôi phục được. Nếu chỉ muốn dừng đơn, hãy chọn trạng thái “Đã hủy”.`)) e.preventDefault();
      }}
    >
      Xóa đã chọn{n ? ` (${n})` : ""}
    </button>
  );
}
