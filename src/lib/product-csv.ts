import type { CatalogProduct } from "@/types/shop";
import { isDimsConfidence } from "./shipping";

/**
 * CSV round-trip of the product list (Admin › Kho hàng › Sản phẩm): every editable field goes out with a Vietnamese header,
 * the same headers come back in and are applied by product ID. Pure module (no DB).
 */
export const CSV_COLUMNS = [
  "ID",
  "SKU",
  "Tên sản phẩm",
  "Tên tiếng Nhật",
  "Đường dẫn (slug)",
  "Danh mục (slug, cách nhau bằng ;)",
  "Hình thức",
  "Giá bán VN (VNĐ)",
  "Giá gốc (VNĐ)",
  "Giá bán NB (VNĐ)",
  "Giá vốn (¥)",
  "Tỉ giá (đ/¥)",
  "Giá vốn (VNĐ)",
  "Nguồn giá",
  "Link giá",
  "Link nhà cung cấp",
  "Số lượng tồn",
  "Mức tồn tối thiểu",
  "Tình trạng",
  "Trạng thái",
  "Cân (g)",
  "Kích thước (cm)",
  "Độ tin cậy",
  "Tags (cách nhau bằng ;)",
  "Link web",
  "Cập nhật",
] as const;
export type CsvColumn = (typeof CSV_COLUMNS)[number];

const CONF_LABEL: Record<string, string> = { high: "Cao", medium: "Trung bình", low: "Thấp" };
const CONF_KEY: Record<string, "high" | "medium" | "low"> = { cao: "high", "trung bình": "medium", "trung binh": "medium", thấp: "low", thap: "low", high: "high", medium: "medium", low: "low" };

export function productToCsvRow(p: CatalogProduct, rate: number, marginPct: number): Record<CsvColumn, string | number> {
  return {
    ID: p.id,
    SKU: p.sku ?? "",
    "Tên sản phẩm": p.name,
    "Tên tiếng Nhật": p.nameJa,
    "Đường dẫn (slug)": p.slug,
    "Danh mục (slug, cách nhau bằng ;)": p.categories.join(";"),
    "Hình thức": p.fulfillment === "stock" ? "Lưu kho" : "Order",
    "Giá bán VN (VNĐ)": p.price,
    "Giá gốc (VNĐ)": p.regularPrice ?? "",
    "Giá bán NB (VNĐ)": p.costPrice === null ? "" : Math.round((p.costPrice * (1 + marginPct / 100)) / 1000) * 1000,
    "Giá vốn (¥)": p.costJpy ?? "",
    "Tỉ giá (đ/¥)": rate,
    "Giá vốn (VNĐ)": p.costPrice ?? "",
    "Nguồn giá": p.costSource,
    "Link giá": p.costUrl,
    "Link nhà cung cấp": p.supplierUrl ?? "",
    "Số lượng tồn": p.stock ?? "",
    "Mức tồn tối thiểu": p.minStock ?? "",
    "Tình trạng": p.stockStatus === "outofstock" ? "Hết hàng" : "Còn hàng",
    "Trạng thái": p.status === "publish" ? "Đang bán" : "Bản nháp",
    "Cân (g)": p.weightG ?? "",
    "Kích thước (cm)": p.dimsCm ?? "",
    "Độ tin cậy": p.dimsConfidence ? CONF_LABEL[p.dimsConfidence] : "",
    "Tags (cách nhau bằng ;)": p.tags.join(";"),
    "Link web": `/product/${p.slug}/`,
    "Cập nhật": p.updatedAt.slice(0, 10),
  };
}

const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export function toCsv(rows: Array<Record<CsvColumn, string | number>>): string {
  return "﻿" + [CSV_COLUMNS as readonly string[], ...rows.map((r) => CSV_COLUMNS.map((c) => r[c]))].map((r) => r.map(esc).join(",")).join("\r\n");
}

/** RFC 4180-ish parser: quotes, doubled quotes, CR/LF inside quotes, BOM; also accepts ; as separator (Excel vi-VN). */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

const intOrNull = (v: string): number | null | undefined => {
  const s = v.trim();
  if (s === "") return null;
  const n = Number.parseInt(s.replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(n) ? n : undefined;
};

export type CsvPatch = Partial<Pick<CatalogProduct, "sku" | "name" | "nameJa" | "categories" | "fulfillment" | "price" | "regularPrice" | "costJpy" | "costPrice" | "costUrl" | "supplierUrl" | "stock" | "minStock" | "stockStatus" | "status" | "weightG" | "dimsCm" | "dimsConfidence" | "tags">>;

/** Turn one CSV record (header → value) into a patch; only columns present in the file are touched. */
export function csvRowToPatch(rec: Record<string, string>): { patch: CsvPatch; errors: string[] } {
  const patch: CsvPatch = {};
  const errors: string[] = [];
  const has = (c: CsvColumn) => Object.prototype.hasOwnProperty.call(rec, c);
  const num = (c: CsvColumn, min = 0) => {
    const v = intOrNull(rec[c]);
    if (v === undefined || (v !== null && v < min)) errors.push(`${c}: "${rec[c]}" không hợp lệ`);
    return v;
  };
  if (has("SKU")) patch.sku = rec.SKU.trim() || null;
  if (has("Tên sản phẩm") && rec["Tên sản phẩm"].trim()) patch.name = rec["Tên sản phẩm"].trim();
  if (has("Tên tiếng Nhật")) patch.nameJa = rec["Tên tiếng Nhật"].trim();
  if (has("Danh mục (slug, cách nhau bằng ;)")) patch.categories = rec["Danh mục (slug, cách nhau bằng ;)"].split(/[;,]/).map((s) => s.trim()).filter(Boolean);
  if (has("Hình thức")) {
    const v = rec["Hình thức"].trim().toLowerCase();
    if (v) patch.fulfillment = v.startsWith("lưu") || v.startsWith("luu") || v === "stock" ? "stock" : "order";
  }
  if (has("Giá bán VN (VNĐ)")) {
    const v = num("Giá bán VN (VNĐ)");
    if (v !== undefined && v !== null) patch.price = v;
  }
  if (has("Giá gốc (VNĐ)")) {
    const v = num("Giá gốc (VNĐ)");
    if (v !== undefined) patch.regularPrice = v;
  }
  if (has("Giá vốn (¥)")) {
    const v = num("Giá vốn (¥)");
    if (v !== undefined) patch.costJpy = v;
  }
  if (has("Giá vốn (VNĐ)")) {
    const v = num("Giá vốn (VNĐ)");
    if (v !== undefined) patch.costPrice = v;
  }
  if (has("Link giá")) patch.costUrl = rec["Link giá"].trim();
  if (has("Link nhà cung cấp")) patch.supplierUrl = rec["Link nhà cung cấp"].trim() || null;
  if (has("Số lượng tồn")) {
    const v = num("Số lượng tồn");
    if (v !== undefined) patch.stock = v;
  }
  if (has("Mức tồn tối thiểu")) {
    const v = num("Mức tồn tối thiểu");
    if (v !== undefined) patch.minStock = v;
  }
  if (has("Tình trạng") && rec["Tình trạng"].trim()) patch.stockStatus = /hết|het|out/i.test(rec["Tình trạng"]) ? "outofstock" : "instock";
  if (has("Trạng thái") && rec["Trạng thái"].trim()) patch.status = /nháp|nhap|draft|ẩn/i.test(rec["Trạng thái"]) ? "draft" : "publish";
  if (has("Cân (g)")) {
    const v = num("Cân (g)");
    if (v !== undefined) patch.weightG = v && v > 0 ? v : null;
  }
  if (has("Kích thước (cm)")) patch.dimsCm = rec["Kích thước (cm)"].replace(/\s+/g, "").replace(/[×*]/g, "x") || null;
  if (has("Độ tin cậy")) {
    const v = rec["Độ tin cậy"].trim().toLowerCase();
    if (!v) patch.dimsConfidence = null;
    else if (CONF_KEY[v] && isDimsConfidence(CONF_KEY[v])) patch.dimsConfidence = CONF_KEY[v];
    else errors.push(`Độ tin cậy: "${rec["Độ tin cậy"]}" (dùng Cao / Trung bình / Thấp)`);
  }
  if (has("Tags (cách nhau bằng ;)")) patch.tags = rec["Tags (cách nhau bằng ;)"].split(/[;,]/).map((s) => s.trim()).filter(Boolean);
  return { patch, errors };
}
