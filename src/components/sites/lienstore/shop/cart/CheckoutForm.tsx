"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { placeOrder } from "@/app/checkout/actions";
import { useCart } from "@/components/sites/lienstore/shop/CartProvider";
import { useLang } from "@/components/sites/lienstore/shared/LangProvider";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { type ShippingQuote, usableForCheckoutTotal } from "@/lib/carriers/types";
import { formatAmount } from "@/lib/format";
import { BANK } from "@/lib/payment";
import { openAccountDrawer } from "@/components/sites/lienstore/shared/open-account";
import { billableKg, quoteJpLegs, type ShippingQuoteConfig } from "@/lib/shipping";
import { cn } from "@/lib/utils";
import { isCompleteAddress, type QuoteResponse, ShipAddressFields, type ShipAddress, ShippingQuotePanel, storeAddress, loadStoredAddress } from "../ShippingQuotePanel";
import type { CheckoutState } from "./checkout-types";
import { Price, Required, shopTableClass, shopTdClass, shopThClass, WooHeading, WooNotice, wooButtonClass, wooInputClass } from "./WooUi";

export interface CheckoutDefaults {
  firstName?: string;
  lastName?: string;
  address?: string;
  /** Province / ward codes + street parsed from the saved address (when it could be parsed). */
  addressCodes?: ShipAddress | null;
  phone?: string;
  email?: string;
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
  /** Codes parsed from the text on the server (null when the text has no recognisable province / ward). */
  codes?: ShipAddress | null;
}

interface Props {
  defaults?: CheckoutDefaults;
  loggedIn?: boolean;
  /** Address book of the signed-in customer (picked with radios above the address field). */
  savedAddresses?: SavedAddress[];
  pickupAddress: string;
  /** Product ids that are bought to order (must be prepaid). */
  preorderIds: number[];
  /** Billable grams per product id (safety factor already applied). */
  weights?: Record<number, number>;
  /** Regular (crossed-out) price per product id, for the "you saved" line. */
  regularPrices?: Record<number, number>;
  /** How the Japan-side legs are priced (per-order mode) — same function runs again on the server. */
  quote?: ShippingQuoteConfig;
}

const EMPTY_ADDR: ShipAddress = { provinceCode: "", wardCode: "", street: "" };

/**
 * Checkout: recipient fields with the 2-level address (province → ward → street), delivery choice (pickup / home delivery
 * with per-carrier quotes for that address), order review, payment, place order. The chosen quote is re-quoted on the
 * server when the order is created; the browser never decides the fee.
 */
export function CheckoutForm({ defaults = {}, loggedIn = false, savedAddresses = [], pickupAddress, preorderIds, weights = {}, regularPrices = {}, quote }: Props) {
  const { items, hydrated, subtotal } = useCart();
  const { t } = useLang();
  const [state, action, pending] = useActionState<CheckoutState, FormData>(placeOrder, null);
  const [delivery, setDelivery] = useState<"ship" | "pickup">("pickup");
  const defaultSaved = savedAddresses.find((a) => a.isDefault) ?? savedAddresses[0];
  const [picked, setPicked] = useState<number | "new">(defaultSaved ? defaultSaved.id : "new");
  const pickedAddr = picked === "new" ? null : (savedAddresses.find((a) => a.id === picked) ?? null);
  const [addr, setAddr] = useState<ShipAddress>(defaultSaved?.codes ?? defaults.addressCodes ?? { ...EMPTY_ADDR, street: defaultSaved?.address ?? defaults.address ?? "" });
  // remembered from the product page / shipping page in this browser (only when the account has nothing)
  useEffect(() => {
    if (defaultSaved?.codes || defaults.addressCodes) return;
    const stored = loadStoredAddress();
    if (stored) setAddr(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [feePayment, setFeePayment] = useState<"prepaid" | "on_delivery">("prepaid");
  const [selQuote, setSelQuote] = useState<ShippingQuote | null>(null);
  const [quoteResp, setQuoteResp] = useState<QuoteResponse | null>(null);
  const [createAccount, setCreateAccount] = useState(false);
  const [voucherInput, setVoucherInput] = useState("");
  const [voucher, setVoucher] = useState<{ code: string; discount: number; label: string } | null>(null);
  const [voucherMsg, setVoucherMsg] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  // "Thanh toán" opens a confirmation sheet with a snapshot of the form; the real submit happens from there.
  const formRef = useRef<HTMLFormElement>(null);
  const [confirm, setConfirm] = useState<{ firstName: string; lastName: string; phone: string; email: string; address: string; note: string } | null>(null);
  const fullAddress = [addr.street.trim(), addr.wardName, addr.provinceName].filter(Boolean).join(", ");
  const openConfirm = () => {
    const fd = new FormData(formRef.current ?? undefined);
    const v = (k: string) => String(fd.get(k) ?? "").trim();
    setConfirm({ firstName: v("first_name"), lastName: v("last_name"), phone: v("phone"), email: v("email"), address: fullAddress, note: v("note") });
  };

  // every order is paid up front by bank transfer (QR + account shown on the order page after "Đặt hàng")
  const payment = "bacs" as const;

  const shipping = delivery === "ship";
  const addressComplete = isCompleteAddress(addr);
  // a "Từ …" quote is never collected with the order: the customer pays the courier on delivery (spec §9.5)
  const fromPrice = !!selQuote && !usableForCheckoutTotal(selQuote);
  const canCodShip = shipping && !!selQuote?.codShipFee;
  const effectiveFeePayment: "prepaid" | "on_delivery" = fromPrice ? "on_delivery" : canCodShip && feePayment === "on_delivery" ? "on_delivery" : "prepaid";

  const totalWeightG = items.reduce((s, it) => s + (weights[it.productId] ?? 1000) * it.quantity, 0);
  const kg = billableKg(totalWeightG || 1000);
  // gross carrier fee → shop support (free-shipping threshold) → what the customer pays for the VN leg
  const carrierFee = shipping && selQuote ? (selQuote.totalFeeVnd ?? 0) : 0;
  const freeOver = quoteResp?.freeOver ?? null;
  const shipSupport = shipping && selQuote && !fromPrice && freeOver && subtotal >= freeOver ? carrierFee : 0;
  const vnFee = Math.max(0, carrierFee - shipSupport);
  const shipDetail = delivery === "pickup" ? t("pickupZero") : selQuote ? `${selQuote.carrierName}${selQuote.serviceName ? ` · ${selQuote.serviceName}` : ""}` : "";
  const jpLegs = quote ? quoteJpLegs(quote, totalWeightG || 1000, subtotal) : [];
  const jpFee = jpLegs.reduce((s, l) => s + l.fee, 0);
  const shippingFee = (effectiveFeePayment === "on_delivery" ? 0 : vnFee) + jpFee;
  const perOrder = !!quote && quote.mode === "per_order";
  const discount = voucher ? Math.min(voucher.discount, subtotal) : 0;
  const total = Math.max(0, subtotal - discount) + shippingFee;
  // a server-side re-quote that came back higher tells the customer to look again; the panel reloads on this token
  const [reloadToken, setReloadToken] = useState(0);
  useEffect(() => {
    if (state?.error && /vừa đổi|báo lại/i.test(state.error)) setReloadToken((n) => n + 1);
  }, [state]);

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
        <input type="hidden" name="ship_fee_payment" value={effectiveFeePayment} readOnly />
        <input type="hidden" name="ship_carrier" value={shipping && selQuote ? selQuote.carrier : ""} readOnly />
        <input type="hidden" name="ship_service" value={shipping && selQuote ? selQuote.serviceCode : ""} readOnly />
        <input type="hidden" name="ship_fee" value={shipping && selQuote && selQuote.totalFeeVnd !== null ? String(selQuote.totalFeeVnd) : ""} readOnly />
        <input type="hidden" name="ship_quoted_at" value={shipping && selQuote ? selQuote.quotedAt : ""} readOnly />
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
                          <input
                            type="radio"
                            name="saved_address"
                            value={a.id}
                            checked={picked === a.id}
                            onChange={() => {
                              setPicked(a.id);
                              setAddr(a.codes ?? { ...EMPTY_ADDR, street: a.address });
                            }}
                            className="mt-0.5 h-4 w-4"
                          />
                          <span>
                            <strong className="text-lien-heading">{a.label}</strong>
                            {a.isDefault ? <span className="ml-1 rounded bg-lien-blue px-1.5 text-[10px] font-bold uppercase text-white">mặc định</span> : null}
                            <span className="block text-lien-text">{a.address}</span>
                            {a.name || a.phone ? <span className="block text-[12px] text-lien-muted">{[a.name, a.phone].filter(Boolean).join(" · ")}</span> : null}
                          </span>
                        </label>
                      ))}
                      <label className={cn("flex cursor-pointer items-center gap-2 rounded-md border p-2.5 text-[14px] leading-5", picked === "new" ? "border-lien-blue bg-lien-blue-soft/60" : "border-lien-line bg-white hover:border-lien-blue/60")}>
                        <input
                          type="radio"
                          name="saved_address"
                          value="new"
                          checked={picked === "new"}
                          onChange={() => {
                            setPicked("new");
                            setAddr(EMPTY_ADDR);
                          }}
                          className="h-4 w-4"
                        />
                        {t("newAddress")}
                      </label>
                    </div>
                  </fieldset>
                ) : null}
                <div className="mb-1.5 w-full p-[3px]">
                  <p className="m-0 mb-2 text-[16px] font-semibold leading-8 text-lien-input-text">
                    {t("address")} <Required />
                  </p>
                  <ShipAddressFields
                    value={addr}
                    onChange={(a) => {
                      setAddr(a);
                      if (pickedAddr && (a.street !== (pickedAddr.codes?.street ?? pickedAddr.address) || a.wardCode !== pickedAddr.codes?.wardCode)) setPicked("new");
                      if (isCompleteAddress(a)) storeAddress(a);
                    }}
                    inputClass={wooInputClass}
                    labelClass="mb-1 block text-[13px] font-semibold text-lien-input-text"
                    errors={fields}
                    streetName="address"
                  />
                </div>
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
              <div className={optionCls(delivery === "ship")}>
                <input type="radio" id="delivery_ship" name="delivery_choice" checked={delivery === "ship"} onChange={() => setDelivery("ship")} className="mt-1 h-4 w-4" />
                <div className="min-w-0 flex-1">
                  <label htmlFor="delivery_ship" className="block cursor-pointer font-semibold text-lien-heading">
                    {t("homeDelivery")}
                  </label>
                  {shipping ? (
                    <div className="mt-2">
                      {!addressComplete ? (
                        <span className="block text-[13px] text-lien-muted">{t("shipQuoteNeedAddress")}</span>
                      ) : (
                        <ShippingQuotePanel key={reloadToken} items={items.map((it) => ({ productId: it.productId, quantity: it.quantity }))} address={addr} compact selectable selected={selQuote ? { carrier: selQuote.carrier, serviceCode: selQuote.serviceCode } : null} onSelect={setSelQuote} onQuotes={setQuoteResp} />
                      )}
                      {fields.ship_carrier ? <span className="mt-1 block text-[14px] leading-5 text-[#b81c23]">{fields.ship_carrier}</span> : null}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            {shipping && selQuote ? (
              <fieldset className="mt-3 rounded-md border border-lien-line bg-white p-3">
                <legend className="px-1 text-[13px] font-semibold text-lien-heading">{t("shipFeePayment")}</legend>
                <label className={cn("flex items-start gap-2 py-1 text-[14px] leading-5", fromPrice ? "opacity-60" : "cursor-pointer")}>
                  <input type="radio" name="ship_fee_choice" checked={effectiveFeePayment === "prepaid"} disabled={fromPrice} onChange={() => setFeePayment("prepaid")} className="mt-1 h-4 w-4" />
                  <span>
                    {t("feePrepaid")}
                    {fromPrice ? <span className="block text-[12px] text-lien-muted">{t("shipFromNote")}</span> : null}
                  </span>
                </label>
                <label className={cn("flex items-start gap-2 py-1 text-[14px] leading-5", canCodShip || fromPrice ? "cursor-pointer" : "opacity-60")}>
                  <input type="radio" name="ship_fee_choice" checked={effectiveFeePayment === "on_delivery"} disabled={!canCodShip && !fromPrice} onChange={() => setFeePayment("on_delivery")} className="mt-1 h-4 w-4" />
                  <span>
                    {t("feeOnDelivery")}
                    {!canCodShip && !fromPrice ? <span className="block text-[12px] text-lien-muted">{t("feeOnDeliveryNa")}</span> : null}
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
                    <button
                      type="button"
                      onClick={() => {
                        setVoucher(null);
                        setVoucherMsg(null);
                      }}
                      className="ml-2 text-[12px] text-lien-muted underline hover:text-lien-heart"
                    >
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
                <td className={shopTdClass} data-testid="vn-fee">
                  {shipping && !selQuote ? <span className="text-lien-muted">{addressComplete ? t("shipSelectRequired") : "—"}</span> : fromPrice ? <span className="text-lien-muted">Từ {formatAmount(carrierFee)}đ · {t("shipOnDeliveryLine")}</span> : <Price value={carrierFee} />}
                </td>
              </tr>
              {shipSupport > 0 && freeOver ? (
                <tr className="shipping-support">
                  <th className={cn(shopTdClass, "font-normal text-lien-muted")} scope="row">
                    {t("shipSupport")} <span className="text-[12px]">({t("orderFrom")} {formatAmount(freeOver)}đ)</span>
                  </th>
                  <td className={cn(shopTdClass, "text-lien-success")}>−<Price value={shipSupport} /></td>
                </tr>
              ) : null}
              {shipping && effectiveFeePayment === "on_delivery" && vnFee > 0 && !fromPrice ? (
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
                <td className={cn(shopTdClass, "font-bold")} data-testid="order-total">
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
                  !addressComplete ? t("address") : "",
                  shipping && !selQuote ? t("deliveryLabel") : "",
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
                        {delivery === "pickup" ? t("pickupFree") : selQuote ? `${selQuote.carrierName}${selQuote.serviceName ? ` · ${selQuote.serviceName}` : ""}${effectiveFeePayment === "on_delivery" ? ` · ${t("shipOnDeliveryLine")}` : ""}` : "—"}
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
                          <td className="pt-2 text-right">
                            <Price value={subtotal} />
                          </td>
                        </tr>
                        {discount > 0 ? (
                          <tr>
                            <td className="text-lien-muted">
                              {t("discount")}
                              {voucher ? ` (${voucher.code})` : ""}
                            </td>
                            <td className="text-right text-lien-success">
                              −<Price value={discount} />
                            </td>
                          </tr>
                        ) : null}
                        <tr>
                          <td className="text-lien-muted">{t("deliveryLabel")}</td>
                          <td className="text-right">
                            <Price value={shippingFee} />
                          </td>
                        </tr>
                        <tr className="border-t-2 border-lien-heading/20 text-[16px] font-bold text-lien-heading">
                          <td className="pt-2">{t("total")}</td>
                          <td className="pt-2 text-right">
                            <Price value={total} />
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    {missing.length ? (
                      <p className="m-0 mt-3 rounded-md bg-[#fde8ea] px-3 py-2 text-[13px] font-semibold text-[#842029]">
                        {t("missingInfo")}
                        {missing.join(", ")}.
                      </p>
                    ) : null}
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
