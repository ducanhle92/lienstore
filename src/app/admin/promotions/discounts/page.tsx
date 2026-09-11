import Image from "next/image";
import Link from "next/link";
import { clearSaleAction, setSaleAction } from "@/app/admin/promotions/actions";
import { adminInput, adminLabel, btnDanger, btnPrimary, btnSecondary, Card, Flash, PageHeader, tableClass, tdClass, thClass } from "@/components/sites/lienstore/admin/ui";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { requireAdmin } from "@/lib/auth";
import { getAllProducts } from "@/lib/db";
import { formatAmount, formatPrice } from "@/lib/format";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** Sales › Giảm giá sản phẩm: products currently on sale + a form to put one on sale (price or %). */
export default async function AdminDiscounts({ searchParams }: Props) {
  await requireAdmin("promotions");
  const sp = await searchParams;
  const products = await getAllProducts(true);
  const onSale = products.filter((p) => p.regularPrice !== null && p.regularPrice > p.price).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const pct = (p: (typeof onSale)[number]) => (p.regularPrice ? Math.round(100 - (p.price / p.regularPrice) * 100) : 0);
  // ?edit=<id> pre-fills the form with that product's current prices
  const editId = Number.parseInt(first(sp.edit), 10);
  const editing = Number.isInteger(editId) ? products.find((p) => p.id === editId) : undefined;

  return (
    <>
      <PageHeader title="Giảm giá sản phẩm" subtitle={`${onSale.length} sản phẩm đang giảm giá · giá gạch = giá gốc, giá bán = giá khuyến mãi`} />
      {first(sp.saved) ? <Flash>{first(sp.saved)}</Flash> : null}
      {first(sp.error) ? <Flash kind="error">{first(sp.error)}</Flash> : null}

      <Card title={editing ? `Sửa giảm giá: ${editing.name}` : "Thêm / sửa giảm giá"} className="mb-6" actions={editing ? <Link href="/admin/promotions/discounts/" className="text-[13px] text-lien-muted hover:text-lien-blue">Huỷ sửa</Link> : undefined}>
        <form id="sale-form" action={setSaleAction} className="grid gap-3 md:grid-cols-[1fr_150px_150px_110px_auto] md:items-end">
          <div>
            <label className={adminLabel}>Sản phẩm *</label>
            <select name="productId" required className={adminInput} defaultValue={editing ? String(editing.id) : ""} key={editing?.id ?? "new"}>
              <option value="" disabled>
                — Chọn sản phẩm —
              </option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  #{p.id} · {p.name} — {formatPrice(p.regularPrice ?? p.price)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={adminLabel}>Giá gốc (đ)</label>
            <input name="regularPrice" inputMode="numeric" placeholder="giữ giá hiện tại" defaultValue={editing?.regularPrice ? formatAmount(editing.regularPrice) : ""} key={`r-${editing?.id ?? "new"}`} className={adminInput} />
          </div>
          <div>
            <label className={adminLabel}>Giá khuyến mãi (đ)</label>
            <input name="price" inputMode="numeric" placeholder="VD 199.000" defaultValue={editing ? formatAmount(editing.price) : ""} key={`p-${editing?.id ?? "new"}`} className={adminInput} />
          </div>
          <div>
            <label className={adminLabel}>hoặc giảm %</label>
            <input name="percent" inputMode="numeric" placeholder="VD 20" className={adminInput} />
          </div>
          <button type="submit" className={btnPrimary}>
            <Fa name="tag" /> {editing ? "Lưu giảm giá" : "Áp dụng"}
          </button>
        </form>
        <p className="mt-2 text-[12px] text-lien-muted">Để trống giá gốc thì lấy giá đang bán làm giá gốc. Nhập giá khuyến mãi hoặc % giảm (một trong hai). Sửa chi tiết hơn trong Kho hàng › Sản phẩm.</p>
      </Card>

      <Card title="Đang giảm giá">
        <div className="overflow-x-auto">
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>Sản phẩm</th>
                <th className={`${thClass} text-right`}>Giá gốc</th>
                <th className={`${thClass} text-right`}>Giá KM</th>
                <th className={`${thClass} text-right`}>Giảm</th>
                <th className={thClass}>Tồn</th>
                <th className={thClass} />
              </tr>
            </thead>
            <tbody>
              {onSale.map((p) => (
                <tr key={p.id}>
                  <td className={tdClass}>
                    <div className="flex items-center gap-3">
                      <Image src={p.thumb} alt="" width={40} height={40} unoptimized className="h-10 w-10 rounded object-cover" />
                      <div>
                        <Link href={`/admin/products/${p.id}/`} className="font-semibold text-lien-heading hover:text-lien-blue">
                          {p.name}
                        </Link>
                        <div className="text-[12px] text-lien-muted">
                          #{p.id} · {p.status === "draft" ? "bản nháp" : "đang bán"}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className={`${tdClass} text-right text-lien-muted line-through`}>{formatPrice(p.regularPrice ?? 0)}</td>
                  <td className={`${tdClass} text-right font-semibold text-lien-sale-text`}>{formatPrice(p.price)}</td>
                  <td className={`${tdClass} text-right`}>
                    <span className="rounded bg-lien-sale px-1.5 py-0.5 text-[11px] font-bold text-white">-{pct(p)}%</span>
                  </td>
                  <td className={tdClass}>{p.stock === null ? "—" : p.stock}</td>
                  <td className={`${tdClass} text-right whitespace-nowrap`}>
                    <Link href={`/admin/promotions/discounts/?edit=${p.id}#sale-form`} className={`${btnSecondary} mr-1 !px-2.5 !py-1.5 !text-[13px]`} title="Sửa giá khuyến mãi">
                      <Fa name="pencil" /> Sửa
                    </Link>
                    <form action={clearSaleAction} className="inline">
                      <input type="hidden" name="productId" value={p.id} />
                      <button type="submit" className={`${btnDanger} !px-2.5 !py-1.5 !text-[13px]`} title="Bỏ giảm giá">
                        <Fa name="times" /> Bỏ giảm
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
              {onSale.length === 0 ? (
                <tr>
                  <td colSpan={6} className={`${tdClass} text-center text-lien-muted`}>
                    Chưa có sản phẩm nào giảm giá.
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
