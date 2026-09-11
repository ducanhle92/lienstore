import Link from "next/link";
import { optimizeCostSourcesAction, savePurchaseSourceAction } from "@/app/admin/products/pricing/actions";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { COST_SOURCE_LABEL, COST_SOURCES } from "@/lib/cost-sources";
import { getJpyRate, getPurchaseSourceDefault, purchaseSourceStats } from "@/lib/db";
import { formatAmount } from "@/lib/format";
import { adminInput, adminLabel, btnPrimary, Card } from "./ui";

/** Công thức giá › "Nguồn mua hàng": preferred source + one-click "buy from the cheapest source" for every product. */
export async function PurchaseSourceCard() {
  const [rate, preferred] = await Promise.all([getJpyRate(), getPurchaseSourceDefault()]);
  const stats = await purchaseSourceStats(preferred);
  return (
    <Card className="mb-6" title="Nguồn mua hàng (tham số giá vốn ¥)">
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div>
          <form action={savePurchaseSourceAction} className="grid gap-4 sm:grid-cols-[260px_auto] sm:items-end">
            <div>
              <label className={adminLabel} htmlFor="purchaseSource">
                Nguồn mua mặc định
              </label>
              <select id="purchaseSource" name="source" defaultValue={preferred} className={adminInput}>
                {COST_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {COST_SOURCE_LABEL[s]}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[12px] leading-5 text-lien-muted">Nguồn gợi ý khi nhập giá mới cho sản phẩm và ưu tiên khi hai nguồn bằng giá.</p>
            </div>
            <button type="submit" className={`${btnPrimary} sm:mb-7`}>
              <Fa name="check" /> Lưu
            </button>
          </form>
          <p className="mt-3 text-[13px] leading-6 text-lien-text">
            Mỗi sản phẩm có thể lưu nhiều báo giá ¥ theo nguồn (Amazon, Rakuten, web hãng, Yahoo, Mercari…) trong{" "}
            <Link href="/admin/products/" className="text-lien-blue hover:underline">
              trang sản phẩm
            </Link>
            ; giá được chọn làm <strong>giá vốn</strong> đi vào công thức. Khi có thêm nguồn rẻ hơn, bấm tối ưu để đổi giá vốn của toàn bộ sản phẩm sang nguồn rẻ nhất (giá vốn VNĐ tính lại theo tỉ giá {formatAmount(rate)} đ/¥).
          </p>
        </div>
        <div className="rounded-md border border-lien-blue/30 bg-lien-blue-soft/60 p-4 text-[13px] leading-6 text-lien-text">
          <p className="m-0">
            <strong>{stats.withPrice}</strong> sản phẩm có giá ¥ · <strong>{stats.multi}</strong> có từ 2 nguồn · <strong data-testid="not-cheapest">{stats.notCheapest}</strong> đang dùng nguồn chưa rẻ nhất.
          </p>
          <p className="m-0 mt-1 text-lien-muted">
            Tiết kiệm nếu tối ưu: <strong className="text-lien-heading">{formatAmount(stats.savingsJpy)}¥</strong> ≈ {formatAmount(Math.round(stats.savingsJpy * rate))}đ trên toàn kho.
          </p>
          <form action={optimizeCostSourcesAction} className="mt-3">
            <button type="submit" className={btnPrimary} disabled={stats.notCheapest === 0}>
              <Fa name="refresh" /> Tối ưu giá vốn theo nguồn rẻ nhất
            </button>
          </form>
        </div>
      </div>
    </Card>
  );
}
