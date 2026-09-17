import { parseCsv } from "./product-csv";
import { parseWarehouse, type Warehouse } from "./warehouses";

/**
 * Stocktake round-trip (Kho hàng): the owner exports the table ("Xuất CSV bảng này" — has an empty "Kiểm đếm thực tế"
 * column), counts the shelves, fills that column in Excel and imports the file back. Only rows with a number in the
 * count column change anything; blank rows are the products that were not counted. Pure (no DB).
 */
export interface StocktakeRow {
  id: number;
  count: number;
  /** Set when the sheet was exported for one warehouse ("Kho kiểm kê" column): the count is that warehouse's, not the total. */
  warehouse: Warehouse | null;
}

export function parseStocktakeCsv(text: string): { rows: StocktakeRow[]; skipped: number; errors: string[] } {
  const all = parseCsv(text);
  if (all.length < 2) return { rows: [], skipped: 0, errors: ['File trống hoặc thiếu dòng tiêu đề — xuất từ nút "Xuất CSV bảng này".'] };
  const header = all[0].map((h) => h.trim());
  const idCol = header.findIndex((h) => h.toUpperCase() === "ID");
  const countCol = header.findIndex((h) => /ki[ểe]m\s*[đd][ếe]m/i.test(h));
  const whCol = header.findIndex((h) => /^kho ki[ểe]m k[êe]$/i.test(h));
  if (idCol < 0 || countCol < 0) return { rows: [], skipped: 0, errors: ['Thiếu cột "ID" hoặc "Kiểm đếm thực tế" — xuất CSV từ trang Kho hàng để có đúng mẫu.'] };
  const rows: StocktakeRow[] = [];
  const errors: string[] = [];
  let skipped = 0;
  for (let i = 1; i < all.length; i++) {
    const idRaw = (all[i][idCol] ?? "").trim();
    const countRaw = (all[i][countCol] ?? "").trim();
    if (!countRaw) {
      skipped++;
      continue;
    }
    const id = Number.parseInt(idRaw, 10);
    const count = Number.parseInt(countRaw.replace(/[^\d-]/g, ""), 10);
    const whRaw = whCol >= 0 ? (all[i][whCol] ?? "").trim() : "";
    const warehouse = whRaw ? parseWarehouse(whRaw) : null;
    if (!Number.isInteger(id) || id <= 0) errors.push(`Dòng ${i + 1}: ID "${idRaw}" không hợp lệ`);
    else if (!Number.isInteger(count) || count < 0) errors.push(`Dòng ${i + 1} (#${id}): số đếm "${countRaw}" không hợp lệ`);
    else if (whRaw && !warehouse) errors.push(`Dòng ${i + 1} (#${id}): kho "${whRaw}" không hợp lệ — ghi Kho Nhật / Kho ĐVVC / Kho Việt Nam`);
    else rows.push({ id, count, warehouse });
  }
  return { rows, skipped, errors };
}
