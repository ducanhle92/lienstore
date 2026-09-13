import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { saveGroupAction, saveVariantAction } from "@/app/admin/products/groups/actions";
import { adminInput, adminLabel, btnPrimary, btnSecondary, Card, Flash, PageHeader, tableClass, tdClass, thClass } from "@/components/sites/lienstore/admin/ui";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { requireAdmin } from "@/lib/auth";
import { getAllProducts, getProductGroupById } from "@/lib/db";
import { formatAmount } from "@/lib/format";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** One variant family: rename, set the attribute labels, and fill each member's values / order. */
export default async function AdminProductGroup({ params, searchParams }: Props) {
  await requireAdmin("products");
  const { id } = await params;
  const gid = Number.parseInt(id, 10);
  if (!Number.isInteger(gid)) notFound();
  const [group, all, sp] = await Promise.all([getProductGroupById(gid), getAllProducts(true), searchParams]);
  if (!group) notFound();
  const members = all.filter((p) => p.groupId === gid).sort((a, b) => a.variantPosition - b.variantPosition || a.id - b.id);
  const rep = members[0];
  return (
    <>
      <PageHeader title={group.name} subtitle={`Nhóm biến thể #${group.id} · ${members.length} sản phẩm`} back={{ href: "/admin/products/groups/", label: "Nhóm biến thể" }} actions={rep ? <a href={`/product/${rep.slug}/`} target="_blank" rel="noreferrer" className="text-[14px] text-lien-blue hover:underline">Xem trên cửa hàng ↗</a> : null} />
      {first(sp.saved) ? <Flash>{first(sp.saved)}</Flash> : null}
      {first(sp.error) ? <Flash kind="error">{first(sp.error)}</Flash> : null}

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <Card title="Thông tin nhóm">
          <form action={saveGroupAction} className="grid gap-3">
            <input type="hidden" name="id" value={group.id} />
            <div>
              <label className={adminLabel} htmlFor="name">
                Tên chung
              </label>
              <input id="name" name="name" defaultValue={group.name} required className={adminInput} />
            </div>
            <div>
              <label className={adminLabel} htmlFor="attrLabels">
                Thuộc tính phân biệt <span className="font-normal text-lien-muted">(tối đa 3, cách nhau dấu phẩy)</span>
              </label>
              <input id="attrLabels" name="attrLabels" defaultValue={group.attrLabels.join(", ")} placeholder="VD: Vị, Khối lượng" className={adminInput} />
              <p className="mt-1 text-[12px] leading-5 text-lien-muted">Để trống thì trang sản phẩm hiện chip theo ảnh + phần tên khác nhau. Đặt thuộc tính (ví dụ “Vị”) rồi điền giá trị cho từng biến thể ở bảng bên để khách chọn theo hàng như trên kệ.</p>
            </div>
            <button type="submit" className={`${btnPrimary} justify-self-start`}>
              <Fa name="check" /> Lưu nhóm
            </button>
          </form>
        </Card>

        <Card title="Các biến thể">
          <div className="overflow-x-auto">
            <table className={tableClass}>
              <thead>
                <tr>
                  <th className={thClass}>Sản phẩm</th>
                  {group.attrLabels.map((l) => (
                    <th key={l} className={thClass}>
                      {l}
                    </th>
                  ))}
                  <th className={thClass}>Thứ tự</th>
                  <th className={`${thClass} text-right`}>Giá</th>
                  <th className={thClass} />
                </tr>
              </thead>
              <tbody>
                {members.map((p) => {
                  const fid = `v-${p.id}`;
                  return (
                    <tr key={p.id}>
                      <td className={tdClass}>
                        <form id={fid} action={saveVariantAction}>
                          <input type="hidden" name="groupId" value={group.id} />
                          <input type="hidden" name="productId" value={p.id} />
                        </form>
                        <div className="flex items-center gap-2">
                          {p.thumb ? <Image src={p.thumb} alt="" width={40} height={40} className="h-10 w-10 rounded border border-[#e5e7eb] object-contain" /> : null}
                          <span className="flex flex-col leading-4">
                            <Link href={`/admin/products/${p.id}/`} className="text-[13px] font-semibold text-lien-heading hover:text-lien-blue">
                              {p.name}
                            </Link>
                            <span className="text-[12px] text-lien-muted">
                              {p.sku ?? "—"}
                              {p.status === "draft" ? " · nháp" : ""}
                            </span>
                          </span>
                        </div>
                      </td>
                      {group.attrLabels.map((l, i) => (
                        <td key={l} className={tdClass}>
                          <input form={fid} name={`attr_${i}`} defaultValue={p.variantAttrs[l] ?? ""} placeholder={l} className={`${adminInput} !mb-0 !w-[140px] !py-1 !text-[13px]`} aria-label={`${l} của ${p.name}`} />
                        </td>
                      ))}
                      <td className={tdClass}>
                        <input form={fid} name="position" inputMode="numeric" defaultValue={p.variantPosition} className={`${adminInput} !mb-0 !w-[64px] !py-1 !text-[13px]`} aria-label="Thứ tự" />
                      </td>
                      <td className={`${tdClass} text-right whitespace-nowrap`}>{formatAmount(p.price)}đ</td>
                      <td className={`${tdClass} whitespace-nowrap`}>
                        <div className="flex items-center gap-2">
                          <button form={fid} type="submit" className={`${btnPrimary} !px-2.5 !py-1 !text-[12px]`}>
                            Lưu
                          </button>
                          <button form={fid} type="submit" name="remove" value="1" className={`${btnSecondary} !px-2.5 !py-1 !text-[12px]`} title="Tách khỏi nhóm (sản phẩm vẫn giữ nguyên)">
                            Tách
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {members.length === 0 ? (
                  <tr>
                    <td colSpan={4 + group.attrLabels.length} className={`${tdClass} text-center text-lien-muted`}>
                      Chưa có sản phẩm nào. Gán ở trang sửa sản phẩm (khung “Nhóm biến thể”) hoặc tích chọn nhiều sản phẩm ở danh sách.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[12px] leading-5 text-lien-muted">Thẻ ngoài kệ dùng ảnh và giá của biến thể có thứ tự nhỏ nhất (hiện là “{rep?.name ?? "—"}”). Giá hiển thị “Từ … ” khi các biến thể khác giá.</p>
        </Card>
      </div>
    </>
  );
}
