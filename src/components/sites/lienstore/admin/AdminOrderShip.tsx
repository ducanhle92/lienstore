"use client";

import { useEffect, useRef, useState } from "react";
import type { ShippingQuote } from "@/lib/carriers/types";
import { cn } from "@/lib/utils";
import { isCompleteAddress, type QuoteLine, type ShipAddress, ShipAddressFields, ShippingQuotePanel } from "@/components/sites/lienstore/shop/ShippingQuotePanel";
import { adminInput } from "./ui";

const EMPTY: ShipAddress = { provinceCode: "", wardCode: "", street: "" };

/** The product rows of the enclosing form (add_<n>_pid / add_<n>_qty) — what the carriers quote on. */
function readItems(form: HTMLFormElement | null): QuoteLine[] {
  if (!form) return [];
  const out: QuoteLine[] = [];
  for (let n = 1; n <= 5; n++) {
    const pid = Number((form.elements.namedItem(`add_${n}_pid`) as HTMLInputElement | null)?.value || 0);
    const qty = Number((form.elements.namedItem(`add_${n}_qty`) as HTMLInputElement | null)?.value || 1);
    if (pid > 0) out.push({ productId: pid, quantity: Math.max(1, Math.floor(qty) || 1) });
  }
  return out;
}

/**
 * Delivery block of "Tạo đơn mới" — the same choice the customer gets at checkout: pick up at the shop (free) or home
 * delivery with the 2-level address and a live carrier quote to choose (GHN / Viettel Post / J&T…). The chosen quote
 * travels as ship_carrier / ship_service / ship_fee, the address as ship_province_code / ship_ward_code / address.
 */
export function AdminOrderShip() {
  const [delivery, setDelivery] = useState<"ship" | "pickup">("ship");
  const [addr, setAddr] = useState<ShipAddress>(EMPTY);
  const [sel, setSel] = useState<ShippingQuote | null>(null);
  const [items, setItems] = useState<QuoteLine[]>([]);
  const box = useRef<HTMLDivElement>(null);

  // follow the product rows typed in the same form
  useEffect(() => {
    const form = box.current?.closest("form") ?? null;
    if (!form) return;
    let timer = 0;
    const sync = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const next = readItems(form);
        setItems((cur) => (JSON.stringify(cur) === JSON.stringify(next) ? cur : next));
      }, 250);
    };
    sync();
    form.addEventListener("input", sync);
    form.addEventListener("change", sync);
    form.addEventListener("click", sync);
    return () => {
      window.clearTimeout(timer);
      form.removeEventListener("input", sync);
      form.removeEventListener("change", sync);
      form.removeEventListener("click", sync);
    };
  }, []);

  const ship = delivery === "ship";
  const opt = (on: boolean) => cn("flex items-start gap-2 rounded-md border px-3 py-2", on ? "border-lien-blue bg-lien-blue-soft/30" : "border-[#e5e7eb] bg-white");
  return (
    <div ref={box} className="grid gap-2" data-testid="admin-ship">
      <input type="hidden" name="delivery" value={delivery} readOnly />
      <input type="hidden" name="ship_carrier" value={ship && sel ? sel.carrier : ""} readOnly />
      <input type="hidden" name="ship_service" value={ship && sel ? sel.serviceCode : ""} readOnly />
      <input type="hidden" name="ship_fee" value={ship && sel && sel.totalFeeVnd !== null ? String(sel.totalFeeVnd) : ""} readOnly />
      <span className="text-[12px] font-semibold text-[#374151]">Hình thức nhận hàng</span>
      <label className={opt(!ship)}>
        <input type="radio" name="delivery_choice" checked={!ship} onChange={() => setDelivery("pickup")} className="mt-1 h-4 w-4" data-testid="ship-pickup" />
        <span>
          <b className="text-lien-heading">Nhận tại kho</b> <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-800">Miễn phí</span>
          <span className="block text-[12px] text-lien-muted">Khách tự tới kho shop VN lấy — không cần địa chỉ.</span>
        </span>
      </label>
      <div className={opt(ship)}>
        <input type="radio" name="delivery_choice" checked={ship} onChange={() => setDelivery("ship")} className="mt-1 h-4 w-4" data-testid="ship-home" />
        <div className="min-w-0 flex-1">
          <b className="text-lien-heading">Giao tận nhà</b>
          {ship ? (
            <div className="mt-2 grid gap-2">
              <ShipAddressFields value={addr} onChange={(a) => { setAddr(a); setSel(null); }} inputClass={cn(adminInput, "!mb-0")} labelClass="mb-1 block text-[12px] font-semibold text-[#374151]" streetName="address" compact />
              {!isCompleteAddress(addr) ? (
                <span className="text-[12px] text-lien-muted">Chọn tỉnh / thành, xã / phường và nhập số nhà, đường để xem cước các hãng.</span>
              ) : items.length === 0 ? (
                <span className="text-[12px] text-lien-muted">Chọn sản phẩm ở bên phải để xem cước (cước tính theo khối lượng, kích thước hàng).</span>
              ) : (
                <ShippingQuotePanel items={items} address={addr} compact selectable selected={sel ? { carrier: sel.carrier, serviceCode: sel.serviceCode } : null} onSelect={setSel} />
              )}
              {sel ? (
                <label className="text-[12px] font-semibold text-[#374151]">
                  Ai trả phí ship
                  <select name="ship_fee_payment" defaultValue="prepaid" className={cn(adminInput, "mt-1")}>
                    <option value="prepaid">Khách trả shop (cộng vào Tổng)</option>
                    <option value="on_delivery">Khách trả shipper khi nhận</option>
                  </select>
                </label>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
