import { parseCsv } from "./product-csv";

/**
 * Stocktake round-trip (Kho hàng): the owner exports the table ("Xuất CSV bảng này" — has an empty "Kiểm đếm thực tế"
 * column), counts the shelves, fills that column in Excel and imports the file back. Only rows with a number in the
 * count column change anything; blank rows are the products that were not counted. Pure (no DB).
 */
export interface StocktakeRow {
  id: number;
  count: number;
}

export function parseStocktakeCsv(text: string): { rows: StocktakeRow[]; skipped: number; errors: string[] } {
  const all = parseCsv(text);
  if (all.length < 2) return { rows: [], skipped: 0, errors: ['File trống hoặc thiếu dòng tiêu đề — xuất từ nút "Xuất CSV bảng này".'] };
  const header = all[0].map((h) => h.trim());
  const idCol = header.findIndex((h) => h.toUpperCase() === "ID");
  const countCol = header.findIndex((h) => /ki[ểe]m\s*[đd][ếe]m/i.test(h));
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
    if (!Number.isInteger(id) || id <= 0) errors.push(`Dòng ${i + 1}: ID "${idRaw}" không hợp lệ`);
    else if (!Number.isInteger(count) || count < 0) errors.push(`Dòng ${i + 1} (#${id}): số đếm "${countRaw}" không hợp lệ`);
    else rows.push({ id, count });
  }
  return { rows, skipped, errors };
}
