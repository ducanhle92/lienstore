"use server";

import { redirect } from "next/navigation";
import { deleteAddress, listAddresses, saveAddress, setDefaultAddress } from "@/lib/db";
import { saveUpload } from "@/lib/uploads";
import { endCustomerSession, getCurrentCustomer, startCustomerSession } from "@/lib/customer-auth";
import type { ChatState } from "@/components/sites/lienstore/shop/cart/OrderChat";
import { addOrderMessage, createCustomer, findCustomerByEmail, findCustomerByLogin, findOrder, getOrderById, updateCustomer, verifyCustomer } from "@/lib/db";
import { revalidatePath } from "next/cache";
import type { Order } from "@/types/shop";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[A-Za-z0-9._-]{3,30}$/;

/** Same-origin path to return to after login/register (the account drawer stays on the current page). */
function safeBack(formData: FormData, fallback = "/my-account/"): string {
  const v = String(formData.get("redirect_to") ?? "").trim();
  if (!v.startsWith("/") || v.startsWith("//") || v.startsWith("/admin")) return fallback;
  return v;
}

export type LookupState = { order?: Order; error?: string } | null;

export async function lookupOrder(_prev: LookupState, formData: FormData): Promise<LookupState> {
  const numberRaw = String(formData.get("number") ?? "").replace(/[^\d]/g, "");
  const phone = String(formData.get("phone") ?? "").trim();
  if (!numberRaw) return { error: "Vui lòng nhập mã đơn hàng." };
  if (phone.replace(/\D/g, "").length < 9) return { error: "Vui lòng nhập số điện thoại đã dùng khi đặt hàng." };
  const order = await findOrder(Number.parseInt(numberRaw, 10), phone);
  if (!order) return { error: `Không tìm thấy đơn hàng #${numberRaw} với số điện thoại này.` };
  return { order };
}

export type AccountFormState = { error?: string; message?: string } | null;

export async function customerLogin(_prev: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const remember = formData.get("rememberme") === "on";
  if (!username || !password) return { error: "Lỗi: Tên đăng nhập và mật khẩu là bắt buộc." };
  const customer = await verifyCustomer(username, password);
  if (!customer) return { error: "Lỗi: Tên đăng nhập / email hoặc mật khẩu không đúng." };
  await startCustomerSession(customer.id, remember);
  redirect(safeBack(formData));
}

export async function customerRegister(_prev: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const get = (k: string) => String(formData.get(k) ?? "").trim();
  const username = get("username");
  const email = get("email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!USERNAME_RE.test(username)) return { error: "Lỗi: Tên đăng nhập gồm 3–30 ký tự chữ không dấu, số, dấu chấm, gạch ngang hoặc gạch dưới." };
  if (email && !EMAIL_RE.test(email)) return { error: "Lỗi: Địa chỉ email không hợp lệ (có thể bỏ trống)." };
  if (password.length < 6) return { error: "Lỗi: Mật khẩu phải có ít nhất 6 ký tự." };
  if (formData.has("password_confirm") && String(formData.get("password_confirm") ?? "") !== password) return { error: "Lỗi: Mật khẩu nhập lại không khớp." };
  if (await findCustomerByLogin(username)) return { error: "Lỗi: Tên đăng nhập này đã được dùng. Chọn tên khác hoặc đăng nhập." };
  if (email && (await findCustomerByEmail(email))) return { error: "Lỗi: Một tài khoản đã được đăng ký với địa chỉ email này. Vui lòng đăng nhập." };
  let customer;
  try {
    customer = await createCustomer({ username, email, password, firstName: get("first_name"), lastName: get("last_name") });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Không tạo được tài khoản." };
  }
  await startCustomerSession(customer.id, true);
  redirect(safeBack(formData));
}

export async function customerLogout(formData?: FormData): Promise<void> {
  await endCustomerSession();
  redirect(formData ? safeBack(formData, "/") : "/my-account/");
}

export async function lostPassword(_prev: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const login = String(formData.get("user_login") ?? "").trim();
  if (!login) return { error: "Vui lòng nhập tên tài khoản hoặc địa chỉ email." };
  // No mail transport in this clone: always answer the same way so accounts cannot be enumerated.
  return { message: "Nếu tài khoản tồn tại, một email đặt lại mật khẩu đã được gửi. Hãy kiểm tra hộp thư (kể cả mục spam)." };
}

export async function updateAccountDetails(_prev: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const me = await getCurrentCustomer();
  if (!me) redirect("/my-account/");
  const get = (k: string) => String(formData.get(k) ?? "").trim();
  const firstName = get("account_first_name");
  const lastName = get("account_last_name");
  const phone = get("account_phone");
  const address = get("account_address");
  const current = String(formData.get("password_current") ?? "");
  const pw1 = String(formData.get("password_1") ?? "");
  const pw2 = String(formData.get("password_2") ?? "");
  if (!firstName || !lastName) return { error: "Tên và Họ là trường bắt buộc." };
  let password: string | undefined;
  if (pw1 || pw2 || current) {
    if (!current) return { error: "Vui lòng nhập mật khẩu hiện tại." };
    if (!(await verifyCustomer(me.email, current))) return { error: "Mật khẩu hiện tại không đúng." };
    if (pw1.length < 6) return { error: "Mật khẩu mới phải có ít nhất 6 ký tự." };
    if (pw1 !== pw2) return { error: "Mật khẩu mới không khớp." };
    password = pw1;
  }
  await updateCustomer(me.id, { firstName, lastName, phone, address, password });
  return { message: "Chi tiết tài khoản đã được thay đổi thành công." };
}

/**
 * Customer → shop message on an order. Allowed for the signed-in owner of the order, or from the order-received page
 * (its URL carries the unguessable order id, the same way the receipt links work).
 */
export async function customerSendMessageAction(_prev: ChatState, formData: FormData): Promise<ChatState> {
  const orderId = String(formData.get("orderId") ?? "");
  const body = String(formData.get("body") ?? "");
  const source = String(formData.get("source") ?? "");
  if (!orderId || !body.trim()) return { error: "Nhập nội dung tin nhắn." };
  const order = await getOrderById(orderId);
  if (!order) return { error: "Không tìm thấy đơn hàng." };
  const me = await getCurrentCustomer();
  const owner = me && (order.customerId === me.id || (me.email && order.customer.email.toLowerCase() === me.email.toLowerCase()));
  if (!owner && source !== "received") return { error: "Vui lòng đăng nhập để nhắn tin về đơn này." };
  const name = me ? `${me.lastName} ${me.firstName}`.trim() || me.username || "Khách hàng" : `${order.customer.lastName} ${order.customer.firstName}`.trim() || "Khách hàng";
  try {
    await addOrderMessage({ orderId, sender: "customer", senderName: name, body });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Không gửi được." };
  }
  revalidatePath("/my-account");
  revalidatePath(`/checkout/order-received/${orderId}`);
  revalidatePath(`/admin/orders/${orderId}`);
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Trang của tôi: profile, address book, avatar, password (plain form actions → redirect back with a notice)

const ACCOUNT = "/my-account/";
const acc = (tab: string, key: "saved" | "error", msg: string): never => redirect(`${ACCOUNT}?tab=${tab}&${key}=${encodeURIComponent(msg)}`);
const isRedirectErr = (e: unknown) => e instanceof Error && e.message.includes("NEXT_REDIRECT");

/** Thông tin cá nhân: name, optional e-mail, phone. */
export async function updateProfile(formData: FormData): Promise<void> {
  const me = await getCurrentCustomer();
  if (!me) redirect("/?login=1");
  const get = (k: string) => String(formData.get(k) ?? "").trim();
  const lastName = get("last_name");
  const firstName = get("first_name");
  const email = get("email").toLowerCase();
  const phone = get("phone").replace(/\s+/g, "");
  if (!firstName && !lastName) acc("profile", "error", "Vui lòng nhập họ và tên.");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) acc("profile", "error", "Email không hợp lệ.");
  if (phone && !/^0\d{9}$/.test(phone)) acc("profile", "error", "Số điện thoại phải gồm 10 chữ số, bắt đầu bằng 0.");
  try {
    await updateCustomer(me.id, { firstName, lastName, phone, email });
  } catch (e) {
    if (isRedirectErr(e)) throw e;
    acc("profile", "error", e instanceof Error ? e.message : "Không lưu được.");
  }
  revalidatePath("/", "layout");
  acc("profile", "saved", "Đã lưu thông tin cá nhân.");
}

/** Add / edit one address in the book. */
export async function saveAddressAction(formData: FormData): Promise<void> {
  const me = await getCurrentCustomer();
  if (!me) redirect("/?login=1");
  const get = (k: string) => String(formData.get(k) ?? "").trim();
  const idRaw = get("id");
  const address = get("address");
  const phone = get("phone").replace(/\s+/g, "");
  if (address.length < 8) acc("profile", "error", "Địa chỉ cần ghi đủ số nhà, đường, phường/xã, quận/huyện, tỉnh/thành.");
  if (phone && !/^0\d{9}$/.test(phone)) acc("profile", "error", "Số điện thoại người nhận phải gồm 10 chữ số.");
  await saveAddress(me.id, {
    id: idRaw ? Number.parseInt(idRaw, 10) : undefined,
    label: get("label"),
    name: get("name") || `${me.lastName} ${me.firstName}`.trim(),
    phone: phone || me.phone,
    address,
    isDefault: formData.get("is_default") === "on",
  });
  revalidatePath("/checkout/");
  acc("profile", "saved", idRaw ? "Đã cập nhật địa chỉ." : "Đã thêm địa chỉ mới.");
}

export async function deleteAddressAction(formData: FormData): Promise<void> {
  const me = await getCurrentCustomer();
  if (!me) redirect("/?login=1");
  const id = Number.parseInt(String(formData.get("id") ?? ""), 10);
  if (Number.isInteger(id)) await deleteAddress(me.id, id);
  revalidatePath("/checkout/");
  acc("profile", "saved", "Đã xoá địa chỉ.");
}

export async function setDefaultAddressAction(formData: FormData): Promise<void> {
  const me = await getCurrentCustomer();
  if (!me) redirect("/?login=1");
  const id = Number.parseInt(String(formData.get("id") ?? ""), 10);
  if (Number.isInteger(id)) await setDefaultAddress(me.id, id);
  revalidatePath("/checkout/");
  acc("profile", "saved", "Đã đặt làm địa chỉ mặc định.");
}

/** Tài khoản: avatar picture (JPG/PNG/WebP ≤ 3 MB). */
export async function uploadAvatarAction(formData: FormData): Promise<void> {
  const me = await getCurrentCustomer();
  if (!me) redirect("/?login=1");
  const file = formData.get("avatar");
  if (formData.get("remove") === "1") {
    await updateCustomer(me.id, { avatar: "" });
    revalidatePath("/", "layout");
    acc("account", "saved", "Đã bỏ ảnh đại diện.");
  }
  if (!(file instanceof File) || file.size === 0) acc("account", "error", "Hãy chọn một ảnh.");
  const f = file as File;
  const types: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
  if (!types[f.type]) acc("account", "error", "Ảnh đại diện phải là JPG, PNG hoặc WebP.");
  if (f.size > 3 * 1024 * 1024) acc("account", "error", "Ảnh tối đa 3 MB.");
  const saved = await saveUpload("avatars", `${me.id}-${Date.now()}.${types[f.type]}`, Buffer.from(await f.arrayBuffer()));
  await updateCustomer(me.id, { avatar: saved.url });
  revalidatePath("/", "layout");
  acc("account", "saved", "Đã cập nhật ảnh đại diện.");
}

/** Tài khoản: change password (current password required). */
export async function changePasswordAction(formData: FormData): Promise<void> {
  const me = await getCurrentCustomer();
  if (!me) redirect("/?login=1");
  const current = String(formData.get("password_current") ?? "");
  const pw1 = String(formData.get("password_1") ?? "");
  const pw2 = String(formData.get("password_2") ?? "");
  if (!current) acc("account", "error", "Vui lòng nhập mật khẩu hiện tại.");
  if (!(await verifyCustomer(me.email, current))) acc("account", "error", "Mật khẩu hiện tại không đúng.");
  if (pw1.length < 6) acc("account", "error", "Mật khẩu mới phải có ít nhất 6 ký tự.");
  if (pw1 !== pw2) acc("account", "error", "Mật khẩu mới không khớp.");
  await updateCustomer(me.id, { password: pw1 });
  acc("account", "saved", "Đã đổi mật khẩu.");
}
