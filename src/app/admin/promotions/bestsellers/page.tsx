import Image from "next/image";
import Link from "next/link";
import { saveHotBadgeAction, setProductHotAction } from "@/app/admin/promotions/actions";
import { InfoPopover } from "@/components/sites/lienstore/admin/InfoPopover";
import { type PickableProduct, ProductSearchSelect } from "@/components/sites/lienstore/admin/ProductSearchSelect";
import { adminLabel, btnPrimary, btnSecondary, Card, Flash, PageHeader, tableClass, tdClass, thClass } from "@/components/sites/lienstore/admin/ui";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { requireAdmin } from "@/lib/auth";
import { getAllProducts, getUnitsSold } from "@/lib/db";
import { formatAmount } from "@/lib/format";
import { DEFAULT_HOT_BADGE, hotBadgeUrl } from "@/lib/hot-badge";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** Sales › Sản phẩm bán chạy: which products carry the Hot mark (home shelf + badge) and the badge picture itself. */
export default async function BestSellersAdmin({ searchParams }: Props) {
  await requireAdmin("promotions");
  const sp = await searchParams;
  const products = await getAllProducts(true);
  const sold = getUnitsSold();
  const hot = products.filter((p) => p.hot).sort((a, b) => (sold.get(b.id) ?? 0) - (sold.get(a.id) ?? 0) || a.name.localeCompare(b.name));
  const pickable: PickableProduct[] = products.filter((p) => !p.hot).map((p) => ({ id: p.id, name: p.name, sku: p.sku, thumb: p.thumb, costJpy: null, stock: p.stock }));
  const badge = hotBadgeUrl();
  const isDefault = badge === DEFAULT_HOT_BADGE;

  return (
    <>
      <PageHeader title="Sản phẩm bán chạy" subtitle={`${hot.length} sản phẩm đang đánh dấu Hot · hiện trong dải “Bán chạy nhất” ở trang chủ, nhãn Hot đỏ trên thẻ và nhãn Best seller trên trang sản phẩm`} />
      {first(sp.saved) ? <Flash>{first(sp.saved)}</Flash> : null}
      {first(sp.error) ? <Flash kind="error">{first(sp.error)}</Flash> : null}

      <div className="mb-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card title="Đánh dấu Hot cho sản phẩm">
          <form action={setProductHotAction} className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end" data-testid="hot-add-form">
            <input type="hidden" name="hot" value="1" />
            <div>
              <label className={adminLabel}>
                Sản phẩm
                <InfoPopover>Tích “Sản phẩm Hot” trong chi tiết sản phẩm cũng được. Sản phẩm Hot đứng đầu dải “Bán chạy nhất” trên trang chủ (thiếu thì bù bằng sản phẩm đánh giá cao), có nhãn Hot đỏ trên thẻ và nhãn Best seller ở góc trái ảnh trang sản phẩm.</InfoPopover>
              </label>
              <ProductSearchSelect products={pickable} placeholder="Gõ tên, SKU hoặc #id sản phẩm…" />
            </div>
            <button type="submit" className={btnPrimary}>
              <Fa name="fire" /> Đánh dấu Hot
            </button>
          </form>
        </Card>
        <Card title="Nhãn Best seller trên trang sản phẩm">
          <div className="mb-3 flex items-center justify-center rounded-md border border-dashed border-[#d1d5db] bg-[#f9fafb] p-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- owner-uploaded picture, any size */}
            <img src={badge} alt="Nhãn Best seller hiện tại" className="max-h-[120px] w-auto max-w-full" data-testid="hot-badge-preview" />
          </div>
          <form action={saveHotBadgeAction} encType="multipart/form-data" className="grid gap-2">
            <label className={adminLabel} htmlFor="badge-file">
              Tải nhãn khác <span className="font-normal text-lien-muted">(PNG nền trong suốt, ngang khoảng 600×300)</span>
            </label>
            <input id="badge-file" name="file" type="file" accept="image/png,image/webp,image/svg+xml,image/jpeg" className="text-[13px]" />
            <div className="flex flex-wrap gap-2">
              <button type="submit" className={btnPrimary}>
                <Fa name="upload" /> Lưu nhãn
              </button>
              {!isDefault ? (
                <button type="submit" name="reset" value="1" className={btnSecondary}>
                  Dùng lại nhãn mặc định
                </button>
              ) : null}
            </div>
            <p className="m-0 text-[12px] leading-5 text-lien-muted">Nhãn nằm ở góc trên bên trái ảnh sản phẩm, rộng khoảng một phần tư khung ảnh. {isDefault ? "Đang dùng nhãn mặc định của web." : "Đang dùng nhãn bạn tải lên."}</p>
          </form>
        </Card>
      </div>

      <Card title={`Đang đánh dấu Hot (${hot.length})`}>
        {hot.length === 0 ? (
          <p className="m-0 text-[14px] text-lien-muted">Chưa có sản phẩm nào. Chọn sản phẩm ở khung trên hoặc tích “Sản phẩm Hot” trong chi tiết sản phẩm.</p>
        ) : (
          <table className={tableClass} data-testid="hot-list">
            <thead>
              <tr>
                <th className={thClass}>Sản phẩm</th>
                <th className={`${thClass} text-right`}>Giá</th>
                <th className={`${thClass} text-right`}>Đã bán</th>
                <th className={thClass}>Trạng thái</th>
                <th className={thClass} />
              </tr>
            </thead>
            <tbody>
              {hot.map((p) => (
                <tr key={p.id}>
                  <td className={tdClass}>
                    <div className="flex items-center gap-3">
                      <Image src={p.thumb} alt="" width={40} height={40} unoptimized className="h-10 w-10 rounded object-cover" />
                      <div>
                        <Link href={`/admin/products/${p.id}/`} className="font-semibold text-lien-heading hover:text-lien-blue">
                          {p.name}
                        </Link>
                        <div className="text-[12px] text-lien-muted">#{p.id}{p.sku ? ` · ${p.sku}` : ""}</div>
                      </div>
                    </div>
                  </td>
                  <td className={`${tdClass} text-right`}>{p.price > 0 ? `${formatAmount(p.price)}đ` : "Liên hệ"}</td>
                  <td className={`${tdClass} text-right`}>{sold.get(p.id) ?? 0}</td>
                  <td className={tdClass}>{p.status === "publish" ? "Đang bán" : "Bản nháp"}</td>
                  <td className={`${tdClass} text-right`}>
                    <form action={setProductHotAction} className="inline">
                      <input type="hidden" name="productId" value={p.id} />
                      <input type="hidden" name="hot" value="0" />
                      <button type="submit" className={`${btnSecondary} !px-2.5 !py-1.5 !text-[13px]`}>
                        Bỏ Hot
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
