import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ClearCartOnMount } from "@/components/sites/lienstore/shop/cart/ClearCartOnMount";
import { OrderSummary, PAYMENT_LABEL } from "@/components/sites/lienstore/shop/cart/OrderDetails";
import { StoreSidebar } from "@/components/sites/lienstore/shop/cart/StoreSidebar";
import { Price, WooHeading } from "@/components/sites/lienstore/shop/cart/WooUi";
import { SiteChrome, TwoColumnShell } from "@/components/sites/lienstore/shop/SiteChrome";
import { getOrderById } from "@/lib/db";
import { BANK, transferContent, vietQrUrl } from "@/lib/payment";
import { receiptLinksFor } from "@/lib/order-files";
import { formatAmount, formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Đơn hàng đã nhận – LienStore" };

interface Props {
  params: Promise<{ id: string }>;
}

export default async function OrderReceived({ params }: Props) {
  const { id } = await params;
  const order = await getOrderById(id);
  if (!order) notFound();
  const receipts = await receiptLinksFor(order.id);

  const detail = "flex-1 basis-auto border-r border-dashed border-[#d3ced2] pr-6 mr-6 mb-4 text-[11.7px] uppercase leading-5 text-[#767676] last:mr-0 last:border-0";
  const value = "block text-[16px] normal-case leading-6 text-lien-text";

  return (
    <SiteChrome>
      <TwoColumnShell sidebar={<StoreSidebar />} title="Đơn hàng đã nhận">
        <article className="entry-content woocommerce">
          <ClearCartOnMount />
          <div className="woocommerce-order">
            <p className="woocommerce-thankyou-order-received mb-6 text-[18px] leading-7 text-lien-text">
              Cảm ơn bạn. Đơn hàng của bạn đã được nhận.
            </p>
            <ul className="order_details mb-8 flex list-none flex-wrap p-0">
              <li className={detail}>
                Mã đơn hàng: <strong className={value}>#{order.number}</strong>
              </li>
              <li className={detail}>
                Ngày: <strong className={value}>{formatDate(order.createdAt)}</strong>
              </li>
              {order.customer.email ? (
                <li className={detail}>
                  Email: <strong className={value}>{order.customer.email}</strong>
                </li>
              ) : null}
              {order.discount > 0 ? (
                <li className={detail}>
                  Giảm giá{order.voucherCode ? ` (${order.voucherCode})` : ""}: <strong className={value}>−{formatAmount(order.discount)}đ</strong>
                </li>
              ) : null}
              <li className={detail}>
                Tổng cộng:{" "}
                <strong className={value}>
                  <Price value={order.total} currency={order.currency} />
                </strong>
              </li>
              <li className={detail}>
                Phương thức thanh toán: <strong className={value}>{PAYMENT_LABEL[order.paymentMethod]}</strong>
              </li>
            </ul>
            {order.paymentMethod === "bacs" ? (
              <section className="woocommerce-bacs-bank-details mb-8 rounded-md border border-lien-line bg-white p-5">
                <WooHeading as="h2" className="!mt-0">
                  Chuyển khoản {order.prepaidRequired ? "toàn bộ giá trị đơn hàng" : "để hoàn tất đơn hàng"}
                </WooHeading>
                <div className="grid gap-6 md:grid-cols-[220px_1fr]">
                  {/* eslint-disable-next-line @next/next/no-img-element -- external VietQR image generated per order */}
                  <img src={vietQrUrl(order.total, transferContent(order.number))} alt={`Mã QR chuyển khoản ${formatAmount(order.total)}đ`} width={220} height={220} className="h-auto w-[220px] rounded border border-lien-line" />
                  <dl className="m-0 grid grid-cols-[130px_1fr] gap-y-2 text-[14px] leading-6 text-lien-text">
                    <dt className="text-lien-muted">Ngân hàng</dt>
                    <dd className="m-0 font-semibold">
                      {BANK.bank} <span className="font-normal text-lien-muted">({BANK.branch})</span>
                    </dd>
                    <dt className="text-lien-muted">Số tài khoản</dt>
                    <dd className="m-0 text-[18px] font-bold tracking-wide text-lien-heading">{BANK.accountNumber}</dd>
                    <dt className="text-lien-muted">Chủ tài khoản</dt>
                    <dd className="m-0 font-semibold">{BANK.accountName}</dd>
                    <dt className="text-lien-muted">Số tiền</dt>
                    <dd className="m-0 text-[18px] font-bold text-lien-sale-text">{formatAmount(order.total)}đ</dd>
                    <dt className="text-lien-muted">Nội dung CK</dt>
                    <dd className="m-0">
                      <code className="rounded bg-lien-cream px-2 py-1 text-[15px] font-bold text-lien-heading">{transferContent(order.number)}</code>
                    </dd>
                  </dl>
                </div>
                <p className="mt-4 mb-0 text-[13px] leading-5 text-lien-muted">
                  Quét mã bằng ứng dụng ngân hàng: số tiền và nội dung đã được điền sẵn. {order.prepaidRequired ? "Đơn có hàng order nên cần thanh toán đủ trước khi LienStore đặt mua tại Nhật." : "Đơn được xử lý ngay khi nhận được tiền."} Chuyển xong có thể gửi ảnh
                  biên lai qua Zalo 0964 839 769 để được xác nhận nhanh.
                </p>
              </section>
            ) : null}
            <OrderSummary order={order} receipts={receipts} />
          </div>
        </article>
      </TwoColumnShell>
    </SiteChrome>
  );
}
