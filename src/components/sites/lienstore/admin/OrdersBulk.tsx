"use client";

import { useEffect, useState } from "react";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { ConfirmDialog } from "./ConfirmDialog";

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

/** "Xóa đơn hàng" — disabled until a row is ticked; one row ticked deletes just that row. Owner only (page hides it). */
export function BulkDeleteButton({ className }: { className: string }) {
  const [n, setN] = useState(0);
  const [picked, setPicked] = useState<string[]>([]);
  useEffect(() => {
    const sync = () => setN(boxes().filter((b) => b.checked).length);
    document.addEventListener("change", sync);
    sync();
    return () => document.removeEventListener("change", sync);
  }, []);
  return (
    <>
      <button
        type="submit"
        form={BULK_FORM_ID}
        disabled={n === 0}
        className={`${className} disabled:cursor-not-allowed disabled:opacity-40`}
        data-testid="bulk-delete"
        onClick={(e) => {
          e.preventDefault();
          const list = boxes()
            .filter((b) => b.checked)
            .map((b) => `#${b.dataset.number ?? ""}`);
          if (list.length) setPicked(list);
        }}
      >
        <Fa name="trash" /> Xóa đơn hàng{n ? ` (${n})` : ""}
      </button>
      <ConfirmDialog
        open={picked.length > 0}
        title={picked.length === 1 ? `Xóa đơn ${picked[0]}?` : `Xóa ${picked.length} đơn hàng?`}
        message={picked.length === 1 ? "Đơn sẽ bị xóa vĩnh viễn, không khôi phục được." : `Các đơn ${picked.join(", ")} sẽ bị xóa vĩnh viễn, không khôi phục được.`}
        details={["Sản phẩm, 4 chặng vận chuyển, tin nhắn và bill đính kèm của đơn cũng bị xóa.", "Không tính vào doanh thu / lãi lỗ.", "Chỉ muốn dừng đơn mà giữ lịch sử thì dùng trạng thái “Đã hủy”."]}
        confirmLabel={picked.length === 1 ? "Xóa đơn" : `Xóa ${picked.length} đơn`}
        onCancel={() => setPicked([])}
        onConfirm={() => {
          setPicked([]);
          (document.getElementById(BULK_FORM_ID) as HTMLFormElement | null)?.requestSubmit();
        }}
      />
    </>
  );
}
