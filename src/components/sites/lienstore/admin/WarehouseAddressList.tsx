"use client";

import { useState } from "react";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { EXTRA_KIND_LABEL, EXTRA_KINDS, type ExtraAddress, MAX_EXTRA_ADDRESSES } from "@/lib/warehouse-addresses";
import { adminInput, btnSecondary } from "./ui";

interface Props {
  initial: ExtraAddress[];
}

const blank = (): ExtraAddress => ({ id: `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, label: "", kind: "vn", address: "", note: "" });

/**
 * "Địa chỉ khác" on Kho hàng › Địa chỉ kho: any number of extra places (second VN warehouse, a room in Japan…).
 * Rows post as parallel fields xa_id / xa_label / xa_kind / xa_address / xa_note; the page's save button submits them
 * together with the four fixed addresses.
 */
export function WarehouseAddressList({ initial }: Props) {
  const [rows, setRows] = useState<ExtraAddress[]>(initial);
  const patch = (i: number, p: Partial<ExtraAddress>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...p } : x)));
  return (
    <div className="grid gap-3" data-testid="extra-addresses">
      {rows.length === 0 ? <p className="m-0 text-[13px] text-lien-muted">Chưa có địa chỉ nào ngoài bốn kho chính. Bấm “Thêm địa chỉ” để ghi thêm kho VN thứ hai, điểm gom ở Nhật, kho tạm…</p> : null}
      {rows.map((r, i) => (
        <div key={r.id} className="grid gap-2 rounded-md border border-[#e5e7eb] bg-[#fafafa] p-3 md:grid-cols-[180px_200px_1fr_auto]" data-testid={`extra-address-${i}`}>
          <input type="hidden" name="xa_id" value={r.id} />
          <div>
            <input name="xa_label" value={r.label} onChange={(e) => patch(i, { label: e.target.value })} placeholder="Tên (VD: Kho Hà Nội)" maxLength={60} className={`${adminInput} !mb-0 !py-1.5 !text-[13px]`} aria-label="Tên địa chỉ" />
          </div>
          <div>
            <select name="xa_kind" value={r.kind} onChange={(e) => patch(i, { kind: e.target.value as ExtraAddress["kind"] })} className={`${adminInput} !mb-0 !py-1.5 !text-[13px]`} aria-label="Loại địa chỉ">
              {EXTRA_KINDS.map((k) => (
                <option key={k} value={k}>
                  {EXTRA_KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <textarea name="xa_address" value={r.address} onChange={(e) => patch(i, { address: e.target.value })} rows={2} placeholder="Địa chỉ đầy đủ" maxLength={300} className={`${adminInput} !mb-0 !py-1.5 !text-[13px]`} aria-label="Địa chỉ" />
            <input name="xa_note" value={r.note} onChange={(e) => patch(i, { note: e.target.value })} placeholder="Ghi chú (giờ nhận, người liên hệ, SĐT…)" maxLength={200} className={`${adminInput} !mb-0 !py-1.5 !text-[13px]`} aria-label="Ghi chú" />
          </div>
          <button type="button" onClick={() => setRows((x) => x.filter((_, j) => j !== i))} className="self-start rounded border border-[#d1d5db] px-2 py-1 text-[12px] text-lien-heart" title="Bỏ địa chỉ này" aria-label="Bỏ địa chỉ">
            <Fa name="times" /> Bỏ
          </button>
        </div>
      ))}
      {rows.length < MAX_EXTRA_ADDRESSES ? (
        <button type="button" onClick={() => setRows((x) => [...x, blank()])} className={`${btnSecondary} justify-self-start !py-1.5 !text-[13px]`} data-testid="add-extra-address">
          <Fa name="plus" /> Thêm địa chỉ
        </button>
      ) : null}
    </div>
  );
}
