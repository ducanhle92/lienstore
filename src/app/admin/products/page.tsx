import Image from "next/image";
import Link from "next/link";
import { deleteProductAction, generateSkusAction } from "@/app/admin/products/actions";
import { ConfirmSubmit } from "@/components/sites/lienstore/admin/ConfirmSubmit";
import { ResizableTable } from "@/components/sites/lienstore/admin/ResizableTable";
import { filterProducts } from "@/lib/product-filter";
import { adminInput, btnPrimary, btnSecondary, Card, Flash, PageHeader, ProductStatusBadge, tableClass, tdClass, thClass } from "@/components/sites/lienstore/admin/ui";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { ConfidenceBadge } from "@/components/sites/lienstore/admin/ConfidenceBadge";
import { requireAdmin } from "@/lib/auth";
import { getAllProducts, getCategories, getPricingConfig } from "@/lib/db";
import { formatDate, formatPrice } from "@/lib/format";

/** Profit per unit and margin % when both prices are known. */
function profitOf(p: { price: number; costPrice: number | null }): { amount: number; pct: number } | null {
  if (p.costPrice === null || p.price <= 0) return null;
  const amount = p.price - p.costPrice;
  return { amount, pct: Math.round((amount / p.price) * 1000) / 10 };
}

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function AdminProducts({ searchParams }: Props) {
  await requireAdmin("products");
  const sp = await searchParams;
  const status = first(sp.status);
  const category = first(sp.category);
  const stock = first(sp.stock);
  const saved = first(sp.saved);
  const deleted = first(sp.deleted);

  const [all, categories, pricing] = await Promise.all([getAllProducts(true), getCategories(), getPricingConfig()]);
  const jpPrice = (cost: number | null) => (cost === null ? null : Math.round((cost * (1 + pricing.marginPct / 100)) / 1000) * 1000);
  const catName = Object.fromEntries(categories.map((c) => [c.slug, c.name]));
  const items = filterProducts(all, sp);
  const fulfillment = first(sp.fulfillment);
  const csvQs = new URLSearchParams(Object.entries({ q: first(sp.q), status, category, stock, fulfillment }).filter(([, v]) => v)).toString();
  const withCost = items.filter((p) => p.costPrice !== null);
  const stockValue = withCost.reduce((s, p) => s + (p.stock ?? 0) * (p.costPrice ?? 0), 0);
  const stockProfit = withCost.reduce((s, p) => s + (p.stock ?? 0) * (p.price - (p.costPrice ?? 0)), 0);
  const missingPrice = items.filter((p) => p.price <= 0).length;

  return (
    <>
      <PageHeader
        title="Sản phẩm"
        subtitle={`${items.length} / ${all.length} sản phẩm · ${withCost.length} có giá vốn · vốn tồn kho ${formatPrice(stockValue)} · lợi nhuận tồn kho ${formatPrice(stockProfit)}${missingPrice ? ` · ${missingPrice} chưa có giá bán` : ""}`}
        actions={
          <>
            {all.filter((p) => !p.sku).length ? (
              <form action={generateSkusAction}>
                <button type="submit" className={btnSecondary} title="SKU = THƯƠNG-HIỆU – DANH-MỤC – THÁNG NHẬP (YYMM) – MÃ SP. VD: LION-TM-2609-0173">
                  <Fa name="tags" /> Tạo SKU cho {all.filter((p) => !p.sku).length} sp chưa có
                </button>
              </form>
            ) : null}
            <a href={`/admin/products/export/${csvQs ? `?${csvQs}` : ""}`} className={btnSecondary} title="Đúng các dòng đang lọc — để in / kiểm kho">
              <Fa name="download" /> Xuất CSV ({items.length})
            </a>
            <Link href="/admin/products/new/" className={btnPrimary}>
              + Thêm sản phẩm
            </Link>
          </>
        }
      />
      {saved.startsWith("sku:") ? (
        <Flash>
          Đã tạo SKU cho {saved.slice(4)} sản phẩm theo quy ước <code>THƯƠNG HIỆU-DANH MỤC-YYMM-MÃ SP</code> (VD: LION-TM-2609-0173 = Lion · Trị mụn · nhập 09/2026 · sản phẩm #173). Sửa từng mã trong trang sản phẩm nếu cần.
        </Flash>
      ) : saved ? (
        <Flash>Đã lưu sản phẩm #{saved}.</Flash>
      ) : null}
      {deleted ? <Flash>Đã xoá sản phẩm.</Flash> : null}

      <Card>
        <form method="get" className="mb-5 grid gap-3 md:grid-cols-[1fr_200px_140px_130px_130px_auto]">
          <input name="q" defaultValue={first(sp.q)} placeholder="Tìm theo tên, slug, SKU…" className={adminInput} />
          <select name="category" defaultValue={category} className={adminInput}>
            <option value="">Tất cả danh mục</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
          <select name="status" defaultValue={status} className={adminInput}>
            <option value="">Mọi trạng thái</option>
            <option value="publish">Đang bán</option>
            <option value="draft">Bản nháp</option>
          </select>
          <select name="stock" defaultValue={stock} className={adminInput}>
            <option value="">Mọi tồn kho</option>
            <option value="in">Còn hàng</option>
            <option value="out">Hết hàng</option>
          </select>
          <select name="fulfillment" defaultValue={fulfillment} className={adminInput}>
            <option value="">Mọi hình thức</option>
            <option value="stock">Lưu kho</option>
            <option value="order">Order</option>
          </select>
          <button type="submit" className={btnPrimary}>
            Lọc
          </button>
        </form>

        <p className="mb-2 text-[12px] text-lien-muted">Kéo mép cột để đổi độ rộng (nhấp đôi để đặt lại) · bảng cuộn ngang khi hẹp.</p>
        <ResizableTable id="products">
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>ID</th>
                <th className={thClass}>SKU</th>
                <th className={thClass} />
                <th className={thClass}>Tên</th>
                <th className={thClass}>Danh mục</th>
                <th className={thClass} title="Giá khách thấy — đã gồm phí vận chuyển 3 chặng về kho shop">Giá bán VN</th>
                <th className={thClass} title={`Giá vốn + ${pricing.marginPct}% lợi nhuận, chưa gồm vận chuyển`}>Giá bán NB</th>
                <th className={thClass}>Giá vốn (VNĐ)</th>
                <th className={thClass}>Giá vốn (¥)</th>
                <th className={thClass}>Lợi nhuận</th>
                <th className={thClass}>Hình thức · tồn</th>
                <th className={thClass}>Cân / KT</th>
                <th className={thClass}>Trạng thái</th>
                <th className={thClass}>Cập nhật</th>
                <th className={thClass} />
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={15} className={`${tdClass} text-center text-lien-muted`}>
                    Không có sản phẩm phù hợp.
                  </td>
                </tr>
              ) : null}
              {items.map((p) => (
                <tr key={p.id} className="hover:bg-[#fafafa]">
                  <td className={`${tdClass} whitespace-nowrap font-mono text-[13px] text-lien-muted`}>#{p.id}</td>
                  <td className={`${tdClass} whitespace-nowrap font-mono text-[12px]`}>{p.sku ? p.sku : <span className="text-lien-muted">—</span>}</td>
                  <td className={`${tdClass} w-16`}>
                    {p.thumb ? <Image src={p.thumb} alt="" width={48} height={48} className="h-12 w-12 rounded border border-[#e5e7eb] object-cover" unoptimized /> : null}
                  </td>
                  <td className={`${tdClass} min-w-[220px]`}>
                    <Link href={`/admin/products/${p.id}/`} className="font-semibold text-lien-heading hover:text-lien-blue">
                      {p.name}
                    </Link>
                    <div className="text-[12px] text-lien-muted">{p.slug}</div>
                  </td>
                  <td className={`${tdClass} max-w-[220px] text-[13px]`}>{p.categories.map((c) => catName[c] ?? c).join(", ")}</td>
                  <td className={`${tdClass} whitespace-nowrap`}>
                    {p.price > 0 ? formatPrice(p.price, p.currency) : <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[12px] text-amber-800">chưa có giá</span>}
                  </td>
                  <td className={`${tdClass} whitespace-nowrap text-lien-muted`}>{jpPrice(p.costPrice) === null ? "—" : formatPrice(jpPrice(p.costPrice) as number, p.currency)}</td>
                  <td className={`${tdClass} whitespace-nowrap text-lien-muted`}>{p.costPrice === null ? "—" : formatPrice(p.costPrice, p.currency)}</td>
                  <td className={`${tdClass} whitespace-nowrap font-mono text-[13px]`} title={p.costUrl || undefined}>{p.costJpy === null ? <span className="text-lien-muted">—</span> : <>¥{p.costJpy.toLocaleString("ja-JP")}<span className="ml-1 text-[10px] text-lien-muted">{p.costSource}</span></>}</td>
                  <td className={`${tdClass} whitespace-nowrap`}>
                    {(() => {
                      const pr = profitOf(p);
                      if (!pr) return <span className="text-lien-muted">—</span>;
                      return (
                        <span className={pr.amount >= 0 ? "text-green-700" : "text-red-600"}>
                          {formatPrice(pr.amount, p.currency)}
                          <span className="ml-1 text-[12px] text-lien-muted">({pr.pct}%)</span>
                        </span>
                      );
                    })()}
                  </td>
                  <td className={`${tdClass} whitespace-nowrap`}>
                    <span className={p.fulfillment === "stock" ? "rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-800" : "rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800"}>{p.fulfillment === "stock" ? "Lưu kho" : "Order"}</span>
                    <span className="ml-1.5 text-[13px]">{p.stock === null ? <span className="text-lien-muted">—</span> : p.stock}</span>
                  </td>
                  <td className={`${tdClass} whitespace-nowrap text-[12px]`}>
                    {p.weightG || p.dimsCm ? (
                      <>
                        <span className="block text-lien-text">{p.weightG ? `${p.weightG} g` : "—"}{p.dimsCm ? ` · ${p.dimsCm.replace(/x/g, "×")}` : ""}</span>
                        <ConfidenceBadge value={p.dimsConfidence} />
                      </>
                    ) : (
                      <span className="text-lien-muted">chưa có</span>
                    )}
                  </td>
                  <td className={tdClass}>
                    <ProductStatusBadge status={p.status} outOfStock={p.stockStatus === "outofstock"} />
                  </td>
                  <td className={`${tdClass} whitespace-nowrap text-[13px] text-lien-muted`}>{formatDate(p.updatedAt)}</td>
                  <td className={`${tdClass} whitespace-nowrap text-right`}>
                    <div className="flex items-center justify-end gap-3">
                      <Link href={`/admin/products/${p.id}/`} className="text-lien-blue hover:underline">
                        Sửa
                      </Link>
                      <a href={`/product/${p.slug}/`} target="_blank" rel="noreferrer" className="text-lien-muted hover:underline">
                        Xem
                      </a>
                      <form action={deleteProductAction}>
                        <input type="hidden" name="id" value={p.id} />
                        <ConfirmSubmit message={`Xoá vĩnh viễn “${p.name}”?`} className="text-lien-heart hover:underline">
                          Xoá
                        </ConfirmSubmit>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ResizableTable>
      </Card>
    </>
  );
}
