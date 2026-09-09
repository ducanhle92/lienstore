import Image from "next/image";
import Link from "next/link";
import { Fa, type FaName } from "@/components/sites/lienstore/shared/icons";
import { cn } from "@/lib/utils";
import type { BlogPost } from "@/types/shop";
import { buildCategoryTree, shortName } from "@/lib/categories";
import type { HeaderCategory } from "./Header2";

/** Row of square category tiles (image, name, item count). Scrolls horizontally on small screens. */
export function CategoryTiles({ categories, limit = 15 }: { categories: HeaderCategory[]; limit?: number }) {
  // top-level groups first, then their sub-categories, largest first
  const tree = buildCategoryTree(categories);
  const ordered = [...tree.map((n) => ({ ...n.category, count: n.total, image: n.image })), ...tree.flatMap((n) => n.children.map((c) => ({ ...c.category, count: c.total, image: c.image })))].filter((c) => c.count > 0);
  const shown = ordered.slice(0, limit);
  const rest = ordered.length - shown.length;
  return (
    <section aria-label="Danh mục sản phẩm" className="mt-6">
      <ul className="m-0 grid list-none grid-cols-3 gap-3 p-0 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
        {shown.map((c, i) => (
          <li key={c.slug} className={cn(i >= 8 && "hidden sm:block")}>
            <Link href={`/product-category/${c.slug}/`} className="group flex h-full flex-col items-center rounded-md border border-lien-line bg-lien-footer2 px-2 pt-3 pb-3 text-center no-underline hover:border-lien-blue hover:bg-white">
              <span className="mb-2 flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-white shadow-sm">
                {c.image ? <Image src={c.image} alt="" width={64} height={64} className="h-14 w-14 object-contain transition-transform group-hover:scale-105" /> : <Fa name="tags" className="text-[22px] text-lien-blue" />}
              </span>
              <span className="line-clamp-2 text-[12px] font-semibold leading-4 text-lien-heading sm:text-[13px]">{shortName(c.name)}</span>
              <span className="mt-1 text-[11px] text-lien-muted">{c.count} mặt hàng</span>
            </Link>
          </li>
        ))}
        <li>
          <Link href="/shop/" className="group flex h-full flex-col items-center justify-center rounded-md border border-dashed border-lien-blue/50 bg-white px-2 py-3 text-center no-underline hover:border-lien-blue hover:bg-lien-blue-soft">
            <span className="mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-lien-blue-soft text-[22px] text-lien-blue">
              <Fa name="th-large" />
            </span>
            <span className="text-[12px] font-semibold leading-4 text-lien-blue sm:text-[13px]">Tất cả danh mục</span>
            <span className="mt-1 text-[11px] text-lien-muted">{rest > 0 ? `+${rest} danh mục khác` : `${categories.length} danh mục`}</span>
          </Link>
        </li>
      </ul>
    </section>
  );
}

/** Section heading: coloured title with optional emoji/icon and a "Xem thêm »" link on the right. */
export function SectionHeader2({ title, href, icon, tone = "blue", className }: { title: string; href?: string; icon?: FaName; tone?: "blue" | "sale"; className?: string }) {
  return (
    <div className={cn("mb-4 flex items-end justify-between gap-4 border-b border-lien-line pb-2", className)}>
      <h2 className={cn("m-0 flex items-center gap-2 text-[20px] font-bold uppercase leading-7 tracking-[0.3px] sm:text-[22px]", tone === "sale" ? "text-lien-sale" : "text-lien-blue")}>
        {icon ? <Fa name={icon} className="text-[20px]" /> : null}
        {title}
      </h2>
      {href ? (
        <Link href={href} className="inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap border-b border-lien-success pb-px text-[13px] font-semibold text-lien-success no-underline hover:border-lien-blue hover:text-lien-blue">
          Xem thêm
          <span className="inline-flex text-[12px] leading-none">
            <Fa name="angle-right" />
            <Fa name="angle-right" className="-ml-1" />
          </span>
        </Link>
      ) : null}
    </div>
  );
}

const USP: Array<{ icon: FaName; title: string; text: string }> = [
  { icon: "check-circle", title: "Hàng Nhật nội địa", text: "Mua trực tiếp tại Nhật, có bill đối chiếu từng đơn" },
  { icon: "plane", title: "Vận chuyển Nhật – Việt", text: "Gom đơn hàng tuần, giao tận nhà toàn quốc" },
  { icon: "comments-o", title: "Tư vấn qua Zalo", text: "Hỗ trợ chọn hàng, báo giá mua hộ nhanh" },
  { icon: "shield", title: "Cam kết chính hãng", text: "Đổi trả nếu hàng không đúng mô tả" },
];

/** Four-tile promise strip (why buy here). */
export function UspStrip() {
  return (
    <section aria-label="Cam kết" className="my-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {USP.map((u) => (
        <div key={u.title} className="flex items-start gap-3 rounded-md border border-lien-line bg-white p-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-lien-blue-soft text-[20px] text-lien-blue">
            <Fa name={u.icon} />
          </span>
          <div>
            <p className="m-0 text-[14px] font-bold leading-5 text-lien-heading">{u.title}</p>
            <p className="m-0 mt-0.5 text-[13px] leading-5 text-lien-muted">{u.text}</p>
          </div>
        </div>
      ))}
    </section>
  );
}

/** Blog teaser cards for the home page. */
export function NewsCards({ posts }: { posts: BlogPost[] }) {
  if (posts.length === 0) return null;
  return (
    <section aria-label="Tin tức" className="my-10">
      <SectionHeader2 title="Góc chia sẻ" href="/category/goc-chia-se/" icon="newspaper-o" />
      <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-4">
        {posts.slice(0, 4).map((p) => (
          <li key={p.slug} className="flex flex-col rounded-md border border-lien-line bg-white p-4 hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.3)]">
            <p className="m-0 mb-2 text-[12px] text-lien-muted">
              <Fa name="calendar" className="mr-1" />
              {new Date(p.date).toLocaleDateString("vi-VN")}
            </p>
            <Link href={`/${p.slug}/`} className="no-underline">
              <h3 className="m-0 line-clamp-2 text-[15px] font-semibold leading-[22px] text-lien-heading hover:text-lien-blue">{p.title}</h3>
            </Link>
            <p className="m-0 mt-2 line-clamp-3 text-[13px] leading-5 text-lien-muted">{p.excerpt.replace(/<[^>]+>/g, "")}</p>
            <Link href={`/${p.slug}/`} className="mt-auto pt-3 text-[13px] font-medium text-lien-blue no-underline hover:underline">
              Đọc tiếp <Fa name="angle-right" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Cream title band with breadcrumb used on listing / static pages. */
export function PageBand({ title, crumbs, description }: { title: string; crumbs: Array<{ label: string; href?: string }>; description?: string }) {
  return (
    <div className="border-b border-lien-line bg-lien-cream">
      <div className="mx-auto max-w-[1300px] px-4 py-5 text-center">
        <h1 className="m-0 text-[22px] font-bold leading-8 text-lien-blue sm:text-[26px]">{title}</h1>
        {description ? <div className="mx-auto mt-1 max-w-[760px] text-[13px] leading-5 text-lien-muted" dangerouslySetInnerHTML={{ __html: description }} /> : null}
        <nav aria-label="Breadcrumb" className="mt-2 text-[12px] leading-5 text-lien-muted">
          <Link href="/" className="text-lien-muted no-underline hover:text-lien-blue">
            Trang chủ
          </Link>
          {crumbs.map((c) => (
            <span key={`${c.label}-${c.href ?? ""}`}>
              <Fa name="angle-right" className="mx-1.5 text-[10px]" />
              {c.href ? (
                <Link href={c.href} className="text-lien-muted no-underline hover:text-lien-blue">
                  {c.label}
                </Link>
              ) : (
                <span className="text-lien-heading">{c.label}</span>
              )}
            </span>
          ))}
        </nav>
      </div>
    </div>
  );
}
