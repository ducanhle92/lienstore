"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { addToGroupAction } from "@/app/admin/products/groups/actions";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { adminInput, btnPrimary } from "./ui";

export interface GroupCandidate {
  id: number;
  name: string;
  sku: string | null;
  thumb: string;
  price: number;
  status: "publish" | "draft";
  /** Name of the family the product already belongs to (it will be moved). */
  inGroup: string | null;
}

interface Props {
  groupId: number;
  candidates: GroupCandidate[];
}

const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").toLowerCase();

/** Search the catalogue and tick the products to add to this family (moves them if they were in another one). */
export function AddToGroupPicker({ groupId, candidates }: Props) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<number[]>([]);
  const matches = useMemo(() => {
    const terms = strip(q).split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    return candidates.filter((c) => terms.every((t) => strip(`${c.name} ${c.sku ?? ""}`).includes(t))).slice(0, 30);
  }, [q, candidates]);
  const toggle = (id: number) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const pickedItems = candidates.filter((c) => picked.includes(c.id));
  return (
    <form action={addToGroupAction} className="grid gap-2" data-testid="add-to-group">
      <input type="hidden" name="groupId" value={groupId} />
      {picked.map((id) => (
        <input key={id} type="hidden" name="ids" value={id} />
      ))}
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Gõ tên hoặc SKU để tìm sản phẩm thêm vào nhóm…" className={`${adminInput} !mb-0`} aria-label="Tìm sản phẩm" />
      {matches.length ? (
        <ul className="m-0 max-h-[260px] list-none overflow-y-auto rounded-md border border-[#e5e7eb] p-1">
          {matches.map((c) => (
            <li key={c.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-[13px] hover:bg-[#f3f4f6]">
                <input type="checkbox" checked={picked.includes(c.id)} onChange={() => toggle(c.id)} className="h-4 w-4" />
                {c.thumb ? <Image src={c.thumb} alt="" width={28} height={28} className="h-7 w-7 shrink-0 rounded object-contain" /> : <span className="h-7 w-7" />}
                <span className="min-w-0 flex-1 truncate">
                  {c.name}
                  <span className="ml-1 text-[12px] text-lien-muted">
                    {c.sku ?? ""} · {c.price.toLocaleString("vi-VN")}đ{c.status === "draft" ? " · nháp" : ""}
                    {c.inGroup ? ` · đang ở nhóm “${c.inGroup}”` : ""}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      ) : q.trim() ? (
        <p className="m-0 text-[12px] text-lien-muted">Không có sản phẩm nào khớp (đã loại các sản phẩm đang trong nhóm này).</p>
      ) : null}
      {pickedItems.length ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] text-lien-muted">Đã chọn {pickedItems.length}:</span>
          {pickedItems.map((c) => (
            <button key={c.id} type="button" onClick={() => toggle(c.id)} className="rounded-full bg-lien-blue-soft px-2 py-0.5 text-[12px] text-lien-blue hover:bg-lien-blue hover:text-white" title="Bỏ chọn">
              {c.name.slice(0, 40)} <Fa name="times" />
            </button>
          ))}
          <button type="submit" className={`${btnPrimary} !py-1 !text-[13px]`}>
            <Fa name="plus" /> Thêm vào nhóm
          </button>
        </div>
      ) : null}
    </form>
  );
}
