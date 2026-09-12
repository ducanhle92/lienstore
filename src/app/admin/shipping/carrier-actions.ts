"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { can } from "@/lib/auth";
import { isCarrierCode } from "@/lib/carriers";
import { ALL_CARRIER_CODES, CARRIER_NAME, type CarrierCode } from "@/lib/carriers/types";
import { GOSHIP_PROD, GOSHIP_SANDBOX, GOSHIP_SETTING_KEYS, GoshipError, goshipCheck, goshipResetCache } from "@/lib/carriers/goship";
import { getOrderById, saveOrderLeg } from "@/lib/db";
import { quoteCart } from "@/lib/ship-quote";
import { getDb, getSetting, setSetting } from "@/lib/sqlite";
import { GHN_SETTING_KEYS, GhnApiError, ghnDistricts, ghnListShops, ghnProvinces, ghnResetCache, ghnWards } from "@/lib/ghn";
import { SPX_SETTING_KEYS } from "@/lib/carriers/spx-api";
import { parseAddressToCodes } from "@/lib/vn-address";

const ALL: CarrierCode[] = ALL_CARRIER_CODES.filter((c) => c !== "GOSHIP");

/** ④ Nội địa Việt Nam › which carriers customers may pick (unchecked = hidden from the quote cards). */
export async function saveCarrierTogglesAction(formData: FormData): Promise<void> {
  if (!(await can("shipping"))) redirect("/admin/login/");
  const enabled = new Set(formData.getAll("carrier").map(String).filter(isCarrierCode));
  const disabled = ALL.filter((c) => !enabled.has(c));
  setSetting(getDb(), "vn_carriers_disabled", JSON.stringify(disabled));
  revalidatePath("/", "layout");
  redirect(`/admin/shipping/?leg=vn_domestic&saved=${encodeURIComponent(`Đã lưu: khách được chọn ${ALL.filter((c) => enabled.has(c)).map((c) => CARRIER_NAME[c]).join(", ") || "không hãng nào"}.`)}`);
}

/**
 * ④ › GHN: the owner pastes the token (server-side settings, never sent to the browser). The shop id is taken from the
 * account when left blank; the pickup district/ward default to Hoằng Hóa (found by name in GHN master data).
 */
export async function saveGhnSettingsAction(formData: FormData): Promise<void> {
  if (!(await can("shipping"))) redirect("/admin/login/");
  const db = getDb();
  const back = "/admin/shipping/?leg=vn_domestic";
  const fail = (msg: string): never => redirect(`${back}&error=${encodeURIComponent(msg)}`);
  if (formData.get("clear") === "1") {
    for (const k of Object.values(GHN_SETTING_KEYS)) setSetting(db, k, "");
    ghnResetCache();
    revalidatePath("/", "layout");
    redirect(`${back}&saved=${encodeURIComponent("Đã gỡ kết nối GHN.")}`);
  }
  const typed = String(formData.get("token") ?? "").trim();
  const token = typed || getSetting(db, GHN_SETTING_KEYS.token) || "";
  if (!token) fail("Dán token GHN (Token API trong tài khoản khachhang.ghn.vn).");
  let shops: Awaited<ReturnType<typeof ghnListShops>>;
  try {
    shops = await ghnListShops(token);
  } catch (e) {
    return fail(e instanceof GhnApiError ? e.message : "Không kiểm tra được token GHN.");
  }
  const shopRaw = Number.parseInt(String(formData.get("shopId") ?? "").trim(), 10);
  const shop = shops.find((s) => s.id === shopRaw) ?? shops[0];
  if (!shop) fail("Tài khoản GHN chưa có cửa hàng (shop) nào — tạo shop trong khachhang.ghn.vn rồi thử lại.");
  // pickup point: typed → the shop's own address → Hoằng Hóa (Thanh Hóa) by name
  let districtId = Number.parseInt(String(formData.get("pickupDistrictId") ?? "").trim(), 10);
  let wardCode = String(formData.get("pickupWardCode") ?? "").trim();
  if (!Number.isInteger(districtId) || districtId <= 0) {
    districtId = shop.districtId || 0;
    wardCode = shop.wardCode || "";
  }
  setSetting(db, GHN_SETTING_KEYS.token, token);
  setSetting(db, GHN_SETTING_KEYS.shopId, String(shop.id));
  ghnResetCache();
  if (!districtId) {
    try {
      const th = (await ghnProvinces()).find((p) => /thanh h[oó]a/i.test(p.name));
      const d = th ? (await ghnDistricts(th.id)).find((x) => /ho[ằa]ng h[oó]a/i.test(x.name)) : undefined;
      const w = d ? (await ghnWards(d.id))[0] : undefined;
      if (d && w) {
        districtId = d.id;
        wardCode = wardCode || w.code;
      }
    } catch {
      /* keep defaults */
    }
  }
  if (districtId) setSetting(db, GHN_SETTING_KEYS.pickupDistrictId, String(districtId));
  if (wardCode) setSetting(db, GHN_SETTING_KEYS.pickupWardCode, wardCode);
  ghnResetCache();
  revalidatePath("/", "layout");
  redirect(`${back}&saved=${encodeURIComponent(`Đã kết nối GHN: shop "${shop.name}" (#${shop.id})${districtId ? ` · điểm lấy hàng district ${districtId}${wardCode ? ` / ward ${wardCode}` : ""}` : ""}. Khách sẽ thấy cước GHN thật khi nhập địa chỉ.`)}`);
}

/**
 * ④ › Goship: the owner pastes the Access Token (shop.goship.io › Cài đặt › Kết nối API). The token is checked against
 * /cities and the warehouse (Hoằng Hóa, Thanh Hóa) is resolved to Goship's city/district codes for address_from.
 */
export async function saveGoshipSettingsAction(formData: FormData): Promise<void> {
  if (!(await can("shipping"))) redirect("/admin/login/");
  const db = getDb();
  const back = "/admin/shipping/?leg=vn_domestic";
  const fail = (msg: string): never => redirect(`${back}&error=${encodeURIComponent(msg)}`);
  if (formData.get("clear") === "1") {
    for (const k of Object.values(GOSHIP_SETTING_KEYS)) setSetting(db, k, "");
    goshipResetCache();
    revalidatePath("/", "layout");
    redirect(`${back}&saved=${encodeURIComponent("Đã gỡ kết nối Goship — quay về GHN trực tiếp + biểu phí.")}`);
  }
  const typed = String(formData.get("token") ?? "").trim();
  const token = typed || getSetting(db, GOSHIP_SETTING_KEYS.token) || "";
  if (!token) return fail("Dán Access Token Goship (shop.goship.io › Cài đặt › Kết nối API › Lấy Access Token).");
  const base = String(formData.get("base") ?? "") === "sandbox" ? GOSHIP_SANDBOX : GOSHIP_PROD;
  let check: Awaited<ReturnType<typeof goshipCheck>>;
  try {
    goshipResetCache();
    check = await goshipCheck(token, base);
  } catch (e) {
    return fail(e instanceof GoshipError ? e.message : "Không kiểm tra được token Goship.");
  }
  let fromCity = String(formData.get("fromCity") ?? "").trim();
  let fromDistrict = String(formData.get("fromDistrict") ?? "").trim();
  if (!fromCity || !fromDistrict) {
    if (!check.origin) return fail("Token đúng nhưng không tìm thấy Hoằng Hóa / Thanh Hóa trong danh mục Goship — điền tay mã tỉnh và quận/huyện gửi.");
    fromCity = check.origin.city.id;
    fromDistrict = check.origin.district.id;
  }
  setSetting(db, GOSHIP_SETTING_KEYS.token, token);
  setSetting(db, GOSHIP_SETTING_KEYS.base, base);
  setSetting(db, GOSHIP_SETTING_KEYS.fromCity, fromCity);
  setSetting(db, GOSHIP_SETTING_KEYS.fromDistrict, fromDistrict);
  goshipResetCache();
  revalidatePath("/", "layout");
  redirect(`${back}&saved=${encodeURIComponent(`Đã kết nối Goship (${base === GOSHIP_SANDBOX ? "sandbox" : "production"}): ${check.cities} tỉnh/thành · kho gửi ${check.origin ? `${check.origin.district.name}, ${check.origin.city.name}` : `${fromDistrict}/${fromCity}`}. Khách sẽ thấy cước thật của mọi hãng qua Goship.`)}`);
}

/** ④ › SPX Express: store User ID + Secret Key (+ fee endpoint once SPX sends the partner document). */
export async function saveSpxSettingsAction(formData: FormData): Promise<void> {
  if (!(await can("shipping"))) redirect("/admin/login/");
  const db = getDb();
  const back = "/admin/shipping/?leg=vn_domestic";
  if (formData.get("clear") === "1") {
    for (const k of Object.values(SPX_SETTING_KEYS)) setSetting(db, k, "");
    revalidatePath("/", "layout");
    redirect(`${back}&saved=${encodeURIComponent("Đã gỡ khóa SPX.")}`);
  }
  const userId = String(formData.get("userId") ?? "").replace(/\s+/g, "");
  const typedKey = String(formData.get("secretKey") ?? "").trim();
  const feeUrl = String(formData.get("feeUrl") ?? "").trim();
  if (userId && !/^\d{6,20}$/.test(userId)) redirect(`${back}&error=${encodeURIComponent("Mã user SPX là dãy số (thường 15 chữ số) trong Hồ sơ shop.")}`);
  if (feeUrl && !/^https:\/\//.test(feeUrl)) redirect(`${back}&error=${encodeURIComponent("Endpoint SPX phải bắt đầu bằng https://")}`);
  const secretKey = typedKey || getSetting(db, SPX_SETTING_KEYS.secretKey) || "";
  if (!secretKey) redirect(`${back}&error=${encodeURIComponent("Dán Secret Key SPX (Quản lý tài khoản › Hồ sơ shop).")}`);
  setSetting(db, SPX_SETTING_KEYS.secretKey, secretKey);
  setSetting(db, SPX_SETTING_KEYS.userId, userId);
  setSetting(db, SPX_SETTING_KEYS.feeUrl, feeUrl);
  revalidatePath("/", "layout");
  const missing = [!userId ? "Mã user (15 số)" : "", !feeUrl ? "tài liệu endpoint tính cước từ SPX" : ""].filter(Boolean);
  redirect(`${back}&saved=${encodeURIComponent(`Đã lưu khóa SPX trên máy chủ.${missing.length ? ` Còn thiếu: ${missing.join(" và ")} — khi có, cước SPX sẽ lấy từ API thay biểu phí.` : " Đủ thông tin — chờ xác nhận định dạng gọi API."}`)}`);
}

/**
 * Re-quote the VN-domestic leg of an order right before the waybill is created (spec §4/§10): fresh quotes for the
 * order's address and parcel, compared with what the customer paid. Nothing is charged automatically — the result goes
 * into the leg note and the flash message so the admin decides.
 */
export async function requoteOrderAction(formData: FormData): Promise<void> {
  if (!(await can("shipping")) && !(await can("orders"))) redirect("/admin/login/");
  const orderId = String(formData.get("orderId") ?? "").trim();
  const back = String(formData.get("back") ?? "").trim() || "/admin/shipping/";
  const order = orderId ? await getOrderById(orderId) : null;
  if (!order) redirect(back);
  const sep = back.includes("?") ? "&" : "?";
  let snapshot: { quote?: { carrier?: string; serviceCode?: string; carrierName?: string; totalFeeVnd?: number | null }; destination?: { provinceCode?: string; wardCode?: string; fullAddress?: string } } = {};
  try {
    snapshot = order.shipQuote ? (JSON.parse(order.shipQuote) as typeof snapshot) : {};
  } catch {
    snapshot = {};
  }
  const parsed = parseAddressToCodes(order.customer.address);
  const dest = snapshot.destination?.provinceCode && snapshot.destination.wardCode ? { provinceCode: snapshot.destination.provinceCode, wardCode: snapshot.destination.wardCode, street: order.customer.address.split(",")[0] ?? "" } : parsed ? { provinceCode: parsed.provinceCode, wardCode: parsed.wardCode, street: parsed.street } : null;
  if (!dest) redirect(`${back}${sep}error=${encodeURIComponent(`Đơn #${order.number}: không nhận ra tỉnh/thành và xã/phường trong địa chỉ để báo giá lại.`)}`);
  const r = await quoteCart({ lines: order.items.map((i) => ({ productId: i.productId, quantity: i.quantity })), destination: dest, cod: order.paymentMethod === "cod" }, { fresh: true });
  if ("error" in r) redirect(`${back}${sep}error=${encodeURIComponent(`Đơn #${order.number}: ${r.error}`)}`);
  const chosen = snapshot.quote?.carrier ? r.quotes.find((q) => q.carrier === snapshot.quote?.carrier && (q.serviceCode === snapshot.quote?.serviceCode || q.available)) : undefined;
  const paid = snapshot.quote?.totalFeeVnd ?? order.shippingFee;
  const lines = r.quotes.map((q) => `${q.carrierName}${q.serviceName ? ` ${q.serviceName}` : ""}: ${q.available && q.totalFeeVnd !== null ? `${q.accuracy === "from_price" ? "từ " : ""}${q.totalFeeVnd.toLocaleString("vi-VN")}đ` : q.statusText}`);
  const diff = chosen && chosen.available && chosen.totalFeeVnd !== null ? chosen.totalFeeVnd - paid : null;
  const stamp = new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour12: false });
  const note = `Báo giá lại ${stamp}: ${lines.join(" · ")}${diff !== null ? ` · chênh so với lúc đặt ${diff > 0 ? "+" : ""}${diff.toLocaleString("vi-VN")}đ` : ""}`;
  console.info(`[ship-requote] order #${order.number} ${note}`);
  const legs = (await import("@/lib/db")).getOrderLegs([order.id]);
  const cur = (await legs).get(order.id)?.find((l) => l.leg === "vn_domestic");
  await saveOrderLeg({ orderId: order.id, leg: "vn_domestic", methodId: cur?.methodId ?? null, zoneId: cur?.zoneId ?? null, label: cur?.label ?? order.shippingLabel, fee: cur?.fee ?? order.shippingFee, tracking: cur?.tracking ?? "", note: `${cur?.note ? `${cur.note} | ` : ""}${note}`.slice(0, 1000) });
  revalidatePath("/admin", "layout");
  redirect(`${back}${sep}saved=${encodeURIComponent(`Đơn #${order.number} — ${note}${diff !== null && diff > 0 ? " (không tự tăng tiền khách; liên hệ khách nếu vượt dung sai)" : ""}`)}#order-${order.id}`);
}
