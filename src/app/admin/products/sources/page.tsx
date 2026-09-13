import Link from "next/link";
import { deletePurchaseSourceAction, savePurchaseSourceEntryAction } from "@/app/admin/products/sources/actions";
import { ConfirmSubmit } from "@/components/sites/lienstore/admin/ConfirmSubmit";
import { adminInput, adminLabel, btnPrimary, btnSecondary, Card, Flash, PageHeader, tableClass, tdClass, thClass } from "@/components/sites/lienstore/admin/ui";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { requireAdmin } from "@/lib/auth";
import { getPurchaseSourceDefault, listPurchaseSources, purchaseSourceUsage } from "@/lib/db";
import { PURCHASE_KIND_LABEL, PURCHASE_SOURCE_KINDS, purchaseSourceDetail } from "@/lib/purchase-sources";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

const KIND_CLS: Record<string, string> = { website: "bg-sky-100 text-sky-800", store: "bg-green-100 text-green-800", auction: "bg-amber-100 text-amber-800", secondhand: "bg-purple-100 text-purple-800", other: "bg-gray-200 text-gray-700" };

/** Kho hàng › Nguồn nhập: every place a product can be bought from — websites, physical stores (address, branch), auctions, second-hand. */
export default async function AdminPurchaseSources({ searchParams }: Props) {
  await requireAdmin("products");
  const [sp, sources, usage, preferred] = await Promise.all([searchParams, listPurchaseSources(true), purchaseSourceUsage(), getPurchaseSourceDefault()]);
  const kindField = (id: string, value?: string) => (
    <select id={id} name="kind" defaultValue={value ?? "store"} className={adminInput} aria-label="Loại nguồn">
      {PURCHASE_SOURCE_KINDS.map((k) => (
        <option key={k} value={k}>
          {PURCHASE_KIND_LABEL[k]}
        </option>
      ))}
    </select>
  );
  return (
    <>
      <PageHeader
        title="Nguồn nhập hàng"
        subtitle="Danh sách nơi mua: website (Amazon, Rakuten…), cửa hàng chụp giá trực tiếp (địa chỉ, chi nhánh), sàn đấu giá, đồ cũ… Mỗi báo giá ¥ của sản phẩm chọn một nguồn ở đây; chưa rõ thì để “Chưa xác định — thêm sau”."
        back={{ href: "/admin/products/", label: "Sản phẩm" }}
        actions={
          <Link href="/admin/products/pricing/" className="text-[14px] text-lien-blue hover:underline">
            Nguồn mặc định: {sources.find((s) => s.key === preferred)?.name ?? preferred} (đổi ở Công thức giá) →
          </Link>
        }
      />
      {first(sp.saved) ? <Flash>{first(sp.saved)}</Flash> : null}
      {first(sp.error) ? <Flash kind="error">{first(sp.error)}</Flash> : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <Card title={`Các nguồn (${sources.length})`}>
          <div className="overflow-x-auto">
            <table className={tableClass}>
              <thead>
                <tr>
                  <th className={thClass}>Nguồn</th>
                  <th className={thClass}>Loại</th>
                  <th className={thClass}>Chi tiết</th>
                  <th className={`${thClass} text-right`}>Báo giá đang dùng</th>
                  <th className={thClass} />
                </tr>
              </thead>
              <tbody>
                {sources.map((s) => {
                  const fid = `src-${s.id}`;
                  const n = usage.get(s.key) ?? 0;
                  return (
                    <tr key={s.id} className={cn(!s.active && "opacity-60")} data-testid={`source-${s.key}`}>
                      <td className={`${tdClass} min-w-[200px]`}>
                        <span className="font-semibold text-lien-heading">{s.name}</span>
                        <span className="block font-mono text-[11px] text-lien-muted">
                          {s.key}
                          {s.builtin ? " · có sẵn" : ""}
                          {!s.active ? " · đang tắt" : ""}
                          {s.key === preferred ? " · mặc định" : ""}
                        </span>
                        <details className="mt-1">
                          <summary className="cursor-pointer select-none text-[12px] font-semibold text-lien-blue">
                            <Fa name="cog" className="mr-1" /> Sửa
                          </summary>
                          <form id={fid} action={savePurchaseSourceEntryAction} className="mt-2 grid gap-2 rounded-md border border-[#e5e7eb] bg-[#fafafa] p-3 sm:grid-cols-2">
                            <input type="hidden" name="id" value={s.id} />
                            <input name="name" defaultValue={s.name} className={adminInput} aria-label="Tên nguồn" />
                            {kindField(`${fid}-kind`, s.kind)}
                            <input name="url" defaultValue={s.url} placeholder="https://…" className={adminInput} aria-label="Website" />
                            <input name="branch" defaultValue={s.branch} placeholder="Chi nhánh" className={adminInput} aria-label="Chi nhánh" />
                            <input name="address" defaultValue={s.address} placeholder="Địa chỉ" className={`${adminInput} sm:col-span-2`} aria-label="Địa chỉ" />
                            <input name="note" defaultValue={s.note} placeholder="Ghi chú (giờ mở, điểm thưởng, tax-free…)" className={`${adminInput} sm:col-span-2`} aria-label="Ghi chú" />
                            <label className="flex items-center gap-2 text-[13px]">
                              <input type="checkbox" name="active" value="1" defaultChecked={s.active} className="h-4 w-4" /> Đang dùng
                              <input type="hidden" name="active" value="0" />
                            </label>
                            <button type="submit" className={`${btnSecondary} justify-self-start`}>
                              <Fa name="check" /> Lưu
                            </button>
                          </form>
                        </details>
                      </td>
                      <td className={tdClass}>
                        <span className={cn("inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold", KIND_CLS[s.kind])}>{PURCHASE_KIND_LABEL[s.kind]}</span>
                      </td>
                      <td className={`${tdClass} max-w-[320px] text-[12px] text-lien-muted`}>
                        {purchaseSourceDetail(s).replace(`${PURCHASE_KIND_LABEL[s.kind]}`, "").replace(/^ · /, "") || "—"}
                        {s.note ? <span className="block">{s.note}</span> : null}
                      </td>
                      <td className={`${tdClass} text-right`}>{n || <span className="text-lien-muted">0</span>}</td>
                      <td className={`${tdClass} whitespace-nowrap text-right`}>
                        {!s.builtin ? (
                          <form action={deletePurchaseSourceAction}>
                            <input type="hidden" name="id" value={s.id} />
                            <ConfirmSubmit message={`Xoá nguồn “${s.name}”?${n ? ` ${n} báo giá sẽ chuyển sang “Chưa xác định”.` : ""}`} className="text-[13px] text-lien-heart hover:underline">
                              Xoá
                            </ConfirmSubmit>
                          </form>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Thêm nguồn nhập">
          <form action={savePurchaseSourceEntryAction} className="grid gap-3" data-testid="source-add">
            <div>
              <label className={adminLabel} htmlFor="ns-name">
                Tên nguồn
              </label>
              <input id="ns-name" name="name" required placeholder="VD: Don Quijote Shibuya · Yahoo Auction · 2nd Street" className={adminInput} />
            </div>
            <div>
              <label className={adminLabel} htmlFor="ns-kind">
                Loại
              </label>
              {kindField("ns-kind")}
            </div>
            <div>
              <label className={adminLabel} htmlFor="ns-url">
                Website <span className="font-normal text-lien-muted">(dán link mua → tự nhận ra nguồn)</span>
              </label>
              <input id="ns-url" name="url" placeholder="https://…" className={adminInput} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={adminLabel} htmlFor="ns-branch">
                  Chi nhánh
                </label>
                <input id="ns-branch" name="branch" placeholder="VD: Shibuya" className={adminInput} />
              </div>
              <div>
                <label className={adminLabel} htmlFor="ns-address">
                  Địa chỉ
                </label>
                <input id="ns-address" name="address" placeholder="VD: 28-6 Udagawacho, Shibuya" className={adminInput} />
              </div>
            </div>
            <div>
              <label className={adminLabel} htmlFor="ns-note">
                Ghi chú
              </label>
              <input id="ns-note" name="note" placeholder="Giờ mở cửa, tax-free, thẻ điểm…" className={adminInput} />
            </div>
            <button type="submit" className={`${btnPrimary} justify-self-start`}>
              <Fa name="plus" /> Thêm nguồn
            </button>
          </form>
          <p className="mt-3 text-[12px] leading-5 text-lien-muted">Nguồn thêm ở đây xuất hiện trong ô “Nguồn mua” của từng báo giá ¥ trên trang sản phẩm và trong CSV nhập hàng (cột “Nguồn giá”: ghi tên hoặc mã nguồn).</p>
        </Card>
      </div>
    </>
  );
}
