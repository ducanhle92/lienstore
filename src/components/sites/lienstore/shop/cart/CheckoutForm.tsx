"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { placeOrder } from "@/app/checkout/actions";
import { useCart } from "@/components/sites/lienstore/shop/CartProvider";
import { useLang } from "@/components/sites/lienstore/shared/LangProvider";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { formatAmount } from "@/lib/format";
import { BANK } from "@/lib/payment";
import { billableKg, quoteJpLegs, type ShippingQuoteConfig } from "@/lib/shipping";
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
  label: string;
  fee: number;
  unit: string;
  freeOver: number | null;
  eta: string;
  areas: string;
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
  pickupAddress: string;
  /** Product ids that are bought to order (must be prepaid). */
  preorderIds: number[];
  /** Billable grams per product id (safety factor already applied). */
  weights?: Record<number, number>;
  /** How the Japan-side legs are priced (per-order mode) — same function runs again on the server. */
  quote?: ShippingQuoteConfig;
}

/** Checkout: billing fields, delivery choice (pickup / home delivery with zone fee), order review, payment, place order. */
export function CheckoutForm({ defaults = {}, loggedIn = false, zones, pickupAddress, preorderIds, weights = {}, quote }: Props) {
  const { items, hydrated, subtotal } = useCart();
  const { t } = useLang();
  const [state, action, pending] = useActionState<CheckoutState, FormData>(placeOrder, null);
  const [delivery, setDelivery] = useState<"ship" | "pickup">(zones.length ? "ship" : "pickup");
  const [zoneId, setZoneId] = useState<number | "">(zones[0]?.id ?? "");
  const [createAccount, setCreateAccount] = useState(false);
  const [voucherInput, setVoucherInput] = useState("");
  const [voucher, setVoucher] = useState<{ code: string; discount: number; label: string } | null>(null);
  const [voucherMsg, setVoucherMsg] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const preorder = useMemo(() => items.filter((it) => preorderIds.includes(it.productId)), [items, preorderIds]);
  const mustPrepay = preorder.length > 0;
  const [paymentChoice, setPaymentChoice] = useState<"bacs" | "cod">("bacs");
  const payment: "bacs" | "cod" = mustPrepay ? "bacs" : paymentChoice;

  const zone = zones.find((z) => z.id === zoneId) ?? null;
  const totalWeightG = items.reduce((s, it) => s + (weights[it.productId] ?? 1000) * it.quantity, 0);
  const kg = billableKg(totalWeightG || 1000);
  const zoneBase = (z: CheckoutZone) => z.fee * (/kg/i.test(z.unit) ? kg : 1);
  const vnFee = delivery === "pickup" || !zone ? 0 : zone.freeOver && subtotal >= zone.freeOver ? 0 : zoneBase(zone);
  const jpLegs = quote ? quoteJpLegs(quote, totalWeightG || 1000, subtotal) : [];
  const jpFee = jpLegs.reduce((s, l) => s + l.fee, 0);
  const shippingFee = vnFee + jpFee;
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
                <Field name="address" label={t("address")} placeholder={t("addressPh")} autoComplete="street-address" error={fields.address} defaultValue={defaults.address} required={delivery === "ship"} />
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
                <input type="radio" name="delivery_choice" checked={delivery === "ship"} onChange={() => setDelivery("ship")} disabled={zones.length === 0} className="mt-1 h-4 w-4" />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-lien-heading">{t("homeDelivery")}</span>
                  {zones.length === 0 ? (
                    <span className="block text-[13px] text-lien-muted">Chưa cấu hình khu vực giao hàng.</span>
                  ) : (
                    <>
                      <select name="shipping_zone" value={zoneId} onChange={(e) => setZoneId(Number(e.target.value))} disabled={delivery !== "ship"} className={cn(wooInputClass, "mt-2 !h-auto !py-2 text-[14px]", fields.shipping_zone && "border-[#b81c23]")}>
                        {zones.map((z) => (
                          <option key={z.id} value={z.id}>
                            {z.label} — {formatAmount(zoneBase(z))}đ{/kg/i.test(z.unit) ? ` (${kg} kg)` : ""}
                            {z.freeOver ? ` (miễn phí từ ${formatAmount(z.freeOver)}đ)` : ""}
                            {z.eta ? ` · ${z.eta}` : ""}
                          </option>
                        ))}
                      </select>
                      {zone?.areas ? <span className="mt-1 block text-[12px] text-lien-muted">{zone.areas}</span> : null}
                      {fields.shipping_zone ? <span className="mt-1 block text-[14px] leading-5 text-[#b81c23]">{fields.shipping_zone}</span> : null}
                    </>
                  )}
                </span>
              </label>
            </div>
            <p className="mt-3 text-[12px] leading-5 text-lien-muted">
              {perOrder
                ? `Phí vận chuyển tính riêng theo đơn: ship nội địa Nhật + Nhật → Việt Nam + giao nội địa Việt Nam, theo cân tính phí ${formatAmount(totalWeightG)} g (${kg} kg làm tròn, đã nhân hệ số an toàn khi kích thước chưa chắc). Chọn "Nhận tại kho" thì không tính chặng nội địa Việt Nam.`
                : `Giá sản phẩm đã gồm phí mua hộ và vận chuyển Nhật → Việt Nam. Phí trên là phí giao từ kho Việt Nam tới nhà bạn${totalWeightG ? `, tính cho khoảng ${formatAmount(totalWeightG)} g (${kg} kg làm tròn)` : ""}.`}
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
                  {delivery === "pickup" ? t("pickupFree") : zone ? (vnFee === 0 ? `${zone.label} · ${t("free").toLowerCase()}` : <Price value={vnFee} />) : "—"}
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
