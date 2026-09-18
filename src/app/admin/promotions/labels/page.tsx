import Image from "next/image";
import Link from "next/link";
import { assignLabelAction, deleteProductLabelAction, saveProductLabelAction } from "@/app/admin/promotions/actions";
import { ConfirmSubmit } from "@/components/sites/lienstore/admin/ConfirmSubmit";
import { FilePickButton } from "@/components/sites/lienstore/admin/FilePickButton";
import { InfoPopover } from "@/components/sites/lienstore/admin/InfoPopover";
import { type PickableProduct, ProductSearchSelect } from "@/components/sites/lienstore/admin/ProductSearchSelect";
import { adminInput, adminLabel, btnDanger, btnPrimary, btnSecondary, Flash, PageHeader, tableClass, tdClass, thClass } from "@/components/sites/lienstore/admin/ui";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { requireAdmin } from "@/lib/auth";
import { getAllProducts, getProductLabels } from "@/lib/db";
import { formatAmount } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** Sales › Nhãn sản phẩm: the label set (animated tags), and which products carry each label. */
export default async function ProductLabelsAdmin({ searchParams }: Props) {
  await requireAdmin("promotions");
  const sp = await searchParams;
  const [labels, products] = await Promise.all([getProductLabels(), getAllProducts(true)]);
  const openId = Number.parseInt(first(sp.open), 10);
  const pickable: PickableProduct[] = products.map((p) => ({ id: p.id, name: p.name, sku: p.sku, thumb: p.thumb, costJpy: null, stock: p.stock }));
  const byLabel = new Map<number, typeof products>();
  for (const p of products) if (p.labelId) byLabel.set(p.labelId, [...(byLabel.get(p.labelId) ?? []), p]);

  return (
    <>
      <PageHeader title="Nhãn sản phẩm" subtitle={`${labels.length} nhãn · mỗi sản phẩm gắn tối đa một nhãn; nhãn hiện ở góc trên trái ảnh trên thẻ sản phẩm và trang sản phẩm`} />
      {first(sp.saved) ? <Flash>{first(sp.saved)}</Flash> : null}
      {first(sp.error) ? <Flash kind="error">{first(sp.error)}</Flash> : null}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="label-grid">
        {labels.map((l) => {
          const n = byLabel.get(l.id)?.length ?? 0;
          return (
            <Link key={l.id} href={`?open=${l.id}#label-${l.id}`} className={cn("flex items-center gap-3 rounded-lg border bg-white p-3 no-underline shadow-sm transition-colors hover:border-lien-blue", openId === l.id ? "border-lien-blue" : "border-[#e5e7eb]", !l.active && "opacity-60")}>
              {/* eslint-disable-next-line @next/next/no-img-element -- animated GIF must stay animated */}
              <img src={l.image} alt="" className="h-14 w-14 shrink-0 object-contain" />
              <div className="min-w-0">
                <div className="truncate text-[13px] font-bold text-lien-heading">{l.name}</div>
                <div className="text-[12px] text-lien-muted">
                  {n} sản phẩm{l.active ? "" : " · đang ẩn"}
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="space-y-4">
        {labels.map((l) => {
          const items = byLabel.get(l.id) ?? [];
          const open = openId === l.id;
          return (
            <section key={l.id} id={`label-${l.id}`} className="rounded-lg border border-[#e5e7eb] bg-white shadow-sm">
              <div className="flex flex-wrap items-center gap-3 border-b border-[#f0f0f0] px-5 py-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- animated GIF must stay animated */}
                <img src={l.image} alt="" className="h-12 w-12 object-contain" />
                <span className="text-[15px] font-bold text-lien-heading">{l.name}</span>
                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", l.active ? "bg-green-100 text-green-800" : "bg-gray-200 text-gray-700")}>{l.active ? "Đang dùng" : "Đang ẩn"}</span>
                <span className="text-[13px] text-lien-muted">{items.length} sản phẩm</span>
                <Link href={open ? "?" : `?open=${l.id}#label-${l.id}`} className="ml-auto text-[13px] text-lien-blue hover:underline">
                  {open ? "Thu gọn" : "Mở / thêm sản phẩm"}
                </Link>
                <form action={deleteProductLabelAction}>
                  <input type="hidden" name="id" value={l.id} />
                  <ConfirmSubmit title={`Xoá nhãn “${l.name}”?`} message="Nhãn biến mất khỏi mọi sản phẩm đang gắn; sản phẩm không bị xoá." details={[`${items.length} sản phẩm đang gắn nhãn này sẽ trở về không nhãn.`]} confirmLabel="Xoá nhãn" className={`${btnDanger} !px-2.5 !py-1.5 !text-[13px]`}>
                    <Fa name="trash" />
                  </ConfirmSubmit>
                </form>
              </div>
              {open ? (
                <div className="grid gap-5 p-5 lg:grid-cols-[1fr_340px]">
                  <div>
                    <form action={assignLabelAction} className="mb-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-end" data-testid={`assign-${l.id}`}>
                      <input type="hidden" name="labelId" value={l.id} />
                      <div>
                        <label className={adminLabel}>
                          Thêm sản phẩm vào nhãn này
                          <InfoPopover>Mỗi sản phẩm chỉ mang một nhãn: chọn sản phẩm đang có nhãn khác thì nhãn cũ được thay. Có thể chọn nhãn ngay trong chi tiết sản phẩm (mục Mã SKU & trạng thái).</InfoPopover>
                        </label>
                        <ProductSearchSelect products={pickable} placeholder="Gõ tên, SKU hoặc #id sản phẩm…" />
                      </div>
                      <button type="submit" className={btnPrimary}>
                        <Fa name="plus" /> Gắn nhãn
                      </button>
                    </form>
                    {items.length ? (
                      <table className={tableClass}>
                        <thead>
                          <tr>
                            <th className={thClass}>Sản phẩm</th>
                            <th className={`${thClass} text-right`}>Giá</th>
                            <th className={thClass}>Trạng thái</th>
                            <th className={thClass} />
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((p) => (
                            <tr key={p.id}>
                              <td className={tdClass}>
                                <div className="flex items-center gap-3">
                                  <Image src={p.thumb} alt="" width={40} height={40} unoptimized className="h-10 w-10 rounded object-cover" />
                                  <div>
                                    <Link href={`/admin/products/${p.id}/`} className="font-semibold text-lien-heading hover:text-lien-blue">
                                      {p.name}
                                    </Link>
                                    <div className="text-[12px] text-lien-muted">
                                      #{p.id}
                                      {p.sku ? ` · ${p.sku}` : ""}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className={`${tdClass} text-right`}>{p.price > 0 ? `${formatAmount(p.price)}đ` : "Liên hệ"}</td>
                              <td className={tdClass}>{p.status === "publish" ? "Đang bán" : "Bản nháp"}</td>
                              <td className={`${tdClass} text-right`}>
                                <form action={assignLabelAction} className="inline">
                                  <input type="hidden" name="productId" value={p.id} />
                                  <input type="hidden" name="labelId" value="" />
                                  <input type="hidden" name="back" value={l.id} />
                                  <button type="submit" className={`${btnSecondary} !px-2.5 !py-1.5 !text-[13px]`}>
                                    Gỡ nhãn
                                  </button>
                                </form>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p className="m-0 text-[13px] text-lien-muted">Chưa có sản phẩm nào gắn nhãn này.</p>
                    )}
                  </div>
                  <form action={saveProductLabelAction} encType="multipart/form-data" className="grid gap-3 self-start rounded-md border border-dashed border-[#d1d5db] p-4" data-testid={`label-form-${l.id}`}>
                    <input type="hidden" name="id" value={l.id} />
                    <div>
                      <label className={adminLabel} htmlFor={`name-${l.id}`}>
                        Tên nhãn
                      </label>
                      <input id={`name-${l.id}`} name="name" defaultValue={l.name} required className={adminInput} />
                    </div>
                    <div>
                      <label className={adminLabel}>
                        Ảnh nhãn <span className="font-normal text-lien-muted">(GIF động / PNG / WebP / SVG, nền trong suốt)</span>
                      </label>
                      <FilePickButton name="file" accept="image/gif,image/png,image/webp,image/svg+xml,image/avif,image/jpeg" label="Chọn ảnh khác" className={btnSecondary} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={adminLabel} htmlFor={`pos-${l.id}`}>
                          Thứ tự
                        </label>
                        <input id={`pos-${l.id}`} name="position" inputMode="numeric" defaultValue={l.position} className={adminInput} />
                      </div>
                      <label className="inline-flex items-center gap-2 self-end pb-2.5 text-[14px]">
                        <input type="checkbox" name="active" defaultChecked={l.active} className="h-4 w-4" /> Đang dùng
                      </label>
                    </div>
                    <button type="submit" className={btnSecondary}>
                      <Fa name="check" /> Lưu nhãn
                    </button>
                  </form>
                </div>
              ) : null}
            </section>
          );
        })}
      </div>

      <details className="mt-6 rounded-lg border border-dashed border-[#d1d5db] bg-white">
        <summary className="flex cursor-pointer items-center gap-2 px-5 py-3 text-[14px] font-semibold text-lien-blue select-none">
          <Fa name="plus" /> Thêm nhãn mới
        </summary>
        <form action={saveProductLabelAction} encType="multipart/form-data" className="grid gap-3 border-t border-[#e5e7eb] p-5 md:grid-cols-[1fr_auto_120px_auto_auto] md:items-end" data-testid="label-new">
          <div>
            <label className={adminLabel} htmlFor="new-name">
              Tên nhãn *
            </label>
            <input id="new-name" name="name" required placeholder="VD: QUÀ TẶNG KÈM" className={adminInput} />
          </div>
          <div>
            <label className={adminLabel}>Ảnh nhãn *</label>
            <FilePickButton name="file" accept="image/gif,image/png,image/webp,image/svg+xml,image/avif,image/jpeg" label="Chọn ảnh" className={btnSecondary} />
          </div>
          <div>
            <label className={adminLabel} htmlFor="new-pos">
              Thứ tự
            </label>
            <input id="new-pos" name="position" inputMode="numeric" defaultValue={labels.length} className={adminInput} />
          </div>
          <label className="inline-flex items-center gap-2 pb-2.5 text-[14px]">
            <input type="checkbox" name="active" defaultChecked className="h-4 w-4" /> Đang dùng
          </label>
          <button type="submit" className={btnPrimary}>
            <Fa name="plus" /> Thêm nhãn
          </button>
        </form>
      </details>
    </>
  );
}
