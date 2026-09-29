import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { addUnitsAction, removeUnitsAction, saveProductUnitsAction, uploadUnitsBillFilesAction } from "@/app/admin/inventory/lots/actions";
import { TableSelectAll } from "@/components/sites/lienstore/admin/TableSelectAll";
import { BulkBar } from "@/components/sites/lienstore/admin/BulkBar";
import { adminInput, adminLabel, btnPrimary, btnSecondary, Card, Flash, PageHeader, tableClass, tdClass, thClass } from "@/components/sites/lienstore/admin/ui";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { listAllocationViews } from "@/lib/allocations-db";
import { requireAdmin } from "@/lib/auth";
import { getProductById, listPurchaseSources } from "@/lib/db";
import { formatAmount, formatDate } from "@/lib/format";
import { groupUnits } from "@/lib/lots-db";
import { daysToExpiry, EXPIRY_LABEL, expiryState, todayIso } from "@/lib/lots";
import { PURCHASE_STAGES, purchaseIndex } from "@/lib/purchase";
import { purchaseSourceName } from "@/lib/purchase-sources";
import { parseReceiptFiles } from "@/lib/receipts-db";
import { getDb } from "@/lib/sqlite";
import { UNIT_ORIGIN_LABEL, UNIT_REMOVED_LABEL, unitInHand } from "@/lib/units";
import { listUnits } from "@/lib/units-db";
import { cn } from "@/lib/utils";
import { SheetTable } from "@/components/sites/lienstore/admin/SheetTable";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const EXP_CLS = { expired: "bg-red-100 text-red-800", soon: "bg-amber-100 text-amber-800", ok: "bg-green-100 text-green-800", none: "bg-gray-100 text-gray-600" } as const;
const cell = "!mb-0 !py-1 !text-[13px]";
/** Places a unit can be entered at / moved to on this page. */
const PLACES = PURCHASE_STAGES.filter((s) => purchaseIndex(s.key) <= purchaseIndex("delivered"));

/** Kho hàng › hàng của một sản phẩm: every unit (code H…) as bill lines × place, editable; plus the lines waiting for it. */
export default async function ProductUnitsPage({ params, searchParams }: Props) {
  await requireAdmin("inventory");
  const { id } = await params;
  const pid = Number.parseInt(id, 10);
  if (!Number.isInteger(pid)) notFound();
  const [product, sources, sp] = await Promise.all([getProductById(pid), listPurchaseSources(), searchParams]);
  if (!product) notFound();
  const db = getDb();
  const all = listUnits(db, { productId: pid, withDelivered: true, withRemoved: true });
  const live = all.filter((u) => !u.removed && purchaseIndex(u.status) <= purchaseIndex("at_shop"));
  const gone = all.filter((u) => !u.removed && purchaseIndex(u.status) > purchaseIndex("at_shop"));
  const removed = all.filter((u) => u.removed);
  const groups = groupUnits(live).sort((a, b) => purchaseIndex(b.status) - purchaseIndex(a.status));
  const inHand = live.filter((u) => unitInHand(u.status));
  const held = live.filter((u) => u.itemId).length;
  // open order lines of the product: what each one holds / still needs
  const lines = db
    .prepare("SELECT oi.id, oi.quantity, o.id AS order_id, o.number, o.first_name, o.last_name FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.product_id = ? AND o.status IN ('pending','processing') ORDER BY o.created_at, oi.id")
    .all(pid) as Array<{ id: number; quantity: number; order_id: string; number: number; first_name: string; last_name: string }>;
  const allocs = listAllocationViews(db, lines.map((l) => l.id));
  const receiptIds = Array.from(new Set(live.map((u) => u.receiptId).filter((x): x is number => x !== null)));
  const bills = new Map((receiptIds.length ? (db.prepare(`SELECT id, code, files FROM purchase_receipts WHERE id IN (${receiptIds.map(() => "?").join(",")})`).all(...receiptIds) as Array<{ id: number; code: string; files: string | null }>) : []).map((r) => [r.id, { code: r.code, files: parseReceiptFiles(r.files) }]));
  const saveId = "units-save";
  const removeId = "units-remove";
  return (
    <>
      <PageHeader
        title={product.name}
        subtitle={`Tồn web ${product.stock ?? "—"} · ${inHand.length} cái trong tay (${inHand.filter((u) => u.status === "bought").length} Kho Nhật · ${inHand.filter((u) => u.status !== "bought" && u.status !== "at_shop").length} đang về · ${inHand.filter((u) => u.status === "at_shop").length} Kho VN) · giữ cho đơn ${held}${live.length > inHand.length ? ` · ${live.length - inHand.length} dự định / đã đặt mua` : ""}`}
        back={{ href: "/admin/inventory/", label: "Tồn kho" }}
        backActions={
          <a href={`/product/${product.slug}/`} target="_blank" rel="noreferrer" className="text-[13px] font-semibold text-lien-blue hover:underline" data-testid="view-on-web">
            Xem trên cửa hàng ↗
          </a>
        }
        actions={
          <Link href={`/admin/products/${product.id}/`} className="text-[14px] text-lien-blue hover:underline">
            Sửa sản phẩm →
          </Link>
        }
      />
      {first(sp.saved) ? <Flash>{first(sp.saved)}</Flash> : null}
      {first(sp.error) ? <Flash kind="error">{first(sp.error)}</Flash> : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-6">
          <Card title={`Hàng của sản phẩm (${live.length} cái · ${groups.length} dòng bill)`}>
            <datalist id="bill-codes">
              {[...bills.values()].map((b) => (
                <option key={b.code} value={b.code} />
              ))}
            </datalist>
            <form id={saveId} action={saveProductUnitsAction}>
              <input type="hidden" name="productId" value={pid} />
            </form>
            <form id={removeId} action={removeUnitsAction}>
              <input type="hidden" name="productId" value={pid} />
            </form>
            {groups.length ? (
              <BulkBar scope={removeId}>
                <select name="reason" form={removeId} defaultValue="lost" className={cn(adminInput, "!mb-0 !w-auto !py-1 !text-[13px] disabled:opacity-50")} aria-label="Lý do">
                  {Object.entries(UNIT_REMOVED_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
                <button type="submit" form={removeId} className={cn(btnSecondary, "!py-1 disabled:opacity-50")}>
                  Loại khỏi tồn kho
                </button>
              </BulkBar>
            ) : null}
            <div className="overflow-x-auto">
              <SheetTable id="product-units">
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th className={cn(thClass, "w-8")}>
                      <TableSelectAll name="uids" />
                    </th>
                    <th className={thClass}>Dòng bill · mã</th>
                    <th className={thClass}>SL</th>
                    <th className={thClass}>Trạng thái</th>
                    <th className={thClass}>Mua ở · cửa hàng</th>
                    <th className={thClass}>Ngày mua</th>
                    <th className={thClass}>HSD</th>
                    <th className={thClass}>¥/cái</th>
                    <th className={thClass}>Cho đơn</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.length === 0 ? (
                    <tr>
                      <td colSpan={9} className={`${tdClass} text-center text-lien-muted`}>
                        Chưa có hàng — nhập ở khung bên phải, hoặc thêm vào đợt ở Quản lý mua hàng.
                      </td>
                    </tr>
                  ) : null}
                  {groups.map((g) => {
                    const p = `g_${g.unitIds[0]}_`;
                    const st = expiryState(g.expiry);
                    const days = daysToExpiry(g.expiry);
                    const bill = g.receiptId ? bills.get(g.receiptId) : undefined;
                    return (
                      <tr key={g.key} className="align-top" data-testid={`pgroup-${g.unitIds[0]}`}>
                        <td className={`${tdClass} w-8`}>
                          <input type="checkbox" name="uids" value={g.unitIds.join(",")} form={removeId} className="h-4 w-4" aria-label={`Chọn dòng bill ${g.receiptCode || g.codes[0]}`} />
                        </td>
                        <td className={`${tdClass} min-w-[230px]`}>
                          <input type="hidden" name={`${p}ids`} form={saveId} value={g.unitIds.join(",")} />
                          <input name={`${p}billCode`} form={saveId} defaultValue={g.receiptCode} list="bill-codes" placeholder="mã bill…" className={cn(adminInput, cell, "!w-[170px] font-mono !text-[12px]")} aria-label="Mã bill" />
                          <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px]">
                            {(bill?.files ?? []).map((f) => (
                              <a key={f.path} href={f.url} target="_blank" rel="noreferrer" title={f.name} className="no-underline">
                                {f.mime.startsWith("image/") ? <Image src={f.url} alt={f.name} width={32} height={32} unoptimized className="h-8 w-8 rounded border border-[#e5e7eb] object-cover" /> : <span className="text-lien-blue">📄</span>}
                              </a>
                            ))}
                            <form action={uploadUnitsBillFilesAction} className="inline-flex items-center gap-1">
                              <input type="hidden" name="productId" value={pid} />
                              <input type="hidden" name="uids" value={g.unitIds.join(",")} />
                              <input type="file" name="files" accept="image/*,application/pdf" multiple className="w-[110px] text-[11px]" aria-label="Ảnh bill" />
                              <button type="submit" className={`${btnSecondary} !px-1.5 !py-0.5 !text-[11px]`} title="Đính ảnh bill (bill được tạo nếu dòng chưa có)">
                                <Fa name="paperclip" /> ảnh
                              </button>
                            </form>
                          </div>
                          <details className="mt-1 text-[12px]">
                            <summary className="cursor-pointer font-mono text-lien-blue">{g.qty > 1 ? `${g.codes[0]} … ${g.qty} mã` : g.codes[0]}</summary>
                            <ul className="m-0 mt-1 list-none space-y-1 p-0">
                              {g.units.map((u) => (
                                <li key={u.id} className="flex flex-wrap items-center gap-1.5">
                                  <input type="checkbox" name="uids" value={u.id} form={removeId} className="h-3.5 w-3.5" aria-label={`Chọn ${u.code}`} />
                                  <Link href={`/admin/inventory/units/${u.code}/`} className="font-mono font-semibold text-lien-blue no-underline hover:underline">
                                    {u.code}
                                  </Link>
                                  <select name={`u_${u.id}_status`} form={saveId} defaultValue={u.status} className={cn(adminInput, "!mb-0 !w-[150px] !py-0.5 !text-[11px]")} aria-label={`Trạng thái ${u.code}`}>
                                    {PLACES.map((x) => (
                                      <option key={x.key} value={x.key}>
                                        {x.label}
                                      </option>
                                    ))}
                                  </select>
                                  <span className="text-[11px] text-lien-muted">{UNIT_ORIGIN_LABEL[u.origin]}</span>
                                  {u.orderId ? (
                                    <Link href={`/admin/orders/${u.orderId}/`} className="text-[11px] text-[#3730a3] hover:underline">
                                      #{u.orderNumber}
                                    </Link>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          </details>
                        </td>
                        <td className={tdClass}>
                          <input name={`${p}qty`} form={saveId} inputMode="numeric" defaultValue={g.qty} className={cn(adminInput, cell, "!w-14 !text-center font-semibold")} aria-label="Số lượng" title="Tăng = thêm cái cùng bill / giá / HSD; giảm = bỏ các cái chưa giữ cho đơn" />
                        </td>
                        <td className={tdClass}>
                          <select name={`${p}status`} form={saveId} defaultValue="" className={cn(adminInput, cell, "!w-44")} aria-label="Trạng thái cả dòng">
                            <option value="">{PURCHASE_STAGES[purchaseIndex(g.status)].label}</option>
                            {PLACES.filter((x) => x.key !== g.status).map((x) => (
                              <option key={x.key} value={x.key}>
                                → {x.label}
                              </option>
                            ))}
                          </select>
                          {g.shipmentCode ? <span className="mt-1 block text-[11px] text-amber-800">chuyến {g.shipmentCode}</span> : null}
                          {g.batchCode ? (
                            <Link href={`/admin/purchases/?tab=batches#batch-${g.batchId}`} className="block text-[11px] text-lien-blue hover:underline">
                              đợt {g.batchCode}
                            </Link>
                          ) : null}
                        </td>
                        <td className={tdClass}>
                          <select name={`${p}sourceKey`} form={saveId} defaultValue={g.sourceKey} className={cn(adminInput, cell, "!w-[150px]")} aria-label="Mua ở">
                            {sources.map((s) => (
                              <option key={s.key} value={s.key}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                          <input name={`${p}store`} form={saveId} defaultValue={g.store} placeholder="cửa hàng…" className={cn(adminInput, cell, "mt-1 !w-[150px] !text-[12px]")} aria-label="Cửa hàng" />
                        </td>
                        <td className={tdClass}>
                          <input type="date" name={`${p}boughtAt`} form={saveId} defaultValue={g.boughtAt ?? ""} className={cn(adminInput, cell, "!w-[112px]")} aria-label="Ngày mua" />
                        </td>
                        <td className={tdClass}>
                          <input name={`${p}expiry`} form={saveId} defaultValue={g.expiry ?? ""} placeholder="03/2027" className={cn(adminInput, cell, "!w-[112px]")} aria-label="Hạn dùng" />
                          <span className={cn("mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold", EXP_CLS[st])}>
                            {EXPIRY_LABEL[st]}
                            {days !== null ? ` · ${days < 0 ? `${-days} ngày trước` : `${days} ngày`}` : ""}
                          </span>
                        </td>
                        <td className={tdClass}>
                          <input name={`${p}unitCostJpy`} form={saveId} inputMode="numeric" defaultValue={g.unitCostJpy ?? ""} placeholder="¥" className={cn(adminInput, cell, "!w-[84px]")} aria-label="¥ mỗi cái" />
                          {g.unitCostVnd ? <span className="block text-[11px] text-lien-muted">≈ {formatAmount(g.unitCostVnd)}đ</span> : null}
                        </td>
                        <td className={`${tdClass} text-[12px]`}>
                          {g.holders.map((h) => (
                            <Link key={h.itemId} href={`/admin/orders/${h.orderId}/`} className={cn("mr-1 inline-block rounded px-1.5 py-0.5 font-semibold no-underline hover:underline", h.committed ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800")}>
                              #{h.orderNumber} ×{h.qty}
                            </Link>
                          ))}
                          {g.free ? <span className="text-green-700">tự do {g.free}</span> : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </SheetTable>
            </div>
          </Card>

          {lines.length ? (
            <Card title={`Đơn đang chờ sản phẩm này (${lines.length} dòng)`}>
              <ul className="m-0 list-none space-y-1 p-0 text-[13px]" data-testid="product-order-lines">
                {lines.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center gap-2">
                    <Link href={`/admin/orders/${l.order_id}/`} className="font-semibold text-lien-blue hover:underline">
                      #{l.number}
                    </Link>
                    <span>{`${l.last_name} ${l.first_name}`.trim()}</span>
                    <span className="font-semibold">×{l.quantity}</span>
                    {allocs
                      .filter((a) => a.orderItemId === l.id)
                      .map((a) => (
                        <span key={a.id} className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", a.sourceType === "buy" ? "bg-gray-200 text-gray-700" : a.tone === "green" ? "bg-green-100 text-green-800" : "bg-sky-100 text-sky-800")} title={a.codes.join(" ")}>
                          {a.label} ×{a.qty}
                        </span>
                      ))}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {gone.length || removed.length ? (
            <Card title="Lịch sử: đã giao khách / đã loại">
              {gone.length ? (
                <p className="m-0 mb-2 text-[12px]">
                  <b>Đã giao / đang giao ({gone.length}):</b>{" "}
                  {gone.map((u) => (
                    <Link key={u.id} href={`/admin/inventory/units/${u.code}/`} className="mr-1 font-mono text-[11px] text-lien-blue hover:underline" title={u.orderNumber ? `đơn #${u.orderNumber}` : undefined}>
                      {u.code}
                    </Link>
                  ))}
                </p>
              ) : null}
              {removed.length ? (
                <form action={removeUnitsAction} className="text-[12px]">
                  <input type="hidden" name="productId" value={pid} />
                  <input type="hidden" name="reason" value="restore" />
                  <b>Đã loại ({removed.length}):</b>{" "}
                  {removed.map((u) => (
                    <label key={u.id} className="mr-2 inline-flex items-center gap-1">
                      <input type="checkbox" name="uids" value={u.id} className="h-3.5 w-3.5" />
                      <Link href={`/admin/inventory/units/${u.code}/`} className="font-mono text-[11px] text-lien-blue hover:underline">
                        {u.code}
                      </Link>
                      <span className="text-lien-muted">{u.removed ? UNIT_REMOVED_LABEL[u.removed] : ""}</span>
                    </label>
                  ))}
                  <button type="submit" className={cn(btnSecondary, "!px-2 !py-0.5 !text-[11px]")}>
                    Khôi phục mã đã tick
                  </button>
                </form>
              ) : null}
            </Card>
          ) : null}
        </div>

        <Card title="Nhập hàng trực tiếp">
          <div className="mb-3 flex items-center gap-2">
            {product.thumb ? <Image src={product.thumb} alt="" width={44} height={44} className="h-11 w-11 rounded border border-[#e5e7eb] object-contain" /> : null}
            <span className="text-[12px] text-lien-muted">
              #{product.id}
              {product.sku ? ` · ${product.sku}` : ""} · giá vốn hiện tại {product.costJpy ? `¥${product.costJpy.toLocaleString("ja-JP")}` : "—"}
            </span>
          </div>
          <form action={addUnitsAction} className="grid gap-3" data-testid="add-units">
            <input type="hidden" name="productId" value={pid} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={adminLabel} htmlFor="au-qty">
                  Số lượng
                </label>
                <input id="au-qty" name="qty" inputMode="numeric" required className={adminInput} />
              </div>
              <div>
                <label className={adminLabel} htmlFor="au-st">
                  Đang ở
                </label>
                <select id="au-st" name="status" defaultValue="at_shop" className={adminInput}>
                  {PLACES.filter((x) => purchaseIndex(x.key) <= purchaseIndex("at_shop")).map((x) => (
                    <option key={x.key} value={x.key}>
                      {x.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={adminLabel} htmlFor="au-src">
                  Mua ở
                </label>
                <select id="au-src" name="sourceKey" defaultValue={product.costSource || "manual"} className={adminInput}>
                  {sources.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={adminLabel} htmlFor="au-origin">
                  Loại
                </label>
                <select id="au-origin" name="origin" defaultValue="manual" className={adminInput}>
                  <option value="manual">Nhập tay (mua trực tiếp…)</option>
                  <option value="return">Khách trả lại</option>
                </select>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className={adminLabel} htmlFor="au-jpy">
                  ¥/cái
                </label>
                <input id="au-jpy" name="unitCostJpy" inputMode="numeric" defaultValue={product.costJpy ?? ""} className={adminInput} />
              </div>
              <div>
                <label className={adminLabel} htmlFor="au-exp">
                  HSD
                </label>
                <input id="au-exp" name="expiry" placeholder="03/2027" className={adminInput} />
              </div>
              <div>
                <label className={adminLabel} htmlFor="au-date">
                  Ngày mua
                </label>
                <input type="date" id="au-date" name="boughtAt" defaultValue={todayIso()} className={adminInput} />
              </div>
            </div>
            <div>
              <label className={adminLabel} htmlFor="au-bill">
                Mã bill <span className="font-normal text-lien-muted">— tuỳ chọn</span>
              </label>
              <input id="au-bill" name="billCode" list="bill-codes" maxLength={60} placeholder="BILL_260927_1454" className={cn(adminInput, "font-mono")} />
            </div>
            <div>
              <label className={adminLabel} htmlFor="au-note">
                Ghi chú
              </label>
              <input id="au-note" name="note" placeholder="Mua tại Don Quijote khi về Nhật 9/2026…" className={adminInput} />
            </div>
            <button type="submit" className={`${btnPrimary} justify-self-start`}>
              <Fa name="plus" /> Nhập hàng
            </button>
          </form>
          <p className="mt-3 mb-0 text-[12px] leading-5 text-lien-muted">
            Mỗi cái nhập được một mã riêng (H…). Hàng mua trong một đợt thì thêm ở Quản lý mua hàng › Mua theo đợt. Đơn khách giữ hàng theo thứ tự: gần khách nhất trước, cùng chỗ thì hạn dùng gần nhất, rồi bill mua sớm hơn.
            {live.length ? ` · ${purchaseSourceName(live[0].sourceKey, sources)} là nơi mua gần nhất.` : ""}
            {live.length ? ` Lần mua gần nhất ${formatDate(live[live.length - 1].boughtAt ?? live[live.length - 1].createdAt)}.` : ""}
          </p>
        </Card>
      </div>
    </>
  );
}
