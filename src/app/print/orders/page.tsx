import Image from "next/image";
import { redirect } from "next/navigation";
import { AutoPrint } from "@/components/sites/lienstore/admin/AutoPrint";
import { contact, invoiceInfo } from "@/components/sites/lienstore/root-8a5edab2/data";
import { getAdminSession } from "@/lib/auth";
import { accountForOrder, orderQrPayload } from "@/lib/bank-config";
import { getOrderById, getSiteTheme } from "@/lib/db";
import { formatAmount, formatDate } from "@/lib/format";

/** Money as on the shop's paper invoice: 1.650.000đ */
const vnd = (n: number) => `${formatAmount(Math.round(n))}đ`;
import { BANK_BINS } from "@/lib/vietqr";
import { paginateInvoice } from "@/lib/invoice-layout";
import { qrArtSvg } from "@/lib/qr-art";
import type { BankAccount, Order } from "@/types/shop";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}
const all = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []).flatMap((x) => x.split(",")).map((x) => x.trim()).filter(Boolean);

/** Full legal names printed under "Thông tin thanh toán" (the short code alone means little to a customer). */
const BANK_FULL: Record<string, string> = {
  BIDV: "NH TMCP Đầu tư và Phát triển Việt Nam",
  VCB: "NH TMCP Ngoại thương Việt Nam",
  VIETCOMBANK: "NH TMCP Ngoại thương Việt Nam",
  CTG: "NH TMCP Công thương Việt Nam",
  VIETINBANK: "NH TMCP Công thương Việt Nam",
  TCB: "NH TMCP Kỹ thương Việt Nam",
  TECHCOMBANK: "NH TMCP Kỹ thương Việt Nam",
  MB: "NH TMCP Quân đội",
  MBBANK: "NH TMCP Quân đội",
  ACB: "NH TMCP Á Châu",
  VPB: "NH TMCP Việt Nam Thịnh Vượng",
  VPBANK: "NH TMCP Việt Nam Thịnh Vượng",
  TPB: "NH TMCP Tiên Phong",
  TPBANK: "NH TMCP Tiên Phong",
  AGRIBANK: "NH Nông nghiệp và Phát triển Nông thôn Việt Nam",
};
const bankLine = (a: BankAccount) => {
  const k = a.bank.toUpperCase();
  const short = BANK_BINS[k]?.name ?? a.bank;
  const full = BANK_FULL[k] ?? a.branch;
  return `Ngân hàng ${short}${full ? ` - ${full}` : ""}`;
};
const PAYMENT: Record<string, string> = { bacs: "Chuyển khoản", cod: "COD (thu khi giao)" };

export async function generateMetadata({ searchParams }: Props) {
  const ids = all((await searchParams).ids).concat(all((await searchParams).orderIds));
  const orders = (await Promise.all(ids.slice(0, 20).map((id) => getOrderById(id)))).filter((o): o is Order => !!o);
  // the browser's "Save as PDF" proposes the page title as the file name
  return { title: `HoaDon-${orders.map((o) => o.number).join("-") || "trong"}`, robots: { index: false, follow: false } };
}

/**
 * Hoá đơn for the ticked orders (⑥ Kho VN › Đơn hàng, ⑦ Giao hàng VN): one A5 sheet per order in the shop's invoice
 * layout — contacts + logo, customer block, "HÓA ĐƠN", items with prices, totals, bank details with a VietQR code.
 * Opened in a new tab outside the admin chrome; the print dialog prints it or saves it as an A5 PDF.
 * Shows selling prices only (never cost): it is the paper that goes into the customer's parcel.
 */
export default async function PrintOrders({ searchParams }: Props) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login/");
  if (!["orders", "kho_vn", "delivery"].some((k) => session.permissions.includes(k))) redirect("/admin/?denied=orders");
  const sp = await searchParams;
  const ids = [...new Set([...all(sp.ids), ...all(sp.orderIds)])].slice(0, 200);
  const orders = (await Promise.all(ids.map((id) => getOrderById(id)))).filter((o): o is Order => !!o);
  const theme = await getSiteTheme();
  const sheets = await Promise.all(
    orders.map(async (o) => {
      const bank = await accountForOrder(o);
      const due = o.paidAt || o.status === "cancelled" ? 0 : o.total;
      // unpaid: the code carries the amount and the order's pay code (SePay matches it); paid: the bare account
      let qr = "";
      try {
        qr = bank.accountNumber ? qrArtSvg(orderQrPayload(bank, due, due ? o.payCode : ""), { color: "#0f4d3a", logoHref: theme.icon }) : "";
      } catch {
        qr = "";
      }
      return { o, bank, due, qr };
    }),
  );
  const zalo = contact.phones.find((p) => p.label === "VN")?.number ?? contact.phones[0]?.number ?? "";

  return (
    <div className="min-h-screen bg-[#e5e7eb] py-6 font-sans text-[#1f2a44] print:bg-white print:py-0">
      <style>{`
        @page { size: A5 portrait; margin: 0; }
        @media print { .no-print { display: none !important; } .sheet { box-shadow: none !important; margin: 0 !important; } .sheet + .sheet { break-before: page; } }
        .sheet { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      `}</style>
      <AutoPrint count={orders.length} />
      {orders.length === 0 ? <p className="no-print mx-auto max-w-[148mm] rounded bg-white p-6 text-center">Không có đơn nào để in (chưa tick đơn, hoặc đơn đã bị xoá).</p> : null}
      {sheets.flatMap(({ o, bank, due, qr }) => {
        const c = o.customer;
        const name = `${c.lastName} ${c.firstName}`.trim();
        const pickup = o.delivery === "pickup";
        const address = pickup ? "Khách tới kho lấy" : c.address;
        const totalsLines = 1 + (o.discount > 0 ? 1 : 0) + (o.shippingFee > 0 ? 1 : 0);
        const pages = paginateInvoice(o.items, { address, totalsLines });
        return pages.map((pg, pi) => (
          <section key={`${o.id}-${pi}`} className="sheet relative mx-auto mb-6 flex h-[210mm] w-[148mm] flex-col overflow-hidden bg-white px-[11mm] pt-[9mm] pb-[8mm] text-[10pt] leading-snug shadow" data-testid={`invoice-${o.number}-p${pi + 1}`}>
            {/* contacts · logo — repeated on every page */}
            <header className="flex items-start justify-between gap-3">
              <ul className="m-0 mt-[5mm] list-none space-y-1 p-0 text-[11pt]">
                <li className="flex items-center gap-1.5">
                  <span className="inline-flex h-[15px] w-[15px] items-center justify-center rounded-full bg-[#0068ff] text-[5pt] font-bold text-white">Zalo</span>Zalo: {zalo}
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="w-[15px] text-center text-[10pt]">🛒</span>Đặt hàng: {invoiceInfo.website}
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="inline-flex h-[15px] w-[15px] items-center justify-center rounded-full bg-[#1877f2] text-[9pt] font-bold leading-none text-white">f</span>Fanpage: {invoiceInfo.fanpage}
                </li>
              </ul>
              <div className="flex shrink-0 flex-col items-end">
                {theme.logoLight ? <Image src={theme.logoLight} alt={theme.shopName} width={800} height={388} sizes="200px" className="h-auto w-[46mm]" /> : <span className="text-[20pt] font-bold text-[#d32f2f]">{theme.shopName}</span>}
                {theme.slogan ? <span className="-mt-1 text-[10pt] font-bold text-[#d32f2f]">{theme.slogan}</span> : null}
              </div>
            </header>

            {pi === 0 ? (
              <div className="mt-[7mm] flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-[12pt] font-bold uppercase">TÊN KH: {name}</div>
                  <div className="text-[9.5pt]">SĐT: {c.phone}</div>
                  <div className="text-[9.5pt]">Địa chỉ: {address}</div>
                  <div className="text-[9.5pt]">
                    Thanh toán: {PAYMENT[o.paymentMethod] ?? o.paymentMethod}
                    {o.paidAt ? " · đã thanh toán" : ""}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[24pt] font-bold leading-none text-[#d32f2f]">HÓA ĐƠN</div>
                  <div className="mt-2 text-[10pt] font-bold">Hoá đơn #{o.number}</div>
                  <div className="text-[9.5pt]">Ngày tạo đơn {formatDate(o.createdAt)}</div>
                </div>
              </div>
            ) : (
              <div className="mt-[4mm] flex items-center justify-between border-b border-[#d1d5db] pb-1 text-[9.5pt]">
                <span className="font-bold">
                  Hoá đơn #{o.number} · {name} <span className="font-normal">(tiếp theo)</span>
                </span>
                <span>
                  Trang {pi + 1}/{pages.length}
                </span>
              </div>
            )}

            {pg.rows.length ? (
              <table className="mt-[6mm] w-full border-collapse text-[10pt]">
                <thead>
                  <tr className="border-y-2 border-[#1f2a44]">
                    <th className="py-2 pl-2 text-left font-bold">Sản phẩm</th>
                    <th className="w-[18mm] py-2 text-center font-bold">Số lượng</th>
                    <th className="w-[22mm] py-2 text-right font-bold">Đơn giá</th>
                    <th className="w-[24mm] py-2 pr-2 text-right font-bold">Thành tiền</th>
                  </tr>
                </thead>
                <tbody>
                  {pg.rows.map((i) => {
                    const it = o.items[i];
                    return (
                      <tr key={it.itemId ?? `${it.productId}-${i}`} className="align-top">
                        <td className="py-[1.9mm] pl-2 pr-2">{it.name}</td>
                        <td className="py-[1.9mm] text-center">{it.quantity}</td>
                        <td className="whitespace-nowrap py-[1.9mm] pl-2 text-right">{vnd(it.price)}</td>
                        <td className="whitespace-nowrap py-[1.9mm] pl-3 pr-2 text-right">{vnd(it.price * it.quantity)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className={pg.totals ? "border-t-2 border-[#1f2a44]" : "border-t border-[#d1d5db]"}>
                    <td colSpan={4} className={pg.totals ? "" : "pt-1 text-right text-[8.5pt] italic text-[#6b7280]"}>
                      {pg.totals ? null : "còn tiếp trang sau →"}
                    </td>
                  </tr>
                </tfoot>
              </table>
            ) : null}

            {pg.totals ? (
              <div className={`ml-auto w-[64%] pr-2 text-right text-[9.5pt] leading-relaxed ${pg.rows.length ? "mt-2" : "mt-[6mm] border-t-2 border-[#1f2a44] pt-2"}`}>
                <div>Tổng cộng: {vnd(o.subtotal)}</div>
                {o.discount > 0 ? <div>Giảm giá: {vnd(o.discount)}</div> : null}
                {o.shippingFee > 0 ? (
                  <div>
                    Phí giao hàng{o.shipFeePayment === "on_delivery" ? " (khách trả shipper)" : ""}: {vnd(o.shippingFee)}
                  </div>
                ) : null}
                <div className="mt-3 inline-block border-b-2 border-[#1f2a44] pb-2 pl-6 text-[11pt] font-bold uppercase">TỔNG TIỀN: {vnd(o.total)}</div>
                {o.paidAt ? <div className="mt-1 text-[9.5pt] font-bold text-green-700">ĐÃ THANH TOÁN</div> : o.paymentMethod === "cod" ? <div className="mt-1 text-[9.5pt] font-bold text-[#d32f2f]">Thu hộ khi giao: {vnd(due)}</div> : null}
              </div>
            ) : null}

            {pg.payment ? (
              <>
                {/* red bar on the page edge, from just above the QR down to the bottom — as in the shop's template */}
                <span aria-hidden className="absolute bottom-0 left-0 h-[47mm] w-[5mm] bg-[#d32f2f]" />
                <footer className="mt-auto flex items-center gap-[7mm] pl-[4mm]" data-testid={`invoice-pay-${o.number}`}>
                  {qr ? <div className="h-[30mm] w-[30mm] shrink-0 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: qr }} /> : null}
                  <div className="text-[10pt] leading-normal">
                    <div className="mb-2 text-[10.5pt] font-bold uppercase">Thông tin thanh toán</div>
                    <div>{bankLine(bank)}</div>
                    <div>Tên tài khoản: {bank.accountName}</div>
                    <div>Số tài khoản: {bank.accountNumber}</div>
                    {due && o.payCode ? <div>Nội dung CK: {o.payCode}</div> : null}
                  </div>
                </footer>
              </>
            ) : pages.length > 1 && pi === 0 ? (
              <div className="mt-auto text-right text-[8.5pt] text-[#6b7280]">Trang 1/{pages.length}</div>
            ) : null}
          </section>
        ));
      })}
    </div>
  );
}
