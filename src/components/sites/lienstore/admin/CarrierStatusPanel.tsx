import { saveCarrierTogglesAction, saveGhnSettingsAction, saveSpxSettingsAction } from "@/app/admin/shipping/carrier-actions";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { RATE_CARD_VERSIONS } from "@/lib/carriers";
import { CARRIER_NAME, type CarrierCode } from "@/lib/carriers/types";
import { ghnConfigured, ghnCredentials } from "@/lib/ghn";
import { spxApiConfigured, spxApiCredentials, spxKeyStored } from "@/lib/carriers/spx-api";
import { viettelConfigured } from "@/lib/carriers/viettel";
import { disabledCarriers, warehouseAddress } from "@/lib/ship-quote";
import { VN_ADDRESS_VERSION } from "@/lib/vn-address";
import { adminInput, adminLabel, btnPrimary, btnSecondary, Card } from "./ui";

const ROWS: Array<{ code: CarrierCode; how: string; configured: () => boolean; source: string }> = [
  { code: "GHN", how: "API GHN (data.total quyết định; không cộng thêm xăng dầu/COD). Cần GHN_TOKEN + GHN_SHOP_ID trên máy chủ.", configured: ghnConfigured, source: "live_api" },
  { code: "VIETTEL_POST", how: "Chỉ qua Open API đối tác (VTP_TOKEN). Không có bảng 17k/25k/30k/35k; chưa có token thì khách thấy “Liên hệ / tra cước”.", configured: viettelConfigured, source: "live_api" },
  { code: "VNPOST", how: "Bộ tính theo biểu phí Chuyển phát tiêu chuẩn (34 tỉnh, 5 loại tuyến, nấc 50/100/250/500/1000/1500/2000 g, +1 kg). Chưa gồm VAT/xăng dầu/COD → hiển thị “Từ …”.", configured: () => true, source: "public_rate_card" },
  { code: "SPX", how: "Biểu phí gói/kiện công khai: cân quy đổi /6000, ≤17 kg & ≤60 cm, 1 kg đầu rồi mỗi 0,5 kg; +25.000đ khi giá trị ≥ 3.000.000đ. Open API đối tác: cần Mã user + Secret Key (Hồ sơ shop) và tài liệu endpoint do SPX cấp qua CSKH.", configured: () => true, source: "public_rate_card" },
];

/** ④ Nội địa Việt Nam: how each carrier is quoted today, what is connected, and which carriers customers may pick. */
export function CarrierStatusPanel() {
  const disabled = disabledCarriers();
  const wh = warehouseAddress();
  const ghn = ghnCredentials();
  const ghnOn = ghnConfigured();
  const spx = spxApiCredentials();
  const spxStored = spxKeyStored();
  const spxOn = spxApiConfigured();
  return (
    <>
    <Card className="mb-6" title="Kết nối SPX Express (Open API đối tác)">
      <form action={saveSpxSettingsAction} className="grid gap-3 md:grid-cols-[180px_1fr_1fr_auto] md:items-end" data-testid="spx-form">
        <div>
          <label className={adminLabel} htmlFor="spx-user">
            Mã user (User ID, 15 số)
          </label>
          <input id="spx-user" name="userId" inputMode="numeric" defaultValue={spx.userId} placeholder="VD: 123456789012345" className={adminInput} />
        </div>
        <div>
          <label className={adminLabel} htmlFor="spx-secret">
            Secret Key {spxStored ? <span className="ml-1 rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700">đã lưu ••••{spx.secretKey.slice(-4)}</span> : <span className="ml-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">chưa có</span>}
          </label>
          <input id="spx-secret" name="secretKey" type="password" autoComplete="off" placeholder={spxStored ? "Để trống = giữ khóa hiện tại" : "spx.vn › Quản lý tài khoản › Hồ sơ shop › Secret Key"} className={adminInput} />
        </div>
        <div>
          <label className={adminLabel} htmlFor="spx-url">
            Endpoint tính cước <span className="font-normal text-lien-muted">(từ tài liệu SPX cấp)</span>
          </label>
          <input id="spx-url" name="feeUrl" type="url" defaultValue={spx.feeUrl} placeholder="https://… (điền khi SPX gửi tài liệu API)" className={adminInput} />
        </div>
        <div className="flex gap-2">
          <button type="submit" className={btnPrimary}>
            <Fa name="check" /> Lưu
          </button>
          {spxStored ? (
            <button type="submit" name="clear" value="1" className={btnSecondary} title="Gỡ khóa">
              Gỡ
            </button>
          ) : null}
        </div>
      </form>
      <p className="mt-2 text-[12px] leading-5 text-lien-muted" data-testid="spx-status">
        {spxOn ? "Đủ khóa và endpoint — đang chờ xác nhận định dạng gọi API theo tài liệu SPX; thẻ SPX tạm vẫn theo biểu phí công khai." : spxStored ? `Khóa đã lưu trên máy chủ${spx.userId ? "" : ", chưa có Mã user"}. SPX không công khai tài liệu Open API: liên hệ CSKH SPX (1900 6885 / cskh@spxexpress.com) xin "kích hoạt kết nối API + tài liệu tích hợp"; khi có endpoint tính cước, điền vào ô trên là chuyển sang cước API.` : "Chưa lưu khóa SPX — thẻ SPX tính theo biểu phí công khai."}
      </p>
    </Card>
    <Card className="mb-6" title="Kết nối GHN (Giao Hàng Nhanh) — API tính cước thật">
      <form action={saveGhnSettingsAction} className="grid gap-3 md:grid-cols-[1fr_140px_150px_150px_auto] md:items-end" data-testid="ghn-form">
        <div>
          <label className={adminLabel} htmlFor="ghn-token">
            Token API {ghnOn ? <span className="ml-1 rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700">đã đặt ••••{ghn.token.slice(-4)}</span> : <span className="ml-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">chưa có</span>}
          </label>
          <input id="ghn-token" name="token" type="password" autoComplete="off" placeholder={ghnOn ? "Để trống = giữ token hiện tại" : "Dán token từ khachhang.ghn.vn › Cài đặt › Token API"} className={adminInput} />
        </div>
        <div>
          <label className={adminLabel} htmlFor="ghn-shop">
            Shop ID
          </label>
          <input id="ghn-shop" name="shopId" inputMode="numeric" defaultValue={ghn.shopId || ""} placeholder="tự lấy" className={adminInput} />
        </div>
        <div>
          <label className={adminLabel} htmlFor="ghn-district">
            District lấy hàng
          </label>
          <input id="ghn-district" name="pickupDistrictId" inputMode="numeric" defaultValue={ghn.pickupDistrictId || ""} placeholder="1748 = Hoằng Hóa" className={adminInput} />
        </div>
        <div>
          <label className={adminLabel} htmlFor="ghn-ward">
            Ward lấy hàng
          </label>
          <input id="ghn-ward" name="pickupWardCode" defaultValue={ghn.pickupWardCode} className={adminInput} />
        </div>
        <div className="flex gap-2">
          <button type="submit" className={btnPrimary}>
            <Fa name="check" /> Lưu & kiểm tra
          </button>
          {ghnOn ? (
            <button type="submit" name="clear" value="1" className={btnSecondary} title="Gỡ token">
              Gỡ
            </button>
          ) : null}
        </div>
      </form>
      <p className="mt-2 text-[12px] leading-5 text-lien-muted">Token chỉ lưu trong CSDL máy chủ, không bao giờ gửi xuống trình duyệt. Khi lưu, hệ thống gọi GHN để lấy danh sách shop của tài khoản (Shop ID tự điền) và tìm mã điểm lấy hàng Hoằng Hóa nếu để trống. Có token là thẻ GHN ở trang sản phẩm / thanh toán hiện cước thật từ API (data.total) cùng ngày giao dự kiến.</p>
    </Card>
    <Card title="Cước nội địa báo theo địa chỉ khách (từng hãng một adapter)">
      <p className="m-0 mb-3 text-[13px] leading-5 text-lien-text">
        Khách nhập <strong>tỉnh/thành → xã/phường → số nhà</strong> (danh mục {VN_ADDRESS_VERSION}, 34 tỉnh) rồi mới thấy thẻ báo giá của từng hãng cho kiện hàng đã đóng gói. Báo giá lại khi vào thanh toán và lần nữa khi tạo đơn; cache tối đa 10 phút. Các bảng vùng bên dưới chỉ còn dùng làm nhãn/ghi chú, <strong>không</strong> dùng để thu tiền. Kho gửi: {wh.fullAddress}.
      </p>
      <form action={saveCarrierTogglesAction}>
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="bg-[#f9fafb] text-left text-[11px] font-bold uppercase tracking-wide text-lien-muted">
              <th className="border-b border-[#e5e7eb] px-2 py-2">Khách được chọn</th>
              <th className="border-b border-[#e5e7eb] px-2 py-2">Hãng</th>
              <th className="border-b border-[#e5e7eb] px-2 py-2">Nguồn giá</th>
              <th className="border-b border-[#e5e7eb] px-2 py-2">Trạng thái</th>
              <th className="border-b border-[#e5e7eb] px-2 py-2">Cách tính</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => {
              const on = !disabled.includes(r.code);
              const ok = r.configured();
              return (
                <tr key={r.code} className="align-top" data-testid={`carrier-row-${r.code}`}>
                  <td className="border-b border-[#f3f4f6] px-2 py-2">
                    <input type="checkbox" name="carrier" value={r.code} defaultChecked={on} className="h-4 w-4" aria-label={`Cho khách chọn ${CARRIER_NAME[r.code]}`} />
                  </td>
                  <td className="border-b border-[#f3f4f6] px-2 py-2 font-semibold text-lien-heading">{CARRIER_NAME[r.code]}</td>
                  <td className="border-b border-[#f3f4f6] px-2 py-2 whitespace-nowrap">
                    {r.source === "live_api" ? "API hãng" : `Biểu phí công khai v${RATE_CARD_VERSIONS[r.code] ?? "?"}`}
                  </td>
                  <td className="border-b border-[#f3f4f6] px-2 py-2 whitespace-nowrap">
                    {ok ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700">
                        <Fa name="check-circle" /> {r.source === "live_api" ? "Đã kết nối" : "Sẵn sàng"}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                        <Fa name="info-circle" /> Chờ token của shop
                      </span>
                    )}
                  </td>
                  <td className="border-b border-[#f3f4f6] px-2 py-2 text-[12px] leading-5 text-lien-muted">{r.how}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="mt-3 flex items-center gap-3">
          <button type="submit" className={btnPrimary}>
            <Fa name="check" /> Lưu lựa chọn hãng
          </button>
          <span className="text-[12px] text-lien-muted">Token/API key chỉ đặt trong biến môi trường máy chủ (GHN_TOKEN, GHN_SHOP_ID, VTP_TOKEN…), không bao giờ gửi xuống trình duyệt.</span>
        </div>
      </form>
    </Card>
    </>
  );
}
