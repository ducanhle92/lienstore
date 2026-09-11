"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLang } from "@/components/sites/lienstore/shared/LangProvider";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { formatQuoteFee, type ShippingQuote, usableForCheckoutTotal } from "@/lib/carriers/types";
import { formatAmount } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Address-based shipping quotes (spec §9): nothing is shown until province + ward + street are known; then one card per
 * carrier/service with fee ("Từ …" when a part is unknown), ETA, billable weight, fee parts, source and time.
 * The same panel serves the product tab, /van-chuyen (cart) and the checkout (selectable).
 */

export interface ShipAddress {
  provinceCode: string;
  wardCode: string;
  street: string;
  provinceName?: string;
  wardName?: string;
}

export interface QuoteLine {
  productId: number;
  quantity: number;
}

interface Option {
  code: string;
  name: string;
}

export const ADDRESS_STORAGE_KEY = "lien-ship-addr";

export function loadStoredAddress(): ShipAddress | null {
  try {
    const raw = window.localStorage.getItem(ADDRESS_STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as ShipAddress;
    return v && typeof v.provinceCode === "string" && typeof v.wardCode === "string" ? { provinceCode: v.provinceCode, wardCode: v.wardCode, street: String(v.street ?? ""), provinceName: v.provinceName, wardName: v.wardName } : null;
  } catch {
    return null;
  }
}
export function storeAddress(a: ShipAddress | null) {
  try {
    if (a) window.localStorage.setItem(ADDRESS_STORAGE_KEY, JSON.stringify(a));
    else window.localStorage.removeItem(ADDRESS_STORAGE_KEY);
  } catch {
    /* storage blocked */
  }
}

export const isCompleteAddress = (a: ShipAddress | null | undefined): a is ShipAddress => !!a && !!a.provinceCode && !!a.wardCode && a.street.trim().length > 0;

const fetchJson = async <T,>(url: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(url, init);
  const body = (await res.json()) as T & { message?: string };
  if (!res.ok) throw new Error(body?.message || "Lỗi kết nối");
  return body;
};

// ---------------------------------------------------------------------------------------------------------------------
// Address fields (province → ward → street), 34-province model served by /api/shipping/address/

export function ShipAddressFields({ value, onChange, inputClass, labelClass, errors = {}, streetName = "address", compact = false }: { value: ShipAddress; onChange: (a: ShipAddress) => void; inputClass: string; labelClass?: string; errors?: Record<string, string | undefined>; streetName?: string; compact?: boolean }) {
  const { t } = useLang();
  const [provinces, setProvinces] = useState<Option[]>([]);
  // wards are kept together with the province they belong to, so a province change never shows a stale list
  const [wardStore, setWardStore] = useState<{ province: string; list: Option[] }>({ province: "", list: [] });
  const wards = wardStore.province === value.provinceCode ? wardStore.list : [];
  useEffect(() => {
    fetchJson<{ data: Option[] }>("/api/shipping/address/").then((r) => setProvinces(r.data)).catch(() => setProvinces([]));
  }, []);
  useEffect(() => {
    if (!value.provinceCode) return;
    let alive = true;
    const province = value.provinceCode;
    fetchJson<{ data: Option[] }>(`/api/shipping/address/?province=${encodeURIComponent(province)}`)
      .then((r) => {
        if (alive) setWardStore({ province, list: r.data });
      })
      .catch(() => {
        if (alive) setWardStore({ province, list: [] });
      });
    return () => {
      alive = false;
    };
  }, [value.provinceCode]);
  const lbl = labelClass ?? "mb-1 block text-[13px] font-semibold text-lien-heading";
  return (
    <div className={cn("grid gap-2", compact ? "sm:grid-cols-2" : "sm:grid-cols-2")}>
      <label className="block">
        <span className={lbl}>{t("shipProvince")} <span className="text-lien-heart">*</span></span>
        <select
          name="ship_province_code"
          value={value.provinceCode}
          onChange={(e) => {
            const code = e.target.value;
            onChange({ ...value, provinceCode: code, provinceName: provinces.find((p) => p.code === code)?.name, wardCode: "", wardName: undefined });
          }}
          className={cn(inputClass, "!h-auto !py-2 text-[14px]", errors.ship_province_code && "border-[#b81c23]")}
          aria-label={t("shipProvince")}
        >
          <option value="">— {t("shipProvince")} —</option>
          {provinces.map((p) => (
            <option key={p.code} value={p.code}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className={lbl}>{t("shipWard")} <span className="text-lien-heart">*</span></span>
        <select
          name="ship_ward_code"
          value={value.wardCode}
          disabled={!value.provinceCode}
          onChange={(e) => {
            const code = e.target.value;
            onChange({ ...value, wardCode: code, wardName: wards.find((w) => w.code === code)?.name });
          }}
          className={cn(inputClass, "!h-auto !py-2 text-[14px]", errors.ship_ward_code && "border-[#b81c23]")}
          aria-label={t("shipWard")}
        >
          <option value="">— {t("shipWard")} —</option>
          {wards.map((w) => (
            <option key={w.code} value={w.code}>
              {w.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block sm:col-span-2">
        <span className={lbl}>{t("shipStreet")} <span className="text-lien-heart">*</span></span>
        <input name={streetName} value={value.street} onChange={(e) => onChange({ ...value, street: e.target.value })} placeholder="VD: Số 12 ngõ 5 đường Lê Lợi, thôn Đông" autoComplete="street-address" className={cn(inputClass, errors[streetName] && "border-[#b81c23]")} aria-label={t("shipStreet")} />
        {errors[streetName] ? <span className="mt-1 block text-[13px] text-[#b81c23]">{errors[streetName]}</span> : null}
      </label>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Quote cards

export interface QuoteResponse {
  quotes: ShippingQuote[];
  parcel: { weightG: number; length: number; width: number; height: number; subtotal: number; quantity: number };
  destination: string;
  quotedAt: string;
  expiresAt: string;
  /** Shop pays the VN fee from this order value (free-shipping policy) — null when off for this region. */
  freeOver: number | null;
}

interface PanelProps {
  items: QuoteLine[];
  address: ShipAddress | null;
  cod?: boolean;
  compact?: boolean;
  /** Checkout mode: cards carry a "Chọn" button and the chosen one is highlighted. */
  selectable?: boolean;
  selected?: { carrier: string; serviceCode: string } | null;
  onSelect?: (q: ShippingQuote | null) => void;
  /** Latest answer (parcel, free-over threshold, quote time) for the parent's totals. */
  onQuotes?: (r: QuoteResponse | null) => void;
}

const SOURCE_KEY = { live_api: "shipSourceLive", public_rate_card: "shipSourceCard", contract_rate: "shipSourceContract" } as const;

export function ShippingQuotePanel({ items, address, cod = false, compact = false, selectable = false, selected = null, onSelect, onQuotes }: PanelProps) {
  const { t, lang } = useLang();
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<QuoteResponse | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const seq = useRef(0);
  const itemsKey = JSON.stringify(items.map((i) => [i.productId, i.quantity]));
  const complete = isCompleteAddress(address);
  const addrKey = complete ? `${address.provinceCode}|${address.wardCode}|${address.street.trim()}` : "";

  const load = useCallback(() => {
    if (!complete || items.length === 0) return;
    const my = ++seq.current;
    setState("loading");
    setError(null);
    fetchJson<QuoteResponse>("/api/shipping/quote/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provinceCode: address.provinceCode, wardCode: address.wardCode, street: address.street.trim(), items, cod }),
    })
      .then((r) => {
        if (my !== seq.current) return;
        setData(r);
        setState("ready");
        onQuotes?.(r);
      })
      .catch((e: Error) => {
        if (my !== seq.current) return;
        setData(null);
        setState("error");
        setError(e.message);
        onQuotes?.(null);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addrKey, itemsKey, cod]);

  // any change of address / cart / COD invalidates the previous answer and the selection (spec §10)
  useEffect(() => {
    onSelect?.(null);
    setData(null);
    if (!complete || items.length === 0) {
      setState("idle");
      onQuotes?.(null);
      return;
    }
    const h = window.setTimeout(load, 400);
    return () => window.clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addrKey, itemsKey, cod]);

  // never show an expired quote: refresh when the bundle's TTL passes while the panel is on screen
  useEffect(() => {
    if (!data?.expiresAt) return;
    const ms = new Date(data.expiresAt).getTime() - Date.now();
    const h = window.setTimeout(load, Math.max(1000, ms));
    return () => window.clearTimeout(h);
  }, [data?.expiresAt, load]);

  if (!complete) {
    return (
      <p className="m-0 rounded-md border border-dashed border-lien-line bg-lien-cream/50 px-3 py-3 text-[13px] leading-5 text-lien-muted" data-testid="ship-need-address">
        <Fa name="map-marker" className="mr-1 text-lien-blue" /> {t("shipQuoteNeedAddress")}
      </p>
    );
  }
  const time = (iso: string) => new Date(iso).toLocaleTimeString(lang === "ja" ? "ja-JP" : "vi-VN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" });
  const quotes = data?.quotes ?? [];
  return (
    <div className="space-y-3" data-testid="ship-quotes">
      {data ? (
        <p className="m-0 text-[12px] leading-5 text-lien-muted">
          <Fa name="cube" className="mr-1 text-lien-blue" />
          {t("shipParcel")}: {formatAmount(data.parcel.weightG)} g · {data.parcel.length}×{data.parcel.width}×{data.parcel.height} cm → {data.destination}
          {state === "loading" ? <span className="ml-2 text-lien-blue">{t("shipQuoteExpired")}</span> : null}
        </p>
      ) : null}
      {state === "loading" && !data ? (
        <p className="m-0 text-[13px] text-lien-blue" aria-busy="true">
          <Fa name="refresh" className="mr-1 animate-spin" /> {t("shipQuoting")}
        </p>
      ) : null}
      {state === "error" ? (
        <p className="m-0 text-[13px] text-[#b81c23]">
          {error}{" "}
          <button type="button" onClick={load} className="underline">
            {t("shipRetry")}
          </button>
        </p>
      ) : null}
      {data && quotes.length === 0 ? <p className="m-0 text-[13px] text-lien-muted">{t("shipNoOptions")}</p> : null}
      {data && quotes.length > 0 && !quotes.some((q) => q.available) ? <p className="m-0 text-[13px] text-amber-700">{t("shipNoOptions")}</p> : null}
      <div className={cn("grid gap-3", compact ? "" : "md:grid-cols-2")}>
        {quotes.map((q) => {
          const key = `${q.carrier}:${q.serviceCode}`;
          const isSel = !!selected && selected.carrier === q.carrier && selected.serviceCode === q.serviceCode;
          const pending = q.feeParts.filter((p) => p.amountVnd === null);
          const zero = q.feeParts.filter((p) => p.amountVnd === 0 && !p.included);
          const charged = q.feeParts.filter((p) => p.amountVnd !== null && p.amountVnd !== 0);
          return (
            <article key={key} className={cn("rounded-md border bg-white p-3 text-[13px] leading-5", q.available ? (isSel ? "border-lien-blue ring-2 ring-lien-blue/30" : "border-lien-line") : "border-dashed border-lien-line bg-lien-cream/40 text-lien-muted")} data-testid={`quote-${q.carrier}`} data-accuracy={q.accuracy} data-available={q.available ? "1" : "0"}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="m-0 font-bold text-lien-heading">
                    {q.carrierName}
                    {q.serviceName ? <span className="font-normal text-lien-muted"> — {q.serviceName}</span> : null}
                  </p>
                  {q.available ? (
                    <p className="m-0 mt-0.5 text-[20px] font-bold leading-7 text-lien-price" data-testid="quote-fee">
                      {formatQuoteFee(q, formatAmount)}
                    </p>
                  ) : (
                    <p className="m-0 mt-0.5 font-semibold" data-testid="quote-status">
                      {q.statusText}
                    </p>
                  )}
                  {q.available ? (
                    <p className="m-0 text-lien-text">
                      {t("shipEta")}: {q.etaText ?? t("shipEtaUnknown")}
                    </p>
                  ) : null}
                </div>
                {selectable && q.available ? (
                  <button type="button" onClick={() => onSelect?.(isSel ? null : q)} className={cn("shrink-0 rounded-md px-3 py-1.5 text-[13px] font-semibold", isSel ? "bg-lien-blue text-white" : "border border-lien-blue text-lien-blue hover:bg-lien-blue-soft")} aria-pressed={isSel}>
                    {isSel ? t("shipChosen") : `${t("shipChoose")} ${q.carrier === "GHN" ? "GHN" : q.carrier === "SPX" ? "SPX" : q.carrier === "VNPOST" ? "VNPost" : "Viettel Post"}`}
                  </button>
                ) : null}
              </div>
              {q.available ? (
                <>
                  <ul className="m-0 mt-2 list-none space-y-0.5 p-0 text-[12px] text-lien-muted">
                    {q.routeLabel ? <li>{t("shipRoute")}: {q.routeLabel}</li> : null}
                    <li>
                      {t("shipBillable")}: {formatAmount(q.billableWeightG)} g
                    </li>
                    {q.includes.length ? <li>{t("shipIncluded")}: {q.includes.join(", ")}</li> : null}
                    {pending.length ? (
                      <li>
                        {pending.map((p) => p.label).join(", ")}: {t("shipConfirmLater")}
                      </li>
                    ) : null}
                    {zero.length ? <li>{t("shipCardHighValue")}: {zero.map((p) => p.label).join(", ")}</li> : null}
                    <li>
                      {t("shipSource")}: {t(SOURCE_KEY[q.source])} · {t("shipQuotedAt")} {time(q.quotedAt)}
                      {q.rateCardVersion ? ` · v${q.rateCardVersion}` : ""}
                    </li>
                  </ul>
                  {q.accuracy === "from_price" ? <p className="m-0 mt-1.5 rounded bg-amber-50 px-2 py-1 text-[12px] leading-4 text-amber-800">{t("shipFromNote")}</p> : null}
                  {q.warnings.map((w) => (
                    <p key={w} className="m-0 mt-1 text-[12px] leading-4 text-amber-700">
                      {w}
                    </p>
                  ))}
                  <button type="button" onClick={() => setOpen(open === key ? null : key)} className="mt-1.5 text-[12px] font-semibold text-lien-blue underline">
                    {open === key ? t("shipHideCalc") : t("shipHowCalc")}
                  </button>
                  {open === key && data ? (
                    <dl className="m-0 mt-1.5 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 rounded bg-lien-cream/60 px-2 py-1.5 text-[12px]">
                      <dt className="text-lien-muted">{t("shipActualWeight")}</dt>
                      <dd className="m-0 text-right">{formatAmount(data.parcel.weightG)} g</dd>
                      {q.volumetricWeightG !== undefined ? (
                        <>
                          <dt className="text-lien-muted">{t("shipVolWeight")}</dt>
                          <dd className="m-0 text-right">{formatAmount(q.volumetricWeightG)} g</dd>
                        </>
                      ) : null}
                      <dt className="text-lien-muted">{t("shipBillable")}</dt>
                      <dd className="m-0 text-right">{formatAmount(q.billableWeightG)} g</dd>
                      {q.routeLabel ? (
                        <>
                          <dt className="text-lien-muted">{t("shipRoute")}</dt>
                          <dd className="m-0 text-right">{q.routeLabel}</dd>
                        </>
                      ) : null}
                      {[...charged, ...q.feeParts.filter((p) => p.included), ...zero, ...pending].map((p) => (
                        <div key={p.code} className="contents">
                          <dt className="text-lien-muted">{p.label}</dt>
                          <dd className="m-0 text-right">{p.included ? t("shipIncluded") : p.amountVnd === null ? t("shipConfirmLater") : `${p.amountVnd < 0 ? "−" : ""}${formatAmount(Math.abs(p.amountVnd))}đ`}</dd>
                        </div>
                      ))}
                      <dt className="font-semibold text-lien-heading">{usableForCheckoutTotal(q) ? "Tổng" : "Từ"}</dt>
                      <dd className="m-0 text-right font-semibold text-lien-heading">{formatQuoteFee(q, formatAmount)}</dd>
                      <dt className="text-lien-muted">{t("shipSource")}</dt>
                      <dd className="m-0 text-right">
                        {t(SOURCE_KEY[q.source])} · {time(q.quotedAt)}
                      </dd>
                    </dl>
                  ) : null}
                </>
              ) : q.warnings.length ? (
                <p className="m-0 mt-1 text-[12px] leading-4">{q.warnings[0]}</p>
              ) : null}
            </article>
          );
        })}
      </div>
      {data?.freeOver ? (
        <p className="m-0 text-[12px] leading-5 text-lien-success">
          <Fa name="gift" className="mr-1" /> Shop hỗ trợ phí giao nội địa cho đơn từ {formatAmount(data.freeOver)}đ tới khu vực này.
        </p>
      ) : null}
      {data ? <p className="m-0 text-[12px] leading-5 text-lien-muted">{t("shipGeneralNote")}</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Stand-alone tab (product page / shipping page): address form + cards, address remembered in this browser

export function ShippingQuoteTab({ items, compact = true, useCart = false }: { items?: QuoteLine[]; compact?: boolean; useCart?: boolean }) {
  const { t } = useLang();
  const [addr, setAddr] = useState<ShipAddress>({ provinceCode: "", wardCode: "", street: "" });
  const [editing, setEditing] = useState(true);
  const [cartItems, setCartItems] = useState<QuoteLine[]>([]);
  useEffect(() => {
    // read this browser's remembered address / cart after mount (deferred: the first client render must match the server)
    const h = window.setTimeout(() => {
      const stored = loadStoredAddress();
      if (stored) {
        setAddr(stored);
        setEditing(!isCompleteAddress(stored));
      }
      if (useCart) {
        try {
          const raw = window.localStorage.getItem("lienstore:cart");
          const parsed = raw ? (JSON.parse(raw) as Array<{ productId: number; quantity: number }>) : [];
          setCartItems(Array.isArray(parsed) ? parsed.filter((x) => Number.isInteger(x.productId) && x.quantity > 0).map((x) => ({ productId: x.productId, quantity: x.quantity })) : []);
        } catch {
          setCartItems([]);
        }
      }
    }, 0);
    return () => window.clearTimeout(h);
  }, [useCart]);
  const lines = useCart ? cartItems : (items ?? []);
  const complete = isCompleteAddress(addr);
  return (
    <div className="space-y-3">
      {editing || !complete ? (
        <div className="rounded-md border border-lien-line bg-white p-3">
          <ShipAddressFields value={addr} onChange={setAddr} inputClass="mb-0 block h-10 w-full rounded-md border border-lien-line bg-white px-3 text-[14px] text-lien-text" streetName="ship_street" compact={compact} />
          <button
            type="button"
            disabled={!complete}
            onClick={() => {
              storeAddress(addr);
              setEditing(false);
            }}
            className="mt-2 rounded-md bg-lien-blue px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            {t("shipGetQuotes")}
          </button>
        </div>
      ) : (
        <p className="m-0 flex flex-wrap items-center gap-2 text-[13px] text-lien-text">
          <Fa name="map-marker" className="text-lien-blue" />
          <span>
            {addr.street}, {addr.wardName ?? ""}, {addr.provinceName ?? ""}
          </span>
          <button type="button" onClick={() => setEditing(true)} className="text-[12px] font-semibold text-lien-blue underline">
            {t("shipChangeAddress")}
          </button>
        </p>
      )}
      {useCart && lines.length === 0 ? <p className="m-0 text-[13px] text-lien-muted">Thêm sản phẩm vào giỏ để xem cước cho kiện hàng của bạn.</p> : <ShippingQuotePanel items={lines} address={editing ? null : addr} compact={compact} />}
    </div>
  );
}
