"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { logout } from "@/app/admin/actions";
import { Fa, type FaName } from "@/components/sites/lienstore/shared/icons";
import { cn } from "@/lib/utils";

interface NavLeaf {
  href: string;
  label: string;
  icon: FaName;
  module?: string;
  exact?: boolean;
}

/** A parent row: either a plain link or a group whose children appear only when the row is opened. */
interface NavGroup extends NavLeaf {
  children?: NavLeaf[];
}

const NAV: NavGroup[] = [
  {
    href: "/admin/",
    label: "Tổng quan",
    icon: "tachometer",
    children: [
      { href: "/admin/", label: "Tổng quan", icon: "tachometer", exact: true },
      { href: "/admin/theme/", label: "Giao diện & Logo", icon: "cog", module: "theme" },
      { href: "/admin/banners/", label: "Banner trang chủ", icon: "picture-o", module: "banners" },
      { href: "/admin/posts/", label: "Góc chia sẻ", icon: "newspaper-o", module: "posts" },
      { href: "/admin/fanpage/", label: "Đăng bài fanpage", icon: "facebook", module: "fanpage" },
    ],
  },
  {
    href: "/admin/products/",
    label: "Kho hàng",
    icon: "cubes",
    children: [
      { href: "/admin/categories/", label: "Danh mục", icon: "align-left", module: "categories" },
      { href: "/admin/products/", label: "Sản phẩm", icon: "list", module: "products" },
      { href: "/admin/products/groups/", label: "Nhóm biến thể", icon: "th-large", module: "products" },
      { href: "/admin/products/sources/", label: "Nguồn nhập", icon: "shopping-bag", module: "products" },
      { href: "/admin/inventory/", label: "Kho hàng", icon: "archive", module: "inventory" },
      { href: "/admin/purchases/", label: "Quản lý mua hàng", icon: "shopping-basket", module: "inventory" },
      { href: "/admin/inventory/warehouses/", label: "Địa chỉ kho", icon: "map-marker", module: "inventory" },
      { href: "/admin/products/pricing/", label: "Công thức giá", icon: "money", module: "products" },
    ],
  },
  { href: "/admin/orders/", label: "Đơn hàng", icon: "shopping-cart", module: "orders" },
  {
    href: "/admin/accounting/",
    label: "Kế toán",
    icon: "money",
    module: "accounting",
    children: [
      { href: "/admin/accounting/", label: "Lãi / lỗ", icon: "money", module: "accounting", exact: true },
      { href: "/admin/accounting/banks/", label: "Tài khoản ngân hàng", icon: "credit-card", module: "accounting" },
      { href: "/admin/accounting/payments/", label: "Thanh toán tự động", icon: "bolt", module: "accounting" },
    ],
  },
  {
    href: "/admin/customers/",
    label: "Sales",
    icon: "tags",
    children: [
      { href: "/admin/customers/", label: "Khách hàng", icon: "users", module: "customers" },
      { href: "/admin/promotions/discounts/", label: "Giảm giá sản phẩm", icon: "tag", module: "promotions" },
      { href: "/admin/promotions/flash-sale/", label: "Flash Sales", icon: "bolt", module: "promotions" },
      { href: "/admin/promotions/vouchers/", label: "Voucher", icon: "gift", module: "promotions" },
      { href: "/admin/promotions/shipping-policy/", label: "Chính sách vận chuyển", icon: "truck", module: "promotions" },
      { href: "/admin/promotions/labels/", label: "Nhãn sản phẩm", icon: "tags", module: "promotions" },
      { href: "/admin/promotions/search/", label: "Gợi ý tìm kiếm", icon: "search", module: "promotions" },
      { href: "/admin/reviews/", label: "Feedback khách hàng", icon: "star", module: "reviews" },
    ],
  },
  {
    href: "/admin/shipping/",
    label: "Vận chuyển",
    icon: "truck",
    module: "shipping",
    children: [
      { href: "/admin/shipping/", label: "Đơn hàng · 4 chặng", icon: "list", module: "shipping" },
      { href: "/admin/shipping/?leg=jp_domestic&sub=to_jp_wh", label: "①a Nội địa Nhật → kho Nhật", icon: "cube", module: "shipping" },
      { href: "/admin/shipping/?leg=jp_domestic&sub=to_carrier", label: "①b Kho Nhật → kho ĐVVC", icon: "cube", module: "shipping" },
      { href: "/admin/shipping/?leg=jp_vn", label: "② Nhật → Việt Nam", icon: "plane", module: "shipping" },
      { href: "/admin/shipping/?leg=vn_transfer", label: "③ Kho ĐVVC → kho shop", icon: "building", module: "shipping" },
      { href: "/admin/shipping/?leg=vn_domestic", label: "④ Nội địa Việt Nam", icon: "truck", module: "shipping" },
      { href: "/admin/shipping/?leg=display", label: "Hiển thị cho khách", icon: "eye", module: "shipping" },
    ],
  },
  { href: "/admin/users/", label: "Người dùng", icon: "user-circle", module: "users" },
];

interface AdminNavProps {
  /** Module keys the signed-in account may use; links for other modules are hidden. */
  permissions: string[];
  userLabel: string;
  role: "owner" | "admin" | "staff";
  /** Brand name from Admin › Giao diện & Logo. */
  shopName?: string;
}

const rowBase = "flex items-center gap-3 rounded-md px-3 py-2 text-[14px] leading-5 no-underline whitespace-nowrap";
const rowIdle = "text-white/80 hover:bg-white/10 hover:text-white";
const rowActive = "bg-lien-blue text-white";

export function AdminNav({ permissions, userLabel, role, shopName = "LienStore" }: AdminNavProps) {
  const pathname = usePathname();
  const search = useSearchParams();
  const allowed = (l: NavLeaf) => !l.module || permissions.includes(l.module);

  // Groups keep only the children the account may open; a group with no visible child disappears.
  const nav = NAV.map((g) => (g.children ? { ...g, children: g.children.filter(allowed) } : g)).filter((g) => (g.children ? g.children.length > 0 : allowed(g)));

  const leafActive = (l: NavLeaf) => {
    const [path, query] = l.href.split("?");
    if (path.startsWith("/admin/shipping")) {
      if (!pathname.startsWith("/admin/shipping")) return false;
      const q = new URLSearchParams(query ?? "");
      if ((search.get("leg") ?? null) !== q.get("leg")) return false;
      // the two ① sheets share a leg; a plain ?leg=jp_domestic lights up ①a
      if (q.get("leg") === "jp_domestic") return (search.get("sub") ?? "to_jp_wh") === q.get("sub");
      return true;
    }
    if (l.exact) return pathname === path || pathname === path.slice(0, -1);
    return pathname.startsWith(path.slice(0, -1));
  };
  const groupActive = (g: NavGroup) => (g.children ? g.children.some(leafActive) : leafActive(g));

  // Children stay hidden until the parent row is clicked; the group holding the current page starts open
  // (until the user toggles it), so a deep link still shows where you are.
  const [open, setOpen] = useState<Record<string, boolean | undefined>>({});
  // Phones: the menu lives in a slide-in drawer; it closes on navigation, Esc or the backdrop.
  const [drawer, setDrawer] = useState(false);
  const route = `${pathname}?${search.toString()}`;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- close the drawer whenever the route changes
    setDrawer(false);
  }, [route]);
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawer(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [drawer]);

  return (
    <aside className="flex w-full flex-col bg-lien-footer text-white max-md:sticky max-md:top-0 max-md:z-40 md:sticky md:top-0 md:h-screen md:w-60 md:shrink-0 md:overflow-y-auto" data-testid="admin-sidebar">
      {/* phone top bar */}
      <div className="flex items-center justify-between gap-3 px-3 py-2.5 md:hidden">
        <Link href="/admin/" className="min-w-0 truncate font-oswald text-[19px] leading-7 text-white no-underline">
          {shopName} <span className="text-white/60">· Quản trị</span>
        </Link>
        <button type="button" onClick={() => setDrawer(true)} aria-label="Mở menu quản trị" aria-expanded={drawer} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-[18px] text-white hover:bg-white/10" data-testid="admin-menu-toggle">
          <Fa name="bars" />
        </button>
      </div>
      {/* desktop brand */}
      <div className="hidden border-b border-white/10 px-5 py-4 md:block">
        <Link href="/admin/" className="block font-oswald text-[22px] leading-7 text-white no-underline">
          {shopName} <span className="text-white/60">· Quản trị</span>
        </Link>
      </div>
      <div className={cn("md:contents", drawer ? "fixed inset-0 z-[90] flex" : "hidden")} data-testid="admin-drawer" data-open={drawer ? "1" : "0"}>
      <nav className={cn("flex h-full w-[290px] max-w-[86vw] flex-col gap-1 overflow-y-auto bg-lien-footer px-2 py-3 shadow-2xl md:h-auto md:w-auto md:max-w-none md:shadow-none md:py-4", drawer && "animate-[slideIn_.2s_ease-out]")} aria-label="Quản trị">
        <div className="mb-1 flex items-center justify-between px-3 md:hidden">
          <span className="text-[12px] font-bold uppercase tracking-wide text-white/60">Menu</span>
          <button type="button" onClick={() => setDrawer(false)} aria-label="Đóng menu" className="flex h-9 w-9 items-center justify-center rounded-md text-[18px] text-white/80 hover:bg-white/10">
            <Fa name="times" />
          </button>
        </div>
        {nav.map((g) => {
          if (!g.children) {
            return (
              <Link key={g.href} href={g.href} className={cn(rowBase, leafActive(g) ? rowActive : rowIdle)}>
                <Fa name={g.icon} className="w-4 text-center text-[14px]" />
                {g.label}
              </Link>
            );
          }
          const active = groupActive(g);
          const isOpen = open[g.label] ?? active;
          return (
            <div key={g.label} className="contents">
              <button
                type="button"
                onClick={() => setOpen((o) => ({ ...o, [g.label]: !isOpen }))}
                aria-expanded={isOpen}
                className={cn(rowBase, "w-full text-left", active && !isOpen ? "bg-white/10 text-white" : rowIdle)}
              >
                <Fa name={g.icon} className="w-4 text-center text-[14px]" />
                <span className="flex-1">{g.label}</span>
                <Fa name={isOpen ? "angle-up" : "angle-down"} className="text-[12px] text-white/60" />
              </button>
              {isOpen
                ? g.children.map((c) => (
                    <Link key={c.href} href={c.href} className={cn(rowBase, "ml-5 py-1.5 text-[13px]", leafActive(c) ? rowActive : rowIdle)}>
                      <Fa name={c.icon} className="w-4 text-center text-[12px]" />
                      {c.label}
                    </Link>
                  ))
                : null}
            </div>
          );
        })}
        <a href="/" target="_blank" rel="noreferrer" className={cn(rowBase, rowIdle)}>
          <Fa name="eye" className="w-4 text-center text-[14px]" />
          Xem cửa hàng
        </a>
        <div className="mt-2 border-t border-white/10 px-3 pt-3 text-[12px] leading-5 text-white/60 md:mt-auto">
          <span className="block truncate text-white/90" title={userLabel}>
            {userLabel}
          </span>
          {role === "owner" ? "Chủ sở hữu · toàn quyền" : role === "admin" ? "Quản trị viên" : "Nhân viên"}
        </div>
        <form action={logout}>
          <button type="submit" className={cn(rowBase, rowIdle, "w-full text-left")}>
            <Fa name="sign-out" className="w-4 text-center text-[14px]" />
            Đăng xuất
          </button>
        </form>
      </nav>
      {/* backdrop (phones only) */}
      <button type="button" aria-label="Đóng menu" onClick={() => setDrawer(false)} className="flex-1 bg-black/50 md:hidden" />
      </div>
    </aside>
  );
}
