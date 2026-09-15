import Image from "next/image";
import Link from "next/link";
import { addFlashSaleProductAction, moveFlashSaleProductAction, removeFlashSaleProductAction, setFlashSaleProductEndsAtAction } from "@/app/admin/promotions/actions";
import { ProductSearchSelect } from "@/components/sites/lienstore/admin/ProductSearchSelect";
import { adminInput, adminLabel, btnDanger, btnPrimary, btnSecondary, Card, Flash, PageHeader, tableClass, tdClass, thClass } from "@/components/sites/lienstore/admin/ui";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { requireAdmin } from "@/lib/auth";
import { getAllProducts, getFlashSaleItems, isFlashSaleItemActive } from "@/lib/db";
import { formatPrice } from "@/lib/format";
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

/** Sales › Flash Sales: hand-picked products, each with its own end time (they run different lengths) — shown on the
 * home page, mixed into the "Giảm giá đặc biệt" carousel, with a countdown chip on the ones still running. */
export default async function AdminFlashSale({ searchParams }: Props) {
  await requireAdmin("promotions");
  const sp = await searchParams;
  const [items, allProducts] = await Promise.all([getFlashSaleItems(true, true), getAllProducts(true)]);
  const runningCount = items.filter((it) => it.product.status === "publish" && isFlashSaleItemActive(it.endsAt)).length;
  const pickable = allProducts.map((p) => ({ id: p.id, name: p.name, sku: p.sku, thumb: p.thumb, costJpy: null, stock: p.stock }));

  return (
    <>
      <PageHeader title="Flash Sales" subtitle={`${runningCount} sản phẩm đang chạy · ${items.length} sản phẩm đã chọn (kể cả đã hết hạn)`} />
      {first(sp.saved) ? <Flash>{first(sp.saved)}</Flash> : null}
      {first(sp.error) ? <Flash kind="error">{first(sp.error)}</Flash> : null}

      <Card title="Thêm sản phẩm" className="mb-6">
        <form action={addFlashSaleProductAction} className="grid gap-3 md:grid-cols-[1fr_220px_auto] md:items-end">
          <div>
            <label className={adminLabel}>Sản phẩm</label>
            <ProductSearchSelect products={pickable} />
          </div>
          <div>
            <label className={adminLabel}>Kết thúc lúc</label>
            <input type="datetime-local" name="endsAt" required className={adminInput} />
          </div>
          <button type="submit" className={btnPrimary}>
            <Fa name="plus" /> Thêm vào Flash Sales
          </button>
        </form>
        <p className="mt-2 text-[12px] text-lien-muted">
          Mỗi sản phẩm có giờ kết thúc riêng — thêm lại một sản phẩm đã có sẽ cập nhật giờ kết thúc mới cho sản phẩm đó. Trang chủ trộn Flash Sales vào chung khối &ldquo;Giảm giá đặc biệt&rdquo;; sản phẩm còn chạy có thêm nhãn đếm ngược. Giá hiển thị là giá đang bán (đặt giảm giá ở Sales › Giảm giá sản phẩm nếu cần) — Flash Sales không có giá riêng.
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
                <th className={thClass}>Kết thúc lúc</th>
                <th className={thClass}>Trạng thái</th>
                <th className={thClass} />
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => {
                const p = it.product;
                const running = p.status === "publish" && isFlashSaleItemActive(it.endsAt);
                const fid = `fs-time-${p.id}`;
                return (
                  <tr key={p.id}>
                    <td className={`${tdClass} w-14`}>
                      <Image src={p.thumb} alt="" width={40} height={40} unoptimized className="h-10 w-10 rounded object-cover" />
                    </td>
                    <td className={tdClass}>
                      <Link href={`/admin/products/${p.id}/`} className="font-semibold text-lien-heading hover:text-lien-blue">
                        {p.name}
                      </Link>
                      <div className="text-[12px] text-lien-muted">#{p.id}</div>
                    </td>
                    <td className={`${tdClass} text-right text-lien-muted`}>{p.regularPrice && p.regularPrice > p.price ? <span className="line-through">{formatPrice(p.regularPrice)}</span> : "—"}</td>
                    <td className={`${tdClass} text-right font-semibold text-lien-sale-text`}>{formatPrice(p.price)}</td>
                    <td className={tdClass}>
                      <form id={fid} action={setFlashSaleProductEndsAtAction} className="flex items-center gap-1">
                        <input type="hidden" name="productId" value={p.id} />
                        <input type="datetime-local" name="endsAt" defaultValue={toLocalInputValue(it.endsAt)} className={cn(adminInput, "!mb-0 !w-auto !py-1 !text-[13px]")} aria-label={`Giờ kết thúc ${p.name}`} />
                        <button type="submit" className={cn(btnSecondary, "!px-2 !py-1")} title="Lưu giờ kết thúc">
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
                        <button type="submit" className={`${btnDanger} !px-2.5 !py-1.5 !text-[13px]`} title="Bỏ khỏi Flash Sales">
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
