import { deleteMethodAction, deleteZoneAction, saveMethodAction, saveNotesAction, saveZoneAction } from "@/app/admin/shipping/actions";
import { adminInput, adminLabel, btnDanger, btnPrimary, btnSecondary, Card, Flash, PageHeader } from "@/components/sites/lienstore/admin/ui";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { ShippingTable } from "@/components/sites/lienstore/shop/ShippingTable";
import { requireAdmin } from "@/lib/auth";
import { getShippingMethods, getShippingNotes } from "@/lib/db";
import { formatAmount } from "@/lib/format";
import type { ShippingMethod, ShippingZone } from "@/types/shop";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const amt = (n: number | null) => (n === null ? "" : formatAmount(n));

const cell = "border-b border-[#f0f0f0] px-2 py-2 align-top";
const small = `${adminInput} !px-2 !py-1.5 !text-[13px]`;

function ZoneRow({ zone, methodId, currency }: { zone: ShippingZone | null; methodId: number; currency: string }) {
  const id = zone ? `z${zone.id}` : `new-${methodId}`;
  const isNew = zone === null;
  return (
    <tr className={isNew ? "bg-[#f9fafb]" : undefined}>
      <td className={cell}>
        <input type="number" name="position" form={id} defaultValue={zone?.position ?? 0} className={`${small} w-16`} aria-label="Thứ tự" />
      </td>
      <td className={cell}>
        <input name="name" form={id} defaultValue={zone?.name ?? ""} placeholder={isNew ? "Tên khu vực mới…" : ""} required className={`${small} min-w-[130px]`} aria-label="Tên khu vực" />
      </td>
      <td className={cell}>
        <div className="flex items-center gap-1">
          <input name="fee" form={id} defaultValue={zone ? formatAmount(zone.fee) : ""} inputMode="numeric" placeholder="0" className={`${small} w-[110px]`} aria-label="Phí thường" />
          <span className="text-[12px] text-lien-muted">{currency}</span>
          <input name="unit" form={id} defaultValue={zone?.unit ?? ""} placeholder="/kg" className={`${small} w-16`} aria-label="Đơn vị" />
        </div>
      </td>
      <td className={cell}>
        <input name="freeOver" form={id} defaultValue={amt(zone?.freeOver ?? null)} inputMode="numeric" placeholder="—" className={`${small} w-[110px]`} aria-label="Miễn phí trên" />
      </td>
      <td className={cell}>
        <div className="flex items-center gap-1">
          <input name="extraFee" form={id} defaultValue={amt(zone?.extraFee ?? null)} inputMode="numeric" placeholder="—" className={`${small} w-[100px]`} aria-label="Phụ phí" />
          <input name="extraFreeOver" form={id} defaultValue={amt(zone?.extraFreeOver ?? null)} inputMode="numeric" placeholder="miễn trên" className={`${small} w-[100px]`} aria-label="Phụ phí miễn trên" />
        </div>
      </td>
      <td className={cell}>
        <textarea name="areas" form={id} defaultValue={zone?.areas ?? ""} rows={2} placeholder="Tỉnh / thành phố…" className={`${small} min-w-[200px]`} aria-label="Khu vực" />
      </td>
      <td className={cell}>
        <input name="eta" form={id} defaultValue={zone?.eta ?? ""} placeholder="1–2 ngày" className={`${small} w-[120px]`} aria-label="Thời gian" />
      </td>
      <td className={`${cell} text-center`}>
        <input type="checkbox" name="active" form={id} defaultChecked={zone?.active ?? true} aria-label="Hiển thị" className="mt-2 h-4 w-4" />
      </td>
      <td className={`${cell} whitespace-nowrap`}>
        <form id={id} action={saveZoneAction} className="inline">
          <input type="hidden" name="methodId" value={methodId} />
          {zone ? <input type="hidden" name="id" value={zone.id} /> : null}
          <button type="submit" className={`${isNew ? btnPrimary : btnSecondary} !px-2.5 !py-1.5 !text-[13px]`} title={isNew ? "Thêm khu vực" : "Lưu"}>
            <Fa name={isNew ? "plus" : "check"} /> {isNew ? "Thêm" : "Lưu"}
          </button>
        </form>
        {zone ? (
          <form action={deleteZoneAction} className="ml-1 inline">
            <input type="hidden" name="id" value={zone.id} />
            <button type="submit" className={`${btnDanger} !px-2.5 !py-1.5 !text-[13px]`} title="Xoá khu vực">
              <Fa name="trash" />
            </button>
          </form>
        ) : null}
      </td>
    </tr>
  );
}

function MethodCard({ m }: { m: ShippingMethod }) {
  const fid = `m${m.id}`;
  return (
    <Card
      title={`${m.name}${m.active ? "" : " (đang ẩn)"}`}
      actions={
        <form action={deleteMethodAction}>
          <input type="hidden" name="id" value={m.id} />
          <button type="submit" className={`${btnDanger} !px-2.5 !py-1.5 !text-[13px]`} title="Xoá phương thức và toàn bộ khu vực">
            <Fa name="trash" /> Xoá phương thức
          </button>
        </form>
      }
    >
      <form id={fid} action={saveMethodAction} className="mb-5 grid gap-3 md:grid-cols-[1fr_1fr]">
        <input type="hidden" name="id" value={m.id} />
        <div>
          <label className={adminLabel}>Tên phương thức</label>
          <input name="name" defaultValue={m.name} required className={adminInput} />
        </div>
        <div>
          <label className={adminLabel}>Nhãn dòng phụ phí (để trống = không có dòng phụ phí)</label>
          <input name="extraLabel" defaultValue={m.extraLabel} placeholder="VD: Hàng lỏng / cồng kềnh, Phí hàng lạnh" className={adminInput} />
        </div>
        <div className="md:col-span-2">
          <label className={adminLabel}>Mô tả ngắn (hiện dưới tên bảng)</label>
          <input name="description" defaultValue={m.description} className={adminInput} />
        </div>
        <div className="flex flex-wrap items-end gap-3 md:col-span-2">
          <div>
            <label className={adminLabel}>Đơn vị tiền</label>
            <input name="currency" defaultValue={m.currency} className={`${adminInput} w-20`} />
          </div>
          <div>
            <label className={adminLabel}>Thứ tự</label>
            <input type="number" name="position" defaultValue={m.position} className={`${adminInput} w-20`} />
          </div>
          <label className="mb-2 inline-flex items-center gap-2 text-[14px]">
            <input type="checkbox" name="active" defaultChecked={m.active} className="h-4 w-4" /> Hiển thị trên web
          </label>
          <button type="submit" className={btnPrimary}>
            <Fa name="check" /> Lưu phương thức
          </button>
        </div>
      </form>

      <h3 className="mb-2 text-[14px] font-semibold text-lien-heading">Khu vực / cột của bảng</h3>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-[13px]">
          <thead>
            <tr className="text-[12px] font-semibold uppercase tracking-wide text-[#6b7280]">
              <th className="px-2 py-2">#</th>
              <th className="px-2 py-2">Tên cột</th>
              <th className="px-2 py-2">Phí thường</th>
              <th className="px-2 py-2">Miễn phí trên</th>
              <th className="px-2 py-2">{m.extraLabel || "Phụ phí"} · miễn trên</th>
              <th className="px-2 py-2">Khu vực</th>
              <th className="px-2 py-2">Thời gian</th>
              <th className="px-2 py-2 text-center">Hiện</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {m.zones.map((z) => (
              <ZoneRow key={z.id} zone={z} methodId={m.id} currency={m.currency} />
            ))}
            <ZoneRow zone={null} methodId={m.id} currency={m.currency} />
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default async function AdminShipping({ searchParams }: Props) {
  await requireAdmin("shipping");
  const sp = await searchParams;
  const saved = first(sp.saved);
  const error = first(sp.error);
  const [methods, notes] = await Promise.all([getShippingMethods(false), getShippingNotes()]);
  const visible = methods.filter((m) => m.active).map((m) => ({ ...m, zones: m.zones.filter((z) => z.active) }));

  return (
    <>
      <PageHeader
        title="Vận chuyển"
        subtitle="Bảng phí hiển thị ở tab “Chi phí vận chuyển” trên trang sản phẩm và trang /van-chuyen/. Mỗi phương thức là một bảng; mỗi khu vực là một cột."
        actions={
          <a href="/van-chuyen/" target="_blank" rel="noreferrer" className={btnSecondary}>
            <Fa name="external-link" /> Xem trang vận chuyển
          </a>
        }
      />
      {saved ? <Flash>{saved}</Flash> : null}
      {error ? <Flash kind="error">{error}</Flash> : null}

      <div className="space-y-6">
        {methods.map((m) => (
          <MethodCard key={m.id} m={m} />
        ))}

        <Card title="Thêm phương thức vận chuyển">
          <form action={saveMethodAction} className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
            <div>
              <label className={adminLabel}>Tên phương thức</label>
              <input name="name" required placeholder="VD: Gửi nhanh EMS" className={adminInput} />
            </div>
            <div>
              <label className={adminLabel}>Nhãn dòng phụ phí (tuỳ chọn)</label>
              <input name="extraLabel" placeholder="VD: Hàng lỏng / cồng kềnh" className={adminInput} />
            </div>
            <div className="flex items-end">
              <input type="hidden" name="currency" value="đ" />
              <input type="hidden" name="position" value={methods.length + 1} />
              <input type="hidden" name="active" value="on" />
              <button type="submit" className={btnPrimary}>
                <Fa name="plus" /> Thêm
              </button>
            </div>
            <div className="md:col-span-3">
              <label className={adminLabel}>Mô tả ngắn</label>
              <input name="description" className={adminInput} />
            </div>
          </form>
        </Card>

        <Card title="Lưu ý về vận chuyển (mỗi dòng một gạch đầu dòng)">
          <form action={saveNotesAction} className="space-y-3">
            <textarea name="notes" rows={6} defaultValue={notes.join("\n")} className={adminInput} />
            <button type="submit" className={btnPrimary}>
              <Fa name="check" /> Lưu lưu ý
            </button>
          </form>
        </Card>

        <Card title="Xem trước (đúng như khách thấy)">
          <ShippingTable methods={visible} notes={notes} />
        </Card>
      </div>
    </>
  );
}
