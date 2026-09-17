"use server";

import { costPriceFromJpy, isCostSourceKind, sourceFromUrl } from "@/lib/cost-sources";
import { PRODUCT_MARGIN_RANGE } from "@/lib/pricing";
import { billableProductWeightG, isDimsConfidence } from "@/lib/shipping";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { can, getAdminSession } from "@/lib/auth";
import { storedPrices } from "@/lib/price-display";
import { deleteProduct, getCategories, getJpyRate, getPricingConfig, getProductById, getProductGroupById, getSourceFeeMap, listPurchaseSources, purchaseSourceKeys, replaceCostSources, saveProduct, saveProductGroup, slugExists, updateProductStock } from "@/lib/db";
import { resolvePurchaseSourceKey, UNKNOWN_SOURCE } from "@/lib/purchase-sources";
import { normalizeAttrLabels } from "@/lib/variants";
import { plainToHtml } from "@/lib/plain-html";
import { slugify } from "@/lib/format";
import { deleteUpload, relFromUrl, resolveThumbFor } from "@/lib/uploads";
import { getAllProducts } from "@/lib/db";
import type { CatalogProduct } from "@/types/shop";
import { structureDescription } from "@/lib/description";
import { suggestSku } from "@/lib/sku";
import { csvRowToPatch, parseCsv } from "@/lib/product-csv";
import { updateProductSku } from "@/lib/db";

export type ProductFormState = { error?: string; fields?: Record<string, string> } | null;

function parseIntField(raw: string): number | null {
  const digits = raw.replace(/[^\d]/g, "");
  return digits ? Number.parseInt(digits, 10) : null;
}

export async function saveProductAction(_prev: ProductFormState, formData: FormData): Promise<ProductFormState> {
  if (!(await can("products"))) return { error: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." };

  const get = (k: string) => String(formData.get(k) ?? "").trim();
  const fields: Record<string, string> = {};

  const idRaw = get("id");
  const id = idRaw ? Number.parseInt(idRaw, 10) : undefined;
  const existing = id ? await getProductById(id) : null;
  if (id && !existing) return { error: "Sản phẩm không tồn tại." };

  const name = get("name");
  if (!name) fields.name = "Tên sản phẩm là bắt buộc.";

  let slug = slugify(get("slug") || existing?.slug || name);
  if (!slug) fields.slug = "Đường dẫn không hợp lệ.";
  else if (await slugExists(slug, id)) fields.slug = "Đường dẫn đã tồn tại, hãy chọn đường dẫn khác.";

  // three prices (lib/price-display.ts): expected web price (required) · promo (optional, must be lower) · market reference
  const expectedRaw = get("expectedPrice") || get("regularPrice") || get("price");
  const expected = parseIntField(expectedRaw);
  if (expected === null || expected < 0) fields.price = "Giá bán trên web phải là số nguyên ≥ 0.";
  const promoRaw = get("expectedPrice") ? get("promoPrice") : get("regularPrice") ? get("price") : "";
  const promo = promoRaw ? parseIntField(promoRaw) : null;
  if (promoRaw && promo === null) fields.promoPrice = "Giá khuyến mại không hợp lệ.";
  const marketRaw = get("marketPrice");
  const marketPrice = marketRaw ? parseIntField(marketRaw) : null;
  if (marketRaw && marketPrice === null) fields.marketPrice = "Giá thị trường không hợp lệ.";
  if (promo !== null && marketPrice !== null && promo >= marketPrice) fields.promoPrice = "Giá khuyến mại phải thấp hơn giá thị trường.";
  const { price, regularPrice } = storedPrices(expected ?? 0, promo);

  // ¥ quotes per purchase source (cs_* repeated); the primary row feeds cost_jpy / cost_source / cost_url
  const csSources = formData.getAll("cs_source").map(String);
  const csPrices = formData.getAll("cs_price").map(String);
  const csUrls = formData.getAll("cs_url").map(String);
  const csConfirm = formData.getAll("cs_confirm").map(String);
  const primaryRaw = Number.parseInt(get("cs_primary"), 10);
  const sourceKeys = await purchaseSourceKeys();
  const costRows: Array<{ source: string; priceJpy: number; url: string; primary: boolean; checkedAt?: string }> = [];
  for (let i = 0; i < csSources.length; i++) {
    const priceRaw = (csPrices[i] ?? "").trim();
    const url = (csUrls[i] ?? "").trim();
    if (!priceRaw && !url) continue;
    const priceJpy = parseIntField(priceRaw);
    if (priceJpy === null || priceJpy <= 0) fields.costJpy = "Giá ¥ của mỗi nguồn phải là số nguyên > 0.";
    else if (url && !/^https?:\/\//i.test(url)) fields.costJpy = "Link giá phải bắt đầu bằng http(s)://";
    else costRows.push({ source: sourceKeys.has(csSources[i]) || isCostSourceKind(csSources[i]) ? csSources[i] : sourceFromUrl(url), priceJpy, url, primary: i === primaryRaw, ...(csConfirm[i] === "1" ? { checkedAt: new Date().toISOString() } : {}) });
  }
  const primaryRow = costRows.find((r) => r.primary) ?? costRows[0];
  const costJpy = primaryRow?.priceJpy ?? null;
  const costUrl = primaryRow?.url ?? "";
  const costSourceSel = primaryRow?.source ?? "";
  const costRaw = get("costPrice");
  let costPrice = costRaw ? parseIntField(costRaw) : null;
  if (costRaw && costPrice === null) fields.costPrice = "Giá vốn không hợp lệ.";

  const marginRaw = get("marginPct").replace(",", ".");
  const marginPct = marginRaw === "" ? null : Number.parseFloat(marginRaw);
  if (marginRaw !== "" && (marginPct === null || !Number.isFinite(marginPct) || marginPct < PRODUCT_MARGIN_RANGE.min || marginPct > PRODUCT_MARGIN_RANGE.max)) fields.marginPct = `Lãi riêng phải là số % từ ${PRODUCT_MARGIN_RANGE.min} đến ${PRODUCT_MARGIN_RANGE.max}.`;
  // the supplier link is the link of the chosen purchase source
  const supplierUrl = primaryRow?.url ?? "";
  const minRaw = get("minStock");
  const minStock = minRaw === "" ? null : parseIntField(minRaw);
  if (minRaw !== "" && (minStock === null || minStock < 0)) fields.minStock = "Mức tồn tối thiểu phải là số nguyên ≥ 0.";

  const weightRaw = get("weightG");
  const weightG = weightRaw === "" ? null : parseIntField(weightRaw);
  if (weightRaw !== "" && (weightG === null || weightG <= 0)) fields.weightG = "Khối lượng tính bằng gram, số nguyên > 0.";
  const dimsCm = get("dimsCm").replace(/\s+/g, "").replace(/[×*]/g, "x") || null;
  const confRaw = get("dimsConfidence");
  const dimsConfidence = isDimsConfidence(confRaw) ? confRaw : null;
  const dimsSource = get("dimsSource").slice(0, 300);
  if (dimsCm && !/^\d+(\.\d+)?x\d+(\.\d+)?x\d+(\.\d+)?$/.test(dimsCm)) fields.dimsCm = "Kích thước ghi dạng Dài x Rộng x Cao (cm), ví dụ 12x8x5.";
  // VND cost from the chosen ¥ quote + the source's surcharges (which may depend on the item's billable weight)
  const weightChanged = (existing?.weightG ?? null) !== weightG || (existing?.dimsCm ?? null) !== dimsCm || (existing?.dimsConfidence ?? null) !== dimsConfidence;
  if (costJpy && (costPrice === null || existing?.costJpy !== costJpy || (existing?.costSource ?? "") !== costSourceSel || weightChanged)) {
    costPrice = costPriceFromJpy(costJpy, costSourceSel, await getJpyRate(), getSourceFeeMap(), billableProductWeightG(weightG, dimsCm, dimsConfidence), (await getPricingConfig()).lotWeightG);
  }

  const stockRaw = get("stock");
  let stock = stockRaw === "" ? null : parseIntField(stockRaw);
  if (stockRaw !== "" && (stock === null || stock < 0)) fields.stock = "Tồn kho phải là số nguyên ≥ 0 hoặc để trống.";
  // "Kho hàng" card: Hàng order = not tracked (stock null) · Lưu kho = tracked, starting from the current count (or 0)
  const stockMode = get("stockMode");
  if (stockMode === "order") stock = null;
  else if (stockMode === "stock" && stock === null) stock = existing?.stock ?? 0;
  const fulfillment: CatalogProduct["fulfillment"] = stockMode ? (stockMode === "stock" ? "stock" : "order") : get("fulfillment") === "stock" ? "stock" : "order";

  const categories = formData.getAll("categories").map(String).filter(Boolean);
  if (categories.length === 0) fields.categories = "Chọn ít nhất một danh mục.";

  const images = get("images")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const thumb = get("thumb") || (images[0] ? await resolveThumbFor(images[0]) : "");
  if (!thumb) fields.images = "Cần ít nhất một ảnh (đường dẫn /sites/... hoặc https://...).";

  const tags = get("tags")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const status: CatalogProduct["status"] = get("status") === "draft" ? "draft" : "publish";
  const discontinued = get("sale_status") === "discontinued";

  if (Object.keys(fields).length > 0) return { error: "Vui lòng kiểm tra lại các trường được đánh dấu.", fields };

  // variant family: keep / move / create / leave
  const groupSel = get("groupId");
  let groupId: number | null = null;
  let groupLabels: string[] = [];
  if (groupSel === "new") {
    const gName = get("groupName");
    if (!gName) return { error: "Nhập tên chung của nhóm biến thể mới.", fields: { groupName: "Bắt buộc khi tạo nhóm mới." } };
    const g = await saveProductGroup({ name: gName, attrLabels: normalizeAttrLabels(get("groupAttrLabels")) });
    groupId = g.id;
    groupLabels = g.attrLabels;
  } else if (groupSel) {
    const g = await getProductGroupById(Number.parseInt(groupSel, 10));
    if (!g) return { error: "Nhóm biến thể không tồn tại." };
    groupId = g.id;
    groupLabels = g.attrLabels;
  }
  const variantAttrs: Record<string, string> = {};
  groupLabels.forEach((label, i) => {
    const v = get(`variant_${i}`).slice(0, 40);
    if (v) variantAttrs[label] = v;
  });
  const posRaw = Number.parseInt(get("variantPosition"), 10);
  const variantPosition = Number.isInteger(posRaw) ? posRaw : (existing?.variantPosition ?? 0);

  slug = slug || `san-pham-${Date.now()}`;
  const saved = await saveProduct({
    id,
    slug,
    name,
    price,
    regularPrice,
    marketPrice,
    costPrice,
    changedBy: (await getAdminSession())?.label ?? "admin",
    supplierUrl: supplierUrl || null,
    minStock,
    weightG,
    dimsCm,
    dimsConfidence,
    dimsSource,
    currency: existing?.currency ?? "VNĐ",
    sku: get("sku") || null,
    stock,
    stockStatus: discontinued ? "discontinued" : "instock",
    fulfillment,
    costJpy,
    costSource: costJpy ? costSourceSel || "manual" : "",
    costUrl,
    marginPct,
    costCheckedAt: costJpy ? (costJpy === existing?.costJpy ? existing.costCheckedAt : new Date().toISOString()) : null,
    categories,
    tags,
    images: images.length ? images : [thumb],
    thumb,
    shortDescription: plainToHtml(get("shortDescription")),
    description: get("description"),
    nameJa: get("nameJa"),
    shortDescriptionJa: plainToHtml(get("shortDescriptionJa")),
    descriptionJa: get("descriptionJa"),
    related: existing?.related ?? [],
    rating: existing?.rating ?? null,
    reviewCount: existing?.reviewCount ?? 0,
    status,
    groupId,
    variantAttrs,
    variantPosition,
  });

  await replaceCostSources(saved.id, costRows.map(({ source, priceJpy, url, checkedAt }) => ({ source, priceJpy, url, checkedAt })));
  if ((existing?.stock ?? null) !== stock) await updateProductStock(saved.id, stock, minStock);
  if (existing) await cleanupRemovedUploads(existing.images, saved.images, saved.id);
  revalidatePath("/", "layout");
  redirect(`/admin/products/?saved=${saved.id}`);
}

/** Delete uploaded files that were removed from a product and are not referenced by any other product. */
async function cleanupRemovedUploads(before: string[], after: string[], productId: number): Promise<void> {
  const removed = before.filter((u) => !after.includes(u) && relFromUrl(u));
  if (removed.length === 0) return;
  const others = (await getAllProducts(true)).filter((p) => p.id !== productId);
  for (const url of removed) {
    if (others.some((p) => p.images.includes(url) || p.thumb === url)) continue;
    const rel = relFromUrl(url);
    if (!rel) continue;
    await deleteUpload(rel);
    await deleteUpload(rel.replace(/(\.[a-z0-9]+)$/i, "-300x300$1"));
  }
}

export async function deleteProductAction(formData: FormData): Promise<void> {
  if (!(await can("products"))) redirect("/admin/login/");
  const id = Number.parseInt(String(formData.get("id") ?? ""), 10);
  if (Number.isInteger(id)) {
    const existing = await getProductById(id);
    if (existing) await cleanupRemovedUploads(existing.images, [], id);
    await deleteProduct(id);
    revalidatePath("/", "layout");
  }
  redirect("/admin/products/?deleted=1");
}

/** Brand fact of a product ("Thương hiệu: DHC") when the description carries one. */
export async function brandHintOf(p: Pick<CatalogProduct, "description" | "name">): Promise<string | null> {
  try {
    return structureDescription(p.description ?? "", p.name).facts.find((f) => f.label === "Thương hiệu")?.value ?? null;
  } catch {
    return null;
  }
}

/** Kho hàng › Sản phẩm: give every product without a SKU one, following BRAND-CAT-YYMM-NNNN (see lib/sku.ts). */
export async function generateSkusAction(): Promise<void> {
  if (!(await can("products"))) redirect("/admin/login/");
  const products = await getAllProducts(true);
  let n = 0;
  for (const p of products) {
    if (p.sku && p.sku.trim()) continue;
    const sku = suggestSku({ id: p.id, name: p.name, categories: p.categories, createdAt: p.createdAt, brand: await brandHintOf(p) });
    if (await updateProductSku(p.id, sku)) n++;
  }
  revalidatePath("/admin", "layout");
  redirect(`/admin/products/?saved=${encodeURIComponent(`sku:${n}`)}`);
}

/**
 * Kho hàng › Sản phẩm › Nhập CSV: rows are matched by the ID column; only the columns present in the file are changed.
 * A ¥ cost without a VND cost recomputes the VND cost with the current rate. Result goes back as a notice.
 */
export async function importProductsCsvAction(formData: FormData): Promise<void> {
  if (!(await can("products"))) redirect("/admin/login/");
  const file = formData.get("csv");
  const fail = (msg: string): never => redirect(`/admin/products/?error=${encodeURIComponent(msg)}`);
  if (!(file instanceof File) || file.size === 0) fail("Hãy chọn file CSV.");
  const f = file as File;
  if (f.size > 5 * 1024 * 1024) fail("File CSV tối đa 5 MB.");
  const rows = parseCsv(Buffer.from(await f.arrayBuffer()).toString("utf8"));
  if (rows.length < 2) fail("File CSV trống hoặc thiếu dòng tiêu đề.");
  const header = rows[0].map((h) => h.trim());
  const idCol = header.findIndex((h) => h.toUpperCase() === "ID");
  const nameCol = header.findIndex((h) => h === "Tên sản phẩm");
  if (idCol < 0 && nameCol < 0) fail('Thiếu cột "ID" (sửa sản phẩm) hoặc "Tên sản phẩm" (tạo mới) — xuất CSV từ trang này để lấy mẫu.');
  const rate = await getJpyRate();
  const fees = getSourceFeeMap();
  const lotG = (await getPricingConfig()).lotWeightG;
  const [sources, categories] = await Promise.all([listPurchaseSources(true), getCategories()]);
  const catSlugs = new Set(categories.map((c) => c.slug));
  const catByName = new Map(categories.map((c) => [c.name.trim().toLowerCase(), c.slug]));
  let updated = 0;
  let created = 0;
  let unchanged = 0;
  const errors: string[] = [];
  for (let i = 1; i < rows.length; i++) {
    const rec: Record<string, string> = {};
    header.forEach((h, j) => (rec[h] = rows[i][j] ?? ""));
    // "Nguồn giá": key or display name from Kho hàng › Nguồn nhập; unknown text → "Chưa xác định"
    const sourceRaw = (rec["Nguồn giá"] ?? "").trim();
    const sourceKey = sourceRaw ? (resolvePurchaseSourceKey(sourceRaw, sources) ?? UNKNOWN_SOURCE) : undefined;
    const idText = (rec.ID ?? "").trim();
    if (!idText || /^(new|mới|moi)$/i.test(idText)) {
      // ---- create a new product from the row (photos are added later in admin, so it starts as a draft) ----
      const { patch, errors: rowErrors } = csvRowToPatch(rec);
      if (!patch.name) {
        errors.push(`Dòng ${i + 1}: thiếu Tên sản phẩm`);
        continue;
      }
      if (rowErrors.length) {
        errors.push(`Dòng ${i + 1}: ${rowErrors.join("; ")}`);
        continue;
      }
      const cats = (patch.categories ?? []).map((c) => (catSlugs.has(c) ? c : catByName.get(c.toLowerCase()) ?? "")).filter(Boolean);
      if (!cats.length) {
        errors.push(`Dòng ${i + 1} (${patch.name}): Danh mục không hợp lệ — dùng slug hoặc tên danh mục có trong shop`);
        continue;
      }
      let slug = slugify(patch.name);
      for (let k = 2; await slugExists(slug); k++) slug = `${slugify(patch.name)}-${k}`;
      const costJpy = patch.costJpy ?? null;
      try {
        const saved = await saveProduct({
          slug,
          name: patch.name,
          nameJa: patch.nameJa ?? "",
          price: patch.price ?? 0,
          regularPrice: patch.regularPrice ?? null,
          marketPrice: null,
          costPrice: patch.costPrice ?? (costJpy ? costPriceFromJpy(costJpy, sourceKey ?? UNKNOWN_SOURCE, rate, fees, billableProductWeightG(patch.weightG ?? null, patch.dimsCm ?? null, patch.dimsConfidence ?? null), lotG) : null),
          supplierUrl: patch.supplierUrl ?? null,
          minStock: patch.minStock ?? null,
          weightG: patch.weightG ?? null,
          dimsCm: patch.dimsCm ?? null,
          dimsConfidence: patch.dimsConfidence ?? null,
          dimsSource: rec["Nguồn kích thước"]?.trim() ?? "",
          currency: "VNĐ",
          sku: patch.sku ?? null,
          stock: patch.stock ?? null,
          stockStatus: patch.stockStatus ?? "instock",
          fulfillment: patch.fulfillment ?? "order",
          costJpy,
          costSource: costJpy ? (sourceKey ?? UNKNOWN_SOURCE) : "",
          costUrl: patch.costUrl ?? "",
          costCheckedAt: costJpy ? new Date().toISOString() : null,
          marginPct: patch.marginPct ?? null,
          categories: cats,
          tags: patch.tags ?? [],
          images: [],
          thumb: "",
          shortDescription: rec["Mô tả ngắn"]?.trim() ?? "",
          description: rec["Mô tả"]?.trim() ?? "",
          shortDescriptionJa: "",
          descriptionJa: "",
          related: [],
          rating: null,
          reviewCount: 0,
          status: "draft", // no photo yet → hidden until the owner adds one and publishes
        });
        if (costJpy) await replaceCostSources(saved.id, [{ source: sourceKey ?? UNKNOWN_SOURCE, priceJpy: costJpy, url: patch.costUrl ?? "" }]);
        created++;
      } catch (e) {
        errors.push(`Dòng ${i + 1} (${patch.name}): ${e instanceof Error ? e.message : "không tạo được"}`);
      }
      continue;
    }
    const id = Number.parseInt(idText, 10);
    if (!Number.isInteger(id)) {
      errors.push(`Dòng ${i + 1}: ID "${rec.ID}" không hợp lệ`);
      continue;
    }
    const existing = await getProductById(id);
    if (!existing) {
      errors.push(`Dòng ${i + 1}: không có sản phẩm #${id}`);
      continue;
    }
    const { patch, errors: rowErrors } = csvRowToPatch(rec);
    if (rowErrors.length) {
      errors.push(`#${id}: ${rowErrors.join("; ")}`);
      continue;
    }
    const next = { ...existing, ...patch, ...(sourceKey ? { costSource: sourceKey } : {}) } as CatalogProduct;
    // an empty VND cost next to a ¥ cost means "derive it from the rate" (never wipes the cost); a changed ¥ also re-derives it
    if (next.costJpy && (patch.costPrice === undefined || patch.costPrice === null || (patch.costJpy !== undefined && patch.costJpy !== existing.costJpy) || (sourceKey && sourceKey !== existing.costSource))) next.costPrice = costPriceFromJpy(next.costJpy, next.costSource, rate, fees, billableProductWeightG(next.weightG, next.dimsCm, next.dimsConfidence), lotG);
    if (patch.costJpy && patch.costJpy !== existing.costJpy) next.costCheckedAt = new Date().toISOString();
    const changed = (Object.keys(patch) as Array<keyof typeof patch>).some((k) => JSON.stringify(existing[k]) !== JSON.stringify(next[k])) || next.costPrice !== existing.costPrice;
    if (!changed) {
      unchanged++;
      continue;
    }
    try {
      await saveProduct({ ...next, id });
      updated++;
    } catch (e) {
      errors.push(`#${id}: ${e instanceof Error ? e.message : "không lưu được"}`);
    }
  }
  revalidatePath("/", "layout");
  const msg = `csv:${updated}:${unchanged}:${errors.length}:${created ? `Tạo mới ${created} sản phẩm (bản nháp — thêm ảnh rồi bật Đang bán). ` : ""}${errors.slice(0, 8).join(" | ").slice(0, 900)}`;
  redirect(`/admin/products/?saved=${encodeURIComponent(msg)}`);
}
