import { createOrderAdminAction } from "@/app/admin/orders/actions";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { cn } from "@/lib/utils";
import { type PickableProduct, ProductSearchSelect } from "./ProductSearchSelect";
import { AdminOrderShip } from "./AdminOrderShip";
import { adminInput, btnPrimary, tableClass, tdClass, thClass } from "./ui";

/**
 * "Tạo đơn mới" on the orders list: a collapsed block the bottom-bar button opens (OpenDetailsButton target "new-order").
 * Goods are priced from the catalogue like a web order; the VN delivery fee is typed by hand and editable per leg later.
 */
export function NewOrderPanel({ products }: { products: PickableProduct[] }) {
  const label = "text-[12px] font-semibold text-[#374151]";
  return (
    <details id="new-order" className="mb-5 hidden rounded-md border-2 border-lien-blue bg-white open:block" data-savebar="off" data-testid="new-order">
      <summary className="cursor-pointer px-4 py-2.5 text-[14px] font-semibold text-lien-heading">
        <Fa name="plus" /> Tạo đơn mới <span className="text-[12px] font-normal text-lien-muted">— đơn khách đặt qua điện thoại / Zalo / Facebook · bấm để đóng</span>
      </summary>
      <form action={createOrderAdminAction} className="grid gap-4 border-t border-[#e5e7eb] px-4 py-4 text-[13px] md:grid-cols-[1fr_1fr]">
        <fieldset className="m-0 grid gap-2 border-0 p-0">
          <legend className="mb-1 text-[13px] font-semibold text-lien-heading">Khách hàng</legend>
          <label className={label}>
            Họ tên *
            <input name="name" required className={cn(adminInput, "mt-1")} placeholder="Nguyễn Văn A" />
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className={label}>
              Điện thoại *
              <input name="phone" required inputMode="tel" className={cn(adminInput, "mt-1")} placeholder="09xx xxx xxx" />
            </label>
            <label className={label}>
              Email
              <input name="email" type="email" className={cn(adminInput, "mt-1")} placeholder="nếu khách có tài khoản web" />
            </label>
          </div>
          <label className={label}>
            Ghi chú của khách
            <input name="note" className={cn(adminInput, "mt-1")} placeholder="giờ nhận, gọi trước…" />
          </label>
          <label className={label}>
            Thanh toán
            <select name="pay" defaultValue="bacs" className={cn(adminInput, "mt-1")}>
              <option value="bacs">Chuyển khoản</option>
              <option value="cod">COD (khách quen — trừ tồn ngay)</option>
            </select>
          </label>
          <label className={label}>
            Mã voucher
            <input name="voucher" className={cn(adminInput, "mt-1")} placeholder="nếu có" />
          </label>
          <AdminOrderShip />
        </fieldset>
        <div className="grid content-start gap-2">
          <p className="m-0 text-[13px] font-semibold text-lien-heading">Sản phẩm</p>
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>Sản phẩm</th>
                <th className={cn(thClass, "w-[80px]")}>SL</th>
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3, 4, 5].map((n) => (
                <tr key={n} className={n === 1 ? undefined : "bg-[#f9fafb]"}>
                  <td className={tdClass}>
                    <ProductSearchSelect products={products} name={`add_${n}_pid`} placeholder={n === 1 ? "Gõ tên / SKU sản phẩm…" : "+ thêm sản phẩm khác…"} />
                  </td>
                  <td className={tdClass}>
                    <input name={`add_${n}_qty`} inputMode="numeric" placeholder="1" className={cn(adminInput, "!mb-0 !py-1 !text-center !text-[13px]")} aria-label="Số lượng" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="m-0 text-[11px] leading-4 text-lien-muted">
            Giá lấy theo giá web lúc tạo (sửa được trong đơn sau khi tạo). Hàng được giữ như đơn web: có sẵn ở Kho VN thì lấy ngay, không thì thành hàng order và cần chuyển khoản trước. Tạo xong, trang đơn có mã thanh toán và link trang QR / nội dung CK để gửi khách.
          </p>
          <button type="submit" className={cn(btnPrimary, "justify-self-start")} data-testid="create-order">
            <Fa name="check" /> Tạo đơn
          </button>
        </div>
      </form>
    </details>
  );
}
