"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { adminInput } from "./ui";

export interface PickableProduct {
  id: number;
  name: string;
  sku: string | null;
  thumb: string;
  costJpy: number | null;
  stock: number | null;
}

interface Props {
  products: PickableProduct[];
  name?: string;
  /** Called when a product is picked (to prefill ¥ etc.). */
  onPick?: (p: PickableProduct | null) => void;
  placeholder?: string;
  /** Pre-selected product (edit forms). */
  initial?: PickableProduct | null;
}

const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").toLowerCase();

/** Type-ahead single product picker: a text box + result list; the chosen id goes into a hidden input. */
export function ProductSearchSelect({ products, name = "productId", onPick, placeholder = "Gõ tên hoặc SKU sản phẩm…", initial = null }: Props) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<PickableProduct | null>(initial);
  const matches = useMemo(() => {
    const terms = strip(q).split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    return products.filter((p) => terms.every((t) => strip(`${p.name} ${p.sku ?? ""} #${p.id}`).includes(t))).slice(0, 12);
  }, [q, products]);
  const choose = (p: PickableProduct | null) => {
    setPicked(p);
    setQ("");
    onPick?.(p);
  };
  return (
    <div className="relative" data-testid="product-search">
      <input type="hidden" name={name} value={picked?.id ?? ""} />
      {picked ? (
        <div className="flex items-center gap-2 rounded-md border border-lien-blue bg-lien-blue-soft/40 px-2 py-1.5 text-[13px]">
          {picked.thumb ? <Image src={picked.thumb} alt="" width={28} height={28} className="h-7 w-7 shrink-0 rounded object-contain" /> : null}
          <span className="min-w-0 flex-1 truncate font-semibold text-lien-heading">{picked.name}</span>
          <span className="text-[12px] text-lien-muted">
            #{picked.id}
            {picked.sku ? ` · ${picked.sku}` : ""}
          </span>
          <button type="button" onClick={() => choose(null)} className="text-[12px] text-lien-blue hover:underline">
            Đổi
          </button>
        </div>
      ) : (
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className={`${adminInput} !mb-0`} aria-label="Tìm sản phẩm" autoComplete="off" />
      )}
      {!picked && matches.length ? (
        <ul className="absolute z-20 mt-1 max-h-[280px] w-full list-none overflow-y-auto rounded-md border border-[#e5e7eb] bg-white p-1 shadow-lg">
          {matches.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => choose(p)} className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[13px] hover:bg-[#f3f4f6]">
                {p.thumb ? <Image src={p.thumb} alt="" width={28} height={28} className="h-7 w-7 shrink-0 rounded object-contain" /> : <span className="h-7 w-7" />}
                <span className="min-w-0 flex-1 truncate">
                  {p.name}
                  <span className="ml-1 text-[12px] text-lien-muted">
                    #{p.id}
                    {p.sku ? ` · ${p.sku}` : ""}
                    {p.costJpy ? ` · ¥${p.costJpy.toLocaleString("ja-JP")}` : ""}
                    {p.stock !== null ? ` · tồn ${p.stock}` : ""}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
