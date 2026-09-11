import type { Metadata } from "next";
import { t } from "@/lib/i18n";
import { getLang } from "@/lib/lang-server";
import Link from "next/link";
import { customerLogout, customerSendMessageAction } from "@/app/my-account/actions";
import { OrderChat } from "@/components/sites/lienstore/shop/cart/OrderChat";
import { AccountDetailsForm, LoginRegisterForms } from "@/components/sites/lienstore/shop/cart/AccountForms";
import { OrderAddress, OrderSummary, STATUS_LABEL } from "@/components/sites/lienstore/shop/cart/OrderDetails";
import { OrderLookupForm } from "@/components/sites/lienstore/shop/cart/OrderLookupForm";
import { displayEmail } from "@/lib/customer-email";
import { getHomeVouchers } from "@/lib/db";
import { VoucherStrip } from "@/components/sites/lienstore/ui2/VoucherStrip";
import { StoreSidebar } from "@/components/sites/lienstore/shop/cart/StoreSidebar";
import { Price, shopTableClass, shopTdClass, shopThClass, WooHeading, WooNotice, wooButtonClass } from "@/components/sites/lienstore/shop/cart/WooUi";
import { SiteChrome, TwoColumnShell } from "@/components/sites/lienstore/shop/SiteChrome";
import { getCurrentCustomer } from "@/lib/customer-auth";
import { getOrderById, getOrderMessages, getOrdersForCustomer, markOrderMessagesRead } from "@/lib/db";
import { receiptLinksFor } from "@/lib/order-files";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tài khoản – LienStore" };

type Tab = "dashboard" | "orders" | "vouchers" | "address" | "details";
const TAB_JA: Record<Tab, "dashboard" | "orders" | "vouchersTab" | "addressTab" | "accountDetails"> = { dashboard: "dashboard", orders: "orders", vouchers: "vouchersTab", address: "addressTab", details: "accountDetails" };
const TABS: { key: Tab; label: string }[] = [
  { key: "dashboard", label: "Bảng điều khiển" },
  { key: "orders", label: "Đơn hàng" },
  { key: "vouchers", label: "Voucher" },
  { key: "address", label: "Địa chỉ" },
  { key: "details", label: "Chi tiết tài khoản" },
];

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function MyAccount({ searchParams }: Props) {
  const lang = await getLang();
  const customer = await getCurrentCustomer();
  const sp = await searchParams;
  const tabRaw = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const tab: Tab = TABS.some((x) => x.key === tabRaw) ? (tabRaw as Tab) : "dashboard";
  const viewId = Array.isArray(sp.view) ? sp.view[0] : sp.view;

  return (
    <SiteChrome>
      <TwoColumnShell sidebar={<StoreSidebar />} title={t(lang, "accountTitle")}>
        <article className="entry-content">
          {customer ? (
            <div className="woocommerce sm:flex sm:gap-8">
              <nav className="woocommerce-MyAccount-navigation mb-6 sm:w-[30%]" aria-label="Tài khoản">
                <ul className="m-0 list-none border-t border-lien-line p-0">
                  {TABS.map((tab0) => (
                    <li key={tab0.key} className="border-b border-lien-line">
                      <Link
                        href={tab0.key === "dashboard" ? "/my-account/" : `/my-account/?tab=${tab0.key}`}
                        className={cn("block px-1 py-2.5 text-[16px] no-underline", tab === tab0.key ? "font-bold text-lien-blue" : "text-lien-muted hover:text-lien-blue")}
                      >
                        {lang === "ja" ? t(lang, TAB_JA[tab0.key]) : tab0.label}
                      </Link>
                    </li>
                  ))}
                  <li className="border-b border-lien-line">
                    <form action={customerLogout}>
                      <button type="submit" className="block w-full px-1 py-2.5 text-left text-[16px] text-lien-muted hover:text-lien-blue">
                        Đăng xuất
                      </button>
                    </form>
                  </li>
                </ul>
              </nav>
              <div className="woocommerce-MyAccount-content min-w-0 flex-1">
                {tab === "dashboard" ? (
                  <>
                    <div className="mb-4 text-[16px] leading-6">
                      Xin chào <strong>{customer.firstName || customer.email}</strong> (không phải tài khoản <strong>{customer.firstName || customer.email}</strong>?{" "}
                      <form action={customerLogout} className="inline">
                        <button type="submit" className="text-lien-muted underline hover:text-lien-blue">
                          Đăng xuất
                        </button>
                      </form>
                      )
                    </div>
                    <p className="text-[16px] leading-6">
                      Từ trang quản lý tài khoản bạn có thể xem{" "}
                      <Link href="/my-account/?tab=orders" className="text-lien-muted underline hover:text-lien-blue">
                        đơn hàng mới
                      </Link>
                      , quản lý{" "}
                      <Link href="/my-account/?tab=address" className="text-lien-muted underline hover:text-lien-blue">
                        địa chỉ giao hàng
                      </Link>{" "}
                      và{" "}
                      <Link href="/my-account/?tab=details" className="text-lien-muted underline hover:text-lien-blue">
                        sửa mật khẩu, thông tin tài khoản
                      </Link>
                      .
                    </p>
                  </>
                ) : null}

                {tab === "orders" ? <OrdersTab customerId={customer.id} email={customer.email} viewId={viewId} /> : null}

                {tab === "vouchers" ? (
                  <>
                    <WooHeading as="h3" className="mt-0">
                      Voucher của bạn
                    </WooHeading>
                    <p className="mb-4 text-[16px] leading-6 text-lien-muted">Mã tặng riêng cho tài khoản này và các ưu đãi đang chạy trên website. Nhập mã ở trang thanh toán.</p>
                    {(await getHomeVouchers(customer.id)).length ? (
                      <VoucherStrip className="!my-0" vouchers={(await getHomeVouchers(customer.id)).map((v) => ({ code: v.code, kind: v.kind, value: v.value, minSubtotal: v.minSubtotal, maxDiscount: v.maxDiscount, endsAt: v.endsAt, personal: v.personal, note: v.note }))} />
                    ) : (
                      <WooNotice kind="info">Hiện chưa có voucher nào dành cho bạn.</WooNotice>
                    )}
                  </>
                ) : null}

                {tab === "address" ? (
                  <>
                    <WooHeading as="h3" className="mt-0">
                      Địa chỉ thanh toán
                    </WooHeading>
                    <p className="mb-4 text-[16px] leading-6 text-lien-muted">Địa chỉ sau sẽ được dùng mặc định trên trang thanh toán.</p>
                    {customer.address || customer.phone ? (
                      <OrderAddress customer={{ firstName: customer.firstName, lastName: customer.lastName, address: customer.address, phone: customer.phone, email: displayEmail(customer.email), note: "" }} />
                    ) : (
                      <WooNotice kind="info">Bạn chưa thiết lập địa chỉ này.</WooNotice>
                    )}
                    <p className="mt-4">
                      <Link href="/my-account/?tab=details" className={wooButtonClass}>
                        Sửa địa chỉ
                      </Link>
                    </p>
                  </>
                ) : null}

                {tab === "details" ? (
                  <>
                    <WooHeading as="h3" className="mt-0">
                      Chi tiết tài khoản
                    </WooHeading>
                    <AccountDetailsForm customer={customer} />
                  </>
                ) : null}
              </div>
            </div>
          ) : (
            <>
              <LoginRegisterForms />
              <hr className="my-8 border-lien-line" />
              <OrderLookupForm />
              <WooNotice kind="info">
                Quản trị viên?{" "}
                <Link href="/admin/login/" className="text-lien-muted underline hover:text-lien-blue">
                  Đăng nhập trang quản trị
                </Link>
              </WooNotice>
            </>
          )}
        </article>
      </TwoColumnShell>
    </SiteChrome>
  );
}

async function OrdersTab({ customerId, email, viewId }: { customerId: string; email: string; viewId?: string }) {
  if (viewId) {
    const order = await getOrderById(viewId);
    if (order && (order.customerId === customerId || order.customer.email.toLowerCase() === email.toLowerCase())) {
      await markOrderMessagesRead(order.id, "customer");
      const messages = await getOrderMessages(order.id);
      return (
        <>
          <p className="mb-6 text-[16px] leading-6">
            Đơn hàng <mark className="bg-transparent font-bold">#{order.number}</mark> đã được đặt vào <mark className="bg-transparent font-bold">{formatDate(order.createdAt)}</mark> và hiện tại{" "}
            <mark className="bg-transparent font-bold">{STATUS_LABEL[order.status]}</mark>.
          </p>
          <OrderSummary order={order} receipts={await receiptLinksFor(order.id)} />
          <section className="mt-8">
            <WooHeading as="h3">Trao đổi với LienStore</WooHeading>
            <OrderChat orderId={order.id} messages={messages} me="customer" action={customerSendMessageAction} />
          </section>
          <p className="mt-4">
            <Link href="/my-account/?tab=orders" className="text-lien-blue hover:underline">
              ← Tất cả đơn hàng
            </Link>
          </p>
        </>
      );
    }
  }
  const orders = await getOrdersForCustomer({ id: customerId, email });
  if (orders.length === 0) {
    return (
      <WooNotice
        kind="info"
        action={
          <Link href="/shop/" className={wooButtonClass}>
            Mua sắm
          </Link>
        }
      >
        Chưa có đơn hàng nào được thực hiện.
      </WooNotice>
    );
  }
  return (
    <table className={cn(shopTableClass, "woocommerce-orders-table")}>
      <thead>
        <tr>
          <th className={shopThClass}>Đơn hàng</th>
          <th className={shopThClass}>Ngày</th>
          <th className={shopThClass}>Trạng thái</th>
          <th className={shopThClass}>Tổng</th>
          <th className={shopThClass}>
            <span className="sr-only">Thao tác</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {orders.map((o) => (
          <tr key={o.id}>
            <td className={shopTdClass}>
              <Link href={`/my-account/?tab=orders&view=${o.id}`} className="text-lien-muted hover:text-lien-blue">
                #{o.number}
              </Link>
            </td>
            <td className={shopTdClass}>{formatDate(o.createdAt)}</td>
            <td className={shopTdClass}>{STATUS_LABEL[o.status]}</td>
            <td className={shopTdClass}>
              <Price value={o.total} currency={o.currency} /> cho {o.items.reduce((n, it) => n + it.quantity, 0)} sản phẩm
            </td>
            <td className={cn(shopTdClass, "text-right")}>
              <Link href={`/my-account/?tab=orders&view=${o.id}`} className={wooButtonClass}>
                Xem
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
