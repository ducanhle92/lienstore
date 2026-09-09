import Link from "next/link";
import type { Order, OrderCustomer, OrderStatus, PaymentMethod } from "@/types/shop";
import { cn } from "@/lib/utils";
import { Price, shopTableClass, shopTdClass, shopThClass, WooHeading } from "./WooUi";

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  bacs: "Chuyển khoản ngân hàng",
  cod: "Thanh toán khi nhận hàng",
};

export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "Chờ xử lý",
  processing: "Đang xử lý",
  completed: "Hoàn thành",
  cancelled: "Đã huỷ",
};

/** WooCommerce `table.order_details`: product × qty / total, with Tạm tính / Phương thức thanh toán / Tổng footer. */
export function OrderDetailsTable({ order, className }: { order: Order; className?: string }) {
  return (
    <table className={cn(shopTableClass, "order_details", className)}>
      <thead>
        <tr>
          <th className={shopThClass} scope="col">
            Sản phẩm
          </th>
          <th className={shopThClass} scope="col">
            Tổng
          </th>
        </tr>
      </thead>
      <tbody>
        {order.items.map((it) => (
          <tr key={it.productId}>
            <td className={shopTdClass}>
              <Link href={`/product/${it.slug}/`} className="text-lien-muted no-underline hover:text-lien-blue">
                {it.name}
              </Link>{" "}
              <strong className="product-quantity whitespace-nowrap">× {it.quantity}</strong>
            </td>
            <td className={shopTdClass}>
              <Price value={it.price * it.quantity} currency={order.currency} />
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <th className={cn(shopTdClass, "font-bold")} scope="row">
            Tạm tính:
          </th>
          <td className={shopTdClass}>
            <Price value={order.subtotal} currency={order.currency} />
          </td>
        </tr>
        {order.discount > 0 ? (
          <tr>
            <th className={cn(shopTdClass, "font-bold")} scope="row">
              Giảm giá{order.voucherCode ? ` (${order.voucherCode})` : ""}:
            </th>
            <td className={cn(shopTdClass, "text-lien-success")}>
              −<Price value={order.discount} currency={order.currency} />
            </td>
          </tr>
        ) : null}
        <tr>
          <th className={cn(shopTdClass, "font-bold")} scope="row">
            Giao hàng{order.shippingFee > 0 && order.shippingLabel ? ` (${order.shippingLabel})` : ""}:
          </th>
          <td className={shopTdClass}>
            {order.shippingFee > 0 ? <Price value={order.shippingFee} currency={order.currency} /> : <span>{order.shippingLabel || "Nhận tại kho"} · miễn phí</span>}
          </td>
        </tr>
        <tr>
          <th className={cn(shopTdClass, "font-bold")} scope="row">
            Phương thức thanh toán:
          </th>
          <td className={shopTdClass}>{PAYMENT_LABEL[order.paymentMethod]}</td>
        </tr>
        <tr>
          <th className={cn(shopTdClass, "font-bold")} scope="row">
            Tổng:
          </th>
          <td className={cn(shopTdClass, "font-bold")}>
            <Price value={order.total} currency={order.currency} />
          </td>
        </tr>
      </tfoot>
    </table>
  );
}

/** `.woocommerce-customer-details address` billing block. */
export function OrderAddress({ customer, className }: { customer: OrderCustomer; className?: string }) {
  return (
    <address
      className={cn(
        "mb-0 w-full rounded-[5px] border border-r-2 border-b-2 border-solid border-black/10 px-3 py-1.5 text-left text-[16px] not-italic leading-6 text-lien-text",
        className,
      )}
    >
      {customer.firstName} {customer.lastName}
      <br />
      {customer.address}
      <br />
      <p className="woocommerce-customer-details--phone mt-2 mb-0 pl-6 before:-ml-6 before:mr-2 before:inline-block before:w-4 before:text-center before:font-fa before:text-[14px] before:text-[#767676] before:content-['\f095']">
        {customer.phone}
      </p>
      <p className="woocommerce-customer-details--email mb-0 pl-6 before:-ml-6 before:mr-2 before:inline-block before:w-4 before:text-center before:font-fa before:text-[14px] before:text-[#767676] before:content-['\f0e0']">
        {customer.email}
      </p>
      {customer.note ? (
        <p className="mt-2 mb-0 text-[14.72px] leading-[22.08px] text-lien-muted">
          <span className="font-bold text-lien-text">Ghi chú:</span> {customer.note}
        </p>
      ) : null}
    </address>
  );
}

export interface OrderReceiptLink {
  name: string;
  url: string;
  note?: string;
  amountJpy?: number | null;
  createdAt?: string;
}

/** "Hoá đơn mua hàng tại Nhật" — files the shop attached to the order (receipts of the purchase in Japan). */
export function OrderReceipts({ files }: { files: OrderReceiptLink[] }) {
  if (files.length === 0) return null;
  return (
    <section className="woocommerce-order-receipts mb-8">
      <WooHeading as="h2">Hoá đơn mua hàng tại Nhật</WooHeading>
      <p className="mb-3 text-[15px] leading-6 text-lien-muted">Cửa hàng đã đính kèm chứng từ mua hàng cho đơn này. Bấm để xem hoặc tải về.</p>
      <ul className="m-0 list-none p-0">
        {files.map((f) => (
          <li key={f.url} className="mb-2 flex flex-wrap items-center gap-2 rounded-[3px] border border-lien-widget-border bg-white px-3 py-2 text-[15px] leading-6">
            <a href={f.url} target="_blank" rel="noreferrer" className="font-semibold text-lien-blue no-underline hover:underline">
              {f.name}
            </a>
            {f.amountJpy ? <span className="text-lien-muted">¥{f.amountJpy.toLocaleString("ja-JP")}</span> : null}
            {f.note ? <span className="text-lien-muted">· {f.note}</span> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** "Chi tiết đơn hàng" + "Địa chỉ thanh toán" sections shared by the thank-you page and the order lookup. */
export function OrderSummary({ order, receipts = [] }: { order: Order; receipts?: OrderReceiptLink[] }) {
  return (
    <>
      <OrderReceipts files={receipts} />
      <section className="woocommerce-order-details">
        <WooHeading as="h2" className="woocommerce-order-details__title">
          Chi tiết đơn hàng
        </WooHeading>
        <OrderDetailsTable order={order} />
      </section>
      <section className="woocommerce-customer-details">
        <WooHeading as="h2" className="woocommerce-column__title">
          Địa chỉ thanh toán
        </WooHeading>
        <OrderAddress customer={order.customer} />
      </section>
    </>
  );
}
