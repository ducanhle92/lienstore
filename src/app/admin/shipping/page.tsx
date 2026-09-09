import { deleteCarrierAction, deleteMethodAction, deleteZoneAction, saveCarrierAction, saveMethodAction, saveNotesAction, savePickupAction, saveZoneAction } from "@/app/admin/shipping/actions";
import { adminInput, adminLabel, btnDanger, btnPrimary, btnSecondary, Card, Flash, PageHeader } from "@/components/sites/lienstore/admin/ui";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { ShippingTable } from "@/components/sites/lienstore/shop/ShippingTable";
import { requireAdmin } from "@/lib/auth";
import { getPickupAddress, getShippingCarriers, getShippingMethods, getShippingNotes } from "@/lib/db";
import { formatAmount } from "@/lib/format";
import { isShippingLeg, SHIPPING_LEGS } from "@/lib/shipping";
import Link from "next/link";
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

function ZoneRow({ zone, methodId, currency }: { zone: ShippingZone | null; methodId: number; currency: string }) {
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
          {zone ? <input type="hidden" name="id" value={zone.id} /> : null}
          <button type="submit" className={`${isNew ? btnPrimary : btnSecondary} !px-2.5 !py-1.5 !text-[13px]`} title={isNew ? "Thêm cột" : "Lưu"}>
            <Fa name={isNew ? "plus" : "check"} /> {isNew ? "Thêm" : "Lưu"}
          </button>
        </form>
        {zone ? (
          <form action={deleteZoneAction} className="ml-1 inline">
            <input type="hidden" name="id" value={zone.id} />
            <button type="submit" className={`${btnDanger} !px-2.5 !py-1.5 !text-[13px]`} title="Xoá cột">
              <Fa name="trash" />
            </button>
          </form>
        ) : null}
      </td>
    </tr>
  );
}

function MethodCard({ m, carriers }: { m: ShippingMethod; carriers: ShippingCarrier[] }) {
  const fid = `m${m.id}`;
  return (
    <div id={`method-${m.id}`}>
      <Card
        title={`${m.name}${m.carrierName ? ` · ${m.carrierName}` : ""}${m.active ? "" : " (đang ẩn)"}`}
        actions={
          <form action={deleteMethodAction}>
            <input type="hidden" name="id" value={m.id} />
            <button type="submit" className={`${btnDanger} !px-2.5 !py-1.5 !text-[13px]`} title="Xoá phương thức và toàn bộ cột">
              <Fa name="trash" /> Xoá phương thức
            </button>
          </form>
        }
      >
        <form id={fid} action={saveMethodAction} className="mb-5 grid gap-3 md:grid-cols-3">
          <input type="hidden" name="id" value={m.id} />
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
            <label className={adminLabel}>Đơn vị vận chuyển</label>
            <CarrierSelect carriers={carriers} value={m.carrierId} />
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
                <ZoneRow key={z.id} zone={z} methodId={m.id} currency={m.currency} />
              ))}
              <ZoneRow zone={null} methodId={m.id} currency={m.currency} />
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[12px] text-lien-muted">Đơn vị &quot;/kg&quot; → phí nhân với số kg (làm tròn lên) của sản phẩm để ước tính ngay trên trang sản phẩm; để trống = phí cho cả đơn.</p>
      </Card>
    </div>
  );
}

export default async function AdminShipping({ searchParams }: Props) {
  await requireAdmin("shipping");
  const sp = await searchParams;
  const saved = first(sp.saved);
  const error = first(sp.error);
  const [methods, notes, carriers, pickupAddress] = await Promise.all([getShippingMethods(false), getShippingNotes(), getShippingCarriers(), getPickupAddress()]);
  const visible = methods.filter((m) => m.active).map((m) => ({ ...m, zones: m.zones.filter((z) => z.active) }));
  const legParam = first(sp.leg);
  const onlyLeg = isShippingLeg(legParam) ? legParam : null;
  const legsShown = SHIPPING_LEGS.filter((l) => !onlyLeg || l.key === onlyLeg);

  return (
    <>
      <PageHeader
        title="Vận chuyển"
        subtitle="Ba chặng: nội địa Nhật → Nhật–Việt → nội địa Việt Nam. Mỗi phương thức là một bảng; mỗi cột là một khu vực hoặc bậc cân nặng. Hiển thị ở tab “Chi phí vận chuyển” trên trang sản phẩm và trang /van-chuyen/."
        actions={
          <a href="/van-chuyen/" target="_blank" rel="noreferrer" className={btnSecondary}>
            <Fa name="external-link" /> Xem trang vận chuyển
          </a>
        }
      />
      {saved ? <Flash>{saved}</Flash> : null}
      {error ? <Flash kind="error">{error}</Flash> : null}

      <div className="mb-6 flex flex-wrap gap-2">
        <Link href="/admin/shipping/" className={cn("rounded-md border px-3 py-1.5 text-[13px] no-underline", !onlyLeg ? "border-lien-blue bg-lien-blue text-white" : "border-[#d1d5db] bg-white text-lien-text hover:bg-[#f3f4f6]")}>
          Tất cả
        </Link>
        {SHIPPING_LEGS.map((l) => (
          <Link key={l.key} href={`/admin/shipping/?leg=${l.key}`} className={cn("rounded-md border px-3 py-1.5 text-[13px] no-underline", onlyLeg === l.key ? "border-lien-blue bg-lien-blue text-white" : "border-[#d1d5db] bg-white text-lien-text hover:bg-[#f3f4f6]")}>
            {l.label} <span className={onlyLeg === l.key ? "text-white/80" : "text-lien-muted"}>({methods.filter((m) => m.leg === l.key).length})</span>
          </Link>
        ))}
      </div>

      <div className="space-y-10">
        {legsShown.map((leg) => {
          const list = methods.filter((m) => m.leg === leg.key);
          return (
            <section key={leg.key} id={`leg-${leg.key}`}>
              <h2 className="mb-1 text-[20px] font-bold text-lien-heading">
                <Fa name={leg.key === "vn_domestic" ? "truck" : leg.key === "jp_vn" ? "plane" : "cube"} className="mr-2 text-lien-blue" />
                {leg.label} <span className="text-[14px] font-normal text-lien-muted">({list.length} phương thức)</span>
              </h2>
              <p className="mb-4 text-[13px] text-lien-muted">{leg.description}</p>
              <div className="space-y-6">
                {list.map((m) => (
                  <MethodCard key={m.id} m={m} carriers={carriers} />
                ))}
                {list.length === 0 ? <p className="rounded-md border border-dashed border-[#d1d5db] p-4 text-[13px] text-lien-muted">Chưa có phương thức cho chặng này — thêm ở khung “Thêm phương thức” bên dưới.</p> : null}
              </div>
            </section>
          );
        })}

        {!onlyLeg || onlyLeg === "vn_domestic" ? (
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
              <p className="mt-2 text-[12px] text-lien-muted">Khách chọn &quot;Nhận tại kho&quot; thì không tính phí giao; chọn &quot;Giao tận nhà&quot; thì phí lấy theo cột của các phương thức chặng Nội địa Việt Nam đang hiển thị (miễn phí khi đạt mức &quot;Miễn phí trên&quot;).</p>
            </Card>
          </div>
        ) : null}

        <Card title="Thêm phương thức vận chuyển">
          <form action={saveMethodAction} className="grid gap-3 md:grid-cols-3">
            <div>
              <label className={adminLabel}>Tên phương thức *</label>
              <input name="name" required placeholder="VD: EMS Kiến Express, Xách tay, Viettel Post" className={adminInput} />
            </div>
            <div>
              <label className={adminLabel}>Chặng *</label>
              <select name="leg" defaultValue={onlyLeg ?? "jp_vn"} className={adminInput}>
                {SHIPPING_LEGS.map((l) => (
                  <option key={l.key} value={l.key}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={adminLabel}>Đơn vị vận chuyển</label>
              <CarrierSelect carriers={carriers} value={null} />
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
                <input type="checkbox" name="homeDelivery" defaultChecked className="h-4 w-4" /> Giao tận nhà
              </label>
              <input type="hidden" name="currency" value="đ" />
              <input type="hidden" name="position" value={methods.length + 1} />
              <input type="hidden" name="active" value="on" />
              <button type="submit" className={btnPrimary}>
                <Fa name="plus" /> Thêm phương thức
              </button>
            </div>
          </form>
        </Card>

        <div id="carriers">
          <Card title="Đơn vị vận chuyển">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-[13px]">
                <thead>
                  <tr className="text-[12px] font-semibold uppercase tracking-wide text-[#6b7280]">
                    <th className="px-2 py-2">Tên</th>
                    <th className="px-2 py-2">Điện thoại</th>
                    <th className="px-2 py-2">Website</th>
                    <th className="px-2 py-2">Ghi chú</th>
                    <th className="px-2 py-2">Đang dùng</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {carriers.map((c) => {
                    const fid = `c${c.id}`;
                    const used = methods.filter((m) => m.carrierId === c.id).length;
                    return (
                      <tr key={c.id}>
                        <td className={cell}>
                          <input name="name" form={fid} defaultValue={c.name} required className={`${small} min-w-[160px]`} />
                        </td>
                        <td className={cell}>
                          <input name="phone" form={fid} defaultValue={c.phone} className={`${small} w-[140px]`} />
                        </td>
                        <td className={cell}>
                          <input name="website" form={fid} defaultValue={c.website} className={`${small} min-w-[180px]`} />
                        </td>
                        <td className={cell}>
                          <input name="note" form={fid} defaultValue={c.note} className={`${small} min-w-[200px]`} />
                        </td>
                        <td className={`${cell} text-[12px] text-lien-muted`}>{used ? `${used} phương thức` : "—"}</td>
                        <td className={`${cell} whitespace-nowrap`}>
                          <form id={fid} action={saveCarrierAction} className="inline">
                            <input type="hidden" name="id" value={c.id} />
                            <button type="submit" className={`${btnSecondary} !px-2.5 !py-1.5 !text-[13px]`}>
                              <Fa name="check" /> Lưu
                            </button>
                          </form>
                          <form action={deleteCarrierAction} className="ml-1 inline">
                            <input type="hidden" name="id" value={c.id} />
                            <button type="submit" className={`${btnDanger} !px-2.5 !py-1.5 !text-[13px]`} title="Xoá đơn vị">
                              <Fa name="trash" />
                            </button>
                          </form>
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="bg-[#f9fafb]">
                    <td className={cell}>
                      <input name="name" form="new-carrier" placeholder="Tên đơn vị mới…" required className={`${small} min-w-[160px]`} />
                    </td>
                    <td className={cell}>
                      <input name="phone" form="new-carrier" className={`${small} w-[140px]`} />
                    </td>
                    <td className={cell}>
                      <input name="website" form="new-carrier" placeholder="https://…" className={`${small} min-w-[180px]`} />
                    </td>
                    <td className={cell}>
                      <input name="note" form="new-carrier" className={`${small} min-w-[200px]`} />
                    </td>
                    <td className={cell} />
                    <td className={`${cell} whitespace-nowrap`}>
                      <form id="new-carrier" action={saveCarrierAction} className="inline">
                        <button type="submit" className={`${btnPrimary} !px-2.5 !py-1.5 !text-[13px]`}>
                          <Fa name="plus" /> Thêm
                        </button>
                      </form>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div id="notes">
          <Card title="Lưu ý chung về vận chuyển (mỗi dòng một gạch đầu dòng)">
            <form action={saveNotesAction} className="space-y-3">
              <textarea name="notes" rows={6} defaultValue={notes.join("\n")} className={adminInput} />
              <button type="submit" className={btnPrimary}>
                <Fa name="check" /> Lưu lưu ý
              </button>
            </form>
          </Card>
        </div>

        <Card title="Xem trước (đúng như khách thấy)">
          <ShippingTable methods={visible} notes={notes} />
        </Card>
      </div>
    </>
  );
}
