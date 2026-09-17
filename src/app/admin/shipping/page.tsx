import Link from "next/link";
import { deleteCarrierAction, deleteMethodAction, deleteZoneAction, saveCarrierAction, saveMethodAction, saveNotesAction, savePickupAction, savePricingAction, saveZoneAction } from "@/app/admin/shipping/actions";
import { adminInput, adminLabel, btnDanger, btnPrimary, btnSecondary, Card, Flash, PageHeader } from "@/components/sites/lienstore/admin/ui";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { ShippingTable } from "@/components/sites/lienstore/shop/ShippingTable";
import { requireAdmin } from "@/lib/auth";
import { getJpyRate, getOrderChargeableWeightG, getOrderLegs, getOrders, getPickupAddress, getQuoteDefaults, getShipPolicy, getShippingCarriers, getShippingMethods, getShippingNotes, getShippingPricingMode, listOrderLegEvents, listShipmentBatches } from "@/lib/db";
import { setOrderLegStatusAction } from "@/app/admin/shipping/order-actions";
import { formatDateTime } from "@/lib/format";
import { GOODS_WHERE, goodsWhere, isGoodsWhere, isLegStatus, LEG_STATUS_CLS, LEG_STATUS_LABEL, LEG_STATUSES, type LegStatus } from "@/lib/leg-status";
import type { Order, OrderLeg, OrderLegEvent } from "@/types/shop";
import { BATCH_FORM_ID, BatchShipmentCard } from "@/components/sites/lienstore/admin/BatchShipmentCard";
import { describeShipPolicy } from "@/lib/ship-policy";
import { ShipPolicyCard } from "@/components/sites/lienstore/shop/ShipPolicyCard";
import { buildQuoteConfig } from "@/lib/shipping";
import { CarrierStatusPanel } from "@/components/sites/lienstore/admin/CarrierStatusPanel";
import { OrderLegCell } from "@/components/sites/lienstore/admin/OrderLegsEditor";
import { formatAmount } from "@/lib/format";
import { describeMethodFormula, isJpSubLeg, isShippingLeg, JP_SUB_LEG_LABEL, JP_SUB_LEGS, type JpSubLeg, LEG_LABEL, SHIPPING_LEGS, type ShippingLeg } from "@/lib/shipping";
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
const LEG_ICON: Record<ShippingLeg, "cube" | "plane" | "truck" | "building"> = { jp_domestic: "cube", jp_vn: "plane", vn_transfer: "building", vn_domestic: "truck" };
/** What can be connected per leg (kết quả điều tra API, 09/2026). */
const LEG_API_NOTE: Record<ShippingLeg, string> = {
  jp_domestic: "Kết nối API: Japan Post (ゆうパック), Yamato, Sagawa không có API công khai tính cước cho khách lẻ (Yamato B2/Sagawa e飛伝 cần hợp đồng doanh nghiệp) → tính theo công thức biểu phí cỡ kiện (size = D+R+C) như bảng dưới; hoặc gom nhiều đơn thành một kiện lớn (Gom lô) để giảm phí.",
  jp_vn: "Kết nối API: Kiến Express không có API — cước theo bảng /kg do Kiến báo. Giảm phí bằng cách gom đủ lô (Gom lô ở sheet Đơn hàng) vì cước tính theo tổng cân của chuyến.",
  vn_transfer: "Kết nối API: Viettel Post có Open API đối tác (đặt VTP_TOKEN trên máy chủ là dùng được ngay, không cần sửa code); SPX chỉ cấp API cho tài khoản được ủy quyền → hiện dùng biểu phí công khai. Bảng dưới là công thức đang dùng.",
  vn_domestic: "Kết nối API: GHN (đặt GHN_TOKEN + GHN_SHOP_ID), Viettel Post (VTP_TOKEN); VNPost và SPX theo biểu phí công khai (phiên bản hóa). Cước cho khách được báo theo địa chỉ, không dùng bảng vùng bên dưới để thu tiền.",
};

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
        <div className="flex items-center gap-1" title="Cách tính của hãng: phí trên áp cho N g đầu, mỗi M g tiếp theo cộng thêm X đ. Để trống cả ba = phí cố định (hoặc /kg nếu đơn vị là /kg).">
          <input name="baseG" form={id} type="number" defaultValue={zone?.baseG ?? ""} placeholder="g đầu" className={`${small} w-[70px]`} aria-label="Gram đầu" />
          <span className="text-[11px] text-lien-muted">+</span>
          <input name="stepFee" form={id} defaultValue={amt(zone?.stepFee ?? null)} inputMode="numeric" placeholder="đ" className={`${small} w-[80px]`} aria-label="Phí mỗi nấc" />
          <span className="text-[11px] text-lien-muted">/</span>
          <input name="stepG" form={id} type="number" defaultValue={zone?.stepG ?? ""} placeholder="g" className={`${small} w-[64px]`} aria-label="Gram mỗi nấc" />
        </div>
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
        {m.description ? <p className="m-0 mb-2 text-[13px] text-lien-muted">{m.description}</p> : null}
        <ul className="m-0 mb-3 list-disc space-y-0.5 pl-5 text-[13px] leading-5 text-lien-text" data-testid="method-formula">
          {describeMethodFormula(m).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        {m.warehouse ? <p className="m-0 mb-3 text-[12px] leading-5 text-lien-muted"><Fa name="map-marker" className="mr-1 text-lien-blue" />{m.warehouse}</p> : null}
        <details className="rounded-md border border-[#e5e7eb]">
        <summary className="cursor-pointer select-none px-4 py-2 text-[13px] font-semibold text-lien-blue">
          <Fa name="cog" className="mr-1" /> Sửa phương thức & công thức (bảng cột)
        </summary>
        <div className="border-t border-[#e5e7eb] p-4">
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
            {m.leg === "jp_domestic" ? (
              <select name="sub_leg" defaultValue={m.subLeg || "to_jp_wh"} className={cn(adminInput, "mt-2")} aria-label="Nhánh của chặng ①">
                {JP_SUB_LEGS.map((x) => (
                  <option key={x.key} value={x.key}>
                    {x.label}
                  </option>
                ))}
              </select>
            ) : null}
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
            <textarea name="warehouse" defaultValue={m.warehouse} rows={2} placeholder="VD: Kho Nhật: 〒270-0145 千葉県流山市名都借 827-3 1F (Kiến Express) · Kho VN: Hà Nội" className={adminInput} />
          </div>
          <div>
            <label className={adminLabel}>Lưu ý riêng của phương thức (mỗi dòng một ý)</label>
            <textarea name="notes" defaultValue={m.notes} rows={2} placeholder="VD: làm tròn lên 1 kg; chỉ nhận từ 4 kg; không phụ phí chất lỏng" className={adminInput} />
          </div>
          <div className="flex flex-wrap items-end gap-4 md:col-span-3">
            <label className="mb-2 inline-flex items-center gap-2 text-[14px]">
              <input type="checkbox" name="includesBothEnds" defaultChecked={m.includesBothEnds} className="h-4 w-4" /> Lấy hàng tại kho & giao đến địa chỉ (giá gồm 2 đầu)
            </label>
            <label className="inline-flex items-center gap-2 pb-2.5 text-[14px]" title="Tắt với hãng khoá tính năng khách trả ship khi đơn COD 0đ (Viettel Post)">
              <input type="checkbox" name="codShipFee" defaultChecked={m.codShipFee} className="h-4 w-4" /> Khách được trả phí ship cho shipper khi nhận
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
                <th className="px-2 py-2">Nấc cân (g đầu + đ / g)</th>

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
        </div>
        </details>
      </Card>
    </div>
  );
}

function AddMethodCard({ leg, carriers, position, tab, subLeg = "" }: { leg: ShippingLeg | null; carriers: ShippingCarrier[]; position: number; tab: string; subLeg?: JpSubLeg | "" }) {
  const list = leg ? carriersFor(carriers, leg) : carriers;
  return (
    <details className="group rounded-lg border border-dashed border-[#d1d5db] bg-white">
      <summary className="flex cursor-pointer items-center gap-2 px-5 py-3 text-[14px] font-semibold text-lien-blue select-none">
        <Fa name="plus" /> Thêm phương thức vận chuyển{leg ? ` · ${subLeg ? JP_SUB_LEG_LABEL[subLeg] : LEG_LABEL[leg]}` : ""}
      </summary>
      <div className="border-t border-[#e5e7eb] p-5">
      <form action={saveMethodAction} className="grid gap-3 md:grid-cols-3">
        <input type="hidden" name="backTab" value={tab} />
        {subLeg ? <input type="hidden" name="sub_leg" value={subLeg} /> : null}
        <div>
          <label className={adminLabel}>Tên phương thức *</label>
          <input name="name" required placeholder={leg === "jp_domestic" ? "VD: Yamato tới kho Chiba, Gom tại nhà" : leg === "vn_domestic" ? "VD: Viettel Post, Bưu điện" : leg === "vn_transfer" ? "VD: Kiến Express Hà Nội → kho Thanh Hóa" : "VD: EMS Kiến Express, Xách tay, Đường biển"} className={adminInput} />
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
        <ul className="m-0 list-none divide-y divide-[#f0f0f0] p-0 text-[13px]">
          {list.map((c) => {
            const fid = `c${c.id}`;
            const used = methods.filter((m) => m.carrierId === c.id).length;
            return (
              <li key={c.id} className="py-2" data-testid={`carrier-${c.id}`}>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="font-semibold text-lien-heading">{c.name}</span>
                  {c.phone ? <span className="text-lien-muted"><Fa name="phone" className="mr-1" />{c.phone}</span> : null}
                  {c.website ? (
                    <a href={c.website} target="_blank" rel="noreferrer" className="text-lien-blue hover:underline">
                      <Fa name="external-link" className="mr-1" />
                      {c.website.replace(/^https?:\/\//, "").split("/")[0]}
                    </a>
                  ) : null}
                  <span className="text-lien-muted" title="Chặng phục vụ">
                    {SHIPPING_LEGS.filter((l) => c.legs.includes(l.key)).map((l) => (
                      <Fa key={l.key} name={LEG_ICON[l.key]} className="mr-1" />
                    ))}
                  </span>
                  <span className="text-[12px] text-lien-muted">{used ? `${used} phương thức` : "chưa dùng"}</span>
                  <details className="ml-auto">
                    <summary className="cursor-pointer select-none text-[12px] font-semibold text-lien-blue">
                      <Fa name="cog" className="mr-1" /> Sửa
                    </summary>
                    <form id={fid} action={saveCarrierAction} className="mt-2 grid gap-2 rounded-md border border-[#e5e7eb] bg-[#fafafa] p-3 md:grid-cols-[1fr_130px_1fr_1fr]">
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="backTab" value={tab} />
                      <input name="name" defaultValue={c.name} required className={small} aria-label="Tên" />
                      <input name="phone" defaultValue={c.phone} placeholder="Điện thoại" className={small} aria-label="Điện thoại" />
                      <input name="website" defaultValue={c.website} placeholder="https://…" className={small} aria-label="Website" />
                      <input name="note" defaultValue={c.note} placeholder="Ghi chú" className={small} aria-label="Ghi chú" />
                      <div className="flex flex-wrap items-center gap-3 md:col-span-4">
                        <span className="text-[12px] text-lien-muted">Chặng:</span>
                        {SHIPPING_LEGS.map((l) => (
                          <label key={l.key} className="inline-flex items-center gap-1 text-[12px]" title={l.label}>
                            <input type="checkbox" name="legs" value={l.key} defaultChecked={c.legs.includes(l.key)} className="h-3.5 w-3.5" />
                            <Fa name={LEG_ICON[l.key]} className="text-lien-muted" /> {l.label.replace(/^[①②③④]\s*/, "")}
                          </label>
                        ))}
                        <button type="submit" className={`${btnSecondary} ml-auto !px-2.5 !py-1.5 !text-[13px]`}>
                          <Fa name="check" /> Lưu
                        </button>
                        <button type="submit" form={`del-${fid}`} className={`${btnDanger} !px-2.5 !py-1.5 !text-[13px]`} title="Xoá đơn vị">
                          <Fa name="trash" /> Xoá
                        </button>
                      </div>
                    </form>
                    <form id={`del-${fid}`} action={deleteCarrierAction} className="hidden">
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="backTab" value={tab} />
                    </form>
                  </details>
                </div>
              </li>
            );
          })}
          {list.length === 0 ? <li className="py-2 text-lien-muted">Chưa có đơn vị nào cho chặng này.</li> : null}
        </ul>
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
  const [methods, notes, carriers, pickupAddress, allOrders, pricingMode, jpyRate, quoteDefaults] = await Promise.all([getShippingMethods(false), getShippingNotes(), getShippingCarriers(), getPickupAddress(), getOrders(), getShippingPricingMode(), getJpyRate(), getQuoteDefaults()]);
  const quoteCfg = buildQuoteConfig(methods, pricingMode, jpyRate, quoteDefaults);
  const recent = allOrders.filter((o) => o.status !== "cancelled").slice(0, 60);
  const legMap = await getOrderLegs(recent.map((o) => o.id));
  const eventMap = await listOrderLegEvents(recent.map((o) => o.id));
  // "Hàng đang ở" — derived from the furthest leg that moved; the filter narrows the 4-leg table to one location
  const whereOf = (o: Order) => goodsWhere(legMap.get(o.id) ?? []);
  const whereRaw = first(sp.where);
  const whereFilter = isGoodsWhere(whereRaw) ? whereRaw : "";
  const orders = whereFilter ? recent.filter((o) => whereOf(o) === whereFilter) : recent;
  const stRaw = first(sp.st);
  const legStatusFilter: LegStatus | "" = isLegStatus(stRaw) ? stRaw : "";
  const batches = await listShipmentBatches(20);
  const weightMap = new Map(await Promise.all(orders.map(async (o) => [o.id, await getOrderChargeableWeightG(o.id)] as const)));
  const visible = methods.filter((m) => m.active).map((m) => ({ ...m, zones: m.zones.filter((z) => z.active) }));
  const policy = await getShipPolicy();
  const tabParam = first(sp.leg);
  const tab: ShippingLeg | "display" | "" = tabParam === "display" ? "display" : isShippingLeg(tabParam) ? tabParam : "";
  // ① is split into two sheets (seller → kho Nhật · kho Nhật → kho ĐVVC); methods never classified count as ①a
  const subRaw = first(sp.sub);
  const sub: JpSubLeg | "" = tab === "jp_domestic" && isJpSubLeg(subRaw) ? subRaw : "";
  const backTab = sub ? `${tab}|${sub}` : tab;

  return (
    <>
      <PageHeader
        title="Vận chuyển"
        subtitle="Bốn chặng: nội địa Nhật → Nhật–Việt → kho ĐVVC về kho shop → giao nội địa Việt Nam. Mỗi phương thức là một bảng; mỗi cột là một khu vực hoặc bậc cân nặng."
        actions={
          <a href="/van-chuyen/" target="_blank" rel="noreferrer" className={btnSecondary}>
            <Fa name="external-link" /> Xem trang vận chuyển
          </a>
        }
      />
      {saved ? <Flash>{saved}</Flash> : null}
      {error ? <Flash kind="error">{error}</Flash> : null}

      {tab === "" || tab === "display" ? (
        <h2 className="mb-4 text-[18px] font-bold text-lien-heading">
          <Fa name={tab === "display" ? "eye" : "list"} className="mr-2 text-lien-blue" />
          {tab === "display" ? "Hiển thị cho khách" : "Đơn hàng · 4 chặng"}
          <span className="ml-2 text-[13px] font-normal text-lien-muted">(chuyển sheet ở menu Vận chuyển bên trái)</span>
        </h2>
      ) : null}

      {tab === "display" ? (
        <div className="space-y-6">
          <div id="pricing">
            <Card title="Cách tính phí vận chuyển ở trang thanh toán">
              <form action={savePricingAction} className="grid gap-4 md:grid-cols-[1fr_200px_auto] md:items-end">
                <div className="space-y-2">
                  <label className="flex items-start gap-2 text-[14px]">
                    <input type="radio" name="mode" value="per_order" defaultChecked={pricingMode === "per_order"} className="mt-1 h-4 w-4" />
                    <span>
                      <strong>Tính riêng các chặng theo đơn</strong> — khách trả ship nội địa Nhật + Nhật → Việt Nam + kho ĐVVC về kho shop + giao nội địa Việt Nam, theo cân tính phí của đơn (đã nhân hệ số an toàn). Chọn &quot;Nhận tại kho&quot; thì bỏ chặng nội địa Việt Nam.
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
                <strong>{quoteCfg.jpDomestic ? quoteCfg.jpDomestic.name : "chưa có"}</strong>, Nhật → Việt Nam → <strong>{quoteCfg.jpVn ? quoteCfg.jpVn.name : "chưa có"}</strong>, kho ĐVVC → kho shop → <strong>{quoteCfg.vnTransfer ? quoteCfg.vnTransfer.name : "chưa có"}</strong>. Cột chọn theo mốc cân (&quot;≤ 5 kg&quot;, &quot;Size 80 (≤5 kg)&quot;) hoặc nhân theo /kg; giá ¥ đổi sang đ theo tỷ giá trên.
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
          <Card title="Chính sách hỗ trợ phí vận chuyển (Sales › Chính sách vận chuyển)">
            {policy.enabled ? (
              <p className="m-0 mb-3 text-[13px] text-lien-success">
                <Fa name="check-circle" /> Đang bật: {describeShipPolicy(policy)}.
              </p>
            ) : (
              <p className="m-0 mb-3 text-[13px] text-lien-muted">Đang tắt — khách không thấy dòng &quot;Miễn phí trên…&quot; và trả đủ phí theo hãng.</p>
            )}
            <ShipPolicyCard policy={policy} />
            <p className="mt-3 text-[12px] text-lien-muted">
              Bật / tắt và đổi mức tại{" "}
              <Link href="/admin/promotions/shipping-policy/" className="text-lien-blue hover:underline">
                Sales › Chính sách vận chuyển
              </Link>
              .
            </p>
          </Card>
          <Card title="Xem trước — đúng như tab “Chi phí vận chuyển” trên trang sản phẩm và trang /van-chuyen/">
            <ShippingTable methods={visible} notes={notes} admin policy={policy} />
            <p className="mt-3 text-[12px] text-lien-muted">Chỉ phương thức và cột đang bật &quot;Hiển thị&quot; mới xuất hiện. Sửa nội dung ở tab từng chặng.</p>
          </Card>
        </div>
      ) : !tab ? (
        <>
        <BatchShipmentCard methods={methods} batches={batches} defaultMethodIds={{ jp_domestic: quoteCfg.jpDomestic?.id, jp_vn: quoteCfg.jpVn?.id, vn_transfer: quoteCfg.vnTransfer?.id }} />
        <Card
          title={`Đơn hàng & vận chuyển theo 4 chặng (${orders.length}${whereFilter ? `/${recent.length}` : ""} đơn gần nhất, trừ đơn đã huỷ)`}
          actions={
            <form method="get" className="flex items-center gap-2 text-[13px]">
              <label htmlFor="where-filter" className="text-lien-muted">
                Hàng đang ở:
              </label>
              <select id="where-filter" name="where" defaultValue={whereFilter} className={`${adminInput} !mb-0 !w-auto !py-1 !text-[13px]`}>
                <option value="">tất cả</option>
                {GOODS_WHERE.map((w) => (
                  <option key={w.key} value={w.key}>
                    {w.label} ({recent.filter((o) => whereOf(o) === w.key).length})
                  </option>
                ))}
              </select>
              <button type="submit" className={`${btnSecondary} !py-1 !text-[13px]`}>
                Lọc
              </button>
            </form>
          }
        >
          <p className="mb-4 text-[13px] text-lien-muted">
            Mỗi đơn một dòng, mỗi chặng một ô: chọn phương thức · cột, phí (để trống = tự tính theo cột và khối lượng đơn), mã vận đơn, ghi chú, rồi bấm ✓. Ô chặng nội địa Việt Nam có thể áp phí vào tổng tiền khách trả.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-[13px]">
              <thead>
                <tr className="text-[12px] font-semibold uppercase tracking-wide text-[#6b7280]">
                  <th className="px-2 py-2" title="Tick để gom lô">Lô</th>
                  <th className="px-2 py-2">Đơn</th>
                  <th className="px-2 py-2" title="Vị trí hàng suy ra từ chặng xa nhất đã đi; bấm 'Lịch sử' để xem từng lần đổi trạng thái">Hàng đang ở</th>
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
                  const where = GOODS_WHERE.find((w) => w.key === whereOf(o)) ?? GOODS_WHERE[0];
                  return (
                    <tr key={o.id} id={`order-${o.id}`} className="align-top odd:bg-white even:bg-[#fafafa]">
                      <td className="border-b border-[#f0f0f0] px-2 py-3">
                        {o.delivery !== "pickup" || true ? <input type="checkbox" name="batch_orders" value={o.id} form={BATCH_FORM_ID} className="mt-1 h-4 w-4" aria-label={`Gom đơn #${o.number}`} data-testid={`batch-pick-${o.number}`} /> : null}
                      </td>
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
                      <td className="min-w-[150px] border-b border-[#f0f0f0] px-2 py-3">
                        <span className={cn("inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold", where.cls)} data-testid="goods-where">
                          {where.label}
                        </span>
                        <LegHistory events={eventMap.get(o.id) ?? []} />
                      </td>
                      {SHIPPING_LEGS.map((l) => (
                        <td key={l.key} className="border-b border-[#f0f0f0] px-2 py-3">
                          <OrderLegCell order={o} leg={l.key} current={legs.find((x) => x.leg === l.key)} methods={methods} back="/admin/shipping/" weightG={weightMap.get(o.id)} quote={quoteCfg} />
                        </td>
                      ))}
                    </tr>
                  );
                })}
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-2 py-6 text-center text-lien-muted">
                      {whereFilter ? "Không có đơn nào ở vị trí này." : "Chưa có đơn hàng."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>
        </>
      ) : (
        <div className="space-y-10">
          {SHIPPING_LEGS.filter((l) => l.key === tab).map((leg) => {
            const list = methods.filter((m) => m.leg === leg.key).filter((m) => !sub || (m.subLeg || "to_jp_wh") === sub);
            const subInfo = sub ? JP_SUB_LEGS.find((x) => x.key === sub) : null;
            return (
              <section key={leg.key} id={`leg-${leg.key}`} className="space-y-6">
                <div>
                  <h2 className="mb-1 text-[20px] font-bold text-lien-heading">
                    <Fa name={LEG_ICON[leg.key]} className="mr-2 text-lien-blue" />
                    {subInfo ? subInfo.label : leg.label} <span className="text-[14px] font-normal text-lien-muted">({list.length} phương thức)</span>
                  </h2>
                  <p className="text-[13px] text-lien-muted">{subInfo ? subInfo.description : leg.description}</p>
                  {leg.key === "jp_domestic" ? (
                    <p className="mt-1 flex flex-wrap gap-2 text-[12px]">
                      {JP_SUB_LEGS.map((x) => (
                        <Link key={x.key} href={`/admin/shipping/?leg=jp_domestic&sub=${x.key}`} className={cn("rounded-full px-2.5 py-0.5 font-semibold no-underline", sub === x.key ? "bg-lien-blue text-white" : "bg-[#eef2ff] text-[#374151] hover:bg-[#e0e7ff]")}>
                          {x.label} ({methods.filter((m) => m.leg === "jp_domestic" && (m.subLeg || "to_jp_wh") === x.key).length})
                        </Link>
                      ))}
                      <Link href="/admin/shipping/?leg=jp_domestic" className={cn("rounded-full px-2.5 py-0.5 font-semibold no-underline", !sub ? "bg-lien-blue text-white" : "bg-[#eef2ff] text-[#374151] hover:bg-[#e0e7ff]")}>
                        Cả hai
                      </Link>
                    </p>
                  ) : null}
                  <p className="mt-2 rounded-md border border-lien-blue/30 bg-lien-blue-soft/60 px-3 py-2 text-[12px] leading-5 text-lien-text">{LEG_API_NOTE[leg.key]}</p>
                </div>
                {leg.key === "vn_domestic" ? <CarrierStatusPanel /> : null}
                <LegShipmentsCard leg={leg.key} orders={recent} legMap={legMap} eventMap={eventMap} filter={legStatusFilter} />
                {list.map((m) => (
                  <MethodCard key={m.id} m={m} carriers={carriers} tab={backTab} />
                ))}
                {list.length === 0 ? <p className="rounded-md border border-dashed border-[#d1d5db] p-4 text-[13px] text-lien-muted">Chưa có phương thức cho chặng này — thêm ở khung bên dưới.</p> : null}
                {tab ? (
                  <>
                    <AddMethodCard leg={leg.key} carriers={carriers} position={methods.length + 1} tab={backTab} subLeg={sub || (leg.key === "jp_domestic" ? "to_jp_wh" : "")} />
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

/** "Lịch sử" of an order's legs: every status change with time, tracking number and who did it. */
function LegHistory({ events }: { events: OrderLegEvent[] }) {
  if (!events.length) return <p className="m-0 mt-1 text-[11px] text-lien-muted">Chưa có cập nhật chặng.</p>;
  return (
    <details className="mt-1 text-[11px]">
      <summary className="cursor-pointer select-none text-lien-blue">Lịch sử ({events.length})</summary>
      <ul className="m-0 mt-1 list-none space-y-0.5 p-0 text-lien-muted">
        {events.slice(0, 12).map((e) => (
          <li key={e.id}>
            {formatDateTime(e.createdAt)} · {LEG_LABEL[e.leg]}: <span className="font-semibold text-lien-text">{LEG_STATUS_LABEL[e.status]}</span>
            {e.tracking ? ` · ${e.tracking}` : ""}
            {e.note ? ` · ${e.note}` : ""}
            {e.actor ? ` · ${e.actor}` : ""}
          </li>
        ))}
      </ul>
    </details>
  );
}

/**
 * Sheet của một chặng › "Đơn hàng qua chặng này": every recent order with this leg's status (chưa gửi / đã gửi / đã đến),
 * tracking number and history — filter by status, change it in place. Delivered orders drop out once the last leg arrived.
 */
function LegShipmentsCard({ leg, orders, legMap, eventMap, filter }: { leg: ShippingLeg; orders: Order[]; legMap: Map<string, OrderLeg[]>; eventMap: Map<string, OrderLegEvent[]>; filter: LegStatus | "" }) {
  const rows = orders
    .map((o) => ({ o, l: (legMap.get(o.id) ?? []).find((x) => x.leg === leg) }))
    .filter(({ o }) => o.shipStage !== "delivered" || leg === "vn_domestic")
    .filter(({ l }) => !filter || (l?.status ?? "pending") === filter);
  const count = (s: LegStatus) => orders.filter((o) => ((legMap.get(o.id) ?? []).find((x) => x.leg === leg)?.status ?? "pending") === s).length;
  const back = `/admin/shipping/?leg=${leg}${filter ? `&st=${filter}` : ""}`;
  return (
    <Card
      title={`Đơn hàng qua chặng này (${rows.length})`}
      actions={
        <form method="get" className="flex items-center gap-2 text-[13px]">
          <input type="hidden" name="leg" value={leg} />
          <select name="st" defaultValue={filter} className={`${adminInput} !mb-0 !w-auto !py-1 !text-[13px]`} aria-label="Lọc theo trạng thái chặng">
            <option value="">Trạng thái: tất cả</option>
            {LEG_STATUSES.map((s) => (
              <option key={s} value={s}>
                {LEG_STATUS_LABEL[s]} ({count(s)})
              </option>
            ))}
          </select>
          <button type="submit" className={`${btnSecondary} !py-1 !text-[13px]`}>
            Lọc
          </button>
        </form>
      }
    >
      <p className="mb-3 text-[13px] text-lien-muted">Mỗi đơn một dòng: đổi trạng thái của chặng {LEG_LABEL[leg].toLowerCase()} (chưa gửi → đã gửi → đã đến), thêm mã vận đơn / ghi chú rồi bấm ✓. Sản phẩm trong đơn và tiến độ đơn cho khách tự nhích theo; &ldquo;Lịch sử&rdquo; ghi lại từng lần đổi.</p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-[13px]">
          <thead>
            <tr className="text-[12px] font-semibold uppercase tracking-wide text-[#6b7280]">
              <th className="px-2 py-2">Đơn</th>
              <th className="px-2 py-2">Phương thức · phí</th>
              <th className="px-2 py-2">Trạng thái chặng</th>
              <th className="px-2 py-2">Mã vận đơn · ghi chú</th>
              <th className="px-2 py-2">Thời gian</th>
              <th className="px-2 py-2">Hàng đang ở</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ o, l }) => {
              const fid = `ls-${o.id}-${leg}`;
              const st = l?.status ?? "pending";
              const where = GOODS_WHERE.find((w) => w.key === goodsWhere(legMap.get(o.id) ?? [])) ?? GOODS_WHERE[0];
              return (
                <tr key={o.id} id={`order-${o.id}`} className="align-top odd:bg-white even:bg-[#fafafa]" data-testid={`leg-row-${o.id}`}>
                  <td className="border-b border-[#f0f0f0] px-2 py-2">
                    <form id={fid} action={setOrderLegStatusAction}>
                      <input type="hidden" name="orderId" value={o.id} />
                      <input type="hidden" name="leg" value={leg} />
                      <input type="hidden" name="back" value={back} />
                    </form>
                    <Link href={`/admin/orders/${o.id}/`} className="font-semibold text-lien-blue hover:underline">
                      #{o.number}
                    </Link>
                    <div className="text-[12px] text-lien-muted">
                      {o.customer.lastName} {o.customer.firstName} · {o.items.reduce((n, it) => n + it.quantity, 0)} sp
                    </div>
                  </td>
                  <td className="border-b border-[#f0f0f0] px-2 py-2 text-[12px]">
                    {l?.label || <span className="text-lien-muted">mặc định theo luồng nhập hàng</span>}
                    {l?.fee ? <span className="block text-lien-muted">{formatAmount(l.fee)}đ</span> : null}
                  </td>
                  <td className="border-b border-[#f0f0f0] px-2 py-2">
                    <div className="flex items-center gap-1">
                      <select name="status" form={fid} defaultValue={st} className={cn(adminInput, "!mb-0 !w-auto !py-1 !text-[12px] font-semibold", LEG_STATUS_CLS[st])} aria-label="Trạng thái chặng">
                        {LEG_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {LEG_STATUS_LABEL[s]}
                          </option>
                        ))}
                      </select>
                      <button type="submit" form={fid} className={`${btnSecondary} !px-2 !py-1 !text-[12px]`} title="Lưu trạng thái">
                        <Fa name="check" />
                      </button>
                    </div>
                  </td>
                  <td className="border-b border-[#f0f0f0] px-2 py-2">
                    <input name="tracking" form={fid} defaultValue={l?.tracking ?? ""} placeholder="Mã vận đơn" className={cn(adminInput, "!mb-1 !w-[160px] !py-1 !text-[12px]")} aria-label="Mã vận đơn" />
                    <input name="note" form={fid} placeholder="Ghi chú lần này" className={cn(adminInput, "!mb-0 !w-[160px] !py-1 !text-[12px]")} aria-label="Ghi chú" />
                  </td>
                  <td className="border-b border-[#f0f0f0] px-2 py-2 text-[12px] text-lien-muted">
                    {l?.sentAt ? <span className="block">Gửi {formatDateTime(l.sentAt)}</span> : null}
                    {l?.arrivedAt ? <span className="block">Đến {formatDateTime(l.arrivedAt)}</span> : null}
                    {!l?.sentAt && !l?.arrivedAt ? "—" : null}
                  </td>
                  <td className="border-b border-[#f0f0f0] px-2 py-2">
                    <span className={cn("inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold", where.cls)}>{where.label}</span>
                    <LegHistory events={(eventMap.get(o.id) ?? []).filter((e) => e.leg === leg)} />
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-2 py-6 text-center text-lien-muted">
                  Không có đơn nào{filter ? ` ở trạng thái "${LEG_STATUS_LABEL[filter]}"` : ""}.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
