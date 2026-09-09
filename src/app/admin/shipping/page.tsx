import Link from "next/link";
import { deleteCarrierAction, deleteMethodAction, deleteZoneAction, saveCarrierAction, saveMethodAction, saveNotesAction, savePickupAction, savePricingAction, saveZoneAction } from "@/app/admin/shipping/actions";
import { adminInput, adminLabel, btnDanger, btnPrimary, btnSecondary, Card, Flash, PageHeader } from "@/components/sites/lienstore/admin/ui";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { ShippingTable } from "@/components/sites/lienstore/shop/ShippingTable";
import { requireAdmin } from "@/lib/auth";
import { getJpyRate, getOrderLegs, getOrders, getPickupAddress, getShippingCarriers, getShippingMethods, getShippingNotes, getShippingPricingMode } from "@/lib/db";
import { buildQuoteConfig } from "@/lib/shipping";
import { OrderLegCell } from "@/components/sites/lienstore/admin/OrderLegsEditor";
import { formatAmount } from "@/lib/format";
import { isShippingLeg, LEG_LABEL, SHIPPING_LEGS, type ShippingLeg } from "@/lib/shipping";
import { cn } from "@/lib/utils";
import type { ShippingCarrier, ShippingMethod, ShippingZone } from "@/types/shop";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const amt = (n: number | null) => (n === null ? "" : formatAmount(n));

const cell = "border-b border-[#f0f0f0] px-2 py-2 align-top";
const small = `${adminInput} !px-2 !py-1.5 !text-[13px]`;
const LEG_ICON: Record<ShippingLeg, "cube" | "plane" | "truck"> = { jp_domestic: "cube", jp_vn: "plane", vn_domestic: "truck" };

/** Carriers serving a leg (a carrier may serve several). */
const carriersFor = (carriers: ShippingCarrier[], leg: ShippingLeg) => carriers.filter((c) => c.legs.includes(leg));

function CarrierSelect({ carriers, value, formId }: { carriers: ShippingCarrier[]; value: number | null; formId?: string }) {
  return (
    <select name="carrierId" form={formId} defaultValue={value ?? ""} className={adminInput}>
      <option value="">— Chưa chọn —</option>
      {carriers.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}

function ZoneRow({ zone, methodId, currency, tab }: { zone: ShippingZone | null; methodId: number; currency: string; tab: string }) {
  const id = zone ? `z${zone.id}` : `new-${methodId}`;
  const isNew = zone === null;
  return (
    <tr className={isNew ? "bg-[#f9fafb]" : undefined}>
      <td className={cell}>
        <input type="number" name="position" form={id} defaultValue={zone?.position ?? 0} className={`${small} w-16`} aria-label="Thứ tự" />
      </td>
      <td className={cell}>
        <input name="name" form={id} defaultValue={zone?.name ?? ""} placeholder={isNew ? "VD: 4–5 kg, Miền Bắc, Đường bay…" : ""} required className={`${small} min-w-[140px]`} aria-label="Tên cột" />
      </td>
      <td className={cell}>
        <div className="flex items-center gap-1">
          <input name="fee" form={id} defaultValue={zone ? formatAmount(zone.fee) : ""} inputMode="numeric" placeholder="0" className={`${small} w-[110px]`} aria-label="Phí" />
          <span className="text-[12px] text-lien-muted">{currency}</span>
          <input name="unit" form={id} defaultValue={zone?.unit ?? ""} placeholder="/kg" className={`${small} w-16`} aria-label="Đơn vị" title="Để trống = phí cho cả đơn; /kg = theo từng kg (dùng để ước tính theo khối lượng sản phẩm)" />
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
        <textarea name="areas" form={id} defaultValue={zone?.areas ?? ""} rows={2} placeholder="Khu vực / điều kiện (VD: chỉ nhận từ 4 kg)" className={`${small} min-w-[200px]`} aria-label="Khu vực" />
      </td>
      <td className={cell}>
        <input name="eta" form={id} defaultValue={zone?.eta ?? ""} placeholder="5–7 ngày" className={`${small} w-[120px]`} aria-label="Thời gian" />
      </td>
      <td className={`${cell} text-center`}>
        <input type="checkbox" name="active" form={id} defaultChecked={zone?.active ?? true} aria-label="Hiển thị" className="mt-2 h-4 w-4" />
      </td>
      <td className={`${cell} whitespace-nowrap`}>
        <form id={id} action={saveZoneAction} className="inline">
          <input type="hidden" name="methodId" value={methodId} />
          <input type="hidden" name="backTab" value={tab} />
          {zone ? <input type="hidden" name="id" value={zone.id} /> : null}
          <button type="submit" className={`${isNew ? btnPrimary : btnSecondary} !px-2.5 !py-1.5 !text-[13px]`} title={isNew ? "Thêm cột" : "Lưu"}>
            <Fa name={isNew ? "plus" : "check"} /> {isNew ? "Thêm" : "Lưu"}
          </button>
        </form>
        {zone ? (
          <form action={deleteZoneAction} className="ml-1 inline">
            <input type="hidden" name="id" value={zone.id} />
            <input type="hidden" name="backTab" value={tab} />
            <button type="submit" className={`${btnDanger} !px-2.5 !py-1.5 !text-[13px]`} title="Xoá cột">
              <Fa name="trash" />
            </button>
          </form>
        ) : null}
      </td>
    </tr>
  );
}

function MethodCard({ m, carriers, tab }: { m: ShippingMethod; carriers: ShippingCarrier[]; tab: string }) {
  const fid = `m${m.id}`;
  return (
    <div id={`method-${m.id}`}>
      <Card
        title={`${m.name}${m.carrierName ? ` · ${m.carrierName}` : ""}${m.active ? "" : " (đang ẩn)"}`}
        actions={
          <form action={deleteMethodAction}>
            <input type="hidden" name="id" value={m.id} />
            <input type="hidden" name="backTab" value={tab} />
            <button type="submit" className={`${btnDanger} !px-2.5 !py-1.5 !text-[13px]`} title="Xoá phương thức và toàn bộ cột">
              <Fa name="trash" /> Xoá phương thức
            </button>
          </form>
        }
      >
        <form id={fid} action={saveMethodAction} className="mb-5 grid gap-3 md:grid-cols-3">
          <input type="hidden" name="id" value={m.id} />
          <input type="hidden" name="backTab" value={tab} />
          <div>
            <label className={adminLabel}>Tên phương thức</label>
            <input name="name" defaultValue={m.name} required className={adminInput} />
          </div>
          <div>
            <label className={adminLabel}>Chặng</label>
            <select name="leg" defaultValue={m.leg} className={adminInput}>
              {SHIPPING_LEGS.map((l) => (
                <option key={l.key} value={l.key}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={adminLabel}>Đơn vị vận chuyển ({LEG_LABEL[m.leg]})</label>
            <CarrierSelect carriers={carriersFor(carriers, m.leg)} value={m.carrierId} />
          </div>
          <div className="md:col-span-2">
            <label className={adminLabel}>Mô tả ngắn (hiện dưới tên bảng)</label>
            <input name="description" defaultValue={m.description} className={adminInput} />
          </div>
          <div>
            <label className={adminLabel}>Nhãn dòng phụ phí (để trống = không có)</label>
            <input name="extraLabel" defaultValue={m.extraLabel} placeholder="VD: Hàng lỏng / cồng kềnh" className={adminInput} />
          </div>
          <div className="md:col-span-2">
            <label className={adminLabel}>Kho / địa điểm nhận & giao (hiện cho khách)</label>
            <textarea name="warehouse" defaultValue={m.warehouse} rows={2} placeholder="VD: Kho Nhật: Chiba-ken, Tomisato-shi, Nanae 880-34 (〒286-0221) · Kho VN: Hà Nội" className={adminInput} />
          </div>
          <div>
            <label className={adminLabel}>Lưu ý riêng của phương thức (mỗi dòng một ý)</label>
            <textarea name="notes" defaultValue={m.notes} rows={2} placeholder="VD: làm tròn lên 1 kg; chỉ nhận từ 4 kg; không phụ phí chất lỏng" className={adminInput} />
          </div>
          <div className="flex flex-wrap items-end gap-4 md:col-span-3">
            <label className="mb-2 inline-flex items-center gap-2 text-[14px]">
              <input type="checkbox" name="includesBothEnds" defaultChecked={m.includesBothEnds} className="h-4 w-4" /> Giá đã gồm 2 đầu (ship nội địa Nhật + Việt)
            </label>
            <label className="mb-2 inline-flex items-center gap-2 text-[14px]">
              <input type="checkbox" name="homeDelivery" defaultChecked={m.homeDelivery} className="h-4 w-4" /> Giao tận nhà
            </label>
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

        <h3 className="mb-2 text-[14px] font-semibold text-lien-heading">Cột của bảng (khu vực hoặc bậc cân nặng)</h3>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-[13px]">
            <thead>
              <tr className="text-[12px] font-semibold uppercase tracking-wide text-[#6b7280]">
                <th className="px-2 py-2">#</th>
                <th className="px-2 py-2">Tên cột</th>
                <th className="px-2 py-2">Phí · đơn vị</th>
                <th className="px-2 py-2">Miễn phí trên</th>
                <th className="px-2 py-2">{m.extraLabel || "Phụ phí"} · miễn trên</th>
                <th className="px-2 py-2">Khu vực / điều kiện</th>
                <th className="px-2 py-2">Thời gian</th>
                <th className="px-2 py-2 text-center">Hiện</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {m.zones.map((z) => (
                <ZoneRow key={z.id} zone={z} methodId={m.id} currency={m.currency} tab={tab} />
              ))}
              <ZoneRow zone={null} methodId={m.id} currency={m.currency} tab={tab} />
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[12px] text-lien-muted">Đơn vị &quot;/kg&quot; → phí nhân với số kg (làm tròn lên) của sản phẩm để ước tính ngay trên trang sản phẩm; để trống = phí cho cả đơn.</p>
      </Card>
    </div>
  );
}

function AddMethodCard({ leg, carriers, position, tab }: { leg: ShippingLeg | null; carriers: ShippingCarrier[]; position: number; tab: string }) {
  const list = leg ? carriersFor(carriers, leg) : carriers;
  return (
    <details className="group rounded-lg border border-dashed border-[#d1d5db] bg-white">
      <summary className="flex cursor-pointer items-center gap-2 px-5 py-3 text-[14px] font-semibold text-lien-blue select-none">
        <Fa name="plus" /> Thêm phương thức vận chuyển{leg ? ` · ${LEG_LABEL[leg]}` : ""}
      </summary>
      <div className="border-t border-[#e5e7eb] p-5">
      <form action={saveMethodAction} className="grid gap-3 md:grid-cols-3">
        <input type="hidden" name="backTab" value={tab} />
        <div>
          <label className={adminLabel}>Tên phương thức *</label>
          <input name="name" required placeholder={leg === "jp_domestic" ? "VD: Yamato tới kho Chiba, Gom tại nhà" : leg === "vn_domestic" ? "VD: Viettel Post, Bưu điện" : "VD: EMS Kiến Express, Xách tay, Đường biển"} className={adminInput} />
        </div>
        <div>
          <label className={adminLabel}>Chặng *</label>
          {leg ? (
            <>
              <input type="hidden" name="leg" value={leg} />
              <input value={LEG_LABEL[leg]} readOnly className={cn(adminInput, "bg-[#f9fafb] text-lien-muted")} />
            </>
          ) : (
            <select name="leg" defaultValue="jp_vn" className={adminInput}>
              {SHIPPING_LEGS.map((l) => (
                <option key={l.key} value={l.key}>
                  {l.label}
                </option>
              ))}
            </select>
          )}
        </div>
        <div>
          <label className={adminLabel}>Đơn vị vận chuyển</label>
          <CarrierSelect carriers={list} value={null} />
          <input name="newCarrier" placeholder="…hoặc gõ tên đơn vị mới" className={cn(adminInput, "mt-2")} />
        </div>
        <div className="md:col-span-2">
          <label className={adminLabel}>Mô tả ngắn</label>
          <input name="description" className={adminInput} />
        </div>
        <div>
          <label className={adminLabel}>Nhãn dòng phụ phí (tuỳ chọn)</label>
          <input name="extraLabel" placeholder="VD: Hàng lỏng / cồng kềnh" className={adminInput} />
        </div>
        <div className="md:col-span-2">
          <label className={adminLabel}>Kho / địa điểm nhận & giao</label>
          <textarea name="warehouse" rows={2} className={adminInput} />
        </div>
        <div>
          <label className={adminLabel}>Lưu ý riêng (mỗi dòng một ý)</label>
          <textarea name="notes" rows={2} className={adminInput} />
        </div>
        <div className="flex flex-wrap items-center gap-4 md:col-span-3">
          <label className="inline-flex items-center gap-2 text-[14px]">
            <input type="checkbox" name="includesBothEnds" className="h-4 w-4" /> Giá đã gồm 2 đầu
          </label>
          <label className="inline-flex items-center gap-2 text-[14px]">
            <input type="checkbox" name="homeDelivery" defaultChecked={leg !== "jp_vn"} className="h-4 w-4" /> Giao tận nhà
          </label>
          <input type="hidden" name="currency" value="đ" />
          <input type="hidden" name="position" value={position} />
          <input type="hidden" name="active" value="on" />
          <button type="submit" className={btnPrimary}>
            <Fa name="plus" /> Thêm phương thức
          </button>
        </div>
      </form>
      </div>
    </details>
  );
}

function CarriersCard({ leg, carriers, methods, tab }: { leg: ShippingLeg | null; carriers: ShippingCarrier[]; methods: ShippingMethod[]; tab: string }) {
  const list = leg ? carriersFor(carriers, leg) : carriers;
  return (
    <div id="carriers">
      <Card title={`Đơn vị vận chuyển${leg ? ` · ${LEG_LABEL[leg]}` : ""}`}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-[13px]">
            <thead>
              <tr className="text-[12px] font-semibold uppercase tracking-wide text-[#6b7280]">
                <th className="px-2 py-2">Tên</th>
                <th className="px-2 py-2">Điện thoại</th>
                <th className="px-2 py-2">Website</th>
                <th className="px-2 py-2">Ghi chú</th>
                <th className="px-2 py-2">Chặng</th>
                <th className="px-2 py-2">Đang dùng</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {list.map((c) => {
                const fid = `c${c.id}`;
                const used = methods.filter((m) => m.carrierId === c.id).length;
                return (
                  <tr key={c.id}>
                    <td className={cell}>
                      <input name="name" form={fid} defaultValue={c.name} required className={`${small} min-w-[170px]`} />
                    </td>
                    <td className={cell}>
                      <input name="phone" form={fid} defaultValue={c.phone} className={`${small} w-[130px]`} />
                    </td>
                    <td className={cell}>
                      <input name="website" form={fid} defaultValue={c.website} className={`${small} min-w-[170px]`} />
                    </td>
                    <td className={cell}>
                      <input name="note" form={fid} defaultValue={c.note} className={`${small} min-w-[200px]`} />
                    </td>
                    <td className={`${cell} whitespace-nowrap`}>
                      {SHIPPING_LEGS.map((l) => (
                        <label key={l.key} className="mr-2 inline-flex items-center gap-1 text-[12px]" title={l.label}>
                          <input type="checkbox" name="legs" value={l.key} form={fid} defaultChecked={c.legs.includes(l.key)} className="h-3.5 w-3.5" />
                          <Fa name={LEG_ICON[l.key]} className="text-lien-muted" />
                        </label>
                      ))}
                    </td>
                    <td className={`${cell} text-[12px] text-lien-muted`}>{used ? `${used} phương thức` : "—"}</td>
                    <td className={`${cell} whitespace-nowrap`}>
                      <form id={fid} action={saveCarrierAction} className="inline">
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="backTab" value={tab} />
                        <button type="submit" className={`${btnSecondary} !px-2.5 !py-1.5 !text-[13px]`}>
                          <Fa name="check" /> Lưu
                        </button>
                      </form>
                      <form action={deleteCarrierAction} className="ml-1 inline">
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="backTab" value={tab} />
                        <button type="submit" className={`${btnDanger} !px-2.5 !py-1.5 !text-[13px]`} title="Xoá đơn vị">
                          <Fa name="trash" />
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <details className="mt-3 rounded-md border border-dashed border-[#d1d5db]">
          <summary className="cursor-pointer px-4 py-2 text-[13px] font-semibold text-lien-blue select-none">
            <Fa name="plus" /> Thêm đơn vị vận chuyển
          </summary>
          <form id="new-carrier" action={saveCarrierAction} className="grid gap-3 border-t border-[#e5e7eb] p-4 md:grid-cols-[1fr_140px_1fr_1fr_auto_auto] md:items-end">
            <input type="hidden" name="backTab" value={tab} />
            <div>
              <label className={adminLabel}>Tên đơn vị *</label>
              <input name="name" required placeholder="VD: Sagawa, Bưu điện…" className={adminInput} />
            </div>
            <div>
              <label className={adminLabel}>Điện thoại</label>
              <input name="phone" className={adminInput} />
            </div>
            <div>
              <label className={adminLabel}>Website</label>
              <input name="website" placeholder="https://…" className={adminInput} />
            </div>
            <div>
              <label className={adminLabel}>Ghi chú</label>
              <input name="note" className={adminInput} />
            </div>
            <div className="whitespace-nowrap">
              <label className={adminLabel}>Chặng</label>
              {SHIPPING_LEGS.map((l) => (
                <label key={l.key} className="mr-2 inline-flex items-center gap-1 text-[12px]" title={l.label}>
                  <input type="checkbox" name="legs" value={l.key} defaultChecked={leg ? l.key === leg : l.key === "jp_vn"} className="h-3.5 w-3.5" />
                  <Fa name={LEG_ICON[l.key]} className="text-lien-muted" />
                </label>
              ))}
            </div>
            <button type="submit" className={btnPrimary}>
              <Fa name="plus" /> Thêm
            </button>
          </form>
        </details>
        <p className="mt-2 text-[12px] text-lien-muted">
          Cột &quot;Chặng&quot;: <Fa name="cube" /> nội địa Nhật · <Fa name="plane" /> Nhật → Việt Nam · <Fa name="truck" /> nội địa Việt Nam. Một đơn vị có thể phục vụ nhiều chặng (VD Japan Post vừa gửi nội địa Nhật vừa EMS quốc tế).
        </p>
      </Card>
    </div>
  );
}

export default async function AdminShipping({ searchParams }: Props) {
  await requireAdmin("shipping");
  const sp = await searchParams;
  const saved = first(sp.saved);
  const error = first(sp.error);
  const [methods, notes, carriers, pickupAddress, allOrders, pricingMode, jpyRate] = await Promise.all([getShippingMethods(false), getShippingNotes(), getShippingCarriers(), getPickupAddress(), getOrders(), getShippingPricingMode(), getJpyRate()]);
  const quoteCfg = buildQuoteConfig(methods, pricingMode, jpyRate);
  const orders = allOrders.filter((o) => o.status !== "cancelled").slice(0, 60);
  const legMap = await getOrderLegs(orders.map((o) => o.id));
  const visible = methods.filter((m) => m.active).map((m) => ({ ...m, zones: m.zones.filter((z) => z.active) }));
  const tabParam = first(sp.leg);
  const tab: ShippingLeg | "display" | "" = tabParam === "display" ? "display" : isShippingLeg(tabParam) ? tabParam : "";
  const tabBtn = (active: boolean) => cn("rounded-md border px-3 py-1.5 text-[13px] no-underline", active ? "border-lien-blue bg-lien-blue text-white" : "border-[#d1d5db] bg-white text-lien-text hover:bg-[#f3f4f6]");

  return (
    <>
      <PageHeader
        title="Vận chuyển"
        subtitle="Ba chặng: nội địa Nhật → Nhật–Việt → nội địa Việt Nam. Mỗi phương thức là một bảng; mỗi cột là một khu vực hoặc bậc cân nặng."
        actions={
          <a href="/van-chuyen/" target="_blank" rel="noreferrer" className={btnSecondary}>
            <Fa name="external-link" /> Xem trang vận chuyển
          </a>
        }
      />
      {saved ? <Flash>{saved}</Flash> : null}
      {error ? <Flash kind="error">{error}</Flash> : null}

      <div className="mb-6 flex flex-wrap gap-2">
        <Link href="/admin/shipping/" className={tabBtn(tab === "")}>
          <Fa name="list" className="mr-1" />
          Đơn hàng
        </Link>
        {SHIPPING_LEGS.map((l) => (
          <Link key={l.key} href={`/admin/shipping/?leg=${l.key}`} className={tabBtn(tab === l.key)}>
            <Fa name={LEG_ICON[l.key]} className="mr-1" />
            {l.label} <span className={tab === l.key ? "text-white/80" : "text-lien-muted"}>({methods.filter((m) => m.leg === l.key).length})</span>
          </Link>
        ))}
        <Link href="/admin/shipping/?leg=display" className={tabBtn(tab === "display")}>
          <Fa name="eye" className="mr-1" />
          Hiển thị cho khách
        </Link>
      </div>

      {tab === "display" ? (
        <div className="space-y-6">
          <div id="pricing">
            <Card title="Cách tính phí vận chuyển ở trang thanh toán">
              <form action={savePricingAction} className="grid gap-4 md:grid-cols-[1fr_200px_auto] md:items-end">
                <div className="space-y-2">
                  <label className="flex items-start gap-2 text-[14px]">
                    <input type="radio" name="mode" value="per_order" defaultChecked={pricingMode === "per_order"} className="mt-1 h-4 w-4" />
                    <span>
                      <strong>Tính riêng 3 chặng theo đơn</strong> — khách trả ship nội địa Nhật + Nhật → Việt Nam + giao nội địa Việt Nam, theo cân tính phí của đơn (đã nhân hệ số an toàn). Chọn &quot;Nhận tại kho&quot; thì bỏ chặng nội địa Việt Nam.
                    </span>
                  </label>
                  <label className="flex items-start gap-2 text-[14px]">
                    <input type="radio" name="mode" value="included" defaultChecked={pricingMode === "included"} className="mt-1 h-4 w-4" />
                    <span>
                      <strong>Giá sản phẩm đã gồm ship về Việt Nam</strong> — khách chỉ trả phí giao nội địa Việt Nam.
                    </span>
                  </label>
                </div>
                <div>
                  <label className={adminLabel}>Tỷ giá 1¥ = ? đ</label>
                  <input name="jpyRate" inputMode="decimal" defaultValue={jpyRate} className={adminInput} />
                </div>
                <button type="submit" className={btnPrimary}>
                  <Fa name="check" /> Lưu
                </button>
              </form>
              <p className="mt-3 text-[12px] leading-5 text-lien-muted">
                Phương thức dùng để báo giá = phương thức <strong>đang bật, đứng đầu</strong> mỗi chặng (kéo vị trí trong tab chặng): nội địa Nhật →{" "}
                <strong>{quoteCfg.jpDomestic ? quoteCfg.jpDomestic.name : "chưa có"}</strong>, Nhật → Việt Nam → <strong>{quoteCfg.jpVn ? quoteCfg.jpVn.name : "chưa có"}</strong>. Cột chọn theo mốc cân (&quot;≤ 5 kg&quot;, &quot;Size 80 (≤5 kg)&quot;) hoặc nhân theo /kg; giá ¥ đổi sang đ theo tỷ giá trên.
              </p>
            </Card>
          </div>
          <div id="notes">
            <Card title="Lưu ý chung về vận chuyển (hiện dưới các bảng; mỗi dòng một gạch đầu dòng)">
              <form action={saveNotesAction} className="space-y-3">
                <textarea name="notes" rows={6} defaultValue={notes.join("\n")} className={adminInput} />
                <button type="submit" className={btnPrimary}>
                  <Fa name="check" /> Lưu lưu ý
                </button>
              </form>
            </Card>
          </div>
          <Card title="Xem trước — đúng như tab “Chi phí vận chuyển” trên trang sản phẩm và trang /van-chuyen/">
            <ShippingTable methods={visible} notes={notes} />
            <p className="mt-3 text-[12px] text-lien-muted">Chỉ phương thức và cột đang bật &quot;Hiển thị&quot; mới xuất hiện. Sửa nội dung ở tab từng chặng.</p>
          </Card>
        </div>
      ) : !tab ? (
        <Card title={`Đơn hàng & vận chuyển theo 3 chặng (${orders.length} đơn gần nhất, trừ đơn đã huỷ)`}>
          <p className="mb-4 text-[13px] text-lien-muted">
            Mỗi đơn một dòng, mỗi chặng một ô: chọn phương thức · cột, phí (để trống = tự tính theo cột và khối lượng đơn), mã vận đơn, ghi chú, rồi bấm ✓. Ô chặng nội địa Việt Nam có thể áp phí vào tổng tiền khách trả.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-[13px]">
              <thead>
                <tr className="text-[12px] font-semibold uppercase tracking-wide text-[#6b7280]">
                  <th className="px-2 py-2">Đơn</th>
                  {SHIPPING_LEGS.map((l) => (
                    <th key={l.key} className="px-2 py-2">
                      <Fa name={LEG_ICON[l.key]} className="mr-1" />
                      {l.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const legs = legMap.get(o.id) ?? [];
                  return (
                    <tr key={o.id} id={`order-${o.id}`} className="align-top odd:bg-white even:bg-[#fafafa]">
                      <td className="border-b border-[#f0f0f0] px-2 py-3">
                        <Link href={`/admin/orders/${o.id}/`} className="font-semibold text-lien-blue hover:underline">
                          #{o.number}
                        </Link>
                        <div className="text-[12px] text-lien-muted">
                          {o.customer.lastName} {o.customer.firstName}
                          <br />
                          {o.items.reduce((n, it) => n + it.quantity, 0)} sp · {formatAmount(o.total)}đ
                          <br />
                          {o.delivery === "pickup" ? "Nhận tại kho" : o.shippingLabel || "Giao tận nhà"} · phí khách {formatAmount(o.shippingFee)}đ
                        </div>
                      </td>
                      {SHIPPING_LEGS.map((l) => (
                        <td key={l.key} className="border-b border-[#f0f0f0] px-2 py-3">
                          <OrderLegCell order={o} leg={l.key} current={legs.find((x) => x.leg === l.key)} methods={methods} back="/admin/shipping/" />
                        </td>
                      ))}
                    </tr>
                  );
                })}
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-2 py-6 text-center text-lien-muted">
                      Chưa có đơn hàng.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <div className="space-y-10">
          {SHIPPING_LEGS.filter((l) => l.key === tab).map((leg) => {
            const list = methods.filter((m) => m.leg === leg.key);
            return (
              <section key={leg.key} id={`leg-${leg.key}`} className="space-y-6">
                <div>
                  <h2 className="mb-1 text-[20px] font-bold text-lien-heading">
                    <Fa name={LEG_ICON[leg.key]} className="mr-2 text-lien-blue" />
                    {leg.label} <span className="text-[14px] font-normal text-lien-muted">({list.length} phương thức)</span>
                  </h2>
                  <p className="text-[13px] text-lien-muted">{leg.description}</p>
                </div>
                {list.map((m) => (
                  <MethodCard key={m.id} m={m} carriers={carriers} tab={tab} />
                ))}
                {list.length === 0 ? <p className="rounded-md border border-dashed border-[#d1d5db] p-4 text-[13px] text-lien-muted">Chưa có phương thức cho chặng này — thêm ở khung bên dưới.</p> : null}
                {tab ? (
                  <>
                    <AddMethodCard leg={leg.key} carriers={carriers} position={methods.length + 1} tab={tab} />
                    {leg.key === "vn_domestic" ? (
                      <div id="pickup">
                        <Card title="Nhận tại kho (tuỳ chọn miễn phí ở trang thanh toán)">
                          <form action={savePickupAction} className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                            <div>
                              <label className={adminLabel}>Địa chỉ kho / điểm nhận hàng hiện cho khách</label>
                              <textarea name="pickupAddress" rows={2} defaultValue={pickupAddress} className={adminInput} />
                            </div>
                            <button type="submit" className={btnPrimary}>
                              <Fa name="check" /> Lưu
                            </button>
                          </form>
                          <p className="mt-2 text-[12px] text-lien-muted">Khách chọn &quot;Nhận tại kho&quot; thì không tính phí; chọn &quot;Giao tận nhà&quot; thì phí lấy theo cột của các phương thức chặng này đang hiển thị.</p>
                        </Card>
                      </div>
                    ) : null}
                    <CarriersCard leg={leg.key} carriers={carriers} methods={methods} tab={tab} />
                  </>
                ) : null}
              </section>
            );
          })}

        </div>
      )}
    </>
  );
}
