"use server";

import { revalidatePath } from "next/cache";
import { expectedPriceOf } from "@/lib/price-display";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { deleteProductLabel, deleteVoucher, deleteVoucherProgram, type FlashDiscount, getFlashSaleItems, getProductById, removeFlashSaleProduct, reorderFlashSaleProducts, resolveCustomerRefs, saveFlashSaleProduct, saveProductLabel, saveVoucher, saveVoucherProgram, setProductLabel, setShipPolicy, updateProductPricing } from "@/lib/db";
import type { ShipPolicy } from "@/lib/ship-policy";
import { parseAmount } from "@/lib/format";
import { invalidateSearchSuggest, saveList, SEARCH_KEYS, searchLists } from "@/lib/search-suggest";
import { normalizeQuery } from "@/lib/search-suggest-pure";
import { getDb } from "@/lib/sqlite";
import { saveUpload } from "@/lib/uploads";
import { isVoucherColor } from "@/lib/voucher-programs";

const DISCOUNTS = "/admin/promotions/discounts/";
const VOUCHERS = "/admin/promotions/vouchers/";
const FLASH_SALE = "/admin/promotions/flash-sale/";
const LABELS = "/admin/promotions/labels/";
const SEARCH = "/admin/promotions/search/";
const text = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const back = (url: string, key: "saved" | "error", msg: string): never => redirect(`${url}?${key}=${encodeURIComponent(msg)}`);
const isRedirect = (e: unknown) => e instanceof Error && e.message.includes("NEXT_REDIRECT");

const LABEL_TYPES: Record<string, string> = { "image/gif": "gif", "image/png": "png", "image/webp": "webp", "image/svg+xml": "svg", "image/avif": "avif", "image/jpeg": "jpg" };

/** Sales › Nhãn sản phẩm: create or edit a label (name, picture, order, on/off). */
export async function saveProductLabelAction(formData: FormData): Promise<void> {
  await requireAdmin("promotions");
  const idRaw = text(formData, "id");
  const id = idRaw ? Number.parseInt(idRaw, 10) : undefined;
  const backTo = id ? `${LABELS}?open=${id}` : LABELS;
  let image = "";
  try {
    const file = formData.get("file");
    if (file instanceof File && file.size > 0) {
      if (!LABEL_TYPES[file.type]) return back(backTo, "error", "Ảnh nhãn phải là GIF, PNG, WebP, SVG, AVIF hoặc JPG.");
      if (file.size > 5 * 1024 * 1024) return back(backTo, "error", "Ảnh nhãn tối đa 5 MB.");
      const saved = await saveUpload("badges", `label-${Date.now()}.${LABEL_TYPES[file.type]}`, Buffer.from(await file.arrayBuffer()));
      image = saved.url;
    }
    const savedId = await saveProductLabel({ id, name: text(formData, "name"), image: image || undefined, position: Number.parseInt(text(formData, "position"), 10) || 0, active: formData.get("active") === "on", hot: formData.get("hot") === "on" });
    revalidatePath("/", "layout");
    back(`${LABELS}?open=${savedId}`, "saved", id ? "Đã lưu nhãn." : "Đã thêm nhãn mới.");
  } catch (e) {
    if (isRedirect(e)) throw e;
    back(backTo, "error", e instanceof Error ? e.message : "Không lưu được nhãn.");
  }
}

export async function deleteProductLabelAction(formData: FormData): Promise<void> {
  await requireAdmin("promotions");
  const id = Number.parseInt(text(formData, "id"), 10);
  if (Number.isInteger(id)) await deleteProductLabel(id);
  revalidatePath("/", "layout");
  back(LABELS, "saved", "Đã xoá nhãn; các sản phẩm từng gắn nhãn này giờ không có nhãn.");
}

/** Pin a label on a product (labelId blank = remove). `back` = label id whose panel stays open. */
export async function assignLabelAction(formData: FormData): Promise<void> {
  await requireAdmin("promotions");
  const productId = Number.parseInt(text(formData, "productId"), 10);
  const labelRaw = text(formData, "labelId");
  const labelId = labelRaw ? Number.parseInt(labelRaw, 10) : null;
  const open = text(formData, "back") || labelRaw;
  const to = open ? `${LABELS}?open=${open}` : LABELS;
  if (!Number.isInteger(productId)) return back(to, "error", "Chọn một sản phẩm.");
  const p = await getProductById(productId);
  if (!p) return back(to, "error", "Không tìm thấy sản phẩm.");
  await setProductLabel(productId, labelId && Number.isInteger(labelId) ? labelId : null);
  revalidatePath("/", "layout");
  back(to, "saved", labelId ? `Đã gắn nhãn cho ${p.name}.` : `Đã gỡ nhãn khỏi ${p.name}.`);
}

/** Sales › Gợi ý tìm kiếm: pinned trending terms + brand list (one per line). */
export async function saveSearchSuggestAction(formData: FormData): Promise<void> {
  await requireAdmin("promotions");
  const db = getDb();
  const lines = (k: string) => text(formData, k).split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  saveList(db, SEARCH_KEYS.pinned, lines("pinned"));
  saveList(db, SEARCH_KEYS.brands, lines("brands"));
  invalidateSearchSuggest();
  revalidatePath("/", "layout");
  back(SEARCH, "saved", "Đã lưu gợi ý tìm kiếm.");
}

/** Hide (or show again) one searched term in the trending list. */
export async function hideSearchTermAction(formData: FormData): Promise<void> {
  await requireAdmin("promotions");
  const db = getDb();
  const term = text(formData, "term");
  const hide = text(formData, "hidden") === "1";
  const cur = searchLists(db).hidden;
  const norm = normalizeQuery(term);
  const next = hide ? [...cur, term] : cur.filter((x) => normalizeQuery(x) !== norm);
  saveList(db, SEARCH_KEYS.hidden, next);
  invalidateSearchSuggest();
  revalidatePath("/", "layout");
  back(SEARCH, "saved", hide ? `Đã ẩn “${term}” khỏi gợi ý.` : `Đã hiện lại “${term}”.`);
}

/** Put a product on sale: keeps the current price as the crossed-out regular price unless one is given. */
export async function setSaleAction(formData: FormData): Promise<void> {
  await requireAdmin("promotions");
  const id = Number.parseInt(text(formData, "productId"), 10);
  const product = Number.isInteger(id) ? await getProductById(id) : null;
  if (!product) return back(DISCOUNTS, "error", "Chọn sản phẩm.");
  // expected web price stays in regular_price while the promo price is charged; the crossed-out price customers see
  // is the market price (Giá thị trường), so "% giảm" here is relative to the market price when the product has one
  const sale = parseAmount(text(formData, "price"));
  const regularRaw = text(formData, "regularPrice");
  const regular = regularRaw ? parseAmount(regularRaw) : expectedPriceOf(product);
  const reference = product.marketPrice && product.marketPrice > 0 ? product.marketPrice : regular;
  const percentRaw = text(formData, "percent");
  const finalSale = !sale && percentRaw ? Math.round((reference * (100 - Math.min(99, Math.max(1, parseAmount(percentRaw))))) / 100) : sale;
  if (!finalSale || finalSale <= 0) back(DISCOUNTS, "error", "Nhập giá khuyến mại hoặc % giảm.");
  if (product.marketPrice && finalSale >= product.marketPrice) back(DISCOUNTS, "error", `Giá khuyến mại (${finalSale.toLocaleString("vi-VN")}đ) phải thấp hơn giá thị trường (${product.marketPrice.toLocaleString("vi-VN")}đ).`);
  if (finalSale === regular) back(DISCOUNTS, "error", "Giá khuyến mại đang bằng giá bán trên web — không có gì thay đổi.");
  await updateProductPricing(id, finalSale, regular);
  revalidatePath("/", "layout");
  back(DISCOUNTS, "saved", `Đã đặt khuyến mại "${product.name}": ${regular.toLocaleString("vi-VN")}đ → ${finalSale.toLocaleString("vi-VN")}đ${product.marketPrice ? ` (giá thị trường ${product.marketPrice.toLocaleString("vi-VN")}đ bị gạch)` : ""}.`);
}

/** End a sale: the regular price becomes the price again. */
export async function clearSaleAction(formData: FormData): Promise<void> {
  await requireAdmin("promotions");
  const id = Number.parseInt(text(formData, "productId"), 10);
  const product = Number.isInteger(id) ? await getProductById(id) : null;
  if (!product) return back(DISCOUNTS, "error", "Không tìm thấy sản phẩm.");
  await updateProductPricing(id, expectedPriceOf(product), null);
  revalidatePath("/", "layout");
  back(DISCOUNTS, "saved", `Đã bỏ giảm giá "${product.name}".`);
}

const toIso = (d: string, endOfDay: boolean) => (d ? new Date(`${d}T${endOfDay ? "23:59:59" : "00:00:00"}+07:00`).toISOString() : null);

export async function saveVoucherAction(formData: FormData): Promise<void> {
  await requireAdmin("promotions");
  const idRaw = text(formData, "id");
  const kind = text(formData, "kind") === "fixed" ? "fixed" : "percent";
  const value = parseAmount(text(formData, "value"));
  if (!value) back(VOUCHERS, "error", "Nhập giá trị giảm.");
  if (kind === "percent" && value > 100) back(VOUCHERS, "error", "Phần trăm giảm tối đa 100.");
  const maxRaw = text(formData, "maxDiscount");
  const limitRaw = text(formData, "usageLimit");
  // accounts the voucher is given to: pasted list + optional CSV/TXT upload (first column)
  const file = formData.get("customersFile");
  const uploaded = file instanceof File && file.size > 0 ? Buffer.from(await file.arrayBuffer()).toString("utf8").replace(/^\uFEFF/, "") : "";
  const tokens = `${text(formData, "customers")}\n${uploaded}`
    .split(/[\r\n;,\t]+/)
    .map((t) => t.split(/[,;\t]/)[0].trim().replace(/^"|"$/g, ""))
    .filter((t) => t && !/^(ma|mã|id|email|khach|khách|customer|stt)/i.test(t));
  const { ids: customerIds, unresolved } = await resolveCustomerRefs(tokens);
  if (unresolved.length) back(VOUCHERS, "error", `Không tìm thấy tài khoản: ${unresolved.slice(0, 10).join(", ")}${unresolved.length > 10 ? "…" : ""}. Dùng mã khách hàng (10001…), ID đăng nhập hoặc email đã đăng ký.`);
  try {
    const id = await saveVoucher({
      id: idRaw ? Number.parseInt(idRaw, 10) : undefined,
      code: text(formData, "code"),
      kind,
      value,
      minSubtotal: parseAmount(text(formData, "minSubtotal")),
      maxDiscount: maxRaw ? parseAmount(maxRaw) : null,
      startsAt: toIso(text(formData, "startsAt"), false),
      endsAt: toIso(text(formData, "endsAt"), true),
      usageLimit: limitRaw ? Number.parseInt(limitRaw, 10) || null : null,
      active: formData.get("active") === "on",
      note: text(formData, "note"),
      showHome: formData.get("showHome") === "on",
      programId: Number.parseInt(text(formData, "programId"), 10) || null,
      customerIds,
    });
    revalidatePath("/admin", "layout");
    redirect(`${VOUCHERS}?saved=${encodeURIComponent(idRaw ? "Đã lưu voucher." : "Đã tạo voucher.")}#voucher-${id}`);
  } catch (e) {
    if (isRedirect(e)) throw e;
    back(VOUCHERS, "error", e instanceof Error ? e.message : "Không lưu được voucher.");
  }
}

/** Voucher programs: name = banner title on the home page, colour per banner, order, on/off. */
export async function saveVoucherProgramAction(formData: FormData): Promise<void> {
  await requireAdmin("promotions");
  const idRaw = text(formData, "id");
  const color = text(formData, "color");
  try {
    await saveVoucherProgram({
      id: idRaw ? Number.parseInt(idRaw, 10) : undefined,
      name: text(formData, "name"),
      subtitle: text(formData, "subtitle"),
      color: isVoucherColor(color) ? color : "red",
      position: Number.parseInt(text(formData, "position"), 10) || 0,
      active: formData.get("active") === "on",
    });
    revalidatePath("/", "layout");
    back(VOUCHERS, "saved", idRaw ? "Đã lưu chương trình." : "Đã thêm chương trình voucher.");
  } catch (e) {
    if (isRedirect(e)) throw e;
    back(VOUCHERS, "error", e instanceof Error ? e.message : "Không lưu được chương trình.");
  }
}

export async function deleteVoucherProgramAction(formData: FormData): Promise<void> {
  await requireAdmin("promotions");
  const id = Number.parseInt(text(formData, "id"), 10);
  if (Number.isInteger(id)) await deleteVoucherProgram(id);
  revalidatePath("/", "layout");
  back(VOUCHERS, "saved", "Đã xoá chương trình; voucher trong đó chuyển sang chương trình đầu tiên.");
}

export async function deleteVoucherAction(formData: FormData): Promise<void> {
  await requireAdmin("promotions");
  const id = Number.parseInt(text(formData, "id"), 10);
  if (Number.isInteger(id)) await deleteVoucher(id);
  revalidatePath("/admin", "layout");
  back(VOUCHERS, "saved", "Đã xoá voucher.");
}

const POLICY = "/admin/promotions/shipping-policy/";

/** Sales › Chính sách vận chuyển: on/off switch, texts and the per-region order value for free domestic delivery. */
export async function saveShipPolicyAction(formData: FormData): Promise<void> {
  await requireAdmin("promotions");
  const amount = (k: string): number | null => {
    const v = text(formData, k);
    if (!v) return null;
    const n = parseAmount(v);
    return n > 0 ? n : null;
  };
  const policy: ShipPolicy = {
    enabled: formData.get("enabled") === "on",
    title: text(formData, "title") || "Hỗ trợ phí vận chuyển",
    text: text(formData, "text"),
    thresholds: { thanh_hoa: amount("t_thanh_hoa"), north: amount("t_north"), central: amount("t_central"), south: amount("t_south") },
  };
  await setShipPolicy(policy);
  revalidatePath("/", "layout");
  redirect(`${POLICY}?saved=${encodeURIComponent(policy.enabled ? "Đã lưu — chính sách đang hiển thị và áp dụng cho khách." : "Đã lưu — chính sách đang tắt.")}`);
}

/** "2026-09-20T18:30" (Vietnam time, from <input type="datetime-local">) → ISO, or null when blank/invalid. */
function parseVnDatetimeLocal(raw: string): string | null {
  if (!raw) return null;
  const iso = new Date(`${raw}:00+07:00`).toISOString();
  return Number.isNaN(new Date(iso).getTime()) ? null : iso;
}

/** Flash price typed as an amount ("199.000") or a percent ("20"); null when both blank. */
function parseFlashDiscount(formData: FormData): FlashDiscount {
  const priceRaw = text(formData, "salePrice");
  const percentRaw = text(formData, "percent");
  if (priceRaw) return { salePrice: parseAmount(priceRaw) };
  if (percentRaw) return { percent: parseAmount(percentRaw) };
  return null;
}

/**
 * Sales › Flash Sales: add a product (or update one already picked) with its own end time and, optionally, its own
 * flash price / % off — applied to the product's pricing so the % badge, cart and checkout all agree.
 */
export async function saveFlashSaleProductAction(formData: FormData): Promise<void> {
  await requireAdmin("promotions");
  const id = Number.parseInt(text(formData, "productId"), 10);
  const product = Number.isInteger(id) ? await getProductById(id) : null;
  if (!product) back(FLASH_SALE, "error", "Chọn sản phẩm.");
  const endsAt = parseVnDatetimeLocal(text(formData, "endsAt"));
  if (!endsAt) back(FLASH_SALE, "error", "Chọn thời điểm kết thúc.");
  try {
    await saveFlashSaleProduct(id, endsAt!, parseFlashDiscount(formData));
  } catch (e) {
    if (isRedirect(e)) throw e;
    back(FLASH_SALE, "error", e instanceof Error ? e.message : "Không lưu được.");
  }
  revalidatePath("/", "layout");
  back(FLASH_SALE, "saved", `Đã lưu "${product!.name}" trong Flash Sales.`);
}

export async function removeFlashSaleProductAction(formData: FormData): Promise<void> {
  await requireAdmin("promotions");
  const id = Number.parseInt(text(formData, "productId"), 10);
  if (Number.isInteger(id)) await removeFlashSaleProduct(id);
  revalidatePath("/", "layout");
  back(FLASH_SALE, "saved", "Đã bỏ khỏi Flash Sales.");
}

/** Move one product up/down the flash-sale order (whole list re-saved, simplest with no drag-and-drop JS). */
export async function moveFlashSaleProductAction(formData: FormData): Promise<void> {
  await requireAdmin("promotions");
  const id = Number.parseInt(text(formData, "productId"), 10);
  const dir = text(formData, "dir") === "up" ? -1 : 1;
  const items = await getFlashSaleItems(true, true);
  const i = items.findIndex((it) => it.product.id === id);
  const j = i + dir;
  if (i >= 0 && j >= 0 && j < items.length) {
    [items[i], items[j]] = [items[j], items[i]];
    await reorderFlashSaleProducts(items.map((it) => it.product.id));
  }
  revalidatePath("/", "layout");
  back(FLASH_SALE, "saved", "Đã sắp xếp lại Flash Sales.");
}
