"use server";

import { redirect } from "next/navigation";
import type { CheckoutState } from "@/components/sites/lienstore/shop/cart/checkout-types";
import { getCurrentCustomer, startCustomerSession } from "@/lib/customer-auth";
import { createCustomer, createOrder, findCustomerByEmail } from "@/lib/db";
import type { CartItem, Order, PaymentMethod } from "@/types/shop";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseItems(raw: string): CartItem[] {
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("bad cart");
  return parsed
    .map((x): CartItem | null => {
      if (typeof x !== "object" || x === null) return null;
      const o = x as Record<string, unknown>;
      const productId = Number(o.productId);
      const quantity = Number(o.quantity);
      if (!Number.isInteger(productId) || productId <= 0 || !Number.isFinite(quantity) || quantity <= 0) return null;
      return {
        productId,
        quantity: Math.min(99, Math.floor(quantity)),
        slug: String(o.slug ?? ""),
        name: String(o.name ?? ""),
        price: Number(o.price) || 0,
        image: String(o.image ?? ""),
      };
    })
    .filter((x): x is CartItem => x !== null);
}

export async function placeOrder(_prev: CheckoutState, formData: FormData): Promise<CheckoutState> {
  const get = (k: string) => String(formData.get(k) ?? "").trim();
  const fields: Record<string, string> = {};

  const firstName = get("first_name");
  const lastName = get("last_name");
  const address = get("address");
  const phone = get("phone");
  const email = get("email");
  const note = get("note").slice(0, 1000);
  const delivery = get("delivery") === "pickup" ? "pickup" : "ship";
  const zoneRaw = get("shipping_zone");
  const shippingZoneId = zoneRaw ? Number.parseInt(zoneRaw, 10) : null;

  if (!firstName) fields.first_name = "Tên là trường bắt buộc.";
  if (!lastName) fields.last_name = "Họ là trường bắt buộc.";
  if (!address) fields.address = "Địa chỉ nhận hàng là trường bắt buộc.";
  const digits = phone.replace(/\D/g, "");
  if (!phone) fields.phone = "Số điện thoại là trường bắt buộc.";
  else if (digits.length !== 10) fields.phone = "Số điện thoại phải gồm 10 chữ số.";
  if (email && !EMAIL_RE.test(email)) fields.email = "Địa chỉ email không hợp lệ.";
  if (delivery === "ship" && (!shippingZoneId || !Number.isInteger(shippingZoneId))) fields.shipping_zone = "Vui lòng chọn khu vực giao hàng.";

  let items: CartItem[];
  try {
    items = parseItems(get("items") || "[]");
  } catch {
    return { error: "Giỏ hàng không hợp lệ. Vui lòng tải lại trang." };
  }
  if (items.length === 0) return { error: "Giỏ hàng của bạn hiện đang trống." };
  if (Object.keys(fields).length > 0) return { error: "Vui lòng kiểm tra lại các trường được đánh dấu.", fields };

  const paymentMethod: PaymentMethod = get("payment_method") === "cod" ? "cod" : "bacs";

  // Optional account creation ("Tạo tài khoản mới?") or link to the logged-in customer.
  let customerId: string | undefined = (await getCurrentCustomer())?.id;
  if (!customerId && formData.get("createaccount") === "on") {
    const password = String(formData.get("account_password") ?? "");
    if (password.length < 6) {
      return { error: "Mật khẩu tài khoản phải có ít nhất 6 ký tự.", fields: { account_password: "Mật khẩu phải có ít nhất 6 ký tự." } };
    }
    if (!email) return { error: "Nhập email để tạo tài khoản kèm đơn hàng (hoặc bỏ tick \"Tạo tài khoản\").", fields: { email: "Cần email khi tạo tài khoản." } };
    if (await findCustomerByEmail(email)) {
      return { error: "Một tài khoản đã được đăng ký với địa chỉ email của bạn. Vui lòng đăng nhập trước khi đặt hàng." };
    }
    const created = await createCustomer({ email, password, firstName, lastName, phone, address });
    await startCustomerSession(created.id, true);
    customerId = created.id;
  }

  let order: Order;
  try {
    order = await createOrder({
      customer: { firstName, lastName, address, phone, email, note },
      items,
      paymentMethod,
      customerId,
      delivery,
      shippingZoneId: delivery === "ship" ? shippingZoneId : null,
      voucherCode: get("voucher_code"),
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Không thể tạo đơn hàng. Vui lòng thử lại." };
  }
  redirect(`/checkout/order-received/${order.id}/`);
}
