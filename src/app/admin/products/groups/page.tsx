import Image from "next/image";
import Link from "next/link";
import { deleteGroupAction, saveGroupAction } from "@/app/admin/products/groups/actions";
import { AttrLabelsEditor } from "@/components/sites/lienstore/admin/AttrLabelsEditor";
import { ConfirmSubmit } from "@/components/sites/lienstore/admin/ConfirmSubmit";
import { adminInput, adminLabel, btnPrimary, Card, Flash, PageHeader } from "@/components/sites/lienstore/admin/ui";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { requireAdmin } from "@/lib/auth";
import { getAllProducts, listProductGroups } from "@/lib/db";
import { formatAmount } from "@/lib/format";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** Kho hàng › Nhóm biến thể: families of products shown as one card with a flavour / size / count picker. */
export default async function AdminProductGroups({ searchParams }: Props) {
  await requireAdmin("products");
  const sp = await searchParams;
  const [groups, all] = await Promise.all([listProductGroups(), getAllProducts(true)]);
  const members = (id: number) => all.filter((p) => p.groupId === id).sort((a, b) => a.variantPosition - b.variantPosition || a.id - b.id);
  return (
    <>
      <PageHeader
        title="Nhóm biến thể"
        subtitle="Cùng một dòng sản phẩm nhưng khác vị, dung tích, số viên, có/không hương… gộp vào một nhóm: ngoài kệ chỉ hiện 1 thẻ “N lựa chọn”, vào trang sản phẩm khách bấm chip để đổi loại. Mỗi biến thể vẫn là một sản phẩm riêng (ảnh, giá, SKU, mô tả)."
        back={{ href: "/admin/products/", label: "Sản phẩm" }}
      />
      {first(sp.saved) ? <Flash>{first(sp.saved)}</Flash> : null}
      {first(sp.error) ? <Flash kind="error">{first(sp.error)}</Flash> : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          {groups.length === 0 ? (
            <Card>
              <p className="m-0 text-[14px] text-lien-muted">
                Chưa có nhóm nào. Vào <Link href="/admin/products/" className="text-lien-blue hover:underline">Sản phẩm</Link>, tích chọn các sản phẩm cùng dòng rồi bấm “Gộp thành nhóm biến thể”.
              </p>
            </Card>
          ) : null}
          {groups.map((g) => {
            const list = members(g.id);
            return (
              <Card key={g.id} title={`${g.name} · ${list.length} biến thể`} actions={<Link href={`/admin/products/groups/${g.id}/`} className="text-[13px] text-lien-blue hover:underline">Sửa nhóm →</Link>}>
                <p className="m-0 mb-3 text-[12px] text-lien-muted">
                  Thuộc tính: {g.attrLabels.length ? g.attrLabels.join(" · ") : <em>chưa đặt — chip sẽ hiện phần tên khác nhau</em>} · /product/{list[0]?.slug ?? "…"}/
                </p>
                <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                  {list.map((p) => (
                    <li key={p.id} className="flex items-center gap-2 rounded-md border border-[#e5e7eb] bg-white px-2 py-1.5 text-[13px]">
                      {p.thumb ? <Image src={p.thumb} alt="" width={32} height={32} className="h-8 w-8 rounded object-contain" /> : null}
                      <span className="flex flex-col leading-4">
                        <Link href={`/admin/products/${p.id}/`} className="font-semibold text-lien-heading hover:text-lien-blue">
                          {p.name}
                        </Link>
                        <span className="text-[12px] text-lien-muted">
                          {g.attrLabels.map((l) => p.variantAttrs[l]).filter(Boolean).join(" · ") || "—"} · {formatAmount(p.price)}đ{p.status === "draft" ? " · nháp" : ""}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>

        <Card title="Tạo nhóm trống">
          <form action={saveGroupAction} className="grid gap-3">
            <div>
              <label className={adminLabel} htmlFor="g-name">
                Tên chung của dòng sản phẩm
              </label>
              <input id="g-name" name="name" required placeholder="VD: SAVAS Whey Protein 100" className={adminInput} />
            </div>
            <div>
              <p className={adminLabel}>Thuộc tính phân biệt (cha → con)</p>
              <AttrLabelsEditor initial={[]} />
            </div>
            <button type="submit" className={`${btnPrimary} justify-self-start`}>
              <Fa name="plus" /> Tạo nhóm
            </button>
            <p className="m-0 text-[12px] leading-5 text-lien-muted">Sau đó gán sản phẩm vào nhóm ở trang sửa từng sản phẩm (khung “Nhóm biến thể”) hoặc tích chọn nhiều sản phẩm ở danh sách.</p>
          </form>
          {groups.length ? (
            <div className="mt-5 border-t border-[#e5e7eb] pt-4">
              <p className={adminLabel}>Xoá nhóm (sản phẩm giữ nguyên, hiển thị riêng lại)</p>
              <ul className="m-0 list-none space-y-1 p-0 text-[13px]">
                {groups.map((g) => (
                  <li key={g.id} className="flex items-center justify-between gap-2">
                    <span>{g.name}</span>
                    <form action={deleteGroupAction}>
                      <input type="hidden" name="id" value={g.id} />
                      <ConfirmSubmit message={`Xoá nhóm “${g.name}”? Các sản phẩm không bị xoá.`} className="text-[12px] text-lien-heart hover:underline">
                        Xoá
                      </ConfirmSubmit>
                    </form>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>
      </div>
    </>
  );
}
