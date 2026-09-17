import Image from "next/image";
import Link from "next/link";
import { moveFlashSaleProductAction, removeFlashSaleProductAction, saveFlashSaleProductAction } from "@/app/admin/promotions/actions";
import { ProductSearchSelect } from "@/components/sites/lienstore/admin/ProductSearchSelect";
import { adminInput, adminLabel, btnDanger, btnPrimary, btnSecondary, Card, Flash, PageHeader, tableClass, tdClass, thClass } from "@/components/sites/lienstore/admin/ui";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { requireAdmin } from "@/lib/auth";
import { getAllProducts, getFlashSaleItems, isFlashSaleItemActive, isFlashSaleTimeUnset } from "@/lib/db";
import { formatAmount, formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** ISO → value for <input type="datetime-local"> in Vietnam time (UTC+7), e.g. "2026-09-20T18:30". */
function toLocalInputValue(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 7 * 3600000);
  return d.toISOString().slice(0, 16);
}
/** The pickers open on the current Vietnam time instead of an empty field / the 1970 migration default. */
function nowLocalInputValue(): string {
  return toLocalInputValue(new Date().toISOString());
}

/** Sales › Flash Sales: hand-picked products, each with its own end time and (optionally) its own flash price — shown
 * on the home page, mixed into the "Giảm giá đặc biệt" carousel, with a countdown chip on the ones still running. */
export default async function AdminFlashSale({ searchParams }: Props) {
  await requireAdmin("promotions");
  const sp = await searchParams;
  const [items, allProducts] = await Promise.all([getFlashSaleItems(true, true), getAllProducts(true)]);
  const runningCount = items.filter((it) => it.product.status === "publish" && isFlashSaleItemActive(it.endsAt)).length;
  const pickable = allProducts.map((p) => ({ id: p.id, name: p.name, sku: p.sku, thumb: p.thumb, costJpy: null, stock: p.stock }));
  const now = nowLocalInputValue();
  const pct = (regular: number | null, price: number) => (regular && regular > price ? Math.round(100 - (price / regular) * 100) : 0);

  return (
    <>
      <PageHeader title="Flash Sales" subtitle={`${runningCount} sản phẩm đang chạy · ${items.length} sản phẩm đã chọn (kể cả đã hết hạn)`} />
      {first(sp.saved) ? <Flash>{first(sp.saved)}</Flash> : null}
      {first(sp.error) ? <Flash kind="error">{first(sp.error)}</Flash> : null}

      <Card title="Thêm sản phẩm" className="mb-6">
        <form action={saveFlashSaleProductAction} className="grid gap-3 md:grid-cols-[1fr_210px_140px_100px_auto] md:items-end">
          <div>
            <label className={adminLabel}>Sản phẩm</label>
            <ProductSearchSelect products={pickable} />
          </div>
          <div>
            <label className={adminLabel}>Kết thúc lúc</label>
            <input type="datetime-local" name="endsAt" required defaultValue={now} className={adminInput} />
          </div>
          <div>
            <label className={adminLabel}>Giá flash (đ)</label>
            <input name="salePrice" inputMode="numeric" placeholder="VD 199.000" className={adminInput} />
          </div>
          <div>
            <label className={adminLabel}>hoặc giảm %</label>
            <input name="percent" inputMode="numeric" placeholder="VD 20" className={adminInput} />
          </div>
          <button type="submit" className={btnPrimary}>
            <Fa name="plus" /> Thêm vào Flash Sales
          </button>
        </form>
        <p className="mt-2 text-[12px] text-lien-muted">
          Mỗi sản phẩm có giờ kết thúc và giá flash riêng. Nhập giá flash hoặc % giảm để khách thấy badge -% và giá gạch; giá cũ tự trở lại khi hết giờ hoặc khi bỏ khỏi Flash Sales. Để trống cả hai thì giữ giá đang bán (nếu đã giảm ở Sales › Giảm giá sản phẩm thì vẫn hiện %). Thêm lại sản phẩm đã có = sửa giờ / giá của sản phẩm đó.
        </p>
      </Card>

      <Card title="Sản phẩm trong Flash Sales">
        <div className="overflow-x-auto">
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass} />
                <th className={thClass}>Sản phẩm</th>
                <th className={`${thClass} text-right`}>Giá gốc</th>
                <th className={`${thClass} text-right`}>Giá bán</th>
                <th className={thClass}>Kết thúc lúc · giá flash / % giảm</th>
                <th className={thClass}>Trạng thái</th>
                <th className={thClass} />
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => {
                const p = it.product;
                const running = p.status === "publish" && isFlashSaleItemActive(it.endsAt);
                const off = pct(p.regularPrice, p.price);
                return (
                  <tr key={p.id}>
                    <td className={`${tdClass} w-14`}>
                      <Image src={p.thumb} alt="" width={40} height={40} unoptimized className="h-10 w-10 rounded object-cover" />
                    </td>
                    <td className={tdClass}>
                      <Link href={`/admin/products/${p.id}/`} className="font-semibold text-lien-heading hover:text-lien-blue">
                        {p.name}
                      </Link>
                      <div className="text-[12px] text-lien-muted">
                        #{p.id}
                        {it.salePrice !== null ? " · giá flash đang áp dụng" : ""}
                      </div>
                    </td>
                    <td className={`${tdClass} text-right text-lien-muted`}>{p.regularPrice && p.regularPrice > p.price ? <span className="line-through">{formatPrice(p.regularPrice)}</span> : "—"}</td>
                    <td className={`${tdClass} text-right whitespace-nowrap`}>
                      <span className="font-semibold text-lien-sale-text">{formatPrice(p.price)}</span>
                      {off ? <span className="ml-1 rounded bg-lien-sale px-1.5 py-0.5 text-[11px] font-bold text-white">-{off}%</span> : <span className="ml-1 text-[11px] text-amber-700">chưa có %</span>}
                    </td>
                    <td className={tdClass}>
                      <form action={saveFlashSaleProductAction} className="flex flex-wrap items-center gap-1">
                        <input type="hidden" name="productId" value={p.id} />
                        <input type="datetime-local" name="endsAt" defaultValue={isFlashSaleTimeUnset(it.endsAt) ? now : toLocalInputValue(it.endsAt)} className={cn(adminInput, "!mb-0 !w-auto !py-1 !text-[13px]")} aria-label={`Giờ kết thúc ${p.name}`} />
                        <input name="salePrice" inputMode="numeric" placeholder={it.salePrice !== null ? formatAmount(it.salePrice) : "giá flash"} className={cn(adminInput, "!mb-0 !w-[96px] !py-1 !text-[13px]")} aria-label={`Giá flash ${p.name}`} />
                        <input name="percent" inputMode="numeric" placeholder="%" className={cn(adminInput, "!mb-0 !w-[56px] !py-1 !text-[13px]")} aria-label={`% giảm ${p.name}`} />
                        <button type="submit" className={cn(btnSecondary, "!px-2 !py-1")} title="Lưu giờ kết thúc / giá flash">
                          <Fa name="check-circle" />
                        </button>
                      </form>
                    </td>
                    <td className={tdClass}>
                      {p.status === "draft" ? (
                        <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[11px] font-semibold text-gray-700">bản nháp — ẩn khỏi trang chủ</span>
                      ) : running ? (
                        <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-orange-800">
                          <Fa name="bolt" /> đang chạy
                        </span>
                      ) : isFlashSaleTimeUnset(it.endsAt) ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">chưa đặt giờ</span>
                      ) : (
                        <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[11px] font-semibold text-gray-700">đã hết hạn</span>
                      )}
                    </td>
                    <td className={`${tdClass} text-right whitespace-nowrap`}>
                      <form action={moveFlashSaleProductAction} className="inline">
                        <input type="hidden" name="productId" value={p.id} />
                        <input type="hidden" name="dir" value="up" />
                        <button type="submit" disabled={i === 0} className={`${btnSecondary} mr-1 !px-2 !py-1.5 !text-[13px] disabled:opacity-30`} title="Lên">
                          <Fa name="angle-up" />
                        </button>
                      </form>
                      <form action={moveFlashSaleProductAction} className="inline">
                        <input type="hidden" name="productId" value={p.id} />
                        <input type="hidden" name="dir" value="down" />
                        <button type="submit" disabled={i === items.length - 1} className={`${btnSecondary} mr-1 !px-2 !py-1.5 !text-[13px] disabled:opacity-30`} title="Xuống">
                          <Fa name="angle-down" />
                        </button>
                      </form>
                      <form action={removeFlashSaleProductAction} className="inline">
                        <input type="hidden" name="productId" value={p.id} />
                        <button type="submit" className={`${btnDanger} !px-2.5 !py-1.5 !text-[13px]`} title="Bỏ khỏi Flash Sales (trả lại giá cũ nếu có giá flash)">
                          <Fa name="times" /> Bỏ
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 ? (
                <tr>
                  <td colSpan={7} className={`${tdClass} text-center text-lien-muted`}>
                    Chưa chọn sản phẩm nào.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
