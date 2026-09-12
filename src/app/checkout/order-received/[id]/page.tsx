import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { customerSendMessageAction } from "@/app/my-account/actions";
import { T } from "@/components/sites/lienstore/shared/LangProvider";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { ClearCartOnMount } from "@/components/sites/lienstore/shop/cart/ClearCartOnMount";
import { OrderChat } from "@/components/sites/lienstore/shop/cart/OrderChat";
import { OrderReceipts, PAYMENT_LABEL } from "@/components/sites/lienstore/shop/cart/OrderDetails";
import { OrderParcel } from "@/components/sites/lienstore/shop/cart/OrderParcel";
import { OrderStatusWatcher } from "@/components/sites/lienstore/shop/cart/OrderStatusWatcher";
import { OrderTracker } from "@/components/sites/lienstore/shop/cart/OrderTracker";
import { Price } from "@/components/sites/lienstore/shop/cart/WooUi";
import { SiteChrome } from "@/components/sites/lienstore/shop/SiteChrome";
import { PageBand } from "@/components/sites/lienstore/ui2/HomeBlocks";
import { getOrderById, getOrderLegs, getOrderMessages, getSiteTheme, markOrderMessagesRead } from "@/lib/db";
import { formatAmount, formatDateTime } from "@/lib/format";
import { receiptLinksFor } from "@/lib/order-files";
import { BANK, transferContent, vietQrUrl } from "@/lib/payment";
import { stageIndex } from "@/lib/shipping";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Đơn hàng đã xác nhận" };

interface Props {
  params: Promise<{ id: string }>;
}

const card = "rounded-md border border-lien-line bg-white p-4 sm:p-5";
const cardTitle = "m-0 mb-3 flex items-center gap-2 text-[16px] font-bold text-lien-heading";

/**
 * Order page laid out like a Mercari transaction: order facts on the left (items, totals, recipient), the
 * live part in the middle (payment, shipping progress, parcel, conversation).
 */
export default async function OrderReceived({ params }: Props) {
  const { id } = await params;
  const order = await getOrderById(id);
  if (!order) notFound();
  await markOrderMessagesRead(order.id, "customer");
  const [receipts, messages, legMap, theme] = await Promise.all([receiptLinksFor(order.id), getOrderMessages(order.id), getOrderLegs([order.id]), getSiteTheme()]);
  const legs = legMap.get(order.id) ?? [];
  const paid = stageIndex(order.shipStage) >= stageIndex("paid") && order.status !== "cancelled";
  const c = order.customer;

  return (
    <SiteChrome>
      <div id="content" className="overflow-x-clip">
        <PageBand title={`Đơn hàng #${order.number}`} crumbs={[{ label: "Đơn hàng", href: "/my-account/?tab=orders" }, { label: `#${order.number}` }]} />
        <ClearCartOnMount />
        <OrderStatusWatcher orderId={order.id} stage={order.shipStage} status={order.status} />
        <div className="mx-auto grid max-w-[1300px] gap-6 px-4 py-6 lg:grid-cols-[360px_1fr] lg:items-start">
          {/* ---- left: what was ordered ------------------------------------------------------------------- */}
          <aside className="space-y-4 lg:sticky lg:top-[88px]">
            <section className={card} aria-label="Thông tin đơn hàng">
              <h2 className={cardTitle}>
                <Fa name="shopping-bag" className="text-lien-blue" /> <T k="orderInfo" />
              </h2>
              <ul className="m-0 list-none divide-y divide-lien-line p-0">
                {order.items.map((it) => (
                  <li key={it.productId} className="flex items-center gap-3 py-2.5">
                    <Link href={`/product/${it.slug}/`} className="shrink-0">
                      {it.image ? <Image src={it.image} alt="" width={56} height={56} unoptimized className="h-14 w-14 rounded border border-lien-line object-cover" /> : <span className="block h-14 w-14 rounded border border-lien-line bg-lien-cream" />}
                    </Link>
                    <div className="min-w-0 flex-1">
                      <Link href={`/product/${it.slug}/`} className="line-clamp-2 text-[13px] leading-5 text-lien-heading no-underline hover:text-lien-blue">
                        {it.name}
                      </Link>
                      <span className="text-[12px] text-lien-muted">× {it.quantity}</span>
                    </div>
                    <span className="whitespace-nowrap text-[13px] font-semibold text-lien-heading">
                      <Price value={it.price * it.quantity} currency={order.currency} />
                    </span>
                  </li>
                ))}
              </ul>
              <dl className="m-0 mt-3 grid grid-cols-[1fr_auto] gap-y-1.5 border-t border-lien-line pt-3 text-[14px] leading-6">
                <dt className="text-lien-muted">
                  <T k="subtotal" />
                </dt>
                <dd className="m-0 text-right">
                  <Price value={order.subtotal} currency={order.currency} />
                </dd>
                {order.discount > 0 ? (
                  <>
                    <dt className="text-lien-muted">Giảm giá{order.voucherCode ? ` (${order.voucherCode})` : ""}</dt>
                    <dd className="m-0 text-right text-lien-success">−{formatAmount(order.discount)}đ</dd>
                  </>
                ) : null}
                <dt className="text-lien-muted">Giao hàng</dt>
                <dd className="m-0 text-right">
                  {order.shippingFee > 0 ? (
                    order.shipFeePayment === "on_delivery" ? (
                      <span className="text-lien-muted">trả cho shipper</span>
                    ) : (
                      <>
                        {formatAmount(order.shippingFee)}đ<span className="block text-[11px] font-normal text-lien-muted">đã gồm trong mã QR</span>
                      </>
                    )
                  ) : (
                    "0đ"
                  )}
                </dd>
                <dt className="font-bold text-lien-heading">
                  <T k="total" />
                </dt>
                <dd className="m-0 text-right text-[18px] font-bold text-lien-heading">
                  <Price value={order.total} currency={order.currency} />
                </dd>
                <dt className="text-lien-muted">Thanh toán</dt>
                <dd className="m-0 text-right">{PAYMENT_LABEL[order.paymentMethod]}</dd>
                <dt className="text-lien-muted">Đặt lúc</dt>
                <dd className="m-0 text-right">{formatDateTime(order.createdAt)}</dd>
                <dt className="text-lien-muted">Mã đơn</dt>
                <dd className="m-0 text-right font-mono font-semibold">#{order.number}</dd>
              </dl>
            </section>

            <section className={card} aria-label="Người nhận">
              <h2 className={cardTitle}>
                <Fa name="map-marker" className="text-lien-blue" /> <T k="recipientLabel" />
              </h2>
              <p className="m-0 text-[14px] leading-6 text-lien-text">
                <strong className="text-lien-heading">
                  {c.lastName} {c.firstName}
                </strong>
                <br />
                {c.address}
                <br />
                <Fa name="phone" className="mr-1 text-lien-muted" />
                {c.phone}
                {c.email ? (
                  <>
                    <br />
                    <Fa name="envelope" className="mr-1 text-lien-muted" />
                    {c.email}
                  </>
                ) : null}
              </p>
              {c.note ? <p className="m-0 mt-2 rounded bg-lien-cream px-2.5 py-1.5 text-[13px] leading-5 text-lien-muted">Ghi chú: {c.note}</p> : null}
            </section>
          </aside>

          {/* ---- centre: what is happening ------------------------------------------------------------------ */}
          <main className="min-w-0 space-y-4">
            {paid ? (
              <section className="rounded-md border border-[#8fae1b] bg-[#f4fbe8] p-4 text-[15px] leading-6 text-lien-text sm:p-5" role="status">
                <p className="m-0 text-[18px] font-bold text-lien-success">✔ Thanh toán thành công</p>
                <p className="m-0 mt-1">
                  {theme.shopName} đã xác nhận nhận được thanh toán cho đơn #{order.number}. Cảm ơn bạn! Hàng đang được đặt mua tại Nhật, bạn theo dõi tiến độ ngay bên dưới.
                </p>
              </section>
            ) : null}
            {order.status === "cancelled" ? <p className="m-0 rounded-md bg-[#fde8ea] px-4 py-3 text-[14px] font-semibold text-[#842029]">Đơn hàng đã huỷ.</p> : null}
            {order.paymentMethod === "bacs" && !paid && order.status !== "cancelled" ? (
              <section className={card} aria-label="Chuyển khoản">
                <h2 className={cardTitle}>
                  <Fa name="credit-card" className="text-lien-blue" /> Chuyển khoản {order.prepaidRequired ? "toàn bộ giá trị đơn hàng" : "để hoàn tất đơn hàng"}
                </h2>
                <div className="grid gap-5 md:grid-cols-[200px_1fr]">
                  {/* eslint-disable-next-line @next/next/no-img-element -- external VietQR image generated per order */}
                  <img src={vietQrUrl(order.total, transferContent(order.number))} alt={`Mã QR chuyển khoản ${formatAmount(order.total)}đ`} width={200} height={200} className="h-auto w-[200px] rounded border border-lien-line" />
                  <dl className="m-0 grid grid-cols-[120px_1fr] gap-y-2 text-[14px] leading-6 text-lien-text">
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
                  Quét mã bằng ứng dụng ngân hàng: số tiền và nội dung đã được điền sẵn. {order.prepaidRequired ? "Đơn có hàng order nên cần thanh toán đủ trước khi shop đặt mua tại Nhật." : "Đơn được xử lý ngay khi nhận được tiền."} Chuyển xong có thể gửi ảnh biên lai qua Zalo 0964 839 769 hoặc nhắn ở khung bên dưới. Trang này tự cập nhật khi {theme.shopName} xác nhận thanh toán.
                </p>
              </section>
            ) : null}

            <section className={card} aria-label="Trạng thái vận chuyển">
              <h2 className={cardTitle}>
                <Fa name="truck" className="text-lien-blue" /> <T k="shippingStatus" />
              </h2>
              <OrderTracker order={order} />
            </section>

            <OrderParcel order={order} legs={legs} />

            {receipts.length ? (
              <section className={card}>
                <OrderReceipts files={receipts} />
              </section>
            ) : null}

            <section className={card} aria-label="Trao đổi">
              <h2 className={cardTitle}>
                <Fa name="comments-o" className="text-lien-blue" /> <T k="chatWithShop" />
              </h2>
              <OrderChat orderId={order.id} messages={messages} me="customer" action={customerSendMessageAction} hidden={{ source: "received" }} shopName={theme.shopName} />
            </section>
          </main>
        </div>
      </div>
    </SiteChrome>
  );
}
