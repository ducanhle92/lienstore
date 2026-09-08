import Image from "next/image";
import Link from "next/link";
import { updateStockAction } from "@/app/admin/inventory/actions";
import { adminInput, btnPrimary, btnSecondary, Card, Flash, PageHeader, tableClass, tdClass, thClass } from "@/components/sites/lienstore/admin/ui";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { requireAdmin } from "@/lib/auth";
import { getCategories } from "@/lib/db";
import { formatPrice } from "@/lib/format";
import { DEFAULT_MIN_STOCK, getInventory, type InventoryLine, type StockState } from "@/lib/inventory";
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

type View = "all" | "tracked" | "low" | "out" | "untracked" | "order";

export default async function AdminInventory({ searchParams }: Props) {
  await requireAdmin("inventory");
  const sp = await searchParams;
  const view = (first(sp.view) || "all") as View;
  const q = first(sp.q).trim().toLowerCase();
  const category = first(sp.category);
  const saved = first(sp.saved);

  const [{ lines, summary }, categories] = await Promise.all([getInventory(), getCategories()]);
  const catName = Object.fromEntries(categories.map((c) => [c.slug, c.name]));

  const filtered = lines
    .filter((l) => !q || `${l.product.name} ${l.product.slug} ${l.product.sku ?? ""}`.toLowerCase().includes(q))
    .filter((l) => !category || l.product.categories.includes(category))
    .filter((l) => {
      switch (view) {
        case "tracked":
          return l.product.stock !== null;
        case "low":
          return l.state === "low";
        case "out":
          return l.state === "out";
        case "untracked":
          return l.product.stock === null;
        case "order":
          return l.toBuy > 0;
        default:
          return true;
      }
    })
    .sort((a, b) => {
      if (view === "order") return b.toBuy - a.toBuy || a.product.name.localeCompare(b.product.name, "vi");
      const rank: Record<StockState, number> = { out: 0, low: 1, ok: 2, untracked: 3 };
      return rank[a.state] - rank[b.state] || a.product.name.localeCompare(b.product.name, "vi");
    });

  const tabs: Array<{ key: View; label: string; count: number }> = [
    { key: "all", label: "Tất cả", count: lines.length },
    { key: "tracked", label: "Theo dõi tồn", count: summary.tracked },
    { key: "low", label: "Sắp hết", count: summary.low },
    { key: "out", label: "Hết hàng", count: summary.out },
    { key: "untracked", label: "Không theo dõi", count: summary.untracked },
    { key: "order", label: "Cần đặt hàng", count: summary.toBuyLines },
  ];
  const hrefFor = (v: View) => `/admin/inventory/?view=${v}${q ? `&q=${encodeURIComponent(q)}` : ""}${category ? `&category=${category}` : ""}`;
  const back = hrefFor(view);

  return (
    <>
      <PageHeader
        title="Kho hàng"
        subtitle={`${summary.tracked} sản phẩm theo dõi tồn · ${summary.units} đơn vị · vốn tồn ${formatPrice(summary.stockValue)} · lợi nhuận dự kiến ${formatPrice(summary.stockProfit)}`}
        actions={
          <Link href="/admin/inventory/export/" className={btnSecondary}>
            <Fa name="download" /> Xuất danh sách cần mua (CSV)
          </Link>
        }
      />
      {saved ? <Flash>Đã cập nhật tồn kho sản phẩm #{saved}.</Flash> : null}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Hết hàng" value={String(summary.out)} tone="red" hint="Sản phẩm tồn 0 hoặc đánh dấu hết" />
        <Stat label="Sắp hết" value={String(summary.low)} tone="amber" hint={`Tồn ≤ mức tối thiểu (mặc định ${DEFAULT_MIN_STOCK})`} />
        <Stat label="Cần đặt hàng" value={`${summary.toBuyLines} sp · ${summary.toBuyUnits} đv`} tone="blue" hint={`Ước tính vốn ${formatPrice(summary.toBuyCost)}`} />
        <Stat label="Không theo dõi tồn" value={String(summary.untracked)} tone="gray" hint="Mua theo đơn — mọi đơn mở đều cần đặt" />
      </div>

      <Card>
        <div className="mb-4 flex flex-wrap gap-2">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={hrefFor(t.key)}
              className={cn(
                "rounded-md border px-3 py-1.5 text-[13px] leading-5 no-underline",
                view === t.key ? "border-lien-blue bg-lien-blue text-white" : "border-[#d1d5db] bg-white text-lien-text hover:bg-[#f3f4f6]",
              )}
            >
              {t.label} <span className={cn("ml-1", view === t.key ? "text-white/80" : "text-lien-muted")}>({t.count})</span>
            </Link>
          ))}
        </div>
        <form method="get" className="mb-5 grid gap-3 md:grid-cols-[1fr_260px_auto]">
          <input type="hidden" name="view" value={view} />
          <input name="q" defaultValue={first(sp.q)} placeholder="Tìm theo tên, slug, SKU…" className={adminInput} />
          <select name="category" defaultValue={category} className={adminInput}>
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

        {view === "order" ? (
          <p className="mb-4 rounded-md border border-lien-blue/30 bg-lien-blue-soft/60 px-3 py-2 text-[13px] leading-5 text-lien-text">
            <strong>Cần đặt hàng</strong> = số lượng trong các đơn <em>Chờ xử lý / Đang xử lý</em> chưa được tồn kho bao phủ, cộng phần bù về mức tồn tối thiểu. Sản phẩm không theo dõi tồn được coi là mua theo từng đơn. Bấm link nhà cung cấp để mở trang mua (Amazon JP).
          </p>
        ) : null}

        <div className="overflow-x-auto">
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass} />
                <th className={thClass}>Sản phẩm</th>
                <th className={thClass}>Tình trạng</th>
                <th className={thClass}>Tồn</th>
                <th className={thClass}>Đơn mở cần</th>
                <th className={thClass}>Cần mua</th>
                <th className={thClass}>Giá vốn</th>
                <th className={thClass}>Giá trị tồn</th>
                <th className={thClass}>Cập nhật tồn / mức tối thiểu</th>
                <th className={thClass}>Mua ở</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className={`${tdClass} text-center text-lien-muted`}>
                    Không có sản phẩm phù hợp.
                  </td>
                </tr>
              ) : null}
              {filtered.map((l) => (
                <Row key={l.product.id} line={l} catName={catName} back={back} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint: string; tone: "red" | "amber" | "blue" | "gray" }) {
  const tones = { red: "border-red-200 bg-red-50", amber: "border-amber-200 bg-amber-50", blue: "border-lien-blue/30 bg-lien-blue-soft/60", gray: "border-[#e5e7eb] bg-[#f9fafb]" };
  return (
    <div className={cn("rounded-lg border p-4", tones[tone])}>
      <div className="text-[12px] font-semibold uppercase tracking-wide text-[#6b7280]">{label}</div>
      <div className="mt-1 font-oswald text-[24px] leading-8 text-lien-heading">{value}</div>
      <div className="text-[12px] text-lien-muted">{hint}</div>
    </div>
  );
}

function Row({ line, catName, back }: { line: InventoryLine; catName: Record<string, string>; back: string }) {
  const p = line.product;
  const st = STATE_LABEL[line.state];
  return (
    <tr className="hover:bg-[#fafafa]">
      <td className={`${tdClass} w-14`}>
        {p.thumb ? <Image src={p.thumb} alt="" width={40} height={40} className="h-10 w-10 rounded border border-[#e5e7eb] object-cover" unoptimized /> : null}
      </td>
      <td className={tdClass}>
        <Link href={`/admin/products/${p.id}/`} className="font-semibold text-lien-heading hover:text-lien-blue">
          {p.name}
        </Link>
        <div className="text-[12px] text-lien-muted">
          #{p.id} · {p.categories.map((c) => catName[c] ?? c).join(", ")}
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
            <Fa name="external-link" /> {p.supplierUrl.includes("amazon") ? "Amazon JP" : "Nhà cung cấp"}
          </a>
        ) : (
          <span className="text-lien-muted">—</span>
        )}
      </td>
    </tr>
  );
}
