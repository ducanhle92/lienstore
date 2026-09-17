import Image from "next/image";
import Link from "next/link";
import { confirmReceiptAction, deleteReceiptAction, parseBillAction, updateReceiptAction } from "@/app/admin/purchases/receipt-actions";
import { formatAmount, formatDate } from "@/lib/format";
import { todayIso } from "@/lib/lots";
import { PURCHASE_STAGES, purchaseIndex, type PurchaseStatus } from "@/lib/purchase";
import { purchaseSourceName } from "@/lib/purchase-sources";
import { RECEIPT_STATUS_LABEL, type ReceiptStatus } from "@/lib/receipts";
import type { Receipt } from "@/lib/receipts-db";
import { cn } from "@/lib/utils";
import type { PurchaseSource } from "@/types/shop";
import { ConfirmSubmit } from "./ConfirmSubmit";
import { type PickableProduct, ProductSearchSelect } from "./ProductSearchSelect";
import { adminInput, adminLabel, btnPrimary, btnSecondary, Card, tableClass, tdClass, thClass } from "./ui";

interface Props {
  receipts: Receipt[];
  sources: PurchaseSource[];
  products: PickableProduct[];
  /** Draft opened from the "Nhập bill" flow — rendered first, expanded. */
  draftId: number | null;
}

const STATUS_CLS: Record<ReceiptStatus, string> = { draft: "bg-amber-100 text-amber-800", bought: "bg-sky-100 text-sky-800", shipped: "bg-green-100 text-green-800" };

/** Quản lý mua hàng › tab "Phiếu mua": bill import + every receipt with its items, linked order lines and ship-out data. */
export function ReceiptsPanel({ receipts, sources, products, draftId }: Props) {
  const srcName = (k: string) => purchaseSourceName(k, sources);
  const srcSelect = (name: string, value: string, id: string) => (
    <select id={id} name={name} defaultValue={value || "unknown"} className={adminInput} aria-label="Nguồn nhập">
      {sources.map((s) => (
        <option key={s.key} value={s.key}>
          {s.name}
        </option>
      ))}
    </select>
  );
  const ordered = [...receipts].sort((a, b) => (a.id === draftId ? -1 : b.id === draftId ? 1 : 0));
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
      <div className="space-y-4">
        {ordered.map((r) => {
          const fid = `rc-${r.id}`;
          const isDraft = r.status === "draft";
          const units = r.items.reduce((n, i) => n + i.qty, 0);
          return (
            <div key={r.id} id={`receipt-${r.id}`}>
              <Card
                title={`${r.code} · ${srcName(r.sourceKey)} · mua ${formatDate(r.boughtAt)}`}
                actions={
                  <span className="flex items-center gap-2">
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", STATUS_CLS[r.status])}>{RECEIPT_STATUS_LABEL[r.status]}</span>
                    <form action={deleteReceiptAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <ConfirmSubmit message={isDraft ? `Xoá phiếu nháp ${r.code}?` : `Xoá phiếu ${r.code}? Các dòng đơn giữ trạng thái, chỉ bỏ liên kết phiếu.`} className="text-[12px] text-lien-heart hover:underline">
                        Xoá
                      </ConfirmSubmit>
                    </form>
                  </span>
                }
              >
                <p className="m-0 mb-3 text-[12px] text-lien-muted">
                  {r.items.length} sản phẩm · {units} đơn vị{r.totalJpy ? ` · ¥${formatAmount(r.totalJpy)}` : ""}
                  {r.orderRef ? ` · mã đơn nguồn ${r.orderRef}` : ""}
                  {r.lines.length ? ` · ${r.lines.length} dòng đơn khách` : ""}
                  {r.stockUnits ? ` · ${r.stockUnits} đv mua lưu kho` : ""}
                  {r.shippedAt ? ` · gửi ĐVVC ${formatDate(r.shippedAt)}` : ""}
                  {r.tracking ? ` · ${r.tracking}` : ""}
                </p>
                {isDraft ? (
                  <form action={confirmReceiptAction} className="mb-4 rounded-md border border-amber-200 bg-amber-50/60 p-3" data-testid="receipt-confirm">
                    <input type="hidden" name="id" value={r.id} />
                    <p className="m-0 mb-2 text-[13px] text-lien-text">Đọc từ bill — kiểm tra sản phẩm khớp (đổi nếu sai, để trống nếu không bán trên web) rồi bấm Xác nhận. Số lượng mua sẽ gán cho các đơn đang chờ (đơn cũ trước), phần dư thành phiếu mua lưu kho.</p>
                    <table className={tableClass}>
                      <thead>
                        <tr>
                          <th className={thClass}>Dòng trên bill</th>
                          <th className={thClass}>SL</th>
                          <th className={thClass}>¥/đv</th>
                          <th className={thClass}>Sản phẩm trên web</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.items.map((it) => (
                          <tr key={it.id}>
                            <td className={`${tdClass} max-w-[320px] text-[13px]`}>
                              {it.rawName}
                              {it.asin ? <span className="block font-mono text-[11px] text-lien-muted">{it.asin}</span> : null}
                            </td>
                            <td className={`${tdClass} font-semibold`}>{it.qty}</td>
                            <td className={`${tdClass} whitespace-nowrap text-[13px]`}>{it.unitJpy ? `¥${formatAmount(it.unitJpy)}` : "—"}</td>
                            <td className={`${tdClass} min-w-[300px]`}>
                              <ProductSearchSelect name={`item_${it.id}`} products={products} initial={it.productId ? products.find((p) => p.id === it.productId) ?? null : null} placeholder="Gõ tên / SKU / #id để chọn…" />
                              {it.matchScore !== null ? <span className={cn("mt-1 inline-block rounded px-1.5 text-[11px] font-semibold", it.matchScore >= 0.99 ? "bg-green-100 text-green-800" : it.matchScore >= 0.7 ? "bg-lime-100 text-lime-800" : "bg-amber-100 text-amber-800")}>{it.matchScore >= 0.99 ? "khớp mã ASIN" : `khớp tên ${Math.round(it.matchScore * 100)}%`}</span> : <span className="mt-1 inline-block rounded bg-gray-100 px-1.5 text-[11px] text-gray-600">chưa khớp</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <button type="submit" className={`${btnPrimary} mt-3`}>
                      Xác nhận phiếu mua
                    </button>
                  </form>
                ) : (
                  <div className="mb-4 overflow-x-auto">
                    <table className={tableClass}>
                      <thead>
                        <tr>
                          <th className={thClass}>Sản phẩm</th>
                          <th className={thClass}>SL</th>
                          <th className={thClass}>¥/đv</th>
                          <th className={thClass}>Đơn khách liên quan</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.items.map((it) => {
                          const mine = r.lines.filter((l) => l.productName === (it.productName || it.rawName) || (it.productId && l.productName === it.productName));
                          return (
                            <tr key={it.id}>
                              <td className={`${tdClass} min-w-[240px]`}>
                                <div className="flex items-center gap-2">
                                  {it.productThumb ? <Image src={it.productThumb} alt="" width={32} height={32} unoptimized className="h-8 w-8 rounded border border-[#e5e7eb] object-contain" /> : null}
                                  {it.productId ? (
                                    <Link href={`/admin/products/${it.productId}/`} className="text-[13px] font-semibold text-lien-heading hover:text-lien-blue">
                                      {it.productName || it.rawName}
                                    </Link>
                                  ) : (
                                    <span className="text-[13px] text-lien-muted">{it.rawName} (không bán trên web)</span>
                                  )}
                                </div>
                              </td>
                              <td className={`${tdClass} font-semibold`}>{it.qty}</td>
                              <td className={`${tdClass} whitespace-nowrap text-[13px]`}>{it.unitJpy ? `¥${formatAmount(it.unitJpy)}` : "—"}</td>
                              <td className={`${tdClass} text-[12px]`}>
                                {mine.length
                                  ? mine.map((l) => {
                                      const st = PURCHASE_STAGES[purchaseIndex(l.purchaseStatus as PurchaseStatus)];
                                      return (
                                        <Link key={l.itemId} href={`/admin/orders/${l.orderId}/`} className="mr-2 inline-flex items-center gap-1 text-lien-blue hover:underline">
                                          #{l.orderNumber} ×{l.quantity}
                                          <span className={cn("rounded px-1 text-[10px] font-semibold", st.cls)}>{st.short}</span>
                                        </Link>
                                      );
                                    })
                                  : <span className="text-lien-muted">—</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                <form action={updateReceiptAction} className="grid gap-2 border-t border-[#e5e7eb] pt-3 sm:grid-cols-3 lg:grid-cols-6" id={fid}>
                  <input type="hidden" name="id" value={r.id} />
                  <label className="text-[12px] text-lien-muted">
                    Nguồn
                    {srcSelect("sourceKey", r.sourceKey, `${fid}-src`)}
                  </label>
                  <label className="text-[12px] text-lien-muted">
                    Ngày mua
                    <input name="boughtAt" defaultValue={r.boughtAt} className={adminInput} />
                  </label>
                  <label className="text-[12px] text-lien-muted">
                    Mã đơn nguồn
                    <input name="orderRef" defaultValue={r.orderRef} placeholder="249-1234567-…" className={adminInput} />
                  </label>
                  <label className="text-[12px] text-lien-muted">
                    Ngày gửi ĐVVC
                    <input name="shippedAt" defaultValue={r.shippedAt ?? ""} placeholder="2026-09-20" className={adminInput} title="Điền khi lô này rời tay bạn tới kho Kiến Express — các dòng liên quan chuyển sang 'Tới ĐVVC Nhật'" />
                  </label>
                  <label className="text-[12px] text-lien-muted">
                    Mã vận đơn
                    <input name="tracking" defaultValue={r.tracking} className={adminInput} />
                  </label>
                  <label className="text-[12px] text-lien-muted">
                    Ghi chú
                    <input name="note" defaultValue={r.note} className={adminInput} />
                  </label>
                  <button type="submit" className={`${btnSecondary} justify-self-start sm:col-span-3 lg:col-span-6`}>
                    Lưu phiếu
                  </button>
                </form>
              </Card>
            </div>
          );
        })}
        {receipts.length === 0 ? (
          <Card>
            <p className="m-0 text-[14px] text-lien-muted">Chưa có phiếu mua nào. Tạo từ các dòng đơn đã tick (tab Theo đơn hàng) hoặc dán bill ở khung bên phải.</p>
          </Card>
        ) : null}
      </div>

      <div className="space-y-6">
        <Card title="Nhập bill mua hàng">
          <form action={parseBillAction} className="grid gap-3" data-testid="bill-import">
            <div>
              <label className={adminLabel} htmlFor="bill-text">
                Nội dung bill <span className="font-normal text-lien-muted">— dán email đặt hàng Amazon / Rakuten, hoặc gõ mỗi dòng: tên · số lượng · giá</span>
              </label>
              <textarea id="bill-text" name="bill" rows={10} placeholder={"注文番号: 249-1234567-8901234\n注文日: 2026/09/15\nロート製薬 メンソレータム アクネス 14g\n数量: 2  ¥1,320\n\nhoặc:\n3 x Sữa rửa mặt Hatomugi 800ml 690円"} className={cn(adminInput, "font-mono text-[12px]")} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={adminLabel} htmlFor="bill-src">
                  Mua ở
                </label>
                {srcSelect("sourceKey", "amazon", "bill-src")}
              </div>
              <div>
                <label className={adminLabel} htmlFor="bill-date">
                  Ngày mua <span className="font-normal text-lien-muted">(trống = lấy từ bill / hôm nay)</span>
                </label>
                <input id="bill-date" name="boughtAt" placeholder={todayIso()} className={adminInput} />
              </div>
            </div>
            <div>
              <label className={adminLabel} htmlFor="bill-ref">
                Mã đơn nguồn <span className="font-normal text-lien-muted">(trống = tự đọc)</span>
              </label>
              <input id="bill-ref" name="orderRef" className={adminInput} />
            </div>
            <button type="submit" className={`${btnPrimary} justify-self-start`}>
              Đọc bill → tạo phiếu nháp
            </button>
          </form>
          <p className="mt-3 mb-0 text-[12px] leading-5 text-lien-muted">Hệ thống tách từng dòng sản phẩm (tên, số lượng, giá ¥), đọc mã đơn và ngày mua, khớp với sản phẩm trên web theo mã ASIN trong link mua hoặc theo tên (Việt / Nhật). Bạn kiểm tra rồi Xác nhận — số lượng mua tự gán cho các đơn khách đang chờ, phần dư thành phiếu mua lưu kho.</p>
        </Card>
        <Card title="Phiếu mua là gì?">
          <p className="m-0 text-[13px] leading-6 text-lien-text">Mỗi lần mua một lố hàng tại một nguồn = một phiếu với mã tự sinh <strong>PM-ngày-số</strong>. Phiếu ghi ngày mua, mã đơn của nguồn, các sản phẩm × số lượng × giá, và sau đó ngày gửi cho đơn vị vận chuyển + mã vận đơn. Từ dòng đơn của khách hay phiếu mua lưu kho đều thấy nó thuộc phiếu nào — nên biết hàng của đơn nào đã mua lúc nào, đi cùng lố nào.</p>
        </Card>
      </div>
    </div>
  );
}
