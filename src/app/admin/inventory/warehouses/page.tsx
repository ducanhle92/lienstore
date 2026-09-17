import { saveWarehouseAddressesAction } from "@/app/admin/inventory/warehouses/actions";
import { InfoPopover } from "@/components/sites/lienstore/admin/InfoPopover";
import { adminInput, adminLabel, btnPrimary, Card, Flash, PageHeader } from "@/components/sites/lienstore/admin/ui";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { requireAdmin } from "@/lib/auth";
import { KIEN_JP_ADDRESS, KIEN_VN_ADDRESS, WAREHOUSE_ADDRESS_KEYS } from "@/lib/default-flow-job";
import { getDb, getSetting } from "@/lib/sqlite";
import { WAREHOUSE_LABEL } from "@/lib/warehouses";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** Kho hàng › Địa chỉ kho: the four places goods sit on the way from Japan to the customer. */
export default async function WarehouseAddresses({ searchParams }: Props) {
  await requireAdmin("inventory");
  const sp = await searchParams;
  const db = getDb();
  const val = (k: string, fallback = "") => getSetting(db, k) || fallback;
  const fields = [
    { key: WAREHOUSE_ADDRESS_KEYS.jpShop, label: `${WAREHOUSE_LABEL.jp} (kho / nhà của shop tại Nhật)`, value: val(WAREHOUSE_ADDRESS_KEYS.jpShop, val("jp_sender_address")), hint: "Nơi gom hàng mua về trước khi giao cho ĐVVC; là điểm gửi của chặng ①b." },
    { key: WAREHOUSE_ADDRESS_KEYS.jpCarrier, label: "Kho ĐVVC tại Nhật (Kiến Express)", value: val(WAREHOUSE_ADDRESS_KEYS.jpCarrier, KIEN_JP_ADDRESS), hint: "Địa chỉ nhận hàng của Kiến Express tại Nhật — điểm đến của chặng ①b, điểm gửi chặng ②." },
    { key: WAREHOUSE_ADDRESS_KEYS.vnCarrier, label: `${WAREHOUSE_LABEL.carrier} (Kiến Express Việt Nam)`, value: val(WAREHOUSE_ADDRESS_KEYS.vnCarrier, KIEN_VN_ADDRESS), hint: "Kho Kiến Express ở Hà Nội — nơi hàng về sau chặng ②; chặng ③ (mặc định Viettel Post) đi từ đây về kho shop. Dùng để hỏi cước hãng ở chi tiết đơn." },
    { key: WAREHOUSE_ADDRESS_KEYS.vnShop, label: `${WAREHOUSE_LABEL.vn} (kho shop, hiện cho khách khi “Nhận tại kho”)`, value: val(WAREHOUSE_ADDRESS_KEYS.vnShop, val("pickup_address")), hint: "Điểm đến của chặng ③ và điểm gửi chặng ④; cũng là địa chỉ khách thấy ở trang thanh toán khi chọn nhận tại kho." },
  ];
  return (
    <>
      <PageHeader title="Địa chỉ kho" subtitle="Bốn điểm hàng đi qua: kho shop tại Nhật → kho ĐVVC tại Nhật → kho ĐVVC tại Việt Nam → kho shop tại Việt Nam." back={{ href: "/admin/inventory/", label: "Kho hàng" }} />
      {first(sp.saved) ? <Flash>{first(sp.saved)}</Flash> : null}
      {first(sp.error) ? <Flash kind="error">{first(sp.error)}</Flash> : null}
      <Card>
        <form action={saveWarehouseAddressesAction} className="grid gap-4 lg:grid-cols-2">
          {fields.map((f) => (
            <div key={f.key}>
              <label className={adminLabel} htmlFor={f.key}>
                {f.label}
                <InfoPopover>{f.hint}</InfoPopover>
              </label>
              <textarea id={f.key} name={f.key} rows={2} defaultValue={f.value} className={adminInput} />
            </div>
          ))}
          <div className="lg:col-span-2">
            <button type="submit" className={btnPrimary}>
              <Fa name="check" /> Lưu địa chỉ
            </button>
          </div>
        </form>
      </Card>
    </>
  );
}
