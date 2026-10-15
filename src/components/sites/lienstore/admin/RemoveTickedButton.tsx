"use client";

import { useRef, useState } from "react";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { UNIT_REMOVED_LABEL, type UnitRemoved } from "@/lib/units";

/**
 * "Xoá" for ticked stock rows (bottom bar): opens a small dialog — reason + a required note — and submits the rows'
 * bulk form to `action`. The units are not wiped: they keep their history (who / when / why) and can be restored.
 */
export function RemoveTickedButton({ formId, action, defaultReason = "mistake", label = "Xoá" }: { formId: string; action: (fd: FormData) => Promise<void>; defaultReason?: UnitRemoved; label?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [note, setNote] = useState("");
  const ok = note.trim().length >= 3;
  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()} className="inline-flex items-center gap-1 rounded-md border border-red-300 bg-white px-2 py-1 text-[12px] font-semibold text-lien-heart hover:bg-red-50" title="Xoá các cái đã tick khỏi tồn kho (ghi lý do — xem lại / khôi phục được)" data-testid={`remove-open-${formId}`}>
        <Fa name="trash" /> {label}
      </button>
      <dialog ref={ref} className="m-auto w-[min(440px,calc(100vw-32px))] rounded-lg border border-[#e5e7eb] p-0 text-left shadow-xl backdrop:bg-black/40" data-testid={`remove-dialog-${formId}`}>
        <div className="border-b border-[#e5e7eb] px-4 py-3">
          <h3 className="m-0 text-[15px] font-semibold text-lien-heading">Xoá các cái đã tick khỏi tồn kho</h3>
          <p className="m-0 mt-1 text-[12px] leading-5 text-lien-muted">Không mất hẳn: mỗi mã ghi lại người xoá, giờ và lý do, hiện ở mục “Đã xoá / loại” cuối trang Kho và trang hàng của sản phẩm (khôi phục được). Đơn đang giữ cái đó sẽ tự tìm hàng khác.</p>
        </div>
        <div className="grid gap-3 px-4 py-3">
          <label className="grid gap-1 text-[12px] font-semibold text-lien-heading">
            Lý do
            <select name="reason" form={formId} defaultValue={defaultReason} className="rounded-md border border-[#d1d5db] bg-white px-2 py-1.5 text-[13px] font-normal">
              {Object.entries(UNIT_REMOVED_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-[12px] font-semibold text-lien-heading">
            Ghi chú <span className="font-normal text-lien-muted">— bắt buộc, VD: nhập trùng với bill PM-261012-02</span>
            <textarea name="note" form={formId} value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={300} className="rounded-md border border-[#d1d5db] px-2 py-1.5 text-[13px] font-normal" data-testid={`remove-note-${formId}`} />
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-[#e5e7eb] px-4 py-3">
          <button type="button" onClick={() => ref.current?.close()} className="rounded-md border border-[#d1d5db] bg-white px-3 py-1.5 text-[13px]">
            Huỷ
          </button>
          <button type="submit" form={formId} formAction={action} disabled={!ok} className="inline-flex items-center gap-1 rounded-md bg-lien-heart px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-40" data-testid={`remove-confirm-${formId}`}>
            <Fa name="trash" /> Xoá
          </button>
        </div>
      </dialog>
    </>
  );
}
