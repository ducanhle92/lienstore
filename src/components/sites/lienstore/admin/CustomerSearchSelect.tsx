"use client";

import { useMemo, useState } from "react";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { TIER_CLASS, TIER_LABEL } from "@/lib/customer-tiers";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { adminInput } from "./ui";

export interface CustomerPickItem {
  id: string;
  customerNo: number | null;
  name: string;
  phone: string;
  email: string;
  tier: string;
  orders: number;
  lastOrderAt: string | null;
  note: string;
  address: { provinceCode: string; wardCode: string; street: string; text: string } | null;
}

/** Fired on the form when a customer is picked — the delivery block fills its address from it. */
export const CUSTOMER_PICK_EVENT = "lien-customer-pick";

const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").toLowerCase();
const digits = (s: string) => s.replace(/\D/g, "");

/**
 * "Khách" box of Tạo đơn mới: type a name / phone / customer number → the matching buyers; picking one fills the
 * name / phone / email / note inputs of the form (still editable) and tells the delivery block the last address.
 * The picked id travels as `customer_id`; typing on without picking creates a new profile when the order is saved.
 */
export function CustomerSearchSelect({ customers, placeholder = "Gõ tên / số điện thoại / mã KH để chọn khách đã mua…" }: { customers: CustomerPickItem[]; placeholder?: string }) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<CustomerPickItem | null>(null);
  const matches = useMemo(() => {
    const t = q.trim();
    if (!t) return [];
    const terms = strip(t).split(/\s+/).filter(Boolean);
    const d = digits(t);
    return customers
      .filter((c) => (d.length >= 3 && digits(c.phone).includes(d)) || terms.every((w) => strip(`${c.name} ${c.email} ${c.customerNo ?? ""} #${c.customerNo ?? ""}`).includes(w)))
      .slice(0, 10);
  }, [q, customers]);

  const fill = (form: HTMLFormElement | null, name: string, value: string) => {
    const el = form?.elements.namedItem(name) as HTMLInputElement | null;
    if (!el) return;
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const choose = (c: CustomerPickItem | null, el: HTMLElement) => {
    const form = el.closest("form");
    setPicked(c);
    setQ("");
    if (c) {
      fill(form, "name", c.name);
      fill(form, "phone", c.phone);
      fill(form, "email", c.email);
      if (c.note) fill(form, "note", c.note);
      form?.dispatchEvent(new CustomEvent(CUSTOMER_PICK_EVENT, { detail: c.address }));
    }
  };
  return (
    <div className="relative" data-testid="customer-search">
      <input type="hidden" name="customer_id" value={picked?.id ?? ""} />
      {picked ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-lien-blue bg-lien-blue-soft/40 px-2 py-1.5 text-[13px]" data-testid="customer-picked">
          <Fa name="user" className="text-lien-blue" />
          <span className="font-semibold text-lien-heading">{picked.name || picked.phone}</span>
          {picked.customerNo ? <span className="font-mono text-[12px] text-lien-muted">#{picked.customerNo}</span> : null}
          {picked.tier ? <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", TIER_CLASS[picked.tier as keyof typeof TIER_CLASS] ?? "")}>{TIER_LABEL[picked.tier as keyof typeof TIER_LABEL] ?? picked.tier}</span> : null}
          <span className="text-[12px] text-lien-muted">
            {picked.orders} đơn{picked.lastOrderAt ? ` · gần nhất ${formatDate(picked.lastOrderAt)}` : ""}
          </span>
          <button type="button" onClick={(e) => choose(null, e.currentTarget)} className="ml-auto text-[12px] text-lien-blue hover:underline">
            Đổi khách
          </button>
        </div>
      ) : (
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className={cn(adminInput, "!mb-0")} aria-label="Tìm khách đã mua" autoComplete="off" />
      )}
      {!picked && matches.length ? (
        <ul className="absolute left-0 right-0 z-30 m-0 mt-1 max-h-72 list-none overflow-auto rounded-md border border-[#d1d5db] bg-white p-1 shadow-lg" role="listbox">
          {matches.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={(e) => choose(c, e.currentTarget)} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] hover:bg-[#f3f4f6]" data-testid={`customer-opt-${c.id}`}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-lien-heading">
                    {c.name || "(chưa có tên)"} {c.customerNo ? <span className="font-mono text-[11px] font-normal text-lien-muted">#{c.customerNo}</span> : null}
                  </span>
                  <span className="block truncate text-[12px] text-lien-muted">
                    {c.phone}
                    {c.email ? ` · ${c.email}` : ""}
                    {c.address?.text ? ` · ${c.address.text}` : ""}
                  </span>
                </span>
                {c.tier ? <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", TIER_CLASS[c.tier as keyof typeof TIER_CLASS] ?? "")}>{TIER_LABEL[c.tier as keyof typeof TIER_LABEL] ?? c.tier}</span> : null}
                <span className="shrink-0 text-[12px] text-lien-muted">{c.orders} đơn</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {!picked && q.trim() && !matches.length ? <p className="m-0 mt-1 text-[12px] text-lien-muted">Chưa có khách nào khớp — điền tên, SĐT bên dưới, hồ sơ khách mới sẽ tự tạo khi tạo đơn.</p> : null}
    </div>
  );
}
