import Link from "next/link";
import { deleteProductAction, generateSkusAction, importProductsCsvAction } from "@/app/admin/products/actions";
import { FilePicker } from "@/components/sites/lienstore/admin/FilePicker";
import { ConfirmSubmit } from "@/components/sites/lienstore/admin/ConfirmSubmit";
import { ResizableTable } from "@/components/sites/lienstore/admin/ResizableTable";
import { filterProducts } from "@/lib/product-filter";
import { adminInput, btnPrimary, btnSecondary, Card, Flash, PageHeader, ProductStatusBadge, tableClass, tdClass, thClass } from "@/components/sites/lienstore/admin/ui";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { ConfidenceBadge } from "@/components/sites/lienstore/admin/ConfidenceBadge";
import { requireAdmin } from "@/lib/auth";
import { getAllProducts, getCategories, getImportQuoteConfig, getJpyRate, getPricingConfig } from "@/lib/db";
import { suggestPrice } from "@/lib/pricing";
import { formatDate, formatPrice } from "@/lib/format";

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

  const [all, categories, pricing, quote, rate] = await Promise.all([getAllProducts(true), getCategories(), getPricingConfig(), getImportQuoteConfig(), getJpyRate()]);
  // price formula per product: import legs shared per gram (same numbers as the CSV export and Công thức giá)
  const breakdown = (p: (typeof all)[number]) => suggestPrice({ costPrice: p.costPrice, weightG: p.weightG, dimsCm: p.dimsCm, dimsConfidence: p.dimsConfidence, marginPct: p.marginPct }, quote, pricing);
  const legFee = (bd: ReturnType<typeof suggestPrice>, leg: "jp_domestic" | "jp_vn" | "vn_transfer") => (bd ? (bd.legs.find((l) => l.leg === leg)?.fee ?? 0) : null);
  const money = (v: number | null | undefined) => (v === null || v === undefined ? <span className="text-lien-muted">—</span> : formatPrice(v));
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
            <a href={`/admin/products/export/${csvQs ? `?${csvQs}` : ""}`} className={btnSecondary} title="Mọi trường của sản phẩm (giá bán, giá vốn ¥ / VNĐ, tỉ giá, link…) cho các dòng đang lọc — sửa trong Excel rồi nhập lại">
              <Fa name="download" /> Xuất CSV ({items.length})
            </a>
            <form action={importProductsCsvAction} className="flex items-center gap-2 rounded-md border border-dashed border-[#d1d5db] bg-white px-2 py-1">
              <FilePicker name="csv" accept=".csv,text/csv" label="Chọn CSV" className="!gap-1 [&_span]:hidden" />
              <button type="submit" className={btnSecondary} title="Cập nhật sản phẩm theo cột ID từ file CSV đã xuất ở đây">
                <Fa name="upload" /> Nhập CSV
              </button>
            </form>
            <Link href="/admin/products/new/" className={btnPrimary}>
              + Thêm sản phẩm
            </Link>
          </>
        }
      />
      {first(sp.error) ? <Flash kind="error">{first(sp.error)}</Flash> : null}
      {saved.startsWith("csv:") ? (
        (() => {
          const [, up, same, nerr, ...rest] = saved.split(":");
          const detail = rest.join(":");
          return (
            <Flash kind={Number(nerr) ? "warning" : "success"}>
              Nhập CSV: cập nhật <strong>{up}</strong> sản phẩm, {same} không đổi{Number(nerr) ? `, ${nerr} dòng lỗi` : ""}.{detail ? <span className="mt-1 block text-[12px]">{detail}</span> : null}
            </Flash>
          );
        })()
      ) : saved.startsWith("sku:") ? (
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

        <ResizableTable id="products">
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>ID</th>
                <th className={thClass}>SKU</th>
                <th className={thClass}>Tên</th>
                <th className={thClass}>Danh mục</th>
                <th className={thClass} title="Giá khách đang thấy trên web">Giá bán VN</th>
                <th className={thClass}>Giá vốn (¥)</th>
                <th className={`${thClass} whitespace-nowrap`} title="Giá vốn (VNĐ) = giá vốn (¥) × tỉ giá này">Tỉ giá JPY/VND</th>
                <th className={thClass}>Giá vốn (VNĐ)</th>
                <th className={thClass} title="Chia theo gram sản phẩm trong lô gom, luồng mặc định">Ship nội địa Nhật</th>
                <th className={thClass}>Ship Nhật → VN</th>
                <th className={thClass}>Ship kho ĐVVC → kho shop</th>
                <th className={thClass}>Tổng phí về kho VN</th>
                <th className={thClass} title="Giá vốn (VNĐ) + tổng phí vận chuyển về kho VN">Giá vốn khi về tới VN</th>
                <th className={thClass} title="Mặc định của Công thức giá, hoặc lãi riêng đặt trong trang sản phẩm">Lãi %</th>
                <th className={thClass} title="Giá vốn về VN × (1 + lãi %), làm tròn lên — giá khách sẽ thấy nếu Áp dụng công thức">Giá bán trên website</th>
                <th className={thClass} title="Giá bán trên website − giá vốn về tới VN">Lợi nhuận</th>
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
                  <td colSpan={21} className={`${tdClass} text-center text-lien-muted`}>
                    Không có sản phẩm phù hợp.
                  </td>
                </tr>
              ) : null}
              {items.map((p) => (
                <tr key={p.id} className="hover:bg-[#fafafa]">
                  <td className={`${tdClass} whitespace-nowrap font-mono text-[13px] text-lien-muted`}>#{p.id}</td>
                  <td className={`${tdClass} whitespace-nowrap font-mono text-[12px]`}>{p.sku ? p.sku : <span className="text-lien-muted">—</span>}</td>
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
                  <td className={`${tdClass} whitespace-nowrap font-mono text-[13px]`} title={p.costUrl || undefined}>{p.costJpy === null ? <span className="text-lien-muted">—</span> : <>¥{p.costJpy.toLocaleString("ja-JP")}<span className="ml-1 text-[10px] text-lien-muted">{p.costSource}</span></>}</td>
                  <td className={`${tdClass} whitespace-nowrap text-lien-muted`}>{p.costJpy === null ? "—" : rate}</td>
                  <td className={`${tdClass} whitespace-nowrap text-lien-muted`}>{p.costPrice === null ? "—" : formatPrice(p.costPrice, p.currency)}</td>
                  {(() => {
                    const bd = breakdown(p);
                    const shelf = bd?.suggested ?? null;
                    const diff = shelf !== null && p.price > 0 ? shelf - p.price : null;
                    return (
                      <>
                        <td className={`${tdClass} whitespace-nowrap text-lien-muted`}>{money(legFee(bd, "jp_domestic"))}</td>
                        <td className={`${tdClass} whitespace-nowrap text-lien-muted`}>{money(legFee(bd, "jp_vn"))}</td>
                        <td className={`${tdClass} whitespace-nowrap text-lien-muted`}>{money(legFee(bd, "vn_transfer"))}</td>
                        <td className={`${tdClass} whitespace-nowrap`}>{money(bd?.shipping)}</td>
                        <td className={`${tdClass} whitespace-nowrap font-semibold`}>{money(bd?.landed)}</td>
                        <td className={`${tdClass} whitespace-nowrap`}>
                          {bd ? (
                            <>
                              {bd.marginPct}%{p.marginPct !== null ? <span className="ml-1 rounded bg-lien-blue-soft px-1 text-[10px] text-lien-blue">riêng</span> : null}
                            </>
                          ) : (
                            <span className="text-lien-muted">—</span>
                          )}
                        </td>
                        <td className={`${tdClass} whitespace-nowrap font-semibold`} title={diff === null ? undefined : diff === 0 ? "Bằng giá bán VN hiện tại" : `${diff > 0 ? "+" : "−"}${formatPrice(Math.abs(diff))} so với giá bán VN hiện tại`}>
                          {shelf === null ? <span className="text-lien-muted">—</span> : <span className={diff === null || diff === 0 ? "text-lien-heading" : diff > 0 ? "text-red-700" : "text-green-700"}>{formatPrice(shelf)}</span>}
                        </td>
                        <td className={`${tdClass} whitespace-nowrap`}>
                          {bd ? (
                            <span className="text-green-700">
                              {formatPrice(bd.margin)}
                              <span className="ml-1 text-[12px] text-lien-muted">({Math.round((bd.margin / bd.suggested) * 1000) / 10}% giá bán)</span>
                            </span>
                          ) : (
                            <span className="text-lien-muted">—</span>
                          )}
                        </td>
                      </>
                    );
                  })()}
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
