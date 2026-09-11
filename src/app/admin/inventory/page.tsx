import Image from "next/image";
import Link from "next/link";
import { updateStockAction } from "@/app/admin/inventory/actions";
import { ResizableTable } from "@/components/sites/lienstore/admin/ResizableTable";
import { adminInput, btnPrimary, btnSecondary, Card, Flash, PageHeader, tableClass, tdClass, thClass } from "@/components/sites/lienstore/admin/ui";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { requireAdmin } from "@/lib/auth";
import { getCategories } from "@/lib/db";
import { formatPrice } from "@/lib/format";
import { DEFAULT_MIN_STOCK, getInventory, type InventoryLine, type StockState } from "@/lib/inventory";
import { applyInventoryView, inventoryHref, type InventoryView, parseInventoryView, type SortKey, sortHref } from "@/lib/inventory-view";
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

export default async function AdminInventory({ searchParams }: Props) {
  await requireAdmin("inventory");
  const sp = await searchParams;
  const v = parseInventoryView(sp);
  const saved = first(sp.saved);

  const [{ lines, summary }, categories] = await Promise.all([getInventory(), getCategories()]);
  const catName = Object.fromEntries(categories.map((c) => [c.slug, c.name]));
  const filtered = applyInventoryView(lines, v);
  const back = inventoryHref(v);
  const tracked = lines.filter((l) => l.product.stock !== null);
  const countState = (s: StockState) => tracked.filter((l) => l.state === s).length;
  const radio = (active: boolean) => cn("inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[13px] no-underline", active ? "border-lien-blue bg-lien-blue text-white" : "border-[#d1d5db] bg-white text-lien-text hover:bg-[#f3f4f6]");
  const dot = (active: boolean) => <span className={cn("h-3 w-3 rounded-full border-2", active ? "border-white bg-white" : "border-[#9ca3af]")} />;
  const csvHref = inventoryHref(v, {}, "/admin/inventory/export/").replace("/export/?", "/export/?mode=view&").replace(/\/export\/$/, "/export/?mode=view");

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

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat href={inventoryHref(v, { track: "tracked", state: "out" })} label="Hết hàng" value={String(summary.out)} tone="red" hint="Sản phẩm tồn 0 hoặc đánh dấu hết" />
        <Stat href={inventoryHref(v, { track: "tracked", state: "low" })} label="Sắp hết" value={String(summary.low)} tone="amber" hint={`Tồn ≤ mức tối thiểu (mặc định ${DEFAULT_MIN_STOCK})`} />
        <Stat href={inventoryHref(v, { need: "order" })} label="Cần đặt hàng" value={`${summary.toBuyLines} sp · ${summary.toBuyUnits} đv`} tone="blue" hint={`Ước tính vốn ${formatPrice(summary.toBuyCost)}`} />
        <Stat href={inventoryHref(v, { track: "untracked", state: "" })} label="Không theo dõi tồn" value={String(summary.untracked)} tone="gray" hint="Mua theo đơn — mọi đơn mở đều cần đặt" />
      </div>

      <Card>
        <div className="mb-4 space-y-2 rounded-md border border-[#e5e7eb] bg-[#fafafa] p-3 text-[13px]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-[150px] font-semibold text-lien-heading">Trạng thái theo dõi:</span>
            <Link href={inventoryHref(v, { track: "all", state: "" })} className={radio(v.track === "all")}>
              {dot(v.track === "all")} Tất cả ({lines.length})
            </Link>
            <Link href={inventoryHref(v, { track: "tracked", state: "" })} className={radio(v.track === "tracked")}>
              {dot(v.track === "tracked")} Theo dõi tồn ({summary.tracked})
            </Link>
            {v.track === "tracked" ? (
              <span className="ml-1 flex flex-wrap gap-1.5 border-l border-[#d1d5db] pl-3">
                {(["out", "low", "ok"] as StockState[]).map((s) => (
                  <Link key={s} href={inventoryHref(v, { state: v.state === s ? "" : s })} className={cn("rounded-full px-2.5 py-0.5 text-[12px] font-semibold no-underline", STATE_LABEL[s].cls, v.state === s ? "ring-2 ring-lien-blue" : "opacity-80 hover:opacity-100")}>
                    {STATE_LABEL[s].label} ({countState(s)})
                  </Link>
                ))}
              </span>
            ) : null}
            <Link href={inventoryHref(v, { track: "untracked", state: "" })} className={radio(v.track === "untracked")}>
              {dot(v.track === "untracked")} Không theo dõi ({summary.untracked})
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-[150px] font-semibold text-lien-heading">Cần mua:</span>
            <Link href={inventoryHref(v, { need: "all" })} className={radio(v.need === "all")}>
              {dot(v.need === "all")} Tất cả
            </Link>
            <Link href={inventoryHref(v, { need: "order" })} className={radio(v.need === "order")}>
              {dot(v.need === "order")} Đơn mở cần ({lines.filter((l) => l.demand > 0 && l.toBuy > 0).length})
            </Link>
            <Link href={inventoryHref(v, { need: "restock" })} className={radio(v.need === "restock")}>
              {dot(v.need === "restock")} Bổ sung tồn ({lines.filter((l) => l.toBuy > 0 && l.demand === 0).length})
            </Link>
            <Link href="/admin/purchases/" className="ml-auto text-lien-blue hover:underline">
              <Fa name="shopping-basket" /> Quản lý mua hàng →
            </Link>
          </div>
        </div>
        <form method="get" className="mb-5 grid gap-3 md:grid-cols-[1fr_260px_auto]">
          {v.track !== "all" ? <input type="hidden" name="track" value={v.track} /> : null}
          {v.state ? <input type="hidden" name="state" value={v.state} /> : null}
          {v.need !== "all" ? <input type="hidden" name="need" value={v.need} /> : null}
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
          <button type="submit" className={btnPrimary}>
            Lọc
          </button>
        </form>

        {v.need !== "all" ? (
          <p className="mb-4 rounded-md border border-lien-blue/30 bg-lien-blue-soft/60 px-3 py-2 text-[13px] leading-5 text-lien-text">
            <strong>Cần mua</strong> = số lượng trong các đơn <em>Chờ xử lý / Đang xử lý</em> chưa được tồn kho và hàng đã mua (đang về / tại kho) bao phủ, cộng phần bù về mức tồn tối thiểu. Sản phẩm không theo dõi tồn được coi là mua theo từng đơn. Đánh dấu đã mua ở Quản lý mua hàng để dòng biến mất khỏi đây.
          </p>
        ) : null}

        <p className="mb-2 text-[12px] text-lien-muted">Bấm tên cột để sắp xếp tăng / giảm · kéo mép cột để đổi độ rộng (nhấp đôi để đặt lại) · bảng cuộn ngang khi hẹp.</p>
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
                <Th v={v} k="pipeline" label="Đang về · tại kho" title="Đã mua tại Nhật / đang về / đã tới kho shop, chưa giao cho khách" />
                <Th v={v} k="orders" label="Đơn hàng (đơn mở cần)" />
                <Th v={v} k="need" label="Cần mua" />
                <Th v={v} k="cost" label="Giá vốn" />
                <Th v={v} k="value" label="Giá trị tồn" title="(tồn + đang về/tại kho) × giá vốn" />
                <th className={thClass}>Cập nhật tồn / mức tối thiểu</th>
                <Th v={v} k="supplier" label="Link mua" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={13} className={`${tdClass} text-center text-lien-muted`}>
                    Không có sản phẩm phù hợp.
                  </td>
                </tr>
              ) : null}
              {filtered.map((l) => (
                <Row key={l.product.id} line={l} catName={catName} back={back} />
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
    <Link href={href} className={cn("rounded-lg border p-4 no-underline hover:shadow-sm", tones[tone])}>
      <div className="text-[12px] font-semibold uppercase tracking-wide text-[#6b7280]">{label}</div>
      <div className="mt-1 font-oswald text-[24px] leading-8 text-lien-heading">{value}</div>
      <div className="text-[12px] text-lien-muted">{hint}</div>
    </Link>
  );
}

function Row({ line, catName, back }: { line: InventoryLine; catName: Record<string, string>; back: string }) {
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
