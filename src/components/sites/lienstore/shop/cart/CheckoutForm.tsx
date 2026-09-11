"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { placeOrder } from "@/app/checkout/actions";
import { useCart } from "@/components/sites/lienstore/shop/CartProvider";
import { useLang } from "@/components/sites/lienstore/shared/LangProvider";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { formatAmount } from "@/lib/format";
import { BANK } from "@/lib/payment";
import { detectRegion, zoneForRegion } from "@/lib/vn-regions";
import { openAccountDrawer } from "@/components/sites/lienstore/shared/open-account";
import { billableKg, quoteJpLegs, type ShippingQuoteConfig, zoneFeeForWeight } from "@/lib/shipping";
import { cn } from "@/lib/utils";
import type { CheckoutState } from "./checkout-types";
import { Price, Required, shopTableClass, shopTdClass, shopThClass, WooHeading, WooNotice, wooButtonClass, wooInputClass } from "./WooUi";

export interface CheckoutDefaults {
  firstName?: string;
  lastName?: string;
  address?: string;
  phone?: string;
  email?: string;
}

/** A domestic delivery option (one zone of a VN-domestic shipping method). */
export interface CheckoutZone {
  id: number;
  methodId: number;
  label: string;
  fee: number;
  unit: string;
  baseG: number | null;
  stepG: number | null;
  stepFee: number | null;
  /** Surcharge for liquids / aerosols / bulky items (zone "phụ phí"). */
  extraFee: number | null;
  freeOver: number | null;
  eta: string;
  areas: string;
}

/** One Vietnam delivery carrier at checkout: zone table (Viettel Post, VNPost) or live GHN quote by 3-level address. */
export interface CheckoutMethod {
  id: number;
  name: string;
  carrier: string | null;
  /** Customer may pay the fee to the courier on delivery. */
  codShipFee: boolean;
  /** Fee comes from the carrier API (GHN) after the address is chosen. */
  live: boolean;
  zones: CheckoutZone[];
}

interface GhnOption {
  id?: number;
  code?: string;
  name: string;
  supportType?: number;
}
interface GhnQuoteView {
  total: number;
  shipping: number;
  cod: number;
  remote: number;
  service: string;
}

interface FieldProps {
  name: string;
  label: string;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  error?: string;
  half?: boolean;
  defaultValue?: string;
  required?: boolean;
  value?: string;
  onChange?: (v: string) => void;
}

function Field({ name, label, type = "text", placeholder, autoComplete, error, half, defaultValue, required = true, value, onChange }: FieldProps) {
  const id = `billing_${name}`;
  return (
    <p className={cn("form-row mb-1.5 p-[3px]", half ? "w-full sm:w-[47%]" : "w-full")}>
      <label htmlFor={id} className="mb-2 block text-[16px] font-semibold leading-8 text-lien-input-text">
        {label} {required ? <Required /> : <span className="optional font-normal text-lien-muted">(tuỳ chọn)</span>}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        autoComplete={autoComplete}
        {...(onChange ? { value: value ?? "", onChange: (e) => onChange(e.target.value) } : { defaultValue })}
        aria-invalid={error ? true : undefined}
        className={cn(wooInputClass, error && "border-[#b81c23]")}
      />
      {error ? <span className="mt-1 block text-[14px] leading-5 text-[#b81c23]">{error}</span> : null}
    </p>
  );
}

export interface SavedAddress {
  id: number;
  label: string;
  name: string;
  phone: string;
  address: string;
  isDefault: boolean;
}

interface Props {
  defaults?: CheckoutDefaults;
  loggedIn?: boolean;
  /** Address book of the signed-in customer (picked with radios above the address field). */
  savedAddresses?: SavedAddress[];
  zones: CheckoutZone[];
  /** Carriers for the VN leg (zones grouped per carrier, or live-quoted). */
  methods?: CheckoutMethod[];
  pickupAddress: string;
  /** Product ids that are bought to order (must be prepaid). */
  preorderIds: number[];
  /** Billable grams per product id (safety factor already applied). */
  weights?: Record<number, number>;
  /** Product ids tagged liquid / aerosol / bulky (pay the zone surcharge). */
  specialIds?: number[];
  /** Regular (crossed-out) price per product id, for the "you saved" line. */
  regularPrices?: Record<number, number>;
  /** How the Japan-side legs are priced (per-order mode) — same function runs again on the server. */
  quote?: ShippingQuoteConfig;
}

/** Checkout: billing fields, delivery choice (pickup / home delivery with zone fee), order review, payment, place order. */
export function CheckoutForm({ defaults = {}, loggedIn = false, savedAddresses = [], zones, methods = [], pickupAddress, preorderIds, weights = {}, specialIds = [], regularPrices = {}, quote }: Props) {
  const { items, hydrated, subtotal } = useCart();
  const { t } = useLang();
  const [state, action, pending] = useActionState<CheckoutState, FormData>(placeOrder, null);
  const carriers = methods.length ? methods : zones.length ? [{ id: 0, name: "", carrier: null, codShipFee: true, live: false, zones }] : [];
  const [delivery, setDelivery] = useState<"ship" | "pickup">("pickup");
  const [methodId, setMethodId] = useState<number>(0);
  const method = carriers.find((m) => m.id === methodId) ?? null;
  const methodZones = method?.zones ?? [];
  const defaultSaved = savedAddresses.find((a) => a.isDefault) ?? savedAddresses[0];
  const [picked, setPicked] = useState<number | "new">(defaultSaved ? defaultSaved.id : "new");
  const pickedAddr = picked === "new" ? null : (savedAddresses.find((a) => a.id === picked) ?? null);
  const [address, setAddress] = useState(defaultSaved?.address ?? defaults.address ?? "");
  // the fee region comes from the address the customer typed — no region picker
  const detected = detectRegion(address);
  const [feePayment, setFeePayment] = useState<"prepaid" | "on_delivery">("prepaid");
  // GHN live quote: 3-level address → server quote (weight & parcel recomputed on the server)
  const [provinces, setProvinces] = useState<GhnOption[]>([]);
  const [districts, setDistricts] = useState<GhnOption[]>([]);
  const [wards, setWards] = useState<GhnOption[]>([]);
  const [provinceId, setProvinceId] = useState<number | "">("");
  const [districtId, setDistrictId] = useState<number | "">("");
  const [wardCode, setWardCode] = useState<string>("");
  const [ghnQuote, setGhnQuote] = useState<GhnQuoteView | null>(null);
  const [ghnState, setGhnState] = useState<"idle" | "loading" | "error">("idle");
  const [ghnError, setGhnError] = useState<string | null>(null);
  const quoteSeq = useRef(0);
  const [createAccount, setCreateAccount] = useState(false);
  const [voucherInput, setVoucherInput] = useState("");
  const [voucher, setVoucher] = useState<{ code: string; discount: number; label: string } | null>(null);
  const [voucherMsg, setVoucherMsg] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  // "Thanh toán" opens a confirmation sheet with a snapshot of the form; the real submit happens from there.
  const formRef = useRef<HTMLFormElement>(null);
  const [confirm, setConfirm] = useState<{ firstName: string; lastName: string; phone: string; email: string; address: string; note: string } | null>(null);
  const openConfirm = () => {
    const fd = new FormData(formRef.current ?? undefined);
    const v = (k: string) => String(fd.get(k) ?? "").trim();
    setConfirm({ firstName: v("first_name"), lastName: v("last_name"), phone: v("phone"), email: v("email"), address: v("address"), note: v("note") });
  };

  // every order is paid up front by bank transfer (QR + account shown on the order page after "Đặt hàng")
  const payment = "bacs" as const;

  const zone = method && !method.live && methodZones.length ? (detected ? zoneForRegion(methodZones, detected.region) : undefined) ?? methodZones.find((z) => /nam/i.test(z.label)) ?? methodZones[methodZones.length - 1] : null;
  const liveMethod = !!method?.live && delivery === "ship";
  const canCodShip = delivery === "ship" && !!method?.codShipFee;
  const effectiveFeePayment: "prepaid" | "on_delivery" = canCodShip && feePayment === "on_delivery" ? "on_delivery" : "prepaid";

  const fetchJson = async <T,>(url: string, init?: RequestInit): Promise<T> => {
    const res = await fetch(url, init);
    const body = (await res.json()) as T & { message?: string };
    if (!res.ok) throw new Error(body?.message || "Lỗi kết nối");
    return body;
  };
  useEffect(() => {
    if (!liveMethod || provinces.length) return;
    fetchJson<{ data: GhnOption[] }>("/api/shipping/ghn/provinces/").then((r) => setProvinces(r.data)).catch((e: Error) => { setGhnState("error"); setGhnError(e.message); });
  }, [liveMethod, provinces.length]);
  useEffect(() => {
    setDistricts([]); setWards([]); setDistrictId(""); setWardCode(""); setGhnQuote(null);
    if (!provinceId) return;
    fetchJson<{ data: GhnOption[] }>(`/api/shipping/ghn/districts/?provinceId=${provinceId}`).then((r) => setDistricts(r.data.filter((d) => d.supportType === undefined || d.supportType >= 2))).catch((e: Error) => { setGhnState("error"); setGhnError(e.message); });
  }, [provinceId]);
  useEffect(() => {
    setWards([]); setWardCode(""); setGhnQuote(null);
    if (!districtId) return;
    fetchJson<{ data: GhnOption[] }>(`/api/shipping/ghn/wards/?districtId=${districtId}`).then((r) => setWards(r.data.filter((w) => w.supportType === undefined || w.supportType >= 2))).catch((e: Error) => { setGhnState("error"); setGhnError(e.message); });
  }, [districtId]);
  const itemsKey = JSON.stringify(items.map((it) => [it.productId, it.quantity]));
  const requestQuote = () => {
    if (!liveMethod || !districtId || !wardCode || items.length === 0) return;
    const seq = ++quoteSeq.current;
    setGhnState("loading"); setGhnError(null);
    fetchJson<{ quote: { fee: { total: number; shipping: number; cod: number; pickupRemoteArea: number; deliveryRemoteArea: number }; service: { name: string } } }>("/api/shipping/ghn/quote/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toDistrictId: districtId, toWardCode: wardCode, items: items.map((it) => ({ productId: it.productId, quantity: it.quantity })), cod: (payment as string) === "cod" }),
    })
      .then((r) => {
        if (seq !== quoteSeq.current) return;
        setGhnQuote({ total: r.quote.fee.total, shipping: r.quote.fee.shipping, cod: r.quote.fee.cod, remote: r.quote.fee.pickupRemoteArea + r.quote.fee.deliveryRemoteArea, service: r.quote.service.name });
        setGhnState("idle");
      })
      .catch((e: Error) => {
        if (seq !== quoteSeq.current) return;
        setGhnQuote(null); setGhnState("error"); setGhnError(e.message);
      });
  };
  useEffect(() => {
    setGhnQuote(null);
    if (!liveMethod || !districtId || !wardCode) return;
    const t = window.setTimeout(requestQuote, 500);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveMethod, districtId, wardCode, itemsKey, payment]);
  const totalWeightG = items.reduce((s, it) => s + (weights[it.productId] ?? 1000) * it.quantity, 0);
  const kg = billableKg(totalWeightG || 1000);
  const special = items.some((it) => specialIds.includes(it.productId));
  const zoneBase = (z: CheckoutZone) => zoneFeeForWeight(z, totalWeightG || 1000);
  const zoneSurcharge = (z: CheckoutZone) => (special && z.extraFee ? z.extraFee : 0);
  // gross carrier fee → shop support (free-shipping threshold) → what the customer pays for the VN leg
  const carrierFee = delivery === "pickup" ? 0 : liveMethod ? (ghnQuote?.total ?? 0) : zone ? zoneBase(zone) : 0;
  const surcharge = delivery === "pickup" || liveMethod || !zone ? 0 : zoneSurcharge(zone);
  const shipSupport = delivery === "ship" && !liveMethod && zone && zone.freeOver && subtotal >= zone.freeOver ? carrierFee + surcharge : 0;
  const vnFee = Math.max(0, carrierFee + surcharge - shipSupport);
  const shipDetail = delivery === "pickup" ? t("pickupZero") : liveMethod ? `Giao Hàng Nhanh${ghnQuote ? ` · ${ghnQuote.service}` : ""}` : zone ? `${method?.carrier ?? method?.name ?? ""} · ≈ ${formatAmount(totalWeightG || 1000)} g` : "";
  const jpLegs = quote ? quoteJpLegs(quote, totalWeightG || 1000, subtotal) : [];
  const jpFee = jpLegs.reduce((s, l) => s + l.fee, 0);
  const shippingFee = (effectiveFeePayment === "on_delivery" ? 0 : vnFee) + jpFee;
  const perOrder = !!quote && quote.mode === "per_order";
  const discount = voucher ? Math.min(voucher.discount, subtotal) : 0;
  const total = Math.max(0, subtotal - discount) + shippingFee;

  const applyVoucher = async () => {
    const code = voucherInput.trim();
    if (!code) return;
    setChecking(true);
    setVoucherMsg(null);
    try {
      const r = (await fetch(`/api/voucher/?code=${encodeURIComponent(code)}&subtotal=${subtotal}`).then((x) => x.json())) as { ok: boolean; code?: string; discount?: number; label?: string; message?: string };
      if (r.ok && r.code) {
        setVoucher({ code: r.code, discount: r.discount ?? 0, label: r.label ?? "" });
        setVoucherMsg(`Đã áp dụng mã ${r.code} (${r.label}).`);
      } else {
        setVoucher(null);
        setVoucherMsg(r.message ?? "Mã không hợp lệ.");
      }
    } catch {
      setVoucherMsg("Không kiểm tra được mã, thử lại.");
    } finally {
      setChecking(false);
    }
  };

  if (!hydrated) return <div className="min-h-[240px]" aria-busy="true" />;

  if (items.length === 0) {
    return (
      <div className="woocommerce">
        <WooNotice kind="info">{t("cartEmpty")}</WooNotice>
        <p>
          <Link href="/shop/" className={wooButtonClass}>
            {t("backToShop")}
          </Link>
        </p>
      </div>
    );
  }

  const fields = state?.fields ?? {};
  const optionCls = (active: boolean) => cn("flex cursor-pointer items-start gap-3 rounded-md border p-3 text-[14px] leading-5", active ? "border-lien-blue bg-lien-blue-soft/60" : "border-lien-line bg-white hover:border-lien-blue/60");

  return (
    <div className="woocommerce">
      {!loggedIn ? (
        <WooNotice kind="info">
          {t("haveAccountQ")}{" "}
          <button type="button" onClick={() => openAccountDrawer("login")} className="text-lien-muted underline hover:text-lien-blue">
            {t("clickToLogin")}
          </button>
        </WooNotice>
      ) : null}

      {state?.error ? (
        <WooNotice kind="error">
          {state.error}
          {Object.keys(fields).length ? (
            <ul className="mt-2 list-disc pl-5">
              {Object.values(fields).map((msg) => (
                <li key={msg}>{msg}</li>
              ))}
            </ul>
          ) : null}
        </WooNotice>
      ) : null}

      <form ref={formRef} action={action} className="checkout woocommerce-checkout" noValidate>
        <input type="hidden" name="items" value={JSON.stringify(items)} readOnly />
        <input type="hidden" name="delivery" value={delivery} readOnly />
        <input type="hidden" name="shipping_method" value={method?.id ?? ""} readOnly />
        <input type="hidden" name="shipping_zone" value={zone?.id ?? ""} readOnly />
        <input type="hidden" name="ship_fee_payment" value={effectiveFeePayment} readOnly />
        <input type="hidden" name="ghn_district_id" value={liveMethod && districtId ? String(districtId) : ""} readOnly />
        <input type="hidden" name="ghn_ward_code" value={liveMethod ? wardCode : ""} readOnly />
        <input type="hidden" name="ghn_province_name" value={provinces.find((p) => p.id === provinceId)?.name ?? ""} readOnly />
        <input type="hidden" name="ghn_district_name" value={districts.find((d) => d.id === districtId)?.name ?? ""} readOnly />
        <input type="hidden" name="ghn_ward_name" value={wards.find((w) => w.code === wardCode)?.name ?? ""} readOnly />
        <input type="hidden" name="payment_method" value={payment} readOnly />
        <input type="hidden" name="voucher_code" value={voucher?.code ?? ""} readOnly />

        <div id="customer_details" className="col2-set sm:flex sm:justify-between">
          <div className="col-1 w-full sm:w-[48%]">
            <div className="woocommerce-billing-fields">
              <WooHeading as="h3">{t("recipientInfo")}</WooHeading>
              <div className="flex flex-wrap justify-between">
                <Field name="first_name" label={t("firstNameShort")} autoComplete="given-name" error={fields.first_name} half defaultValue={defaults.firstName} />
                <Field name="last_name" label={t("lastNameShort")} autoComplete="family-name" error={fields.last_name} half defaultValue={defaults.lastName} />
                <Field key={`phone-${picked}`} name="phone" label={t("phone")} type="tel" autoComplete="tel" error={fields.phone} defaultValue={pickedAddr?.phone || defaults.phone} />
                <Field name="email" label={t("emailOptionalLabel")} type="email" autoComplete="email" error={fields.email} defaultValue={defaults.email} required={false} />
                {savedAddresses.length ? (
                  <fieldset className="mb-2 w-full p-[3px]">
                    <legend className="mb-1.5 text-[16px] font-semibold leading-8 text-lien-input-text">{t("savedAddresses")}</legend>
                    <div className="space-y-1.5">
                      {savedAddresses.map((a) => (
                        <label key={a.id} className={cn("flex cursor-pointer items-start gap-2 rounded-md border p-2.5 text-[14px] leading-5", picked === a.id ? "border-lien-blue bg-lien-blue-soft/60" : "border-lien-line bg-white hover:border-lien-blue/60")}>
                          <input type="radio" name="saved_address" value={a.id} checked={picked === a.id} onChange={() => { setPicked(a.id); setAddress(a.address); }} className="mt-0.5 h-4 w-4" />
                          <span>
                            <strong className="text-lien-heading">{a.label}</strong>
                            {a.isDefault ? <span className="ml-1 rounded bg-lien-blue px-1.5 text-[10px] font-bold uppercase text-white">mặc định</span> : null}
                            <span className="block text-lien-text">{a.address}</span>
                            {a.name || a.phone ? <span className="block text-[12px] text-lien-muted">{[a.name, a.phone].filter(Boolean).join(" · ")}</span> : null}
                          </span>
                        </label>
                      ))}
                      <label className={cn("flex cursor-pointer items-center gap-2 rounded-md border p-2.5 text-[14px] leading-5", picked === "new" ? "border-lien-blue bg-lien-blue-soft/60" : "border-lien-line bg-white hover:border-lien-blue/60")}>
                        <input type="radio" name="saved_address" value="new" checked={picked === "new"} onChange={() => { setPicked("new"); setAddress(""); }} className="h-4 w-4" />
                        {t("newAddress")}
                      </label>
                    </div>
                  </fieldset>
                ) : null}
                <Field name="address" label={t("address")} placeholder={t("addressPh")} autoComplete="street-address" error={fields.address} value={address} onChange={(v) => { setAddress(v); if (pickedAddr && v !== pickedAddr.address) setPicked("new"); }} />
              </div>
            </div>
            {!loggedIn ? (
              <div className="woocommerce-account-fields mt-2">
                <p className="form-row form-row-wide create-account mb-1.5 p-[3px]">
                  <label className="inline-flex items-center gap-2 text-[16px] font-semibold leading-8 text-lien-input-text">
                    <input type="checkbox" name="createaccount" checked={createAccount} onChange={(e) => setCreateAccount(e.target.checked)} className="h-4 w-4" />
                    {t("createAccountQ")}
                  </label>
                </p>
                {createAccount ? (
                  <p className="form-row mb-1.5 p-[3px]">
                    <label htmlFor="account_password" className="mb-2 block text-[16px] font-semibold leading-8 text-lien-input-text">
                      {t("createPassword")} <Required />
                    </label>
                    <input id="account_password" name="account_password" type="password" autoComplete="new-password" minLength={6} className={cn(wooInputClass, fields.account_password && "border-[#b81c23]")} />
                    {fields.account_password ? <span className="mt-1 block text-[14px] leading-5 text-[#b81c23]">{fields.account_password}</span> : null}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="col-2 w-full sm:w-[48%]">
            <WooHeading as="h3">{t("deliveryMethod")}</WooHeading>
            <div className="space-y-2">
              <label className={optionCls(delivery === "pickup")}>
                <input type="radio" name="delivery_choice" checked={delivery === "pickup"} onChange={() => setDelivery("pickup")} className="mt-1 h-4 w-4" />
                <span>
                  <span className="block font-semibold text-lien-heading">
                    {t("pickup")} <span className="ml-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-800">{t("free")}</span>
                  </span>
                  <span className="block text-[13px] text-lien-muted">{pickupAddress || "Địa chỉ kho sẽ được gửi sau khi xác nhận đơn."}</span>
                </span>
              </label>
              <label className={optionCls(delivery === "ship")}>
                <input type="radio" name="delivery_choice" checked={delivery === "ship"} onChange={() => setDelivery("ship")} disabled={carriers.length === 0} className="mt-1 h-4 w-4" />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-lien-heading">{t("homeDelivery")}</span>
                  {carriers.length === 0 ? <span className="block text-[13px] text-lien-muted">Chưa cấu hình đơn vị giao hàng.</span> : null}
                  {delivery === "ship" && carriers.length ? (
                    !address.trim() ? (
                      <span className="mt-1 block text-[13px] text-lien-muted">{t("enterAddressFirst")}</span>
                    ) : (
                      <>
                        <label className="mt-2 block text-[12px] font-semibold text-lien-muted">
                          {t("carrierLabel")}
                          <select
                            value={method?.id ?? ""}
                            onChange={(e) => {
                              setMethodId(Number(e.target.value));
                              setGhnQuote(null);
                            }}
                            className={cn(wooInputClass, "mt-1 !h-auto !py-2 text-[14px] font-normal", fields.shipping_zone && "border-[#b81c23]")}
                          >
                            <option value="">{t("chooseCarrier")}</option>
                            {carriers.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name}
                                {m.live ? " — tính phí chính xác theo địa chỉ" : ""}
                                {!m.codShipFee ? " — trả trước phí ship" : ""}
                              </option>
                            ))}
                          </select>
                        </label>
                        {liveMethod ? (
                          <span className="mt-2 grid gap-2 sm:grid-cols-3">
                            <select value={provinceId} onChange={(e) => setProvinceId(e.target.value ? Number(e.target.value) : "")} className={cn(wooInputClass, "!h-auto !py-2 text-[14px]")} aria-label={t("ghnProvince")}>
                              <option value="">{t("ghnProvince")}</option>
                              {provinces.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                            </select>
                            <select value={districtId} onChange={(e) => setDistrictId(e.target.value ? Number(e.target.value) : "")} disabled={!provinceId} className={cn(wooInputClass, "!h-auto !py-2 text-[14px]")} aria-label={t("ghnDistrict")}>
                              <option value="">{t("ghnDistrict")}</option>
                              {districts.map((d) => (
                                <option key={d.id} value={d.id}>
                                  {d.name}
                                </option>
                              ))}
                            </select>
                            <select value={wardCode} onChange={(e) => setWardCode(e.target.value)} disabled={!districtId} className={cn(wooInputClass, "!h-auto !py-2 text-[14px]")} aria-label={t("ghnWard")}>
                              <option value="">{t("ghnWard")}</option>
                              {wards.map((w) => (
                                <option key={w.code} value={w.code}>
                                  {w.name}
                                </option>
                              ))}
                            </select>
                            <span className="text-[12px] text-lien-muted sm:col-span-3">
                              {ghnState === "loading" ? (
                                <span className="text-lien-blue">{t("ghnQuoting")}</span>
                              ) : ghnQuote ? (
                                <span>
                                  <strong className="text-lien-heading">Giao Hàng Nhanh — {ghnQuote.service}</strong> · {formatAmount(ghnQuote.total)}đ
                                  {ghnQuote.remote ? ` (gồm phụ phí vùng xa ${formatAmount(ghnQuote.remote)}đ)` : ""}. {t("ghnEstimateNote")}
                                </span>
                              ) : ghnState === "error" ? (
                                <span className="text-[#b81c23]">
                                  {ghnError}{" "}
                                  <button type="button" onClick={requestQuote} className="underline">
                                    {t("ghnRetry")}
                                  </button>
                                </span>
                              ) : (
                                t("ghnPickAddress")
                              )}
                            </span>
                          </span>
                        ) : method && !detected ? (
                          <span className="mt-1 block text-[12px] text-lien-muted">{t("regionNotDetected")}</span>
                        ) : null}
                        {fields.shipping_zone ? <span className="mt-1 block text-[14px] leading-5 text-[#b81c23]">{fields.shipping_zone}</span> : null}
                      </>
                    )
                  ) : null}
                </span>
              </label>
            </div>

            {delivery === "ship" && method ? (
              <fieldset className="mt-3 rounded-md border border-lien-line bg-white p-3">
                <legend className="px-1 text-[13px] font-semibold text-lien-heading">{t("shipFeePayment")}</legend>
                <label className="flex cursor-pointer items-start gap-2 py-1 text-[14px] leading-5">
                  <input type="radio" name="ship_fee_choice" checked={effectiveFeePayment === "prepaid"} onChange={() => setFeePayment("prepaid")} className="mt-1 h-4 w-4" />
                  <span>{t("feePrepaid")}</span>
                </label>
                <label className={cn("flex items-start gap-2 py-1 text-[14px] leading-5", canCodShip ? "cursor-pointer" : "opacity-60")}>
                  <input type="radio" name="ship_fee_choice" checked={effectiveFeePayment === "on_delivery"} disabled={!canCodShip} onChange={() => setFeePayment("on_delivery")} className="mt-1 h-4 w-4" />
                  <span>
                    {t("feeOnDelivery")}
                    {!canCodShip ? <span className="block text-[12px] text-lien-muted">{t("feeOnDeliveryNa")}</span> : null}
                  </span>
                </label>
              </fieldset>
            ) : null}
            <p className="mt-3 text-[13px] leading-5 text-lien-text">
              <Fa name="info-circle" className="mr-1 text-lien-blue" />
              {t("mergeOrdersHint")}
            </p>

            <div className="woocommerce-additional-fields mt-4">
              <p className="form-row notes mb-1.5 p-[3px]">
                <label htmlFor="order_comments" className="mb-2 block text-[16px] font-semibold leading-8 text-lien-input-text">
                  {t("orderNote")} <span className="optional font-semibold">{t("optional")}</span>
                </label>
                <textarea id="order_comments" name="note" rows={2} placeholder={t("orderNotePh")} className={cn(wooInputClass, "h-16 resize-y font-mono leading-6")} />
              </p>
            </div>
          </div>
        </div>

        <WooHeading as="h3" className="mt-6">
          {t("yourOrder")}
        </WooHeading>
        <div id="order_review" className="woocommerce-checkout-review-order">
          <table className={cn(shopTableClass, "woocommerce-checkout-review-order-table")}>
            <thead>
              <tr>
                <th className={shopThClass} scope="col">
                  {t("product")}
                </th>
                <th className={shopThClass} scope="col">
                  {t("subtotal")}
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.productId} className="cart_item">
                  <td className={shopTdClass}>
                    {it.name} <strong className="product-quantity whitespace-nowrap">× {it.quantity}</strong>
                    {preorderIds.includes(it.productId) ? <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">{t("preorderTag")}</span> : null}
                    {regularPrices[it.productId] && regularPrices[it.productId] > it.price ? (
                      <span className="block text-[12px] text-lien-success">
                        {t("saleLine")} −{Math.round(100 - (it.price / regularPrices[it.productId]) * 100)}% · {t("regularPriceWord")} {formatAmount(regularPrices[it.productId])}đ → {formatAmount(it.price)}đ (−{formatAmount((regularPrices[it.productId] - it.price) * it.quantity)}đ)
                      </span>
                    ) : null}
                  </td>
                  <td className={shopTdClass}>
                    <Price value={it.price * it.quantity} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="cart-subtotal">
                <th className={cn(shopTdClass, "font-bold")} scope="row">
                  {t("subtotal")}
                </th>
                <td className={cn(shopTdClass, "font-bold")}>
                  <Price value={subtotal} />
                </td>
              </tr>
              {voucher ? (
                <tr className="discount">
                  <th className={cn(shopTdClass, "font-bold")} scope="row">
                    {t("discount")} <span className="font-normal text-lien-muted">({voucher.code})</span>
                  </th>
                  <td className={cn(shopTdClass, "text-lien-success")}>
                    −<Price value={discount} />{" "}
                    <button type="button" onClick={() => { setVoucher(null); setVoucherMsg(null); }} className="ml-2 text-[12px] text-lien-muted underline hover:text-lien-heart">
                      {t("removeCode")}
                    </button>
                  </td>
                </tr>
              ) : null}
              {jpLegs.map((l) => (
                <tr key={l.leg} className="shipping">
                  <th className={cn(shopTdClass, "font-bold")} scope="row">
                    {l.leg === "jp_domestic" ? t("jpDomesticLeg") : l.leg === "vn_transfer" ? t("leg_vn_transfer") : t("jpVnLeg")}
                    <span className="block text-[12px] font-normal text-lien-muted">
                      {l.label}
                      {/¥/.test(l.currency) ? ` · ${formatAmount(l.feeRaw)}¥` : ""}
                    </span>
                  </th>
                  <td className={shopTdClass}>{l.fee === 0 ? t("free") : <Price value={l.fee} />}</td>
                </tr>
              ))}
              <tr className="shipping">
                <th className={cn(shopTdClass, "font-bold")} scope="row">
                  {perOrder ? t("vnLeg") : t("shipping")}
                  {shipDetail ? <span className="block text-[12px] font-normal text-lien-muted">{shipDetail}</span> : null}
                </th>
                <td className={shopTdClass}>
                  {liveMethod && !ghnQuote ? <span className="text-lien-muted">{ghnState === "loading" ? t("ghnQuoting") : "—"}</span> : <Price value={carrierFee} />}
                </td>
              </tr>
              {surcharge > 0 ? (
                <tr className="shipping-surcharge">
                  <th className={cn(shopTdClass, "font-normal text-lien-muted")} scope="row">
                    {t("shipSurcharge")}
                  </th>
                  <td className={shopTdClass}>+<Price value={surcharge} /></td>
                </tr>
              ) : null}
              {shipSupport > 0 && zone?.freeOver ? (
                <tr className="shipping-support">
                  <th className={cn(shopTdClass, "font-normal text-lien-muted")} scope="row">
                    {t("shipSupport")} <span className="text-[12px]">({t("orderFrom")} {formatAmount(zone.freeOver)}đ)</span>
                  </th>
                  <td className={cn(shopTdClass, "text-lien-success")}>−<Price value={shipSupport} /></td>
                </tr>
              ) : null}
              {delivery === "ship" && effectiveFeePayment === "on_delivery" && vnFee > 0 ? (
                <tr className="shipping-cod">
                  <th className={cn(shopTdClass, "font-normal text-lien-muted")} scope="row">
                    {t("shipOnDeliveryLine")} <span className="text-[12px]">{t("notInTotal")}</span>
                  </th>
                  <td className={cn(shopTdClass, "text-lien-muted")}>≈ <Price value={vnFee} /></td>
                </tr>
              ) : null}
              {perOrder ? (
                <tr className="shipping-total">
                  <th className={cn(shopTdClass, "font-semibold text-lien-muted")} scope="row">
                    {t("totalShipping")} <span className="font-normal">({formatAmount(totalWeightG)} g cân tính phí → {kg} kg)</span>
                  </th>
                  <td className={cn(shopTdClass, "text-lien-muted")}>
                    <Price value={shippingFee} />
                  </td>
                </tr>
              ) : null}
              <tr className="voucher-row">
                <td colSpan={2} className={cn(shopTdClass, "!py-3")}>
                  <label htmlFor="voucher_input" className="mb-1.5 block text-[13px] font-semibold text-lien-heading">
                    <Fa name="gift" className="mr-1 text-lien-blue" /> {t("voucherLabel")}
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="voucher_input"
                      value={voucherInput}
                      onChange={(e) => setVoucherInput(e.target.value.toUpperCase())}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void applyVoucher();
                        }
                      }}
                      placeholder={t("enterCode")}
                      className={cn(wooInputClass, "!mb-0 !h-10 flex-1 uppercase")}
                    />
                    <button type="button" onClick={() => void applyVoucher()} disabled={checking || !voucherInput.trim()} className={cn(wooButtonClass, "!py-2 whitespace-nowrap disabled:opacity-60")}>
                      {checking ? t("checking") : t("apply")}
                    </button>
                  </div>
                  {voucherMsg ? <p className={cn("m-0 mt-1.5 text-[13px]", voucher ? "text-lien-success" : "text-[#b81c23]")}>{voucherMsg}</p> : null}
                </td>
              </tr>
              <tr className="order-total">
                <th className={cn(shopTdClass, "font-bold")} scope="row">
                  {t("total")}
                </th>
                <td className={cn(shopTdClass, "font-bold")}>
                  <Price value={total} />
                </td>
              </tr>
            </tfoot>
          </table>

          <div className="place-order mt-4 flex flex-col items-end gap-2">
            <button type="button" onClick={openConfirm} disabled={pending} className={cn(wooButtonClass, "!px-10 !py-2.5 !text-[15px] font-arial")} id="place_order">
              {pending ? t("processing") : t("payNow")}
            </button>
            <p className="m-0 max-w-[560px] text-right text-[12px] leading-5 text-lien-muted">
              <Fa name="credit-card" className="mr-1 text-lien-blue" /> {t("payAfterOrderNote").replace("{0}", BANK.bank)} Thông tin của bạn chỉ dùng để xử lý đơn hàng, theo{" "}
              <Link href="/privacy-policy/" className="text-lien-muted hover:text-lien-blue">
                chính sách riêng tư
              </Link>
              .
            </p>
          </div>
        </div>

        {confirm ? (
          <div className="fixed inset-0 z-[9600] flex items-end justify-center bg-black/50 p-3 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
            <button type="button" aria-label={t("editInfo")} onClick={() => setConfirm(null)} className="absolute inset-0 cursor-default" />
            <div className="relative max-h-[92vh] w-full max-w-[600px] overflow-y-auto rounded-lg bg-white p-5 shadow-2xl sm:p-6">
              <h3 id="confirm-title" className="m-0 text-[18px] font-bold text-lien-heading">
                {t("confirmTitle")}
              </h3>
              <p className="m-0 mt-1 text-[13px] leading-5 text-lien-muted">{t("confirmHint")}</p>
              {(() => {
                const missing = [
                  !confirm.firstName && !confirm.lastName ? t("firstNameShort") : "",
                  !confirm.phone ? t("phone") : "",
                  !confirm.address ? t("address") : "",
                  delivery === "ship" && !method ? t("deliveryLabel") : "",
                ].filter(Boolean);
                const row = "grid grid-cols-[110px_1fr] gap-x-3 gap-y-1 text-[14px] leading-6";
                return (
                  <>
                    <dl className={cn(row, "m-0 mt-4 rounded-md border border-lien-line bg-lien-cream/60 p-3")}>
                      <dt className="text-lien-muted">{t("recipientLabel")}</dt>
                      <dd className="m-0 font-semibold text-lien-heading">{`${confirm.lastName} ${confirm.firstName}`.trim() || "—"}</dd>
                      <dt className="text-lien-muted">{t("phone")}</dt>
                      <dd className="m-0">{confirm.phone || "—"}</dd>
                      {confirm.email ? (
                        <>
                          <dt className="text-lien-muted">Email</dt>
                          <dd className="m-0">{confirm.email}</dd>
                        </>
                      ) : null}
                      <dt className="text-lien-muted">{t("address")}</dt>
                      <dd className="m-0">{confirm.address || "—"}</dd>
                      <dt className="text-lien-muted">{t("deliveryLabel")}</dt>
                      <dd className="m-0">
                        {delivery === "pickup" ? t("pickupFree") : method ? `${method.carrier ?? method.name}${zone ? ` · ${zone.label}` : ""}${liveMethod && ghnQuote ? ` · ${ghnQuote.service}` : ""}${effectiveFeePayment === "on_delivery" ? ` · ${t("shipOnDeliveryLine")}` : ""}` : "—"}
                      </dd>
                      {confirm.note ? (
                        <>
                          <dt className="text-lien-muted">{t("orderNoteLabel")}</dt>
                          <dd className="m-0 whitespace-pre-wrap">{confirm.note}</dd>
                        </>
                      ) : null}
                    </dl>
                    <table className="mt-4 w-full border-collapse text-[14px] leading-6">
                      <tbody>
                        {items.map((it) => (
                          <tr key={it.productId} className="border-b border-lien-line">
                            <td className="py-1.5 pr-2 text-lien-text">
                              {it.name} <strong className="whitespace-nowrap">× {it.quantity}</strong>
                            </td>
                            <td className="py-1.5 text-right whitespace-nowrap">
                              <Price value={it.price * it.quantity} />
                            </td>
                          </tr>
                        ))}
                        <tr>
                          <td className="pt-2 text-lien-muted">{t("subtotal")}</td>
                          <td className="pt-2 text-right"><Price value={subtotal} /></td>
                        </tr>
                        {discount > 0 ? (
                          <tr>
                            <td className="text-lien-muted">{t("discount")}{voucher ? ` (${voucher.code})` : ""}</td>
                            <td className="text-right text-lien-success">−<Price value={discount} /></td>
                          </tr>
                        ) : null}
                        <tr>
                          <td className="text-lien-muted">{t("deliveryLabel")}</td>
                          <td className="text-right"><Price value={shippingFee} /></td>
                        </tr>
                        <tr className="border-t-2 border-lien-heading/20 text-[16px] font-bold text-lien-heading">
                          <td className="pt-2">{t("total")}</td>
                          <td className="pt-2 text-right"><Price value={total} /></td>
                        </tr>
                      </tbody>
                    </table>
                    {missing.length ? <p className="m-0 mt-3 rounded-md bg-[#fde8ea] px-3 py-2 text-[13px] font-semibold text-[#842029]">{t("missingInfo")}{missing.join(", ")}.</p> : null}
                    <div className="mt-5 flex flex-wrap justify-end gap-2">
                      <button type="button" onClick={() => setConfirm(null)} className="rounded-md border border-lien-line bg-white px-4 py-2 text-[14px] font-semibold text-lien-text hover:bg-lien-cream">
                        {t("editInfo")}
                      </button>
                      <button type="submit" disabled={pending || missing.length > 0} onClick={() => window.setTimeout(() => setConfirm(null), 400)} className={cn(wooButtonClass, "!px-6 !py-2 disabled:opacity-60")}>
                        {pending ? t("processing") : t("confirmPay")}
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        ) : null}
      </form>
    </div>
  );
}
