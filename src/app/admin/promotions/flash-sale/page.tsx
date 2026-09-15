import Image from "next/image";
import Link from "next/link";
import { addFlashSaleProductAction, moveFlashSaleProductAction, removeFlashSaleProductAction, saveFlashSaleCampaignAction } from "@/app/admin/promotions/actions";
import { adminInput, adminLabel, btnDanger, btnPrimary, btnSecondary, Card, Flash, PageHeader, tableClass, tdClass, thClass } from "@/components/sites/lienstore/admin/ui";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { requireAdmin } from "@/lib/auth";
import { getAllProducts, getFlashSaleEndsAt, getFlashSaleProducts, isFlashSaleActive } from "@/lib/db";
import { formatPrice } from "@/lib/format";

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

/** Sales › Flash Sales: one timed campaign — end time + a hand-picked, ordered product list, shown on the home page
 * with a countdown between "Ưu đãi độc quyền website" and "Giảm giá đặc biệt" while the campaign is running. */
export default async function AdminFlashSale({ searchParams }: Props) {
  await requireAdmin("promotions");
  const sp = await searchParams;
  const [endsAt, picked, allProducts] = await Promise.all([getFlashSaleEndsAt(), getFlashSaleProducts(true), getAllProducts(true)]);
  const active = isFlashSaleActive(endsAt);
  const pickedIds = new Set(picked.map((p) => p.id));
  const pickable = allProducts.filter((p) => !pickedIds.has(p.id));

  return (
    <>
      <PageHeader title="Flash Sales" subtitle={active ? `Đang chạy · kết thúc ${new Date(endsAt!).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })} · ${picked.length} sản phẩm` : `Đang tắt · ${picked.length} sản phẩm đã chọn`} />
      {first(sp.saved) ? <Flash>{first(sp.saved)}</Flash> : null}
      {first(sp.error) ? <Flash kind="error">{first(sp.error)}</Flash> : null}

      <Card title="Thời gian chạy" className="mb-6">
        <div className="grid gap-3 md:grid-cols-[260px_auto_auto] md:items-end">
          <form id="flash-sale-time" action={saveFlashSaleCampaignAction} className="contents">
            <div>
              <label className={adminLabel}>Kết thúc lúc</label>
              <input type="datetime-local" name="endsAt" defaultValue={endsAt ? toLocalInputValue(endsAt) : ""} className={adminInput} />
            </div>
            <button type="submit" className={btnPrimary}>
              <Fa name="clock-o" /> Lưu
            </button>
          </form>
          {endsAt ? (
            <form action={saveFlashSaleCampaignAction}>
              <input type="hidden" name="endsAt" value="" />
              <button type="submit" className={btnSecondary} title="Tắt Flash Sales ngay">
                <Fa name="times" /> Tắt ngay
              </button>
            </form>
          ) : null}
        </div>
        <p className="mt-2 text-[12px] text-lien-muted">
          Trang chủ chỉ hiện khối Flash Sales khi còn thời gian <em>và</em> có ít nhất 1 sản phẩm ở dưới. Giá hiển thị là giá đang bán của sản phẩm (đặt giảm giá ở Sales › Giảm giá sản phẩm nếu cần) — Flash Sales không có giá riêng.
        </p>
      </Card>

      <Card title="Thêm sản phẩm" className="mb-6">
        <form action={addFlashSaleProductAction} className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <label className={adminLabel}>Sản phẩm</label>
            <select name="productId" required className={adminInput} defaultValue="">
              <option value="" disabled>
                — Chọn sản phẩm —
              </option>
              {pickable.map((p) => (
                <option key={p.id} value={p.id}>
                  #{p.id} · {p.name} — {formatPrice(p.price)}
                  {p.status === "draft" ? " (bản nháp)" : ""}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className={btnPrimary}>
            <Fa name="plus" /> Thêm vào Flash Sales
          </button>
        </form>
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
                <th className={thClass}>Trạng thái</th>
                <th className={thClass} />
              </tr>
            </thead>
            <tbody>
              {picked.map((p, i) => (
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
                  <td className={tdClass}>{p.status === "draft" ? <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[11px] font-semibold text-gray-700">bản nháp — ẩn khỏi trang chủ</span> : <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-800">đang bán</span>}</td>
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
                      <button type="submit" disabled={i === picked.length - 1} className={`${btnSecondary} mr-1 !px-2 !py-1.5 !text-[13px] disabled:opacity-30`} title="Xuống">
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
              ))}
              {picked.length === 0 ? (
                <tr>
                  <td colSpan={6} className={`${tdClass} text-center text-lien-muted`}>
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
