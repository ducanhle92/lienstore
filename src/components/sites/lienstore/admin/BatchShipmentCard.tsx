import Link from "next/link";
import { createBatchAction, setBatchTrackingAction } from "@/app/admin/shipping/batch-actions";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { formatAmount, formatDateTime } from "@/lib/format";
import { IMPORT_LEGS, LEG_LABEL } from "@/lib/shipping";
import type { ShipmentBatch, ShippingMethod } from "@/types/shop";
import { adminInput, adminLabel, btnPrimary, btnSecondary, Card } from "./ui";

export const BATCH_FORM_ID = "batch-form";

/**
 * Vận chuyển › Đơn hàng · 4 chặng: consolidate ticked orders into one shipment for an import leg (the order rows'
 * checkboxes point at this form with form="batch-form"), plus the list of batches already made.
 */
export function BatchShipmentCard({ methods, batches, defaultMethodIds }: { methods: ShippingMethod[]; batches: ShipmentBatch[]; defaultMethodIds: Partial<Record<string, number | undefined>> }) {
  const firstDefault = IMPORT_LEGS.map((leg) => (defaultMethodIds[leg] ? `${leg}:${defaultMethodIds[leg]}` : "")).find(Boolean) ?? "";
  return (
    <div id="batches">
    <Card className="mb-6" title="Gom đơn thành lô (giảm phí chặng ① ② ③)">
      <form id={BATCH_FORM_ID} action={createBatchAction} className="grid gap-3 md:grid-cols-[1fr_220px_auto] md:items-end">
        <div>
          <label className={adminLabel} htmlFor="batch-choice">
            Chặng · phương thức gửi chung
          </label>
          <select id="batch-choice" name="choice" defaultValue={firstDefault} className={adminInput}>
            {IMPORT_LEGS.map((leg) => (
              <optgroup key={leg} label={LEG_LABEL[leg]}>
                {methods
                  .filter((m) => m.leg === leg && m.active)
                  .map((m) => (
                    <option key={m.id} value={`${leg}:${m.id}`}>
                      {m.name}
                      {m.carrierName && !m.name.includes(m.carrierName) ? ` (${m.carrierName})` : ""}
                      {defaultMethodIds[leg] === m.id ? " — mặc định" : ""}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div>
          <label className={adminLabel} htmlFor="batch-tracking">
            Mã vận đơn của lô <span className="font-normal text-lien-muted">(điền sau cũng được)</span>
          </label>
          <input id="batch-tracking" name="tracking" className={adminInput} placeholder="VD: 1234-5678-9012" />
        </div>
        <button type="submit" className={btnPrimary}>
          <Fa name="cubes" /> Gom các đơn đã tick
        </button>
      </form>
      <p className="mt-2 text-[12px] leading-5 text-lien-muted">
        Tick các đơn ở cột đầu bảng dưới → chọn chặng/phương thức → Gom. Phí được tính <strong>một lần cho cả lô</strong> theo tổng cân tính phí rồi chia cho từng đơn theo gram; chênh lệch so với gửi từng đơn được ghi là tiết kiệm. Mã vận đơn của lô tự ghi vào chặng đó của mọi đơn trong lô.
      </p>
      {batches.length ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-left text-[13px]">
            <thead>
              <tr className="text-[11px] font-bold uppercase tracking-wide text-lien-muted">
                <th className="border-b border-[#e5e7eb] px-2 py-2">Lô</th>
                <th className="border-b border-[#e5e7eb] px-2 py-2">Chặng · phương thức</th>
                <th className="border-b border-[#e5e7eb] px-2 py-2">Đơn trong lô</th>
                <th className="border-b border-[#e5e7eb] px-2 py-2 text-right">Tổng cân</th>
                <th className="border-b border-[#e5e7eb] px-2 py-2 text-right">Phí lô</th>
                <th className="border-b border-[#e5e7eb] px-2 py-2 text-right">Tiết kiệm</th>
                <th className="border-b border-[#e5e7eb] px-2 py-2">Mã vận đơn</th>
                <th className="border-b border-[#e5e7eb] px-2 py-2">Tạo lúc</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id} className="align-top" data-testid={`batch-row-${b.id}`}>
                  <td className="border-b border-[#f3f4f6] px-2 py-2 font-semibold text-lien-heading">#{b.id}</td>
                  <td className="border-b border-[#f3f4f6] px-2 py-2">
                    {LEG_LABEL[b.leg]}
                    <span className="block text-[12px] text-lien-muted">{b.label}</span>
                  </td>
                  <td className="border-b border-[#f3f4f6] px-2 py-2">
                    {b.orderNumbers.map((n, i) => (
                      <span key={b.orderIds[i]}>
                        {i > 0 ? ", " : ""}
                        <Link href={`/admin/orders/${b.orderIds[i]}/`} className="text-lien-blue hover:underline">
                          #{n}
                        </Link>
                      </span>
                    ))}
                  </td>
                  <td className="border-b border-[#f3f4f6] px-2 py-2 text-right whitespace-nowrap">{formatAmount(b.totalWeightG)} g</td>
                  <td className="border-b border-[#f3f4f6] px-2 py-2 text-right whitespace-nowrap">
                    {formatAmount(b.fee)}đ{/¥/.test(b.currency) ? <span className="block text-[11px] text-lien-muted">{formatAmount(b.feeRaw)}¥</span> : null}
                  </td>
                  <td className="border-b border-[#f3f4f6] px-2 py-2 text-right whitespace-nowrap text-green-700">{b.savings > 0 ? `−${formatAmount(b.savings)}đ` : "—"}</td>
                  <td className="border-b border-[#f3f4f6] px-2 py-2">
                    <form action={setBatchTrackingAction} className="flex items-center gap-1">
                      <input type="hidden" name="id" value={b.id} />
                      <input name="tracking" defaultValue={b.tracking} placeholder="Mã vận đơn" className={`${adminInput} !mb-0 !w-[160px] !px-2 !py-1 !text-[12px]`} aria-label="Mã vận đơn lô" />
                      <button type="submit" className={`${btnSecondary} !px-2 !py-1 !text-[12px]`} title="Lưu mã cho lô và mọi đơn trong lô">
                        <Fa name="check" />
                      </button>
                    </form>
                  </td>
                  <td className="border-b border-[#f3f4f6] px-2 py-2 whitespace-nowrap text-[12px] text-lien-muted">{formatDateTime(b.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-3 text-[13px] text-lien-muted">Chưa có lô nào.</p>
      )}
    </Card>
    </div>
  );
}
