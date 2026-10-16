"use client";

import Link from "next/link";

export interface ProductBriefView {
  id: number;
  name: string;
  sku: string | null;
  thumb: string;
  status: "publish" | "draft";
  saleStatus: "instock" | "discontinued";
  adminUrl: string;
  stockUrl: string;
}
export interface StockView {
  product: ProductBriefView;
  stock: number | null;
  stockVn: number | null;
  minStock: number | null;
  inHand: number;
  heldForOrders: number;
  incoming: number;
  notYetBought: number;
  places: Array<{ warehouse: string; label: string; total: number; free: number; held: number; boxed: number; byExpiry: Array<{ expiry: string | null; qty: number; expired: boolean }> }>;
  transit: Array<{ status: string; label: string; qty: number }>;
  barcodes: Array<{ id: number; code: string; packQty: number; packLabel: string }>;
  price?: { price: number; regularPrice: number | null };
  /** Only when the account has "Xem giá vốn" (see_cost). Sorted thấp → cao. */
  costSources?: Array<{
    source: string;
    label: string;
    priceJpy: number;
    feeJpy: number;
    landedJpy: number;
    priceVnd: number;
    url: string;
    checkedAt: string | null;
    cheapest: boolean;
  }>;
  jpyRate?: number;
}
export interface UnitBriefView {
  code: string;
  statusLabel: string;
  place: string;
  removed: string | null;
  expiry: string | null;
  orderNumber: number | null;
  committed: boolean;
  shipmentCode: string;
  receiptCode: string;
  url: string;
}

const vnd = (n: number) => `${n.toLocaleString("vi-VN")}đ`;
const jpy = (n: number) => `¥${Math.round(n).toLocaleString("ja-JP")}`;

export function ProductHeader({ product, code, packQty, packLabel }: { product: ProductBriefView; code?: string; packQty?: number; packLabel?: string }) {
  return (
    <div className="flex gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element -- admin thumbs come from /api/files */}
      <img src={product.thumb || "/sites/lienstore/brand/no-image.png"} alt="" className="h-16 w-16 shrink-0 rounded border border-[#e5e7eb] bg-white object-contain" />
      <div className="min-w-0 text-[14px] leading-5">
        <div className="font-semibold text-lien-heading">{product.name}</div>
        <div className="text-[12px] text-lien-muted">
          #{product.id}
          {product.sku ? ` · SKU ${product.sku}` : ""}
          {product.status === "draft" ? " · bản nháp" : ""}
          {product.saleStatus === "discontinued" ? " · ngừng bán" : ""}
        </div>
        {code ? (
          <div className="text-[12px] text-lien-muted">
            Mã vừa quét <span className="font-mono text-lien-text">{code}</span>
            {packQty && packQty > 1 ? ` · quy cách ${packLabel || "gói"} = ${packQty} cái` : ""}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function UnitInfo({ unit }: { unit: UnitBriefView }) {
  return (
    <div className="rounded-md bg-[#f3f4f6] p-2 text-[13px] leading-5" data-testid="unit-info">
      <div>
        Cái <span className="font-mono font-semibold">{unit.code}</span> · {unit.place}
        {unit.removed ? <span className="font-semibold text-red-700"> · đã loại ({unit.removed})</span> : null}
      </div>
      <div className="text-lien-muted">
        {unit.expiry ? `HSD ${unit.expiry}` : "Chưa có HSD"}
        {unit.orderNumber ? ` · giữ cho đơn #${unit.orderNumber}${unit.committed ? " (đã trừ)" : ""}` : " · chưa giữ cho đơn nào"}
        {unit.shipmentCode ? ` · chuyến ${unit.shipmentCode}` : ""}
        {unit.receiptCode ? ` · bill ${unit.receiptCode}` : ""}
      </div>
      <Link href={unit.url} className="text-lien-blue underline">
        Lịch sử cái này
      </Link>
    </div>
  );
}

export function ProductStockCard({ stock }: { stock: StockView }) {
  return (
    <div className="space-y-2 text-[14px]" data-testid="stock-card">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-md bg-green-50 p-2">
          <div className="text-[20px] font-bold text-green-800">{stock.stock ?? "—"}</div>
          <div className="text-[11px] leading-4 text-green-900">Khả dụng (rảnh)</div>
        </div>
        <div className="rounded-md bg-amber-50 p-2">
          <div className="text-[20px] font-bold text-amber-800">{stock.heldForOrders}</div>
          <div className="text-[11px] leading-4 text-amber-900">Giữ cho đơn</div>
        </div>
        <div className="rounded-md bg-sky-50 p-2">
          <div className="text-[20px] font-bold text-sky-800">{stock.inHand}</div>
          <div className="text-[11px] leading-4 text-sky-900">Thực tế trong tay</div>
        </div>
      </div>
      {stock.stock === null ? <p className="text-[12px] text-lien-muted">Hàng order — không lưu kho (chưa từng có hàng trong tay).</p> : null}
      {stock.places.map((p) => (
        <div key={p.warehouse} className="rounded-md border border-[#e5e7eb] p-2">
          <div className="flex justify-between font-semibold">
            <span>{p.label}</span>
            <span>{p.total} cái</span>
          </div>
          <div className="text-[12px] text-lien-muted">
            rảnh {p.free} · giữ cho đơn {p.held}
            {p.boxed ? ` · đã đóng thùng ${p.boxed}` : ""}
          </div>
          {p.byExpiry.length ? (
            <ul className="mt-1 text-[12px]">
              {p.byExpiry.map((e) => (
                <li key={e.expiry ?? "none"} className={e.expired ? "font-semibold text-red-700" : ""}>
                  {e.expiry ? `HSD ${e.expiry}` : "Không ghi HSD"}: {e.qty}
                  {e.expired ? " (đã hết hạn)" : ""}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ))}
      {stock.transit.length ? <div className="text-[12px] text-lien-muted">Đang về: {stock.transit.map((t) => `${t.label} ${t.qty}`).join(" · ")}</div> : null}
      {stock.notYetBought ? <div className="text-[12px] text-lien-muted">Chưa mua / đã đặt mua: {stock.notYetBought}</div> : null}
      {stock.price ? (
        <div className="text-[13px]">
          Giá bán: <strong>{stock.price.price ? vnd(stock.price.price) : "Liên hệ"}</strong>
          {stock.price.regularPrice ? <span className="text-lien-muted"> (thường {vnd(stock.price.regularPrice)})</span> : null}
        </div>
      ) : null}
      {stock.costSources ? (
        <div className="rounded-md border border-[#e5e7eb] p-2" data-testid="cost-sources">
          <div className="mb-1 font-semibold text-[13px]">Giá các nguồn (thấp → cao)</div>
          {stock.costSources.length === 0 ? (
            <p className="text-[12px] text-lien-muted">Chưa có báo giá nguồn nào trên sản phẩm.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[12px]">
                  <thead>
                    <tr className="border-b border-[#e5e7eb] text-lien-muted">
                      <th className="py-1 pr-2 font-medium">Nguồn</th>
                      <th className="py-1 pr-2 font-medium text-right">¥ báo giá</th>
                      <th className="py-1 pr-2 font-medium text-right">Phụ phí</th>
                      <th className="py-1 font-medium text-right">Vốn ≈</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stock.costSources.map((c) => (
                      <tr key={`${c.source}-${c.priceJpy}-${c.url}`} className={c.cheapest ? "bg-green-50 font-semibold text-green-900" : ""}>
                        <td className="py-1.5 pr-2 align-top">
                          {c.url ? (
                            <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-lien-blue underline">
                              {c.label}
                            </a>
                          ) : (
                            c.label
                          )}
                          {c.cheapest ? <span className="ml-1 text-[10px] font-bold text-green-700">rẻ nhất</span> : null}
                        </td>
                        <td className="py-1.5 pr-2 text-right font-mono align-top">{jpy(c.priceJpy)}</td>
                        <td className="py-1.5 pr-2 text-right font-mono align-top text-lien-muted">{c.feeJpy ? `+${jpy(c.feeJpy)}` : "—"}</td>
                        <td className="py-1.5 text-right font-mono align-top">{vnd(c.priceVnd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {stock.jpyRate ? <p className="mt-1 text-[11px] text-lien-muted">Vốn ≈ (¥ + phụ phí nguồn) × tỉ giá {stock.jpyRate.toLocaleString("vi-VN")} — quyền “Xem giá vốn”.</p> : null}
            </>
          )}
        </div>
      ) : null}
      {stock.barcodes.length ? <div className="text-[12px] text-lien-muted">Mã đã liên kết: {stock.barcodes.map((b) => `${b.code}${b.packQty > 1 ? ` (${b.packLabel || "gói"} ${b.packQty})` : ""}`).join(", ")}</div> : null}
      <div className="flex gap-3 text-[13px]">
        <Link href={stock.product.stockUrl} className="text-lien-blue underline">
          Tồn kho chi tiết
        </Link>
        <Link href={stock.product.adminUrl} className="text-lien-blue underline">
          Trang sản phẩm
        </Link>
        {stock.inHand ? (
          <a href={`/print/units/?product=${stock.product.id}`} target="_blank" rel="noopener" className="text-lien-blue underline">
            In nhãn mã H ({stock.inHand})
          </a>
        ) : null}
      </div>
    </div>
  );
}
