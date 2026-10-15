"use client";

import { useState } from "react";
import { api, newOpId } from "./scan-client";
import type { ProductBriefView } from "./ProductStockCard";

/**
 * Mã lạ: the code is shown as read, the user finds the product and links the code (needs the "products" permission).
 * Nothing is created automatically; "Tạo sản phẩm" opens the normal admin form in a new tab. After linking, the
 * caller re-applies the same scan in the document that was open (context kept).
 */
interface Hit {
  id: number;
  name: string;
  sku: string | null;
  thumb: string;
  status: string;
}

export function LinkCodePanel({ code, candidates, canLink, onLinked, onCancel }: { code: string; candidates?: ProductBriefView[]; canLink: boolean; onLinked: () => void; onCancel: () => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>(candidates?.map((c) => ({ id: c.id, name: c.name, sku: c.sku, thumb: c.thumb, status: c.status })) ?? []);
  const [picked, setPicked] = useState<Hit | null>(null);
  const [packQty, setPackQty] = useState(1);
  const [packLabel, setPackLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [needForce, setNeedForce] = useState(false);
  const [key] = useState(newOpId);

  const search = async () => {
    if (!q.trim()) return;
    setBusy(true);
    setMsg("");
    const r = await api<Hit[]>("GET", "products", { query: { search: q.trim(), fields: "id,name,sku,thumb,status", perPage: 15 } });
    setBusy(false);
    if (r.ok) {
      setHits(r.data);
      if (!r.data.length) setMsg("Không tìm thấy sản phẩm.");
    } else setMsg(r.error.message);
  };

  const link = async (force: boolean) => {
    if (!picked) return;
    setBusy(true);
    setMsg("");
    const r = await api("POST", `products/${picked.id}/barcodes`, { body: { code, packQty, packLabel, force }, idempotencyKey: `link-${key}-${picked.id}-${packQty}-${force ? 1 : 0}` });
    setBusy(false);
    if (r.ok) return onLinked();
    if (r.error.code === "CODE_IS_SKU_OF_OTHER") setNeedForce(true);
    setMsg(r.error.message);
  };

  return (
    <div className="space-y-3 rounded-lg border-2 border-amber-400 bg-amber-50 p-3 text-[14px]" data-testid="link-panel">
      <div>
        <div className="font-semibold text-amber-900">{candidates?.length ? "Mã trùng nhiều sản phẩm — chọn đúng sản phẩm" : "Chưa liên kết sản phẩm"}</div>
        <div className="font-mono text-[16px]">{code}</div>
      </div>
      {!canLink ? (
        <p className="text-[13px]">Tài khoản không có quyền Sản phẩm để liên kết mã — nhờ quản trị liên kết, hoặc tìm sản phẩm bằng tên.</p>
      ) : null}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm sản phẩm theo tên / SKU" className="min-h-11 min-w-0 flex-1 rounded-md border border-[#d1d5db] px-3" enterKeyHint="search" data-testid="link-search" />
        <button type="submit" className="min-h-11 rounded-md bg-lien-blue px-4 font-semibold text-white" disabled={busy}>
          Tìm
        </button>
      </form>
      {hits.length ? (
        <ul className="max-h-60 divide-y overflow-y-auto rounded-md border border-[#e5e7eb] bg-white">
          {hits.map((h) => (
            <li key={h.id}>
              <button type="button" className={`flex min-h-12 w-full items-center gap-2 px-2 text-left ${picked?.id === h.id ? "bg-sky-100" : ""}`} onClick={() => setPicked(h)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={h.thumb || "/sites/lienstore/brand/no-image.png"} alt="" className="h-10 w-10 rounded object-contain" />
                <span className="min-w-0 text-[13px] leading-4">
                  {h.name}
                  <span className="block text-lien-muted">
                    #{h.id}
                    {h.sku ? ` · ${h.sku}` : ""}
                    {h.status === "draft" ? " · nháp" : ""}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {picked && canLink ? (
        <div className="space-y-2 rounded-md bg-white p-2">
          <div className="text-[13px]">
            Liên kết <span className="font-mono">{code}</span> → <strong>#{picked.id}</strong> {picked.name}
          </div>
          <div className="flex items-center gap-2 text-[13px]">
            <label htmlFor="pack-qty">Mỗi mã =</label>
            <input id="pack-qty" type="number" min={1} max={1000} value={packQty} onChange={(e) => setPackQty(Math.max(1, Number.parseInt(e.target.value, 10) || 1))} className="min-h-11 w-20 rounded-md border border-[#d1d5db] px-2" inputMode="numeric" />
            <span>cái</span>
            <input value={packLabel} onChange={(e) => setPackLabel(e.target.value)} placeholder="(hộp, thùng…)" className="min-h-11 w-28 rounded-md border border-[#d1d5db] px-2" />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="min-h-12 flex-1 rounded-lg bg-green-700 px-4 font-semibold text-white" disabled={busy} onClick={() => void link(false)} data-testid="link-confirm">
              Liên kết mã
            </button>
            {needForce ? (
              <button type="button" className="min-h-12 rounded-lg border border-red-600 px-3 text-red-700" disabled={busy} onClick={() => void link(true)}>
                Vẫn liên kết
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      {msg ? <p className="text-[13px] text-red-700">{msg}</p> : null}
      <div className="flex flex-wrap gap-3 text-[13px]">
        <a href="/admin/products/new/" target="_blank" rel="noopener" className="text-lien-blue underline">
          Tạo sản phẩm mới (tab mới)
        </a>
        <button type="button" className="text-lien-muted underline" onClick={onCancel}>
          Bỏ qua mã này
        </button>
      </div>
    </div>
  );
}
