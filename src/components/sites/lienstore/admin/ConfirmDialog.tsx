"use client";

import { useEffect, useRef } from "react";
import { Fa } from "@/components/sites/lienstore/shared/icons";

export interface ConfirmDialogProps {
  open: boolean;
  title?: string;
  message: string;
  /** Extra lines under the message (e.g. what exactly gets removed). */
  details?: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button for destructive actions (default). */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Styled replacement for window.confirm: native <dialog> (Esc / backdrop close), red confirm for destructive actions. */
export function ConfirmDialog({ open, title = "Xác nhận", message, details, confirmLabel = "Xóa", cancelLabel = "Hủy", danger = true, onConfirm, onCancel }: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      className="m-auto w-[min(92vw,420px)] rounded-2xl border-0 bg-white p-0 text-lien-text shadow-2xl backdrop:bg-black/40"
      data-testid="confirm-dialog"
    >
      <div className="p-6">
        <div className="flex items-start gap-3">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${danger ? "bg-red-50 text-lien-sale-text" : "bg-lien-blue-soft text-lien-blue"}`} aria-hidden>
            <Fa name={danger ? "trash" : "check"} />
          </span>
          <div className="min-w-0">
            <h3 className="m-0 text-[16px] font-bold leading-6 text-lien-heading">{title}</h3>
            <p className="m-0 mt-1 text-[14px] leading-6">{message}</p>
            {details?.length ? (
              <ul className="m-0 mt-2 list-disc pl-5 text-[13px] leading-5 text-lien-muted">
                {details.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-md border border-[#d1d5db] bg-white px-4 py-2 text-[14px] font-semibold text-lien-text hover:bg-[#f9fafb]" autoFocus>
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm} className={`rounded-md px-4 py-2 text-[14px] font-semibold text-white ${danger ? "bg-lien-sale hover:brightness-95" : "bg-lien-blue hover:brightness-95"}`} data-testid="confirm-yes">
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
