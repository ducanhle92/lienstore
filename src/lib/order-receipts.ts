import { addOrderFile } from "@/lib/db";
import { extForMime, MAX_UPLOAD_BYTES, RECEIPT_MIMES, saveUpload, slugifyFileName, uniqueName } from "@/lib/uploads";

/** Digits of a typed amount ("¥2,280" → 2280), or null when there are none. */
export function parseJpy(raw: string): number | null {
  const digits = raw.replace(/[^\d]/g, "");
  return digits ? Number.parseInt(digits, 10) : null;
}

/**
 * Store receipt files (image / PDF, ≤ 10 MB each) of an order — the "Bill mua hàng tại Nhật" the customer can open.
 * Used by the bill form and by the chat's "Đính kèm bill". Returns how many were saved, their names and the last skip reason.
 */
export async function saveOrderReceipts(orderId: string, files: File[], opts: { note?: string; amountJpy?: number | null } = {}): Promise<{ saved: number; names: string[]; error: string }> {
  const note = (opts.note ?? "").trim().slice(0, 300);
  let saved = 0;
  let error = "";
  const names: string[] = [];
  for (const file of files) {
    if (!RECEIPT_MIMES.has(file.type)) {
      error = `Bỏ qua ${file.name}: chỉ nhận ảnh hoặc PDF.`;
      continue;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      error = `Bỏ qua ${file.name}: vượt 10 MB.`;
      continue;
    }
    const ext = extForMime(file.type) || ".bin";
    const name = uniqueName(slugifyFileName(file.name), ext);
    const stored = await saveUpload(`orders/${orderId}`, name, Buffer.from(await file.arrayBuffer()));
    await addOrderFile({ orderId, kind: "receipt", fileName: file.name, path: stored.rel, mime: file.type, size: file.size, note, amountJpy: opts.amountJpy ?? null });
    names.push(file.name);
    saved += 1;
  }
  return { saved, names, error };
}
