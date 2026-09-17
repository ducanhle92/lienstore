import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { saveGroupAction, saveVariantAction, saveVariantsBulkAction } from "@/app/admin/products/groups/actions";
import { AddToGroupPicker } from "@/components/sites/lienstore/admin/AddToGroupPicker";
import { AttrLabelsEditor } from "@/components/sites/lienstore/admin/AttrLabelsEditor";
import { VariantTree } from "@/components/sites/lienstore/admin/VariantTree";
import { adminInput, adminLabel, btnPrimary, btnSecondary, Card, Flash, PageHeader, tableClass, tdClass, thClass } from "@/components/sites/lienstore/admin/ui";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { requireAdmin } from "@/lib/auth";
import { getAllProducts, getProductGroupById, listProductGroups } from "@/lib/db";
import { formatAmount } from "@/lib/format";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** One variant family: rename, set the attribute levels, add members, fill each member's values / order, see the tree. */
export default async function AdminProductGroup({ params, searchParams }: Props) {
  await requireAdmin("products");
  const { id } = await params;
  const gid = Number.parseInt(id, 10);
  if (!Number.isInteger(gid)) notFound();
  const [group, all, groups, sp] = await Promise.all([getProductGroupById(gid), getAllProducts(true), listProductGroups(), searchParams]);
  if (!group) notFound();
  const groupName = Object.fromEntries(groups.map((g) => [g.id, g.name]));
  const labels = group.attrLabels;
  // members sorted the way the tree branches: level-1 value, level-2 value…, then order
  const members = all
    .filter((p) => p.groupId === gid)
    .sort((a, b) => {
      for (const l of labels) {
        const c = (a.variantAttrs[l] ?? "").localeCompare(b.variantAttrs[l] ?? "", "vi", { numeric: true });
        if (c) return c;
      }
      return a.variantPosition - b.variantPosition || a.id - b.id;
    });
  const rep = [...members].sort((a, b) => a.variantPosition - b.variantPosition || a.id - b.id)[0];
  const candidates = all.filter((p) => p.groupId !== gid).map((p) => ({ id: p.id, name: p.name, sku: p.sku, thumb: p.thumb, price: p.price, status: p.status, inGroup: p.groupId ? (groupName[p.groupId] ?? null) : null }));
  return (
    <>
      <PageHeader title={group.name} subtitle={`Nhóm biến thể #${group.id} · ${members.length} sản phẩm`} back={{ href: "/admin/products/groups/", label: "Nhóm biến thể" }} actions={rep ? <a href={`/product/${rep.slug}/`} target="_blank" rel="noreferrer" className="text-[14px] text-lien-blue hover:underline">Xem trên cửa hàng ↗</a> : null} />
      {first(sp.saved) ? <Flash>{first(sp.saved)}</Flash> : null}
      {first(sp.error) ? <Flash kind="error">{first(sp.error)}</Flash> : null}

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <div className="space-y-6">
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
                <p className={adminLabel}>Thuộc tính phân biệt (cha → con)</p>
                <AttrLabelsEditor key={labels.join("|")} initial={labels} />
              </div>
              <button type="submit" className={`${btnPrimary} justify-self-start`}>
                <Fa name="check" /> Lưu nhóm
              </button>
            </form>
          </Card>

          <Card title="Cây phân nhánh">
            <VariantTree labels={labels} members={members} />
            <p className="mt-3 mb-0 text-[12px] leading-5 text-lien-muted">Nhánh vẽ theo giá trị từng cấp của mỗi sản phẩm (điền ở bảng bên phải). Nhánh “(chưa điền)” là sản phẩm còn thiếu giá trị; trên web khách chọn cấp 1 rồi mới thấy các mức cấp 2 thuộc nhánh đó.</p>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Thêm sản phẩm vào nhóm">
            <AddToGroupPicker groupId={group.id} candidates={candidates} />
          </Card>

          <Card
            title={`Các biến thể (${members.length})`}
            actions={
              members.length ? (
                <button type="submit" form="bulk-variants" className={`${btnPrimary} !px-3 !py-1.5 !text-[13px]`}>
                  <Fa name="check" /> Lưu tất cả
                </button>
              ) : null
            }
          >
            {/* one form for every row: type freely, save once (the per-row "Tách" buttons have their own tiny forms) */}
            <form id="bulk-variants" action={saveVariantsBulkAction}>
              <input type="hidden" name="groupId" value={group.id} />
            </form>
            <div className="overflow-x-auto">
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th className={thClass}>Sản phẩm</th>
                    {labels.map((l, i) => (
                      <th key={l} className={thClass}>
                        <span className="mr-1 rounded bg-[#e5e7eb] px-1 text-[10px] text-lien-muted">cấp {i + 1}</span>
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
                        <td className={`${tdClass} min-w-[280px]`}>
                          <form id={fid} action={saveVariantAction}>
                            <input type="hidden" name="groupId" value={group.id} />
                            <input type="hidden" name="productId" value={p.id} />
                            <input type="hidden" name="remove" value="1" />
                          </form>
                          <input type="hidden" name="pid" value={p.id} form="bulk-variants" />
                          <div className="flex items-center gap-2">
                            {p.thumb ? <Image src={p.thumb} alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded border border-[#e5e7eb] object-contain" /> : null}
                            <span className="flex min-w-0 flex-col leading-4">
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
                        {labels.map((l, i) => (
                          <td key={l} className={tdClass}>
                            <input form="bulk-variants" name={`attr_${p.id}_${i}`} defaultValue={p.variantAttrs[l] ?? ""} placeholder={l} className={`${adminInput} !mb-0 !w-[150px] !py-1 !text-[13px] ${p.variantAttrs[l] ? "" : "border-amber-300 bg-amber-50"}`} aria-label={`${l} của ${p.name}`} />
                          </td>
                        ))}
                        <td className={tdClass}>
                          <input form="bulk-variants" name={`pos_${p.id}`} inputMode="numeric" defaultValue={p.variantPosition} className={`${adminInput} !mb-0 !w-[64px] !py-1 !text-[13px]`} aria-label="Thứ tự" />
                        </td>
                        <td className={`${tdClass} text-right whitespace-nowrap`}>{formatAmount(p.price)}đ</td>
                        <td className={`${tdClass} whitespace-nowrap`}>
                          <button form={fid} type="submit" className={`${btnSecondary} !px-2.5 !py-1 !text-[12px]`} title="Tách khỏi nhóm (sản phẩm vẫn giữ nguyên)">
                            Tách
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {members.length === 0 ? (
                    <tr>
                      <td colSpan={4 + labels.length} className={`${tdClass} text-center text-lien-muted`}>
                        Chưa có sản phẩm nào — tìm và thêm ở khung phía trên.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            {members.length ? (
              <button type="submit" form="bulk-variants" className={`${btnPrimary} mt-3`}>
                <Fa name="check" /> Lưu tất cả ({members.length} biến thể)
              </button>
            ) : null}
            <p className="mt-3 text-[12px] leading-5 text-lien-muted">Điền thoải mái các ô rồi bấm “Lưu tất cả” một lần. Mỗi cột thuộc tính là một cấp: điền “Loại” = A / White, “Số viên” = 420 / 840… Ô vàng là giá trị còn thiếu. Thẻ ngoài kệ dùng ảnh và giá của biến thể có thứ tự nhỏ nhất (hiện là “{rep?.name ?? "—"}”); giá hiển thị “Từ …” khi các biến thể khác giá.</p>
          </Card>
        </div>
      </div>
    </>
  );
}
