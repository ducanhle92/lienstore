"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { logout } from "@/app/admin/actions";
import { Fa, type FaName } from "@/components/sites/lienstore/shared/icons";
import { cn } from "@/lib/utils";

const LINKS: { href: string; label: string; icon: FaName; exact?: boolean; module?: string; child?: boolean }[] = [
  { href: "/admin/", label: "Tổng quan", icon: "tachometer", exact: true },
  { href: "/admin/products/", label: "Sản phẩm", icon: "list", module: "products" },
  { href: "/admin/categories/", label: "Danh mục", icon: "align-left", module: "categories" },
  { href: "/admin/orders/", label: "Đơn hàng", icon: "shopping-cart", module: "orders" },
  { href: "/admin/customers/", label: "Khách hàng", icon: "users", module: "customers" },
  { href: "/admin/inventory/", label: "Kho hàng", icon: "cubes", module: "inventory" },
  { href: "/admin/shipping/", label: "Vận chuyển", icon: "truck", module: "shipping" },
  { href: "/admin/shipping/?leg=jp_domestic", label: "Nội địa Nhật", icon: "cube", module: "shipping", child: true },
  { href: "/admin/shipping/?leg=jp_vn", label: "Nhật → Việt Nam", icon: "plane", module: "shipping", child: true },
  { href: "/admin/shipping/?leg=vn_domestic", label: "Nội địa Việt Nam", icon: "truck", module: "shipping", child: true },
  { href: "/admin/shipping/?leg=display", label: "Hiển thị cho khách", icon: "eye", module: "shipping", child: true },
  { href: "/admin/users/", label: "Người dùng", icon: "user-circle", module: "users" },
];

interface AdminNavProps {
  /** Module keys the signed-in account may use; links for other modules are hidden. */
  permissions: string[];
  userLabel: string;
  role: "admin" | "staff";
}

export function AdminNav({ permissions, userLabel, role }: AdminNavProps) {
  const pathname = usePathname();
  const search = useSearchParams();
  const links = LINKS.filter((l) => !l.module || permissions.includes(l.module));
  const isActiveLink = (l: (typeof LINKS)[number]) => {
    if (l.child) {
      const leg = l.href.split("leg=")[1];
      return pathname.startsWith("/admin/shipping") && search.get("leg") === leg;
    }
    if (l.href === "/admin/shipping/") return pathname.startsWith("/admin/shipping") && !search.get("leg");
    return isActive(l.href, l.exact);
  };
  const isActive = (href: string, exact?: boolean) => (exact ? pathname === href || pathname === href.slice(0, -1) : pathname.startsWith(href.slice(0, -1)));

  return (
    <aside className="flex w-full flex-col bg-lien-footer text-white md:min-h-screen md:w-60">
      <div className="border-b border-white/10 px-5 py-4">
        <Link href="/admin/" className="block font-oswald text-[22px] leading-7 text-white no-underline">
          LienStore <span className="text-white/60">· Quản trị</span>
        </Link>
      </div>
      <nav className="flex flex-row gap-1 overflow-x-auto px-2 py-2 md:flex-col md:py-4" aria-label="Quản trị">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-[14px] leading-5 no-underline whitespace-nowrap",
              l.child && "ml-5 py-1.5 text-[13px]",
              isActiveLink(l) ? "bg-lien-blue text-white" : "text-white/80 hover:bg-white/10 hover:text-white",
            )}
          >
            <Fa name={l.icon} className={cn("w-4 text-center", l.child ? "text-[12px]" : "text-[14px]")} />
            {l.label}
          </Link>
        ))}
        <a
          href="/"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 rounded-md px-3 py-2 text-[14px] leading-5 text-white/80 no-underline whitespace-nowrap hover:bg-white/10 hover:text-white"
        >
          <Fa name="eye" className="w-4 text-center text-[14px]" />
          Xem cửa hàng
        </a>
        <div className="mt-2 border-t border-white/10 px-3 pt-3 text-[12px] leading-5 text-white/60 md:mt-auto">
          <span className="block truncate text-white/90" title={userLabel}>
            {userLabel}
          </span>
          {userLabel.includes("(chủ cửa hàng)") ? "Toàn quyền" : role === "admin" ? "Quản trị viên" : "Nhân viên"}
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-[14px] leading-5 text-white/80 whitespace-nowrap hover:bg-white/10 hover:text-white"
          >
            <Fa name="sign-out" className="w-4 text-center text-[14px]" />
            Đăng xuất
          </button>
        </form>
      </nav>
    </aside>
  );
}
