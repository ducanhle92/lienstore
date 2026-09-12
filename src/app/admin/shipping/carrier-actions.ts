"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { can } from "@/lib/auth";
import { isCarrierCode } from "@/lib/carriers";
import { CARRIER_NAME, type CarrierCode } from "@/lib/carriers/types";
import { getOrderById, saveOrderLeg } from "@/lib/db";
import { quoteCart } from "@/lib/ship-quote";
import { getDb, getSetting, setSetting } from "@/lib/sqlite";
import { GHN_SETTING_KEYS, GhnApiError, ghnDistricts, ghnListShops, ghnProvinces, ghnResetCache, ghnWards } from "@/lib/ghn";
import { parseAddressToCodes } from "@/lib/vn-address";

const ALL: CarrierCode[] = ["GHN", "VIETTEL_POST", "VNPOST", "SPX"];

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
