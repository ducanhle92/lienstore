import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { adminSendMessageAction, deleteOrderAction, reallocateOrderAction, setItemSourceAction, setOrderStateAction, setStageAction, updateOrderCustomerAction, updateOrderItemsAction } from "@/app/admin/orders/actions";
import { isRegularBy } from "@/lib/regular-customers";
import { heldByOthers, listAllocationViews, listSourceOptions } from "@/lib/allocations-db";
import { cn } from "@/lib/utils";
import { OrderChat } from "@/components/sites/lienstore/shop/cart/OrderChat";
import { OrderTracker } from "@/components/sites/lienstore/shop/cart/OrderTracker";
import { orderSteps, SHIP_STAGES, SHIPPING_LEGS, stageIndex, TRANSIT_SUBSTEPS } from "@/lib/shipping";
import { LEG_STATUS_CLS, LEG_STATUS_LABEL } from "@/lib/leg-status";
import { purchaseIndex } from "@/lib/purchase";
import { deleteOrderFileAction } from "@/app/admin/orders/files-actions";
import { BarTools } from "@/components/sites/lienstore/admin/BulkBar";
import { ConfirmSubmit } from "@/components/sites/lienstore/admin/ConfirmSubmit";
import { InfoPopover } from "@/components/sites/lienstore/admin/InfoPopover";
import { adminInput, btnDanger, btnPrimary, btnSecondary, Card, Flash, PageHeader, StatusBadge, tableClass, tdClass, thClass } from "@/components/sites/lienstore/admin/ui";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { requireAdmin } from "@/lib/auth";
import { getAllProducts, getCustomerById, getCustomerOverview, listRegularSets, getImportQuoteConfig, getOrderById, getOrderChargeableWeightG, getOrderFiles, getOrderLegs, getOrderMessages, getShippingMethods, getSiteTheme, markOrderMessagesRead } from "@/lib/db";
import type { TransferQuotesView } from "@/components/sites/lienstore/admin/OrderLegsEditor";
import { getDb, getSetting } from "@/lib/sqlite";
import { OrderLegsEditor } from "@/components/sites/lienstore/admin/OrderLegsEditor";
import { type PickableProduct, ProductSearchSelect } from "@/components/sites/lienstore/admin/ProductSearchSelect";
import { formatDateTime, formatPrice } from "@/lib/format";
import { FILES_URL_PREFIX, formatBytes, orderFileToken } from "@/lib/uploads";
import { SheetTable } from "@/components/sites/lienstore/admin/SheetTable";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const PAYMENT: Record<string, string> = { bacs: "Chuyển khoản ngân hàng", cod: "Thanh toán khi nhận hàng" };
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function AdminOrderDetail({ params, searchParams }: Props) {
  const session = await requireAdmin("orders");
  const isOwner = session.role === "owner";
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const [order, files, overview, legMap, shippingMethods, messages, orderWeightG, importQuote, theme] = await Promise.all([getOrderById(id), getOrderFiles(id), getCustomerOverview(), getOrderLegs([id]), getShippingMethods(false), getOrderMessages(id), getOrderChargeableWeightG(id), getImportQuoteConfig(), getSiteTheme()]);
  // "Nguồn hàng": which lot / slip / batch serves each line, plus what the admin may switch it to
  const itemIds = (order?.items ?? []).map((it) => it.itemId).filter((x): x is number => typeof x === "number");
  const allocViews = order ? listAllocationViews(getDb(), itemIds) : [];
  // stock of the line's product that other (unpaid) orders hold — why a line can say "Cần mua" while the shelf has it
  const heldElsewhere = new Map(order ? order.items.filter((it) => it.itemId).map((it) => [it.itemId as number, [...new Set(heldByOthers(getDb(), it.productId, it.itemId as number).map((u) => u.orderNumber))]] as const) : []);
  const sourceOptions = new Map(order ? order.items.filter((it) => it.itemId).map((it) => [it.itemId as number, listSourceOptions(getDb(), it.productId, it.itemId as number)] as const) : []);
  const regularCustomer = order?.customerId ? await getCustomerById(order.customerId) : null;
  const regularSets = await listRegularSets();
  const isRegular = !!order && isRegularBy({ accountRegular: regularCustomer?.isRegular, phone: order.customer.phone, regularPhones: regularSets.phones });
  const TONE: Record<string, string> = { green: "bg-green-100 text-green-800", sky: "bg-sky-100 text-sky-800", amber: "bg-amber-100 text-amber-800", gray: "bg-gray-200 text-gray-700" };
  let transferQuotes: TransferQuotesView | null = null;
  try {
    const raw = getSetting(getDb(), `leg3_quotes:${id}`);
    transferQuotes = raw ? (JSON.parse(raw) as TransferQuotesView) : null;
  } catch {
    transferQuotes = null;
  }
  const shop = theme.shopName;
  if (!order) notFound();
  await markOrderMessagesRead(order.id, "admin");
  const curStage = stageIndex(order.shipStage);
  const nextStage = SHIP_STAGES[curStage + 1];
  const cod = order.paymentMethod === "cod";
  const paidAt = order.paidAt;
  const flow = orderSteps(order, true);
  // "Đang vận chuyển về kho shop VN": which leg the goods are on (admin only), from the slowest line of the order
  const slowest = order.items.reduce((m, it) => Math.min(m, purchaseIndex(it.purchaseStatus ?? "not_bought")), Number.POSITIVE_INFINITY);
  const transitSub = order.shipStage === "in_transit" ? ([...TRANSIT_SUBSTEPS].reverse().find((x) => purchaseIndex(x.status as never) <= slowest)?.label ?? TRANSIT_SUBSTEPS[0].label) : "";
  // prepaid orders wait for the money before the goods move; COD orders move freely and are paid at the end
  const waitingPay = !cod && !paidAt && order.status !== "cancelled";
  const c = order.customer;
  const customerKey =
    overview.find((x) => (order.customerId && x.customerId === order.customerId) || (x.email && x.email.toLowerCase() === c.email.trim().toLowerCase()))?.key ??
    `g:${c.email.trim().toLowerCase() || c.phone.replace(/\D/g, "")}`;
  const token = orderFileToken(order.id);
  const publicReceiptUrl = (path: string) => `${FILES_URL_PREFIX}${path}?t=${token}`;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const totalJpy = files.reduce((s, f) => s + (f.amountJpy ?? 0), 0);
  // products can be edited until the order is out for delivery
  const itemsEditable = order.status !== "cancelled" && order.shipStage !== "delivering" && order.shipStage !== "delivered";
  const pickable: PickableProduct[] = itemsEditable ? (await getAllProducts(false)).map((p) => ({ id: p.id, name: p.name, nameJa: p.nameJa, sku: p.sku, thumb: p.thumb, costJpy: null, stock: p.stock })) : [];

  return (
    <>
      <PageHeader
        title={`Đơn hàng #${order.number}`}
        subtitle={`Đặt lúc ${formatDateTime(order.createdAt)} · cập nhật ${formatDateTime(order.updatedAt)}`}
        back={{ href: "/admin/orders/", label: "Đơn hàng" }}
        actions={<StatusBadge status={order.status} />}
      />
      {sp.updated ? <Flash>Đã cập nhật trạng thái đơn hàng.</Flash> : null}
      {sp.files ? <Flash>Đã đính kèm {first(sp.files)} file vào đơn hàng.</Flash> : null}
      {sp.fileDeleted ? <Flash>Đã xoá file.</Flash> : null}
      {sp.noted ? <Flash>Đã lưu ghi chú nội bộ.</Flash> : null}
      {sp.staged ? <Flash>Đã cập nhật tiến độ vận chuyển; khách thấy ngay trong trang đơn hàng.</Flash> : null}
      {sp.fileError ? <Flash kind="warning">{first(sp.fileError)}</Flash> : null}
      {sp.saved ? <Flash>{first(sp.saved)}</Flash> : null}
      {sp.error ? <Flash kind="error">{first(sp.error)}</Flash> : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card
            className="relative"
            title="Sản phẩm"
            actions={
              <span className="flex items-center gap-2">
                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", order.stockCommittedAt ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800")} title={order.stockCommittedAt ? `Tồn kho đã trừ lúc ${formatDateTime(order.stockCommittedAt)}` : "Đang giữ chỗ — trừ tồn thật khi xác nhận thanh toán hoặc đổi sang thu khi giao"}>
                  {order.stockCommittedAt ? "Đã trừ tồn kho" : "Đang giữ chỗ"}
                </span>
                {itemsEditable ? (
                  <details data-testid="edit-items">
                    <summary className={cn(btnSecondary, "inline-flex cursor-pointer list-none !px-2.5 !py-1 !text-[12px]")} title="Sửa số lượng, đơn giá, xoá hoặc thêm sản phẩm của đơn">
                      <Fa name="pencil" /> Sửa
                    </summary>
                    {/* opens across the whole card (anchored to it), not from the button */}
                    <div className="absolute inset-x-3 top-14 z-30 rounded-md border border-[#e5e7eb] bg-white p-3 shadow-lg max-md:fixed max-md:inset-x-2 max-md:top-16 max-md:max-h-[75vh] max-md:overflow-auto">
                      <form action={updateOrderItemsAction} className="grid gap-3 text-[13px]">
                        <input type="hidden" name="id" value={order.id} />
                        <table className={tableClass}>
                          <thead>
                            <tr>
                              <th className={thClass}>Sản phẩm</th>
                              <th className={cn(thClass, "w-[130px]")}>Đơn giá (đ)</th>
                              <th className={cn(thClass, "w-[80px]")}>SL</th>
                              <th className={cn(thClass, "w-[60px]")}>Xoá</th>
                            </tr>
                          </thead>
                          <tbody>
                            {order.items
                              .filter((it) => it.itemId)
                              .map((it) => (
                                <tr key={it.itemId}>
                                  <td className={cn(tdClass, "text-[13px] font-semibold text-lien-heading")}>
                                    {it.name}
                                    <span className="block text-[11px] font-normal text-lien-muted">#{it.productId}</span>
                                  </td>
                                  <td className={tdClass}>
                                    <input name={`p_${it.itemId}`} defaultValue={it.price} inputMode="numeric" className={cn(adminInput, "!mb-0 !py-1 !text-[13px]")} aria-label={`Đơn giá ${it.name}`} />
                                  </td>
                                  <td className={tdClass}>
                                    <input name={`q_${it.itemId}`} defaultValue={it.quantity} inputMode="numeric" className={cn(adminInput, "!mb-0 !py-1 !text-center !text-[13px]")} aria-label={`Số lượng ${it.name}`} />
                                  </td>
                                  <td className={cn(tdClass, "text-center")}>
                                    <input type="checkbox" name={`rm_${it.itemId}`} className="h-4 w-4" aria-label={`Xoá ${it.name} khỏi đơn`} title="Xoá dòng này khỏi đơn" />
                                  </td>
                                </tr>
                              ))}
                            {[1, 2, 3].map((n) => (
                              <tr key={`add${n}`} className="bg-[#f9fafb]">
                                <td className={tdClass}>
                                  <ProductSearchSelect products={pickable} name={`add_${n}_pid`} placeholder={n === 1 ? "+ Thêm sản phẩm: gõ tên / SKU…" : "+ thêm sản phẩm khác…"} />
                                </td>
                                <td className={tdClass}>
                                  <input name={`add_${n}_price`} inputMode="numeric" placeholder="giá web" className={cn(adminInput, "!mb-0 !py-1 !text-[13px]")} aria-label="Đơn giá sản phẩm thêm" />
                                </td>
                                <td className={tdClass}>
                                  <input name={`add_${n}_qty`} inputMode="numeric" placeholder="1" className={cn(adminInput, "!mb-0 !py-1 !text-center !text-[13px]")} aria-label="Số lượng sản phẩm thêm" />
                                </td>
                                <td className={tdClass} />
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <p className="m-0 text-[11px] leading-4 text-lien-muted">
                          Tạm tính và Tổng tính lại (giảm giá không vượt tạm tính, phí ship đã tính giữ nguyên); hàng của dòng bớt / xoá trở về tồn, dòng thêm được giữ hàng tự động.
                          {order.paidAt ? " Đơn đã thanh toán — nhớ báo khách phần chênh lệch." : ""}
                        </p>
                        <button type="submit" className={cn(btnPrimary, "justify-self-start !py-1.5 !text-[13px]")} data-testid="save-items">
                          <Fa name="check" /> Lưu sản phẩm
                        </button>
                      </form>
                    </div>
                  </details>
                ) : null}
                {order.status !== "cancelled" ? (
                  <form action={reallocateOrderAction}>
                    <input type="hidden" name="id" value={order.id} />
                    <button type="submit" className={`${btnPrimary} !px-2.5 !py-1 !text-[12px]`} data-testid="auto-allocate" title="Tính lại nguồn hàng cho mọi dòng: gần khách nhất trước (Kho VN → ĐVVC VN → đang về → đang bay → ĐVVC Nhật → Kho Nhật → phiếu mua đang về → đợt đang gom → cần mua); cùng chỗ thì hạn dùng gần nhất trước (bỏ qua lô đã hết hạn), rồi bill mua sớm hơn. Giữ ghi đè tay và phần đã trừ tồn.">
                      <Fa name="refresh" /> Tự động phân bổ
                    </button>
                  </form>
                ) : null}
              </span>
            }
          >
            <SheetTable id="order-items">
            <table className={tableClass}>
              <thead>
                <tr>
                  <th className={thClass} />
                  <th className={thClass}>Sản phẩm</th>
                  <th className={thClass}>Đơn giá</th>
                  <th className={thClass}>SL</th>
                  <th className={thClass}>
                    Nguồn hàng
                    <InfoPopover>Hàng của dòng này lấy từ đâu: lô có sẵn (kho VN / ĐVVC / Nhật, theo hạn dùng gần nhất trước), phiếu mua đang về, đợt đang gom, hay còn phải mua. Tồn kho đã trừ phần giữ chỗ; trừ thật khi xác nhận thanh toán hoặc đổi sang thu khi giao. Chọn nguồn khác trong ô bên dưới nếu muốn ghi đè.</InfoPopover>
                  </th>
                  <th className={`${thClass} text-right`}>Thành tiền</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((it) => (
                  <tr key={it.productId}>
                    <td className={`${tdClass} w-14`}>
                      {it.image ? <Image src={it.image} alt="" width={40} height={40} className="h-10 w-10 rounded border border-[#e5e7eb] object-cover" unoptimized /> : null}
                    </td>
                    <td className={tdClass}>
                      <Link href={`/product/${it.slug}/`} target="_blank" className="text-lien-heading hover:text-lien-blue">
                        {it.name}
                      </Link>
                      <div className="text-[12px] text-lien-muted">
                        #{it.productId} ·{" "}
                        <Link href={`/admin/products/${it.productId}/`} className="hover:text-lien-blue">
                          sửa sản phẩm
                        </Link>
                      </div>
                    </td>
                    <td className={`${tdClass} whitespace-nowrap`}>{formatPrice(it.price, order.currency)}</td>
                    <td className={tdClass}>{it.quantity}</td>
                    <td className={`${tdClass} min-w-[260px]`} data-testid={`source-${it.itemId ?? it.productId}`}>
                      {it.itemId ? (
                        <>
                          <div className="space-y-1">
                            {allocViews
                              .filter((a) => a.orderItemId === it.itemId)
                              .map((a) => (
                                <div key={a.id} className="text-[12px] leading-4">
                                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", TONE[a.tone])}>{a.label}</span>
                                  {it.quantity > 1 ? <span className="ml-1 font-semibold">×{a.qty}</span> : null}
                                  {a.manual ? <span className="ml-1 text-[10px] text-lien-muted">(ghi đè)</span> : null}
                                  {a.detail ? <span className="block text-lien-muted">{a.detail}</span> : null}
                                  {a.codes.length ? (
                                    <span className="mt-0.5 flex flex-wrap gap-1">
                                      {a.codes.map((c) => (
                                        <Link key={c} href={`/admin/inventory/units/${c}/`} className="rounded bg-[#f3f4f6] px-1 font-mono text-[10px] font-semibold text-lien-blue no-underline hover:underline" title="Xem lịch sử của mã">
                                          {c}
                                        </Link>
                                      ))}
                                    </span>
                                  ) : null}
                                </div>
                              ))}
                            {!allocViews.some((a) => a.orderItemId === it.itemId) ? <span className="text-[12px] text-lien-muted">— theo trạng thái tay: {it.purchaseStatus ?? "chưa mua"}</span> : null}
                            {allocViews.some((a) => a.orderItemId === it.itemId && a.label === "Cần mua") && heldElsewhere.get(it.itemId)?.length ? (
                              <span className="block text-[11px] leading-4 text-amber-800" data-testid={`held-elsewhere-${it.itemId}`}>
                                Kho có hàng nhưng đang giữ cho {heldElsewhere.get(it.itemId)!.map((n) => `#${n}`).join(", ")} (đơn đã thanh toán / đặt trước được ưu tiên) — muốn giao đơn này trước: chọn “lấy … cho đơn này” ở đổi nguồn.
                              </span>
                            ) : null}
                          </div>
                          {order.status !== "cancelled" ? (
                            <form action={setItemSourceAction} className="mt-1.5 flex items-center gap-1">
                              <input type="hidden" name="id" value={order.id} />
                              <input type="hidden" name="itemId" value={it.itemId} />
                              <select name="source" defaultValue="" className="max-w-[240px] rounded-md border border-[#d1d5db] bg-white px-2 py-1 text-[12px]" aria-label="Đổi nguồn hàng">
                                <option value="" disabled>
                                  — đổi nguồn —
                                </option>
                                <option value="buy">Cần mua (trả hàng đang giữ về tồn)</option>
                                {(sourceOptions.get(it.itemId) ?? []).map((o) => (
                                  <option key={o.value} value={o.value}>
                                    {o.label}
                                  </option>
                                ))}
                              </select>
                              <button type="submit" className="rounded-md border border-[#d1d5db] bg-white px-2 py-1 text-[12px] hover:border-lien-blue" title="Đổi nguồn cho dòng này">
                                <Fa name="check-circle" />
                              </button>
                            </form>
                          ) : null}
                        </>
                      ) : null}
                    </td>
                    <td className={`${tdClass} whitespace-nowrap text-right`}>{formatPrice(it.price * it.quantity, order.currency)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5} className={`${tdClass} text-right font-semibold`}>
                    Tạm tính
                  </td>
                  <td className={`${tdClass} text-right`}>{formatPrice(order.subtotal, order.currency)}</td>
                </tr>
                {order.discount > 0 ? (
                  <tr>
                    <td colSpan={5} className={`${tdClass} text-right font-semibold`}>
                      Giảm giá {order.voucherCode ? <span className="font-normal text-lien-muted">({order.voucherCode})</span> : null}
                    </td>
                    <td className={`${tdClass} text-right text-lien-success`}>−{formatPrice(order.discount, order.currency)}</td>
                  </tr>
                ) : null}
                <tr>
                  <td colSpan={5} className={`${tdClass} text-right font-semibold`}>
                    Giao hàng {order.shippingLabel ? <span className="font-normal text-lien-muted">({order.shippingLabel})</span> : null}
                    {order.shipFeePayment === "on_delivery" ? <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">khách trả phí ship cho shipper · không nằm trong Tổng</span> : null}
                  </td>
                  <td className={`${tdClass} text-right`}>{order.shippingFee > 0 ? `${order.shipFeePayment === "on_delivery" ? "≈ " : ""}${formatPrice(order.shippingFee, order.currency)}` : "Miễn phí"}</td>
                </tr>
                <tr>
                  <td colSpan={5} className={`${tdClass} text-right font-semibold`}>
                    Tổng
                  </td>
                  <td className={`${tdClass} text-right text-[16px] font-bold`}>{formatPrice(order.total, order.currency)}</td>
                </tr>
              </tfoot>
            </table>
            </SheetTable>
          </Card>


          <div id="bill">
          <Card
            title={`Trao đổi với khách${messages.length ? ` (${messages.length})` : ""}`}
            actions={files.length ? <span className="text-[13px] text-lien-muted">Bill: {files.length} file{totalJpy ? ` · ¥${totalJpy.toLocaleString("ja-JP")}` : ""}</span> : null}
          >
            <OrderChat
              orderId={order.id}
              messages={messages}
              me="admin"
              action={adminSendMessageAction}
              shopName={shop}
              attach
              files={files.map((f) => ({ id: f.id, fileName: f.fileName, url: publicReceiptUrl(f.path), mime: f.mime, size: formatBytes(f.size), amountJpy: f.amountJpy ?? null, note: f.note ?? "", createdAt: f.createdAt }))}
              fileDeleteAction={deleteOrderFileAction}
              quickReplies={[
                `Cảm ơn anh/chị đã mua hàng của ${shop}! Đơn #${order.number} đã được xác nhận thanh toán và đang được xử lý để gửi tới anh/chị. Bên em sẽ nhắn ngay khi hàng lên đường ạ.`,
                `Đơn #${order.number} của anh/chị đã thanh toán xong, bên em đang đặt mua tại Nhật. Dự kiến 7–14 ngày hàng về tới kho Việt Nam; có tiến độ mới em báo liền nhé.`,
                `${shop} đã nhận đơn #${order.number}, sẽ xác nhận và đặt mua tại Nhật trong hôm nay.`,
                "Đã mua hàng tại Nhật, bill đính kèm trong đơn. Hàng về kho Nhật trong 2–4 ngày.",
                "Kiện hàng đã lên đường về Việt Nam, dự kiến 5–7 ngày nữa tới kho.",
                `Hàng đã về kho Thanh Hóa, ${shop} giao cho đơn vị vận chuyển hôm nay. Anh/chị để ý điện thoại giúp em nhé.`,
                `Đơn #${order.number} đã giao thành công. Cảm ơn anh/chị đã ủng hộ ${shop}, có gì cần hỗ trợ cứ nhắn em ạ!`,
              ]}
            />
            {files.length ? (
              <p className="m-0 mt-3 text-[12px] leading-5 text-lien-muted">
                Khách xem bill trong trang đơn hàng (không cần đăng nhập):{" "}
                <code className="rounded bg-[#f3f4f6] px-1.5 py-0.5">
                  {siteUrl}/checkout/order-received/{order.id}/
                </code>
              </p>
            ) : null}
          </Card>
          </div>
        </div>

        <div className="space-y-6">
          <Card
            title="Trạng thái đơn hàng"
            actions={
              <InfoPopover align="end" wide>
                <span className="block text-[13px] leading-5 text-lien-text" data-testid="stage-now">
                  Hiện tại: <strong className="text-lien-heart">{flow.steps[flow.current].label}</strong>
                  {transitSub ? <span className="ml-1 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-800">{transitSub}</span> : null}
                </span>
                {transitSub ? <span className="block text-[11px] text-lien-muted">(chặng chỉ admin thấy — khách thấy “Đang vận chuyển về kho shop VN”)</span> : null}
                <span className="mt-1 block text-[12px]">{flow.steps[flow.current].hint}</span>
                <span className="mt-1 block text-lien-muted">{cod ? "Luồng COD: giao hàng trước, “Hoàn tất thanh toán” ở cuối." : "Luồng trả trước: khách chuyển khoản trước, shop mới gửi hàng."}</span>
                {nextStage && waitingPay && order.shipStage === "ordered" ? <span className="mt-1 block text-lien-muted">Bước “Đã gửi hàng” mở sau khi ghi nhận chuyển khoản (hoặc cho COD) ở ô Trạng thái của thanh dưới.</span> : null}
              </InfoPopover>
            }
          >
            <div id="tracking" className="mb-4">
              <OrderTracker order={order} compact admin />
            </div>
            <form action={setStageAction} className="grid gap-2">
              <input type="hidden" name="id" value={order.id} />
              {nextStage && waitingPay && order.shipStage === "ordered" ? null : nextStage ? (
                <button type="submit" name="stage" value={nextStage.key} className={btnPrimary} data-testid="next-stage">
                  <Fa name="check" /> Chuyển sang: {nextStage.label}
                </button>
              ) : paidAt ? (
                <p className="m-0 rounded-md bg-green-50 px-3 py-2 text-[13px] font-semibold text-green-800">Đơn đã hoàn tất: đã giao và đã thanh toán.</p>
              ) : (
                <p className="m-0 rounded-md bg-amber-50 px-3 py-2 text-[13px] font-semibold text-amber-800">Đã giao hàng — chờ hoàn tất thanh toán.</p>
              )}
            </form>
          </Card>
          {/* bottom bar: "Xóa đơn hàng" next to Huỷ; on the right one "Trạng thái" select — progress steps, payment
              steps and cancel — saved with "Lưu thay đổi" */}
          <form id="order-state" action={setOrderStateAction}>
            <input type="hidden" name="id" value={order.id} />
          </form>
          <BarTools>
            {isOwner ? (
              <form action={deleteOrderAction} data-testid="delete-order-form">
                <input type="hidden" name="id" value={order.id} />
                <input type="hidden" name="back" value="/admin/orders/" />
                <ConfirmSubmit
                  title={`Xóa đơn #${order.number}?`}
                  message="Đơn sẽ bị xóa vĩnh viễn, không khôi phục được."
                  details={["Sản phẩm, 4 chặng vận chuyển, tin nhắn và bill đính kèm của đơn cũng bị xóa.", "Không tính vào doanh thu / lãi lỗ.", "Chỉ muốn dừng đơn mà giữ lịch sử thì chọn trạng thái “Huỷ đơn”."]}
                  confirmLabel="Xóa đơn"
                  className={cn(btnDanger, "!py-1.5 !text-[13px]")}
                >
                  <Fa name="trash" /> Xóa đơn hàng
                </ConfirmSubmit>
              </form>
            ) : null}
            <span className="ml-auto text-[12px] text-lien-muted" data-testid="payment-box">
              <Fa name="money" />{" "}
              <b className="text-lien-heading">
                {cod ? `COD · ${paidAt ? `đã thu ${formatDateTime(paidAt)}` : "chưa thu"}` : paidAt ? `Đã nhận CK ${formatDateTime(paidAt)}` : "Chuyển khoản · chưa nhận"}
              </b>
            </span>
            <label className="flex items-center gap-1.5 text-[13px] font-semibold text-lien-heading">
              Trạng thái
              <select name="state" form="order-state" defaultValue={order.status === "cancelled" ? "status:cancelled" : `stage:${order.shipStage}`} className={cn(adminInput, "!mb-0 !w-auto !py-1 !text-[13px]")} data-testid="bar-order-state">
                <optgroup label="Tiến độ đơn">
                  {SHIP_STAGES.map((st) => (
                    <option key={st.key} value={`stage:${st.key}`}>
                      {st.label}
                    </option>
                  ))}
                </optgroup>
                {order.status !== "cancelled" && !paidAt ? (
                  <optgroup label="Thanh toán">
                    {stageIndex(order.shipStage) < stageIndex("delivered") ? <option value="pay:transfer">Đã nhận chuyển khoản</option> : null}
                    {!cod && stageIndex(order.shipStage) < stageIndex("delivered") ? <option value="pay:cod">Cho thanh toán khi nhận hàng (COD)</option> : null}
                    {cod && order.shipStage === "delivered" ? <option value="pay:cod_done">Hoàn tất thanh toán (đã thu tiền COD)</option> : null}
                  </optgroup>
                ) : null}
                <optgroup label="Đơn">{order.status === "cancelled" ? <option value="status:pending">Khôi phục đơn (Chờ xử lý)</option> : <option value="status:cancelled">Huỷ đơn</option>}</optgroup>
                {order.status === "cancelled" ? <option value="status:cancelled" hidden>Đã huỷ</option> : null}
              </select>
            </label>
          </BarTools>
          <details className="group rounded-lg border border-[#e5e7eb] bg-white shadow-sm" open={first(sp.legs) === "1"} data-testid="legs-card">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 md:px-5">
              <h2 className="text-[15px] font-semibold leading-6 text-lien-heading">Vận chuyển đơn này</h2>
              <span className="flex flex-wrap gap-1">
                {SHIPPING_LEGS.map((l) => {
                  const cur = (legMap.get(order.id) ?? []).find((x) => x.leg === l.key);
                  const st = cur?.status ?? "pending";
                  return (
                    <span key={l.key} className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", LEG_STATUS_CLS[st])} title={`${l.label}: ${LEG_STATUS_LABEL[st]}${cur?.tracking ? ` · ${cur.tracking}` : ""}`}>
                      {l.label.slice(0, 1)} {LEG_STATUS_LABEL[st]}
                    </span>
                  );
                })}
              </span>
              <span className="ml-auto text-[12px] text-lien-blue">
                <span className="group-open:hidden">▸ mở</span>
                <span className="hidden group-open:inline">▾ thu gọn</span>
              </span>
            </summary>
            <div className="border-t border-[#e5e7eb] p-4 md:p-5">
              <OrderLegsEditor order={order} legs={legMap.get(order.id) ?? []} methods={shippingMethods} back={`/admin/orders/${order.id}/?legs=1`} weightG={orderWeightG} quote={importQuote} transferQuotes={transferQuotes} />
              <p className="mt-3 text-[12px] text-lien-muted">
                Mỗi chặng: phương thức, phí, mã vận đơn, trạng thái → bấm ✓.
                <InfoPopover>Để trống phí thì tự tính theo cột và khối lượng đơn. Chặng ③ có thể hỏi cước hãng theo API rồi bấm “Chọn”. Chặng ④ mặc định theo phương án khách đã chọn khi thanh toán; đổi rồi lưu chỉ khi khách yêu cầu (có thể áp lại phí vào tổng tiền khách trả).</InfoPopover>
              </p>
            </div>
          </details>
          <Card
            title="Khách hàng"
            actions={
              <span className="flex items-center gap-2">
                {isRegular ? (
                  <span className="rounded-full bg-lien-blue-soft px-2 py-0.5 text-[11px] font-semibold text-lien-blue" title="Khách quen — được thanh toán khi nhận hàng">
                    <Fa name="star" /> Khách quen
                  </span>
                ) : null}
                <details className="relative" data-testid="edit-customer">
                  <summary className={cn(btnSecondary, "inline-flex cursor-pointer list-none !px-2 !py-0.5 !text-[12px]")} title="Sửa thông tin khách của đơn này (khi khách yêu cầu đổi)">
                    <Fa name="pencil" /> Sửa
                  </summary>
                  <div className="absolute right-0 z-30 mt-1 w-[min(92vw,380px)] rounded-md border border-[#e5e7eb] bg-white p-3 shadow-lg">
                    <form action={updateOrderCustomerAction} className="grid gap-2 text-[13px]">
                      <input type="hidden" name="id" value={order.id} />
                      <label className="grid gap-0.5 font-semibold text-lien-heading">
                        Họ tên
                        <input name="name" defaultValue={`${c.lastName} ${c.firstName}`.trim()} required maxLength={120} className={cn(adminInput, "!py-1.5 !text-[13px] font-normal")} />
                      </label>
                      <label className="grid gap-0.5 font-semibold text-lien-heading">
                        Điện thoại
                        <input name="phone" defaultValue={c.phone} required inputMode="tel" maxLength={30} className={cn(adminInput, "!py-1.5 !text-[13px] font-normal")} />
                      </label>
                      <label className="grid gap-0.5 font-semibold text-lien-heading">
                        Email
                        <input name="email" type="email" defaultValue={c.email} maxLength={160} className={cn(adminInput, "!py-1.5 !text-[13px] font-normal")} />
                      </label>
                      <label className="grid gap-0.5 font-semibold text-lien-heading">
                        Địa chỉ
                        <textarea name="address" defaultValue={c.address} rows={2} maxLength={400} className={cn(adminInput, "!py-1.5 !text-[13px] font-normal")} />
                      </label>
                      <label className="grid gap-0.5 font-semibold text-lien-heading">
                        Ghi chú của khách
                        <textarea name="note" defaultValue={c.note} rows={2} maxLength={1000} className={cn(adminInput, "!py-1.5 !text-[13px] font-normal")} />
                      </label>
                      <p className="m-0 text-[11px] text-lien-muted">Chỉ sửa thông tin trên đơn này; phí ship đã báo không tự tính lại — đổi địa chỉ thì kiểm tra chặng ④.</p>
                      <button type="submit" className={cn(btnPrimary, "justify-self-start !py-1.5 !text-[13px]")}>
                        <Fa name="check" /> Lưu
                      </button>
                    </form>
                  </div>
                </details>
                <Link href={`/admin/customers/${encodeURIComponent(customerKey)}/`} className="text-[13px] text-lien-blue hover:underline">
                  Lịch sử mua →
                </Link>
              </span>
            }
          >
            <dl className="grid gap-2 text-[14px] leading-5">
              <div>
                <dt className="text-[12px] font-semibold uppercase text-[#6b7280]">Họ tên</dt>
                <dd>
                  {c.lastName} {c.firstName}
                </dd>
              </div>
              <div>
                <dt className="text-[12px] font-semibold uppercase text-[#6b7280]">Điện thoại</dt>
                <dd>
                  <a href={`tel:${c.phone}`} className="text-lien-blue hover:underline">
                    {c.phone}
                  </a>
                </dd>
              </div>
              <div>
                <dt className="text-[12px] font-semibold uppercase text-[#6b7280]">Email</dt>
                <dd>
                  <a href={`mailto:${c.email}`} className="text-lien-blue hover:underline">
                    {c.email}
                  </a>
                </dd>
              </div>
              <div>
                <dt className="text-[12px] font-semibold uppercase text-[#6b7280]">Địa chỉ</dt>
                <dd>{c.address}</dd>
              </div>
              <div>
                <dt className="text-[12px] font-semibold uppercase text-[#6b7280]">Thanh toán</dt>
                <dd>
                  {PAYMENT[order.paymentMethod]}
                  {order.prepaidRequired ? <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Hàng order · cần thanh toán trước 100%</span> : null}
                  <span className="block text-[12px] text-lien-muted">
                    Mã thanh toán / nội dung CK: <code className="rounded bg-lien-cream px-1.5 font-bold tracking-wider text-lien-heading">{order.payCode || "—"}</code>
                  </span>
                </dd>
              </div>
              {c.note ? (
                <div>
                  <dt className="text-[12px] font-semibold uppercase text-[#6b7280]">Ghi chú của khách</dt>
                  <dd className="whitespace-pre-wrap">{c.note}</dd>
                </div>
              ) : null}
            </dl>
          </Card>

        </div>
      </div>
    </>
  );
}
