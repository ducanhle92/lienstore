"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { placeOrder } from "@/app/checkout/actions";
import { useCart } from "@/components/sites/lienstore/shop/CartProvider";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { formatAmount } from "@/lib/format";
import { BANK } from "@/lib/payment";
import { billableKg } from "@/lib/shipping";
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
  /** Chargeable grams per product id (for per-kg zones). */
  weights?: Record<number, number>;
}

/** Checkout: billing fields, delivery choice (pickup / home delivery with zone fee), order review, payment, place order. */
export function CheckoutForm({ defaults = {}, loggedIn = false, zones, pickupAddress, preorderIds, weights = {} }: Props) {
  const { items, hydrated, subtotal } = useCart();
  const [state, action, pending] = useActionState<CheckoutState, FormData>(placeOrder, null);
  const [delivery, setDelivery] = useState<"ship" | "pickup">(zones.length ? "ship" : "pickup");
  const [zoneId, setZoneId] = useState<number | "">(zones[0]?.id ?? "");
  const [createAccount, setCreateAccount] = useState(false);

  const preorder = useMemo(() => items.filter((it) => preorderIds.includes(it.productId)), [items, preorderIds]);
  const mustPrepay = preorder.length > 0;
  const [paymentChoice, setPaymentChoice] = useState<"bacs" | "cod">("bacs");
  const payment: "bacs" | "cod" = mustPrepay ? "bacs" : paymentChoice;

  const zone = zones.find((z) => z.id === zoneId) ?? null;
  const totalWeightG = items.reduce((s, it) => s + (weights[it.productId] ?? 0) * it.quantity, 0);
  const kg = billableKg(totalWeightG || 1000);
  const zoneBase = (z: CheckoutZone) => z.fee * (/kg/i.test(z.unit) ? kg : 1);
  const shippingFee = delivery === "pickup" || !zone ? 0 : zone.freeOver && subtotal >= zone.freeOver ? 0 : zoneBase(zone);
  const total = subtotal + shippingFee;

  if (!hydrated) return <div className="min-h-[240px]" aria-busy="true" />;

  if (items.length === 0) {
    return (
      <div className="woocommerce">
        <WooNotice kind="info">Giỏ hàng của bạn hiện đang trống.</WooNotice>
        <p>
          <Link href="/shop/" className={wooButtonClass}>
            Quay trở lại cửa hàng
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
          Bạn đã có tài khoản?{" "}
          <Link href="/my-account/" className="text-lien-muted underline hover:text-lien-blue">
            Ấn vào đây để đăng nhập
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

        <div id="customer_details" className="col2-set sm:flex sm:justify-between">
          <div className="col-1 w-full sm:w-[48%]">
            <div className="woocommerce-billing-fields">
              <WooHeading as="h3">Thông tin người nhận</WooHeading>
              <div className="flex flex-wrap justify-between">
                <Field name="first_name" label="Tên" autoComplete="given-name" error={fields.first_name} half defaultValue={defaults.firstName} />
                <Field name="last_name" label="Họ" autoComplete="family-name" error={fields.last_name} half defaultValue={defaults.lastName} />
                <Field name="phone" label="Số điện thoại" type="tel" autoComplete="tel" error={fields.phone} defaultValue={defaults.phone} />
                <Field name="email" label="Địa chỉ email" type="email" autoComplete="email" error={fields.email} defaultValue={defaults.email} />
                <Field name="address" label="Địa chỉ nhận hàng" placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành" autoComplete="street-address" error={fields.address} defaultValue={defaults.address} required={delivery === "ship"} />
              </div>
            </div>
            {!loggedIn ? (
              <div className="woocommerce-account-fields mt-2">
                <p className="form-row form-row-wide create-account mb-1.5 p-[3px]">
                  <label className="inline-flex items-center gap-2 text-[16px] font-semibold leading-8 text-lien-input-text">
                    <input type="checkbox" name="createaccount" checked={createAccount} onChange={(e) => setCreateAccount(e.target.checked)} className="h-4 w-4" />
                    Tạo tài khoản mới?
                  </label>
                </p>
                {createAccount ? (
                  <p className="form-row mb-1.5 p-[3px]">
                    <label htmlFor="account_password" className="mb-2 block text-[16px] font-semibold leading-8 text-lien-input-text">
                      Tạo mật khẩu <Required />
                    </label>
                    <input id="account_password" name="account_password" type="password" autoComplete="new-password" minLength={6} className={cn(wooInputClass, fields.account_password && "border-[#b81c23]")} />
                    {fields.account_password ? <span className="mt-1 block text-[14px] leading-5 text-[#b81c23]">{fields.account_password}</span> : null}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="col-2 w-full sm:w-[48%]">
            <WooHeading as="h3">Hình thức nhận hàng</WooHeading>
            <div className="space-y-2">
              <label className={optionCls(delivery === "pickup")}>
                <input type="radio" name="delivery_choice" checked={delivery === "pickup"} onChange={() => setDelivery("pickup")} className="mt-1 h-4 w-4" />
                <span>
                  <span className="block font-semibold text-lien-heading">
                    Nhận tại kho <span className="ml-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-800">Miễn phí</span>
                  </span>
                  <span className="block text-[13px] text-lien-muted">{pickupAddress || "Địa chỉ kho sẽ được gửi sau khi xác nhận đơn."}</span>
                </span>
              </label>
              <label className={optionCls(delivery === "ship")}>
                <input type="radio" name="delivery_choice" checked={delivery === "ship"} onChange={() => setDelivery("ship")} disabled={zones.length === 0} className="mt-1 h-4 w-4" />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-lien-heading">Giao tận nhà</span>
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
              Giá sản phẩm đã gồm phí mua hộ và vận chuyển Nhật → Việt Nam. Phí trên là phí giao từ kho Việt Nam tới nhà bạn
              {totalWeightG ? `, tính cho khoảng ${formatAmount(totalWeightG)} g (${kg} kg làm tròn)` : ""}.
            </p>

            <div className="woocommerce-additional-fields mt-4">
              <p className="form-row notes mb-1.5 p-[3px]">
                <label htmlFor="order_comments" className="mb-2 block text-[16px] font-semibold leading-8 text-lien-input-text">
                  Ghi chú đơn hàng <span className="optional font-semibold">(tuỳ chọn)</span>
                </label>
                <textarea id="order_comments" name="note" rows={2} placeholder="Ví dụ: giờ nhận hàng, chỉ dẫn địa điểm…" className={cn(wooInputClass, "h-16 resize-y font-mono leading-6")} />
              </p>
            </div>
          </div>
        </div>

        <WooHeading as="h3" className="mt-6">
          Đơn hàng của bạn
        </WooHeading>
        <div id="order_review" className="woocommerce-checkout-review-order">
          <table className={cn(shopTableClass, "woocommerce-checkout-review-order-table")}>
            <thead>
              <tr>
                <th className={shopThClass} scope="col">
                  Sản phẩm
                </th>
                <th className={shopThClass} scope="col">
                  Tạm tính
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.productId} className="cart_item">
                  <td className={shopTdClass}>
                    {it.name} <strong className="product-quantity whitespace-nowrap">× {it.quantity}</strong>
                    {preorderIds.includes(it.productId) ? <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Hàng order</span> : null}
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
                  Tạm tính
                </th>
                <td className={cn(shopTdClass, "font-bold")}>
                  <Price value={subtotal} />
                </td>
              </tr>
              <tr className="shipping">
                <th className={cn(shopTdClass, "font-bold")} scope="row">
                  Giao hàng
                </th>
                <td className={shopTdClass}>
                  {delivery === "pickup" ? "Nhận tại kho · miễn phí" : zone ? (shippingFee === 0 ? `${zone.label} · miễn phí` : <Price value={shippingFee} />) : "—"}
                </td>
              </tr>
              <tr className="order-total">
                <th className={cn(shopTdClass, "font-bold")} scope="row">
                  Tổng
                </th>
                <td className={cn(shopTdClass, "font-bold")}>
                  <Price value={total} />
                </td>
              </tr>
            </tfoot>
          </table>

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
                  Chuyển khoản ngân hàng {mustPrepay ? <span className="text-[13px] text-lien-muted">(thanh toán trước 100%)</span> : null}
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
                  Thanh toán khi nhận hàng {mustPrepay ? <span className="text-[13px] text-lien-muted">(không áp dụng cho hàng order)</span> : null}
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
                {pending ? "Đang xử lý…" : "Đặt hàng"}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
