"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { placeOrder } from "@/app/checkout/actions";
import { useCart } from "@/components/sites/lienstore/shop/CartProvider";
import { useLang } from "@/components/sites/lienstore/shared/LangProvider";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { formatAmount } from "@/lib/format";
import { BANK } from "@/lib/payment";
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
}

function Field({ name, label, type = "text", placeholder, autoComplete, error, half, defaultValue, required = true }: FieldProps) {
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
        defaultValue={defaultValue}
        aria-invalid={error ? true : undefined}
        className={cn(wooInputClass, error && "border-[#b81c23]")}
      />
      {error ? <span className="mt-1 block text-[14px] leading-5 text-[#b81c23]">{error}</span> : null}
    </p>
  );
}

interface Props {
  defaults?: CheckoutDefaults;
  loggedIn?: boolean;
  zones: CheckoutZone[];
  /** Carriers for the VN leg (zones grouped per carrier, or live-quoted). */
  methods?: CheckoutMethod[];
  pickupAddress: string;
  /** Product ids that are bought to order (must be prepaid). */
  preorderIds: number[];
  /** Billable grams per product id (safety factor already applied). */
  weights?: Record<number, number>;
  /** How the Japan-side legs are priced (per-order mode) — same function runs again on the server. */
  quote?: ShippingQuoteConfig;
}

/** Checkout: billing fields, delivery choice (pickup / home delivery with zone fee), order review, payment, place order. */
export function CheckoutForm({ defaults = {}, loggedIn = false, zones, methods = [], pickupAddress, preorderIds, weights = {}, quote }: Props) {
  const { items, hydrated, subtotal } = useCart();
  const { t } = useLang();
  const [state, action, pending] = useActionState<CheckoutState, FormData>(placeOrder, null);
  const carriers = methods.length ? methods : zones.length ? [{ id: 0, name: "", carrier: null, codShipFee: true, live: false, zones }] : [];
  const [delivery, setDelivery] = useState<"ship" | "pickup">(carriers.length ? "ship" : "pickup");
  const [methodId, setMethodId] = useState<number>(carriers[0]?.id ?? 0);
  const method = carriers.find((m) => m.id === methodId) ?? carriers[0] ?? null;
  const methodZones = method?.zones ?? [];
  const [zoneId, setZoneId] = useState<number | "">(methodZones[0]?.id ?? "");
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

  const preorder = useMemo(() => items.filter((it) => preorderIds.includes(it.productId)), [items, preorderIds]);
  const mustPrepay = preorder.length > 0;
  const [paymentChoice, setPaymentChoice] = useState<"bacs" | "cod">("bacs");
  const payment: "bacs" | "cod" = mustPrepay ? "bacs" : paymentChoice;

  const zone = methodZones.find((z) => z.id === zoneId) ?? null;
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
    fetchJson<{ data: GhnOption[] }>("/api/shipping/ghn/provinces").then((r) => setProvinces(r.data)).catch((e: Error) => { setGhnState("error"); setGhnError(e.message); });
  }, [liveMethod, provinces.length]);
  useEffect(() => {
    setDistricts([]); setWards([]); setDistrictId(""); setWardCode(""); setGhnQuote(null);
    if (!provinceId) return;
    fetchJson<{ data: GhnOption[] }>(`/api/shipping/ghn/districts?provinceId=${provinceId}`).then((r) => setDistricts(r.data.filter((d) => d.supportType === undefined || d.supportType >= 2))).catch((e: Error) => { setGhnState("error"); setGhnError(e.message); });
  }, [provinceId]);
  useEffect(() => {
    setWards([]); setWardCode(""); setGhnQuote(null);
    if (!districtId) return;
    fetchJson<{ data: GhnOption[] }>(`/api/shipping/ghn/wards?districtId=${districtId}`).then((r) => setWards(r.data.filter((w) => w.supportType === undefined || w.supportType >= 2))).catch((e: Error) => { setGhnState("error"); setGhnError(e.message); });
  }, [districtId]);
  const itemsKey = JSON.stringify(items.map((it) => [it.productId, it.quantity]));
  const requestQuote = () => {
    if (!liveMethod || !districtId || !wardCode || items.length === 0) return;
    const seq = ++quoteSeq.current;
    setGhnState("loading"); setGhnError(null);
    fetchJson<{ quote: { fee: { total: number; shipping: number; cod: number; pickupRemoteArea: number; deliveryRemoteArea: number }; service: { name: string } } }>("/api/shipping/ghn/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toDistrictId: districtId, toWardCode: wardCode, items: items.map((it) => ({ productId: it.productId, quantity: it.quantity })), cod: payment === "cod" }),
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
  const zoneBase = (z: CheckoutZone) => zoneFeeForWeight(z, totalWeightG || 1000);
  const vnFee = delivery === "pickup" ? 0 : liveMethod ? (ghnQuote?.total ?? 0) : !zone ? 0 : zone.freeOver && subtotal >= zone.freeOver ? 0 : zoneBase(zone);
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
          <Link href="/my-account/" className="text-lien-muted underline hover:text-lien-blue">
            {t("clickToLogin")}
          </Link>
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

      <form action={action} className="checkout woocommerce-checkout" noValidate>
        <input type="hidden" name="items" value={JSON.stringify(items)} readOnly />
        <input type="hidden" name="delivery" value={delivery} readOnly />
        <input type="hidden" name="shipping_method" value={method?.id ?? ""} readOnly />
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
                <Field name="phone" label={t("phone")} type="tel" autoComplete="tel" error={fields.phone} defaultValue={defaults.phone} />
                <Field name="email" label={t("emailOptionalLabel")} type="email" autoComplete="email" error={fields.email} defaultValue={defaults.email} required={false} />
                <Field name="address" label={t("address")} placeholder={t("addressPh")} autoComplete="street-address" error={fields.address} defaultValue={defaults.address} />
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
                  {carriers.length === 0 ? (
                    <span className="block text-[13px] text-lien-muted">Chưa cấu hình khu vực giao hàng.</span>
                  ) : (
                    <>
                      {carriers.length > 1 ? (
                        <label className="mt-2 block text-[12px] font-semibold text-lien-muted">
                          {t("carrierLabel")}
                          <select
                            value={method?.id ?? ""}
                            onChange={(e) => {
                              const next = carriers.find((m) => m.id === Number(e.target.value));
                              setMethodId(Number(e.target.value));
                              setZoneId(next?.zones[0]?.id ?? "");
                              setGhnQuote(null);
                            }}
                            disabled={delivery !== "ship"}
                            className={cn(wooInputClass, "mt-1 !h-auto !py-2 text-[14px] font-normal")}
                          >
                            {carriers.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name}
                                {m.live ? " — tính phí chính xác theo địa chỉ" : ""}
                                {!m.codShipFee ? " — trả trước phí ship" : ""}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
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
                                {ghnQuote.remote ? ` (gồm phụ phí vùng xa ${formatAmount(ghnQuote.remote)}đ)` : ""}
                                {ghnQuote.cod ? ` (gồm phí thu hộ ${formatAmount(ghnQuote.cod)}đ)` : ""}. {t("ghnEstimateNote")}
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
                      ) : (
                        <>
                          <select name="shipping_zone" value={zoneId} onChange={(e) => setZoneId(Number(e.target.value))} disabled={delivery !== "ship"} className={cn(wooInputClass, "mt-2 !h-auto !py-2 text-[14px]", fields.shipping_zone && "border-[#b81c23]")} aria-label={t("regionLabel")}>
                            {methodZones.map((z) => (
                              <option key={z.id} value={z.id}>
                                {z.label} — {formatAmount(zoneBase(z))}đ{/kg/i.test(z.unit) ? ` (${kg} kg)` : z.stepG ? ` (≈ ${formatAmount(totalWeightG || 1000)} g)` : ""}
                                {z.freeOver ? ` (miễn phí từ ${formatAmount(z.freeOver)}đ)` : ""}
                                {z.eta ? ` · ${z.eta}` : ""}
                              </option>
                            ))}
                          </select>
                          {zone?.areas ? <span className="mt-1 block text-[12px] text-lien-muted">{zone.areas}</span> : null}
                        </>
                      )}
                      {fields.shipping_zone ? <span className="mt-1 block text-[14px] leading-5 text-[#b81c23]">{fields.shipping_zone}</span> : null}
                    </>
                  )}
                </span>
              </label>
            </div>

            {delivery === "ship" && carriers.length ? (
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
                    {l.leg === "jp_domestic" ? t("jpDomesticLeg") : t("jpVnLeg")}
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
                  {delivery === "pickup" && perOrder ? <span className="block text-[12px] font-normal text-lien-success">Tự tới kho lấy · không tính phí chặng này</span> : null}
                </th>
                <td className={shopTdClass}>
                  {delivery === "pickup" ? (
                    t("pickupFree")
                  ) : liveMethod ? (
                    ghnQuote ? (
                      <>
                        {effectiveFeePayment === "on_delivery" ? "≈ " : ""}
                        <Price value={ghnQuote.total} />
                        {effectiveFeePayment === "on_delivery" ? <span className="block text-[12px] text-lien-muted">{t("shipOnDeliveryLine")} {t("notInTotal")}</span> : null}
                      </>
                    ) : ghnState === "loading" ? (
                      <span className="text-lien-muted">{t("ghnQuoting")}</span>
                    ) : (
                      "—"
                    )
                  ) : zone ? (
                    vnFee === 0 ? (
                      `${zone.label} · ${t("free").toLowerCase()}`
                    ) : (
                      <>
                        {effectiveFeePayment === "on_delivery" ? "≈ " : ""}
                        <Price value={vnFee} />
                        {effectiveFeePayment === "on_delivery" ? <span className="block text-[12px] text-lien-muted">{t("shipOnDeliveryLine")} {t("notInTotal")}</span> : null}
                      </>
                    )
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
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

          <div className="mb-6 rounded-md border border-dashed border-lien-line bg-white p-4">
            <label htmlFor="voucher_input" className="mb-2 block text-[14px] font-semibold text-lien-heading">
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
                className={cn(wooInputClass, "!mb-0 flex-1 uppercase")}
              />
              <button type="button" onClick={() => void applyVoucher()} disabled={checking || !voucherInput.trim()} className={cn(wooButtonClass, "whitespace-nowrap disabled:opacity-60")}>
                {checking ? t("checking") : t("apply")}
              </button>
            </div>
            {voucherMsg ? <p className={cn("m-0 mt-2 text-[13px]", voucher ? "text-lien-success" : "text-[#b81c23]")}>{voucherMsg}</p> : null}
          </div>

          {mustPrepay ? (
            <WooNotice kind="info">
              Đơn có <strong>{preorder.length} sản phẩm hàng order</strong> (đặt mua từ Nhật theo yêu cầu) nên cần <strong>thanh toán trước 100%</strong> bằng chuyển khoản. Không áp dụng thanh toán khi nhận hàng.
            </WooNotice>
          ) : null}

          <div id="payment" className="woocommerce-checkout-payment rounded-[5px] bg-lien-blue-soft">
            <ul className="wc_payment_methods payment_methods methods m-0 list-none border-b border-[#d3ced2] p-4 text-left">
              <li className="wc_payment_method leading-8">
                <input id="payment_method_bacs" type="radio" checked={payment === "bacs"} onChange={() => setPaymentChoice("bacs")} className="mr-4 inline-block h-[13px] w-[13px] align-middle" />
                <label htmlFor="payment_method_bacs" className="mb-2 inline text-[16px] leading-8 text-lien-input-text">
                  {t("bankTransfer")} {mustPrepay ? <span className="text-[13px] text-lien-muted">(thanh toán trước 100%)</span> : null}
                </label>
                {payment === "bacs" ? (
                  <div className="payment_box my-[14.72px] rounded-[2px] bg-white p-[14.72px] text-[14px] leading-[22px] text-[#515151]">
                    <p className="m-0 mb-2">Sau khi đặt hàng, bạn sẽ thấy mã QR và số tài khoản để chuyển khoản. Nội dung chuyển khoản được tạo tự động theo mã đơn.</p>
                    <ul className="m-0 list-none space-y-0.5 p-0 text-[13px]">
                      <li>
                        <Fa name="credit-card" className="mr-1 text-lien-blue" /> {BANK.bank} · <strong>{BANK.accountNumber}</strong> · {BANK.accountName}
                      </li>
                      <li className="text-lien-muted">{BANK.branch}</li>
                    </ul>
                  </div>
                ) : null}
              </li>
              <li className={cn("wc_payment_method leading-8", mustPrepay && "opacity-50")}>
                <input id="payment_method_cod" type="radio" checked={payment === "cod"} disabled={mustPrepay} onChange={() => setPaymentChoice("cod")} className="mr-4 inline-block h-[13px] w-[13px] align-middle" />
                <label htmlFor="payment_method_cod" className="mb-2 inline text-[16px] leading-8 text-lien-input-text">
                  {t("cod")} {mustPrepay ? <span className="text-[13px] text-lien-muted">(không áp dụng cho hàng order)</span> : null}
                </label>
                {payment === "cod" ? (
                  <div className="payment_box my-[14.72px] rounded-[2px] bg-white p-[14.72px] text-[14px] leading-[22px] text-[#515151]">
                    <p className="m-0">Trả tiền mặt khi nhận hàng{delivery === "pickup" ? " tại kho" : ""}.</p>
                  </div>
                ) : null}
              </li>
            </ul>
            <div className="form-row place-order mb-1.5 flow-root p-4">
              <p className="mb-4 text-[14px] leading-6">
                Thông tin của bạn chỉ dùng để xử lý đơn hàng và hỗ trợ mua hàng, theo{" "}
                <Link href="/privacy-policy/" className="text-lien-muted hover:text-lien-blue">
                  chính sách riêng tư
                </Link>
                .
              </p>
              <button type="submit" disabled={pending} className={cn(wooButtonClass, "float-right font-arial")} id="place_order">
                {pending ? t("processing") : t("placeOrder")}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
