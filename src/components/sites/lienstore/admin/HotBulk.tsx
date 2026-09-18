"use client";

import { useEffect, useState } from "react";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { ConfirmDialog } from "./ConfirmDialog";

export const HOT_BULK_FORM_ID = "hot-bulk";
const boxes = () => Array.from(document.querySelectorAll<HTMLInputElement>(`input[name="ids"][form="${HOT_BULK_FORM_ID}"]`));

/** Header checkbox: ticks / unticks every row of the Hot list. */
export function SelectAllHot() {
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
      aria-label="Chọn tất cả sản phẩm Hot"
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

/** "Bỏ Hot đã chọn (n)" — confirms, then submits the bulk form with every ticked product id. */
export function BulkUnhotButton({ className }: { className: string }) {
  const [n, setN] = useState(0);
  const [open, setOpen] = useState(false);
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
        form={HOT_BULK_FORM_ID}
        disabled={n === 0}
        className={`${className} disabled:cursor-not-allowed disabled:opacity-40`}
        data-testid="bulk-unhot"
        onClick={(e) => {
          e.preventDefault();
          if (n) setOpen(true);
        }}
      >
        <Fa name="times" /> Bỏ Hot đã chọn{n ? ` (${n})` : ""}
      </button>
      <ConfirmDialog
        open={open}
        title={`Bỏ Hot ${n} sản phẩm?`}
        message="Các sản phẩm này không còn đứng đầu dải “Bán chạy nhất”, mất nhãn Hot và nhãn Best seller. Đánh dấu lại được bất cứ lúc nào."
        confirmLabel={`Bỏ Hot ${n} sản phẩm`}
        danger={false}
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          (document.getElementById(HOT_BULK_FORM_ID) as HTMLFormElement | null)?.requestSubmit();
        }}
      />
    </>
  );
}
