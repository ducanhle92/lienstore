import Image from "next/image";
import { redirect } from "next/navigation";
import { AutoPrint } from "@/components/sites/lienstore/admin/AutoPrint";
import { contact } from "@/components/sites/lienstore/root-8a5edab2/data";
import { getAdminSession } from "@/lib/auth";
import { getOrderById, getOrderLegs, getSiteTheme } from "@/lib/db";
import { formatDateTime, formatPrice } from "@/lib/format";
import type { Order } from "@/types/shop";

export const dynamic = "force-dynamic";
export const metadata = { title: "In hoá đơn", robots: { index: false, follow: false } };

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}
const all = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []).flatMap((x) => x.split(",")).map((x) => x.trim()).filter(Boolean);

/**
 * Phiếu giao hàng / hoá đơn for the ticked orders (⑥ Kho VN › Đơn hàng, ⑦ Giao hàng VN): one A5 sheet per order, outside
 * the admin chrome, print dialog opened on load. Money follows the account: with "Xem giá bán" the full price lines and
 * totals, without it only what the shipper / shop must collect (COD) or "Đã thanh toán".
 */
export default async function PrintOrders({ searchParams }: Props) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login/");
  const may = ["orders", "kho_vn", "delivery"].some((k) => session.permissions.includes(k));
  if (!may) redirect("/admin/?denied=orders");
  const seePrices = session.permissions.includes("see_prices");
  const sp = await searchParams;
  const ids = [...new Set([...all(sp.ids), ...all(sp.orderIds)])].slice(0, 200);
  const orders = (await Promise.all(ids.map((id) => getOrderById(id)))).filter((o): o is Order => !!o);
  const legs = await getOrderLegs(orders.map((o) => o.id));
  const theme = await getSiteTheme();
  const printedAt = formatDateTime(new Date().toISOString());

  return (
    <div className="print-root min-h-screen bg-[#e5e7eb] py-6 text-[13px] text-black print:bg-white print:py-0">
      <style>{`
        @page { size: A5 portrait; margin: 8mm; }
        @media print { .no-print { display: none !important; } .sheet { box-shadow: none !important; margin: 0 !important; width: auto !important; min-height: 0 !important; } .sheet + .sheet { break-before: page; } }
      `}</style>
      <AutoPrint count={orders.length} />
      {orders.length === 0 ? <p className="no-print mx-auto max-w-[148mm] rounded bg-white p-6 text-center">Không có đơn nào để in (chưa tick đơn, hoặc đơn đã bị xoá).</p> : null}
      {orders.map((o) => {
        const c = o.customer;
        const pickup = o.delivery === "pickup";
        const leg = (legs.get(o.id) ?? []).find((l) => l.leg === "vn_domestic");
        const toCollect = o.paidAt || o.status === "cancelled" ? 0 : o.total;
        const qty = o.items.reduce((n, it) => n + it.quantity, 0);
        return (
          <section key={o.id} className="sheet mx-auto mb-6 w-[148mm] min-h-[200mm] bg-white p-[8mm] shadow" data-testid={`invoice-${o.number}`}>
            <header className="flex items-start justify-between gap-4 border-b border-black pb-2">
              <div className="flex items-center gap-2">
                {theme.logoLight ? <Image src={theme.logoLight} alt={theme.shopName} width={800} height={388} sizes="110px" className="h-auto w-[110px]" /> : null}
                <div className="leading-4">
                  <div className="text-[15px] font-bold">{theme.shopName}</div>
                  <div className="text-[11px]">{contact.address}</div>
                  <div className="text-[11px]">ĐT {contact.phones.map((p) => p.number).join(" · ")}</div>
                </div>
              </div>
              <div className="text-right leading-5">
                <div className="text-[16px] font-bold uppercase">{seePrices ? "Hoá đơn" : "Phiếu giao hàng"}</div>
                <div className="text-[15px] font-bold">#{o.number}</div>
                <div className="text-[11px]">Đặt {formatDateTime(o.createdAt)}</div>
              </div>
            </header>

            <div className="mt-3 grid grid-cols-[1fr_auto] gap-3">
              <div className="leading-5">
                <div className="text-[11px] uppercase text-[#555]">Người nhận</div>
                <div className="text-[15px] font-bold">
                  {c.lastName} {c.firstName}
                </div>
                <div className="text-[14px] font-semibold">{c.phone}</div>
                <div>{pickup ? "Khách tới kho lấy" : c.address}</div>
                {c.note ? <div className="mt-1 italic">Ghi chú: {c.note}</div> : null}
              </div>
              <div className="text-right leading-5">
                <div className="text-[11px] uppercase text-[#555]">Giao hàng</div>
                <div className="font-semibold">{pickup ? "Nhận tại kho" : leg?.label || o.shippingLabel || "Giao tận nhà"}</div>
                {leg?.tracking ? <div className="font-mono text-[12px]">Mã: {leg.tracking}</div> : null}
              </div>
            </div>

            <table className="mt-3 w-full border-collapse text-[12px]">
              <thead>
                <tr className="border-y border-black">
                  <th className="py-1 pr-1 text-left font-semibold">#</th>
                  <th className="py-1 text-left font-semibold">Sản phẩm</th>
                  <th className="py-1 text-right font-semibold">SL</th>
                  {seePrices ? <th className="py-1 text-right font-semibold">Đơn giá</th> : null}
                  {seePrices ? <th className="py-1 text-right font-semibold">Thành tiền</th> : null}
                </tr>
              </thead>
              <tbody>
                {o.items.map((it, i) => (
                  <tr key={it.itemId ?? it.productId} className="border-b border-[#ccc] align-top">
                    <td className="py-1 pr-1">{i + 1}</td>
                    <td className="py-1">{it.name}</td>
                    <td className="py-1 text-right">{it.quantity}</td>
                    {seePrices ? <td className="whitespace-nowrap py-1 pl-2 text-right">{formatPrice(it.price, o.currency)}</td> : null}
                    {seePrices ? <td className="whitespace-nowrap py-1 pl-2 text-right">{formatPrice(it.price * it.quantity, o.currency)}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-2 ml-auto w-[70%] leading-6">
              <div className="flex justify-between">
                <span>Tổng số lượng</span>
                <span>{qty} cái</span>
              </div>
              {seePrices ? (
                <>
                  <div className="flex justify-between">
                    <span>Tạm tính</span>
                    <span>{formatPrice(o.subtotal, o.currency)}</span>
                  </div>
                  {o.discount > 0 ? (
                    <div className="flex justify-between">
                      <span>Giảm giá</span>
                      <span>−{formatPrice(o.discount, o.currency)}</span>
                    </div>
                  ) : null}
                  <div className="flex justify-between">
                    <span>Phí giao hàng{o.shipFeePayment === "on_delivery" ? " (khách trả shipper)" : ""}</span>
                    <span>{o.shippingFee > 0 ? formatPrice(o.shippingFee, o.currency) : "Miễn phí"}</span>
                  </div>
                  <div className="flex justify-between border-t border-black font-bold">
                    <span>Tổng</span>
                    <span>{formatPrice(o.total, o.currency)}</span>
                  </div>
                </>
              ) : null}
              <div className="mt-1 flex items-center justify-between rounded border-2 border-black px-2 py-1 text-[15px] font-bold" data-testid={`invoice-collect-${o.number}`}>
                <span>{toCollect ? (o.paymentMethod === "cod" ? "Thu hộ (COD)" : "Cần thu") : "Đã thanh toán"}</span>
                <span>{toCollect ? formatPrice(toCollect, o.currency) : "0đ"}</span>
              </div>
              {toCollect && o.shipFeePayment === "on_delivery" && !pickup ? <div className="text-right text-[11px]">+ phí ship khách trả shipper</div> : null}
            </div>

            <footer className="mt-6 grid grid-cols-2 gap-6 text-center text-[11px]">
              <div>
                Người giao
                <div className="h-12" />
              </div>
              <div>
                Người nhận (ký, ghi rõ họ tên)
                <div className="h-12" />
              </div>
            </footer>
            <p className="mt-2 text-center text-[10px] text-[#666]">
              Cảm ơn quý khách đã mua hàng tại {theme.shopName} · In lúc {printedAt}
            </p>
          </section>
        );
      })}
    </div>
  );
}
