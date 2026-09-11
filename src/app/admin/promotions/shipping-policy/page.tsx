import Link from "next/link";
import { saveShipPolicyAction } from "@/app/admin/promotions/actions";
import { adminInput, adminLabel, btnPrimary, Card, Flash, PageHeader } from "@/components/sites/lienstore/admin/ui";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { ShipPolicyCard } from "@/components/sites/lienstore/shop/ShipPolicyCard";
import { requireAdmin } from "@/lib/auth";
import { getShipPolicy } from "@/lib/db";
import { formatAmount } from "@/lib/format";
import { describeShipPolicy } from "@/lib/ship-policy";
import { REGION_LABEL, type VnRegion } from "@/lib/vn-regions";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** Sales › Chính sách vận chuyển: the shop's free-shipping thresholds per region, with an on/off switch. */
export default async function AdminShipPolicy({ searchParams }: Props) {
  await requireAdmin("promotions");
  const sp = await searchParams;
  const policy = await getShipPolicy();
  return (
    <>
      <PageHeader
        title="Chính sách vận chuyển"
        subtitle={policy.enabled ? `Đang áp dụng: ${describeShipPolicy(policy)}` : "Đang tắt — khách không thấy và không được trừ phí vận chuyển"}
        actions={
          <Link href="/admin/shipping/?leg=display" className="text-[13px] text-lien-blue hover:underline">
            <Fa name="eye" /> Xem trước ở Vận chuyển › Hiển thị cho khách
          </Link>
        }
      />
      {first(sp.saved) ? <Flash>{first(sp.saved)}</Flash> : null}
      {first(sp.error) ? <Flash kind="error">{first(sp.error)}</Flash> : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <Card title="Hỗ trợ phí giao hàng nội địa Việt Nam">
          <form action={saveShipPolicyAction} className="space-y-4">
            <label className="flex items-start gap-3 rounded-md border border-[#e5e7eb] p-3">
              <input type="checkbox" name="enabled" defaultChecked={policy.enabled} className="mt-1 h-4 w-4" />
              <span>
                <span className="block text-[14px] font-semibold text-lien-heading">Hiển thị và áp dụng chính sách</span>
                <span className="block text-[12px] text-lien-muted">Khi bật: bảng phí trên trang sản phẩm ghi &quot;Miễn phí trên …&quot;, trang thanh toán trừ dòng &quot;Shop hỗ trợ phí vận chuyển&quot; khi đơn đạt mức. Khi tắt: không hiện gì, khách trả đủ phí theo hãng.</span>
              </span>
            </label>
            <div>
              <label className={adminLabel} htmlFor="title">
                Tiêu đề hiện cho khách
              </label>
              <input id="title" name="title" defaultValue={policy.title} className={adminInput} />
            </div>
            <div>
              <label className={adminLabel} htmlFor="text">
                Nội dung mô tả
              </label>
              <textarea id="text" name="text" rows={3} defaultValue={policy.text} className={adminInput} />
            </div>
            <div>
              <p className={adminLabel}>Đơn từ (đ) để được hỗ trợ phí — để trống vùng nào thì vùng đó không hỗ trợ</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {(Object.keys(REGION_LABEL) as VnRegion[]).map((r) => (
                  <label key={r} className="block text-[12px] text-[#6b7280]">
                    {REGION_LABEL[r]}
                    <input name={`t_${r}`} inputMode="numeric" defaultValue={policy.thresholds[r] ? formatAmount(policy.thresholds[r]!) : ""} placeholder="không hỗ trợ" className={`${adminInput} mt-0.5`} />
                  </label>
                ))}
              </div>
            </div>
            <button type="submit" className={btnPrimary}>
              <Fa name="check" /> Lưu chính sách
            </button>
          </form>
        </Card>
        <div className="space-y-3">
          <p className="m-0 text-[13px] font-semibold text-lien-heading">Khách sẽ thấy (khi bật):</p>
          {policy.enabled ? <ShipPolicyCard policy={policy} /> : <ShipPolicyCard policy={{ ...policy, enabled: true }} className="opacity-60" />}
          <p className="m-0 text-[12px] leading-5 text-lien-muted">Mức hỗ trợ = toàn bộ phí giao nội địa của hãng khách chọn (kể cả phụ phí hàng lỏng / cồng kềnh). Không áp dụng cho phí trả cho shipper khi nhận hàng.</p>
        </div>
      </div>
    </>
  );
}
