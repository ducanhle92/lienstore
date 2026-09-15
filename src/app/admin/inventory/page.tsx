import Image from "next/image";
import Link from "next/link";
import { updateStockAction } from "@/app/admin/inventory/actions";
import { ResizableTable } from "@/components/sites/lienstore/admin/ResizableTable";
import { adminInput, btnPrimary, btnSecondary, Card, Flash, PageHeader, tableClass, tdClass, thClass } from "@/components/sites/lienstore/admin/ui";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { requireAdmin } from "@/lib/auth";
import { getCategories } from "@/lib/db";
import { formatPrice } from "@/lib/format";
import { DEFAULT_MIN_STOCK, getInventory, SALES_PACE_DAYS, type InventoryLine, type StockState } from "@/lib/inventory";
import { daysToExpiry, expiryState } from "@/lib/lots";
import { purchaseSourceName } from "@/lib/purchase-sources";
import { listPurchaseSources } from "@/lib/db";
import { applyInventoryView, inventoryHref, type InventoryView, type Pstatus, parseInventoryView, type SortKey, sortHref } from "@/lib/inventory-view";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

const STATE_LABEL: Record<StockState, { label: string; cls: string }> = {
  ok: { label: "Còn hàng", cls: "bg-green-100 text-green-800" },
  low: { label: "Sắp hết", cls: "bg-amber-100 text-amber-800" },
  out: { label: "Hết hàng", cls: "bg-red-100 text-red-800" },
  untracked: { label: "Không theo dõi", cls: "bg-gray-200 text-gray-700" },
};
const PSTATUS_LABEL: Record<Exclude<Pstatus, "">, string> = { in_stock: "Đang lưu kho", incoming: "Đang về", unbought: "Chưa mua" };

export default async function AdminInventory({ searchParams }: Props) {
  await requireAdmin("inventory");
  const sp = await searchParams;
  const v = parseInventoryView(sp);
  const saved = first(sp.saved);

  const [{ lines, summary }, categories, sources] = await Promise.all([getInventory(), getCategories(), listPurchaseSources(true)]);
  const sourceName = (k: string) => purchaseSourceName(k, sources);
  const catName = Object.fromEntries(categories.map((c) => [c.slug, c.name]));
  const filtered = applyInventoryView(lines, v);
  const back = inventoryHref(v);
  const csvHref = inventoryHref(v, {}, "/admin/inventory/export/").replace("/export/?", "/export/?mode=view&").replace(/\/export\/$/, "/export/?mode=view");
  const countPstatus = (s: Exclude<Pstatus, "">) => lines.filter((l) => l.pipelineStage === s).length;

  return (
    <>
      <PageHeader
        title="Kho hàng"
        subtitle={`${summary.tracked} sản phẩm theo dõi tồn · ${summary.units} đơn vị · vốn tồn ${formatPrice(summary.stockValue)} · lợi nhuận dự kiến ${formatPrice(summary.stockProfit)}`}
        actions={
          <>
            <a href={csvHref} className={btnSecondary} title="Đúng các dòng và thứ tự đang hiển thị — dùng để in kiểm kho">
              <Fa name="download" /> Xuất CSV bảng này ({filtered.length})
            </a>
            <Link href="/admin/inventory/export/" className={btnSecondary}>
              <Fa name="download" /> CSV cần mua
            </Link>
          </>
        }
      />
      {saved ? <Flash>Đã cập nhật tồn kho sản phẩm #{saved}.</Flash> : null}

      <div className="mb-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-7">
        <Stat href="/admin/purchases/" label="Đang trên đường về" value={`${summary.inTransitUnits} đv`} tone="blue" hint={formatPrice(summary.inTransitValue)} />
        <Stat href="/admin/purchases/" label="Tại kho shop (cho đơn)" value={`${summary.atShopUnits} đv`} tone="gray" hint={`+ tồn tự do ${summary.units}`} />
        <Stat href={inventoryHref(v, { track: "tracked", state: "out" })} label="Hết hàng" value={String(summary.out)} tone="red" hint="Tồn 0 / đánh dấu hết" />
        <Stat href={inventoryHref(v, { track: "tracked", state: "low" })} label="Sắp hết" value={String(summary.low)} tone="amber" hint={`≤ tối thiểu (mặc định ${DEFAULT_MIN_STOCK})`} />
        <Stat href={inventoryHref(v, { need: "order" })} label="Cần đặt hàng" value={`${summary.toBuyLines} sp · ${summary.toBuyUnits} đv`} tone="blue" hint={formatPrice(summary.toBuyCost)} />
        <Stat href={inventoryHref(v, { track: "untracked", state: "" })} label="Không theo dõi tồn" value={String(summary.untracked)} tone="gray" hint="Mua theo đơn" />
        <Stat href={inventoryHref(v, { track: "tracked", state: "" })} label="Hạn dùng cần chú ý" value={`${summary.expiringSoonUnits} sắp · ${summary.expiredUnits} hết`} tone={summary.expiredUnits ? "red" : summary.expiringSoonUnits ? "amber" : "gray"} hint="≤ 90 ngày = sắp hết hạn" />
      </div>

      <Card>
        <form method="get" className="mb-4 grid gap-3 md:grid-cols-[1fr_170px_160px_160px_auto] md:items-end">
          {v.track !== "all" ? <input type="hidden" name="track" value={v.track} /> : null}
          {v.state ? <input type="hidden" name="state" value={v.state} /> : null}
          {v.sort !== "state" ? <input type="hidden" name="sort" value={v.sort} /> : null}
          {v.sort !== "state" ? <input type="hidden" name="dir" value={v.dir} /> : null}
          <input name="q" defaultValue={first(sp.q)} placeholder="Tìm theo tên, slug, SKU, #id…" className={adminInput} />
          <select name="category" defaultValue={v.category} className={adminInput}>
            <option value="">Tất cả danh mục</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
          <select name="pstatus" defaultValue={v.pstatus} className={adminInput} aria-label="Trạng thái theo dõi">
            <option value="">Trạng thái: tất cả</option>
            <option value="in_stock">{PSTATUS_LABEL.in_stock} ({countPstatus("in_stock")})</option>
            <option value="incoming">{PSTATUS_LABEL.incoming} ({countPstatus("incoming")})</option>
            <option value="unbought">{PSTATUS_LABEL.unbought} ({countPstatus("unbought")})</option>
          </select>
          <select name="need" defaultValue={v.need} className={adminInput} aria-label="Cần mua">
            <option value="all">Cần mua: tất cả</option>
            <option value="order">Theo đơn hàng ({lines.filter((l) => l.demand > 0 && l.toBuy > 0).length})</option>
            <option value="restock">Để lưu kho ({lines.filter((l) => l.toBuy > 0 && l.demand === 0).length})</option>
          </select>
          <button type="submit" className={btnPrimary}>
            Lọc
          </button>
        </form>
        <p className="mb-4 text-[12px] text-lien-muted">
          <strong>Trạng thái theo dõi</strong>: Đang lưu kho (còn tồn) · Đang về (đã đặt lô lưu kho, chưa tới) · Chưa mua (cần mua nhưng chưa đặt gì). <strong>Cần mua</strong>: theo đơn hàng đang mở, hoặc để bù về mức tồn tiêu chuẩn.{" "}
          <Link href="/admin/purchases/" className="text-lien-blue hover:underline">
            <Fa name="shopping-basket" /> Quản lý mua hàng →
          </Link>
        </p>

        <p className="mb-2 text-[12px] text-lien-muted">Bấm tên cột để sắp xếp tăng / giảm.</p>
        <ResizableTable id="inventory">
          <table className={tableClass}>
            <thead>
              <tr>
                <Th v={v} k="id" label="ID" />
                <Th v={v} k="sku" label="SKU" />
                <th className={thClass} />
                <Th v={v} k="name" label="Sản phẩm" />
                <Th v={v} k="state" label="Tình trạng" />
                <Th v={v} k="stock" label="Số lượng tồn hiện tại" />
                <th className={cn(thClass, "whitespace-nowrap")} title="Từng lần nhập kho: ngày nhập · còn/nhập · nguồn · hạn dùng · vị trí">
                  Lô hàng (ngày nhập · SL · nguồn · HSD · vị trí)
                </th>
                <Th v={v} k="pipeline" label="Đang về · tại kho" title="Đã mua tại Nhật / đang về / đã tới kho shop, chưa giao cho khách" />
                <Th v={v} k="orders" label="Đơn hàng (đơn mở cần)" />
                <Th v={v} k="need" label="Cần mua" />
                <th className={cn(thClass, "whitespace-nowrap")} title={`Số lượng bán ra trong ${SALES_PACE_DAYS} ngày gần đây`}>
                  Bán ra ({SALES_PACE_DAYS}n)
                </th>
                <th className={cn(thClass, "whitespace-nowrap")} title="(Tồn kho + đang về) − bán ra gần đây — ước tính còn dư bao nhiêu theo nhịp bán hiện tại">
                  Dự trữ dự kiến
                </th>
                <Th v={v} k="cost" label="Giá vốn" />
                <Th v={v} k="value" label="Giá trị tồn" title="(tồn + đang về/tại kho) × giá vốn" />
                <th className={thClass}>Cập nhật tồn / mức tối thiểu</th>
                <Th v={v} k="supplier" label="Link mua" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={16} className={`${tdClass} text-center text-lien-muted`}>
                    Không có sản phẩm phù hợp.
                  </td>
                </tr>
              ) : null}
              {filtered.map((l) => (
                <Row key={l.product.id} line={l} catName={catName} back={back} sourceName={sourceName} />
              ))}
            </tbody>
          </table>
        </ResizableTable>
      </Card>
    </>
  );
}

function Th({ v, k, label, title }: { v: InventoryView; k: SortKey; label: string; title?: string }) {
  const active = v.sort === k;
  return (
    <th className={cn(thClass, "whitespace-nowrap")} title={title} aria-sort={active ? (v.dir === "asc" ? "ascending" : "descending") : undefined}>
      <Link href={sortHref(v, k)} className={cn("inline-flex items-center gap-1 no-underline", active ? "text-lien-blue" : "text-[#6b7280] hover:text-lien-blue")}>
        {label}
        <Fa name={active ? (v.dir === "asc" ? "angle-up" : "angle-down") : "angle-down"} className={cn("text-[11px]", !active && "opacity-30")} />
      </Link>
    </th>
  );
}

function Stat({ label, value, hint, tone, href }: { label: string; value: string; hint: string; tone: "red" | "amber" | "blue" | "gray"; href: string }) {
  const tones = { red: "border-red-200 bg-red-50", amber: "border-amber-200 bg-amber-50", blue: "border-lien-blue/30 bg-lien-blue-soft/60", gray: "border-[#e5e7eb] bg-[#f9fafb]" };
  return (
    <Link href={href} className={cn("rounded-md border px-2.5 py-1.5 no-underline hover:shadow-sm", tones[tone])}>
      <div className="truncate text-[10px] font-semibold uppercase tracking-wide text-[#6b7280]" title={label}>
        {label}
      </div>
      <div className="font-oswald text-[16px] leading-5 text-lien-heading">{value}</div>
      <div className="truncate text-[10px] text-lien-muted" title={hint}>
        {hint}
      </div>
    </Link>
  );
}

const EXP_CLS = { expired: "bg-red-100 text-red-800", soon: "bg-amber-100 text-amber-800", ok: "text-lien-muted", none: "text-lien-muted" } as const;

function Row({ line, catName, back, sourceName }: { line: InventoryLine; catName: Record<string, string>; back: string; sourceName: (k: string) => string }) {
  const p = line.product;
  const st = STATE_LABEL[line.state];
  return (
    <tr className="hover:bg-[#fafafa]">
      <td className={`${tdClass} whitespace-nowrap font-mono text-[13px] text-lien-muted`}>#{p.id}</td>
      <td className={`${tdClass} whitespace-nowrap font-mono text-[12px]`}>{p.sku ? p.sku : <span className="text-lien-muted">—</span>}</td>
      <td className={`${tdClass} w-14`}>{p.thumb ? <Image src={p.thumb} alt="" width={40} height={40} className="h-10 w-10 rounded border border-[#e5e7eb] object-cover" unoptimized /> : null}</td>
      <td className={`${tdClass} min-w-[220px]`}>
        <Link href={`/admin/products/${p.id}/`} className="font-semibold text-lien-heading hover:text-lien-blue">
          {p.name}
        </Link>
        <div className="text-[12px] text-lien-muted">
          {p.categories.map((c) => catName[c] ?? c).join(", ")}
          {p.status === "draft" ? " · nháp" : ""}
        </div>
      </td>
      <td className={tdClass}>
        <span className={cn("inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-semibold leading-5", st.cls)}>{st.label}</span>
      </td>
      <td className={`${tdClass} whitespace-nowrap`}>
        {p.stock === null ? <span className="text-lien-muted">—</span> : <span className={cn("font-semibold", line.state === "out" && "text-red-700", line.state === "low" && "text-amber-700")}>{p.stock}</span>}
        <span className="ml-1 text-[12px] text-lien-muted">/ min {line.minStock}</span>
      </td>
      <td className={`${tdClass} min-w-[260px] text-[12px]`}>
        {line.lots.length ? (
          <ul className="m-0 list-none space-y-0.5 p-0" data-testid="lot-list">
            {line.lots.slice(0, 4).map((lot) => {
              const st = expiryState(lot.expiry);
              const d = daysToExpiry(lot.expiry);
              return (
                <li key={lot.id} className="flex flex-wrap items-center gap-x-1.5 leading-4">
                  <span className="text-lien-muted">{lot.receivedAt.slice(5).split("-").reverse().join("/")}</span>
                  <span className="font-semibold text-lien-heading">{lot.qtyLeft}</span>
                  <span className="text-lien-muted">· {sourceName(lot.sourceKey)}</span>
                  {lot.expiry ? (
                    <span className={cn("rounded px-1 font-semibold", EXP_CLS[st])} title={d !== null ? `${d} ngày` : undefined}>
                      HSD {lot.expiry.slice(2).split("-").reverse().join("/")}
                    </span>
                  ) : null}
                  {lot.location ? <span className="text-lien-muted">· {lot.location}</span> : null}
                </li>
              );
            })}
            {line.lots.length > 4 ? <li className="text-lien-muted">+{line.lots.length - 4} lô nữa</li> : null}
          </ul>
        ) : (
          <span className="text-lien-muted">{p.stock ? "chưa chia lô" : "—"}</span>
        )}
        <Link href={`/admin/inventory/lots/${p.id}/`} className="mt-1 inline-block text-[12px] font-semibold text-lien-blue hover:underline">
          {line.lots.length ? "Quản lý lô →" : "Nhập lô →"}
        </Link>
      </td>
      <td className={`${tdClass} whitespace-nowrap`}>
        {line.pipeline.pipeline ? (
          <span title={`${line.pipeline.inTransit} đang về · ${line.pipeline.atShop} tại kho shop`}>
            <span className="font-semibold text-sky-800">{line.pipeline.inTransit}</span>
            <span className="text-lien-muted"> / </span>
            <span className="font-semibold text-green-800">{line.pipeline.atShop}</span>
          </span>
        ) : (
          <span className="text-lien-muted">—</span>
        )}
      </td>
      <td className={tdClass}>
        {line.demand > 0 ? (
          <span title={line.demandOrders.map((o) => `#${o.number} × ${o.quantity}`).join(", ")}>
            {line.demand}
            <span className="ml-1 text-[12px] text-lien-muted">({line.demandOrders.map((o) => `#${o.number}`).join(", ")})</span>
          </span>
        ) : (
          <span className="text-lien-muted">—</span>
        )}
      </td>
      <td className={tdClass}>{line.toBuy > 0 ? <span className="rounded bg-lien-blue px-2 py-0.5 text-[13px] font-semibold text-white">{line.toBuy}</span> : <span className="text-lien-muted">—</span>}</td>
      <td className={`${tdClass} whitespace-nowrap`}>{line.soldRecent > 0 ? line.soldRecent : <span className="text-lien-muted">—</span>}</td>
      <td className={`${tdClass} whitespace-nowrap`}>
        {line.reserveForecast === null ? <span className="text-lien-muted">—</span> : <span className={cn("font-semibold", line.reserveForecast < 0 && "text-red-700")}>{line.reserveForecast}</span>}
      </td>
      <td className={`${tdClass} whitespace-nowrap text-lien-muted`}>{p.costPrice === null ? "—" : formatPrice(p.costPrice, p.currency)}</td>
      <td className={`${tdClass} whitespace-nowrap`}>{line.stockValue ? formatPrice(line.stockValue, p.currency) : <span className="text-lien-muted">—</span>}</td>
      <td className={tdClass}>
        <form action={updateStockAction} className="flex items-center gap-1">
          <input type="hidden" name="id" value={p.id} />
          <input type="hidden" name="back" value={back} />
          <input name="stock" inputMode="numeric" defaultValue={p.stock ?? ""} placeholder="—" className={cn(adminInput, "w-16 px-2 py-1 text-center")} aria-label="Tồn kho" />
          <input name="minStock" inputMode="numeric" defaultValue={p.minStock ?? ""} placeholder={String(DEFAULT_MIN_STOCK)} className={cn(adminInput, "w-14 px-2 py-1 text-center")} aria-label="Mức tối thiểu" />
          <button type="submit" className={cn(btnSecondary, "px-2 py-1")} title="Lưu">
            <Fa name="check-circle" />
          </button>
        </form>
      </td>
      <td className={`${tdClass} whitespace-nowrap`}>
        {p.supplierUrl ? (
          <a href={p.supplierUrl} target="_blank" rel="noreferrer" className="text-lien-blue hover:underline">
            <Fa name="external-link" /> {p.supplierUrl.includes("amazon") ? "Amazon JP" : p.supplierUrl.includes("iherb") ? "iHerb" : "Nhà cung cấp"}
          </a>
        ) : (
          <span className="text-lien-muted">—</span>
        )}
      </td>
    </tr>
  );
}
