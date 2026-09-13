import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { addLotAction, updateLotAction } from "@/app/admin/inventory/lots/actions";
import { adminInput, adminLabel, btnPrimary, btnSecondary, Card, Flash, PageHeader, tableClass, tdClass, thClass } from "@/components/sites/lienstore/admin/ui";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { requireAdmin } from "@/lib/auth";
import { getProductById, listPurchaseSources, listStockLots, listStockPurchases } from "@/lib/db";
import { formatAmount, formatDate } from "@/lib/format";
import { daysToExpiry, EXPIRY_LABEL, expiryState, todayIso } from "@/lib/lots";
import { PURCHASE_STAGES, purchaseIndex } from "@/lib/purchase";
import { purchaseSourceName } from "@/lib/purchase-sources";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const EXP_CLS = { expired: "bg-red-100 text-red-800", soon: "bg-amber-100 text-amber-800", ok: "bg-green-100 text-green-800", none: "bg-gray-100 text-gray-600" } as const;

/** Kho hàng › Lô hàng của một sản phẩm: mỗi lần nhập là một dòng — ngày nhập, số lượng, nguồn, hạn dùng, vị trí. */
export default async function ProductLotsPage({ params, searchParams }: Props) {
  await requireAdmin("inventory");
  const { id } = await params;
  const pid = Number.parseInt(id, 10);
  if (!Number.isInteger(pid)) notFound();
  const [product, lots, sources, purchases, sp] = await Promise.all([getProductById(pid), listStockLots(pid, false), listPurchaseSources(), listStockPurchases(false), searchParams]);
  if (!product) notFound();
  const open = purchases.filter((p) => p.productId === pid);
  const left = lots.reduce((s, l) => s + l.qtyLeft, 0);
  const srcField = (name: string, value: string, id: string) => (
    <select id={id} name={name} defaultValue={value} className={`${adminInput} !mb-0 !w-[170px] !py-1 !text-[13px]`} aria-label="Nguồn nhập">
      {sources.map((s) => (
        <option key={s.key} value={s.key}>
          {s.name}
        </option>
      ))}
    </select>
  );
  return (
    <>
      <PageHeader
        title={product.name}
        subtitle={`Lô hàng · tồn ${product.stock ?? 0} đơn vị trong ${lots.filter((l) => l.qtyLeft > 0).length} lô${open.length ? ` · ${open.reduce((s, p) => s + p.qty, 0)} đv đang mua lưu kho` : ""}`}
        back={{ href: "/admin/inventory/", label: "Kho hàng" }}
        actions={
          <Link href={`/admin/products/${product.id}/`} className="text-[14px] text-lien-blue hover:underline">
            Sửa sản phẩm →
          </Link>
        }
      />
      {first(sp.saved) ? <Flash>{first(sp.saved)}</Flash> : null}
      {first(sp.error) ? <Flash kind="error">{first(sp.error)}</Flash> : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card title={`Các lô đang có (${left} đơn vị)`}>
            <div className="overflow-x-auto">
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th className={thClass}>Ngày nhập</th>
                    <th className={thClass}>Còn / nhập</th>
                    <th className={thClass}>Nguồn nhập</th>
                    <th className={thClass}>Giá vốn ¥/đv</th>
                    <th className={thClass}>Hạn dùng</th>
                    <th className={thClass}>Vị trí kho</th>
                    <th className={thClass}>Ghi chú</th>
                    <th className={thClass} />
                  </tr>
                </thead>
                <tbody>
                  {lots.map((l) => {
                    const fid = `lot-${l.id}`;
                    const st = expiryState(l.expiry);
                    const days = daysToExpiry(l.expiry);
                    return (
                      <tr key={l.id} className={cn(l.qtyLeft === 0 && "opacity-50")} data-testid={`lot-${l.id}`}>
                        <td className={tdClass}>
                          <form id={fid} action={updateLotAction}>
                            <input type="hidden" name="productId" value={pid} />
                            <input type="hidden" name="lotId" value={l.id} />
                          </form>
                          <input form={fid} name="receivedAt" defaultValue={l.receivedAt} className={`${adminInput} !mb-0 !w-[118px] !py-1 !text-[13px]`} aria-label="Ngày nhập" />
                          {l.purchaseId ? <span className="block text-[11px] text-lien-muted">phiếu mua #{l.purchaseId}</span> : null}
                        </td>
                        <td className={`${tdClass} whitespace-nowrap`}>
                          <input form={fid} name="qtyLeft" inputMode="numeric" defaultValue={l.qtyLeft} className={`${adminInput} !mb-0 inline-block !w-[64px] !py-1 text-center !text-[13px]`} aria-label="Số lượng còn" />
                          <span className="ml-1 text-[12px] text-lien-muted">/ {l.qtyIn}</span>
                        </td>
                        <td className={tdClass}>{srcField("sourceKey", l.sourceKey, `${fid}-src`)}</td>
                        <td className={tdClass}>
                          <input form={fid} name="unitCostJpy" inputMode="numeric" defaultValue={l.unitCostJpy ?? ""} placeholder="¥" className={`${adminInput} !mb-0 !w-[84px] !py-1 !text-[13px]`} aria-label="Giá vốn ¥" />
                          {l.unitCostVnd ? <span className="block text-[11px] text-lien-muted">≈ {formatAmount(l.unitCostVnd)}đ</span> : null}
                        </td>
                        <td className={tdClass}>
                          <input form={fid} name="expiry" defaultValue={l.expiry ?? ""} placeholder="2027-03-31" className={`${adminInput} !mb-0 !w-[118px] !py-1 !text-[13px]`} aria-label="Hạn dùng" />
                          <span className={cn("mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold", EXP_CLS[st])}>
                            {EXPIRY_LABEL[st]}
                            {days !== null ? ` · ${days < 0 ? `${-days} ngày trước` : `${days} ngày`}` : ""}
                          </span>
                        </td>
                        <td className={tdClass}>
                          <input form={fid} name="location" defaultValue={l.location} placeholder="Kệ A2 / thùng 3" className={`${adminInput} !mb-0 !w-[120px] !py-1 !text-[13px]`} aria-label="Vị trí" />
                        </td>
                        <td className={tdClass}>
                          <input form={fid} name="note" defaultValue={l.note} className={`${adminInput} !mb-0 !w-[180px] !py-1 !text-[13px]`} aria-label="Ghi chú" />
                        </td>
                        <td className={`${tdClass} whitespace-nowrap`}>
                          <div className="flex items-center gap-1">
                            <button form={fid} type="submit" className={`${btnPrimary} !px-2.5 !py-1 !text-[12px]`}>
                              Lưu
                            </button>
                            <button form={fid} type="submit" name="remove" value="1" className={`${btnSecondary} !px-2 !py-1 !text-[12px] !text-lien-heart`} title="Xoá lô">
                              <Fa name="trash" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {lots.length === 0 ? (
                    <tr>
                      <td colSpan={8} className={`${tdClass} text-center text-lien-muted`}>
                        Chưa có lô nào — nhập lô ở khung bên phải, hoặc tạo phiếu “Mua lưu kho” ở Quản lý mua hàng (khi hàng về tới kho, lô tự tạo).
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <p className="mt-3 mb-0 text-[12px] leading-5 text-lien-muted">Khi khách đặt hàng, số lượng trừ vào lô có hạn dùng gần nhất trước (FEFO). Sửa số “còn” để kiểm kho; tồn kho của sản phẩm = tổng “còn” của các lô.</p>
          </Card>

          {open.length ? (
            <Card title="Đang mua lưu kho (chưa về)">
              <ul className="m-0 list-none space-y-1 p-0 text-[13px]">
                {open.map((p) => {
                  const st = PURCHASE_STAGES[purchaseIndex(p.status)];
                  return (
                    <li key={p.id} className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{p.qty} đv</span>
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", st.cls)}>{st.short}</span>
                      <span className="text-lien-muted">
                        {purchaseSourceName(p.sourceKey, sources)}
                        {p.unitCostJpy ? ` · ¥${p.unitCostJpy.toLocaleString("ja-JP")}` : ""}
                        {p.expiry ? ` · HSD ${formatDate(p.expiry)}` : ""} · tạo {formatDate(p.createdAt)}
                      </span>
                      <Link href="/admin/purchases/?tab=stock" className="text-lien-blue hover:underline">
                        cập nhật →
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ) : null}
        </div>

        <Card title="Nhập lô trực tiếp">
          <div className="mb-3 flex items-center gap-2">
            {product.thumb ? <Image src={product.thumb} alt="" width={44} height={44} className="h-11 w-11 rounded border border-[#e5e7eb] object-contain" /> : null}
            <span className="text-[12px] text-lien-muted">
              #{product.id}
              {product.sku ? ` · ${product.sku}` : ""} · giá vốn hiện tại {product.costJpy ? `¥${product.costJpy.toLocaleString("ja-JP")}` : "—"}
            </span>
          </div>
          <form action={addLotAction} className="grid gap-3" data-testid="add-lot">
            <input type="hidden" name="productId" value={pid} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={adminLabel} htmlFor="al-qty">
                  Số lượng
                </label>
                <input id="al-qty" name="qty" inputMode="numeric" required className={adminInput} />
              </div>
              <div>
                <label className={adminLabel} htmlFor="al-date">
                  Ngày nhập
                </label>
                <input id="al-date" name="receivedAt" defaultValue={todayIso()} className={adminInput} />
              </div>
            </div>
            <div>
              <label className={adminLabel} htmlFor="al-src">
                Nguồn nhập
              </label>
              {srcField("sourceKey", product.costSource || "unknown", "al-src")}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={adminLabel} htmlFor="al-jpy">
                  Giá vốn ¥/đv <span className="font-normal text-lien-muted">(trống = giá vốn hiện tại)</span>
                </label>
                <input id="al-jpy" name="unitCostJpy" inputMode="numeric" defaultValue={product.costJpy ?? ""} className={adminInput} />
              </div>
              <div>
                <label className={adminLabel} htmlFor="al-exp">
                  Hạn dùng
                </label>
                <input id="al-exp" name="expiry" placeholder="2027-03-31 · 03/2027" className={adminInput} />
              </div>
            </div>
            <div>
              <label className={adminLabel} htmlFor="al-loc">
                Vị trí kho
              </label>
              <input id="al-loc" name="location" placeholder="Kệ A2 · thùng 3 · tủ mát" className={adminInput} />
            </div>
            <div>
              <label className={adminLabel} htmlFor="al-note">
                Ghi chú
              </label>
              <input id="al-note" name="note" placeholder="Mua tại Don Quijote khi về Nhật 9/2026…" className={adminInput} />
            </div>
            <button type="submit" className={`${btnPrimary} justify-self-start`}>
              <Fa name="plus" /> Nhập lô
            </button>
          </form>
          <p className="mt-3 mb-0 text-[12px] leading-5 text-lien-muted">Hàng mua trước rồi mới về (theo dõi đường đi) thì tạo phiếu “Mua lưu kho” ở Quản lý mua hàng; khi chuyển trạng thái “Đã nhận được hàng (kho shop)” lô sẽ tự được tạo ở đây.</p>
        </Card>
      </div>
    </>
  );
}
