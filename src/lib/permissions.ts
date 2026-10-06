/**
 * Admin roles and module permissions (shared by server auth and client nav).
 *
 * - `owner`   : the shop owner — full access, the only role that may create / edit / delete admins.
 * - `admin`   : full access to the shop; manages staff and customer accounts but not other admins.
 * - `staff`   : access only to the modules listed in `permissions`.
 * - `customer`: storefront account, no admin access.
 * The bootstrap account from ADMIN_USER / ADMIN_PASSWORD is always a full admin.
 */
export type UserRole = "owner" | "admin" | "staff" | "customer";

export interface AdminModule {
  key: string;
  label: string;
  href: string;
  description: string;
}

export const ADMIN_MODULES: AdminModule[] = [
  { key: "products", label: "Sản phẩm", href: "/admin/products/", description: "Thêm, sửa, xoá sản phẩm; upload ảnh" },
  { key: "categories", label: "Danh mục", href: "/admin/categories/", description: "Danh mục và ảnh danh mục" },
  { key: "orders", label: "Đơn hàng", href: "/admin/orders/", description: "Xem đơn, đổi trạng thái, đính kèm bill" },
  { key: "customers", label: "Khách hàng", href: "/admin/customers/", description: "Lịch sử mua của từng khách" },
  { key: "promotions", label: "Khuyến mãi", href: "/admin/promotions/discounts/", description: "Giảm giá sản phẩm, voucher" },
  { key: "reviews", label: "Feedback khách hàng", href: "/admin/reviews/", description: "Duyệt feedback / đánh giá của khách trước khi hiển thị" },
  { key: "banners", label: "Banner trang chủ", href: "/admin/banners/", description: "Ảnh và link của dải banner đầu trang chủ" },
  { key: "theme", label: "Giao diện & Logo", href: "/admin/theme/", description: "Logo, slogan, bảng màu của web và web app" },
  { key: "posts", label: "Góc chia sẻ", href: "/admin/posts/", description: "Bài viết blog: viết, sửa, đăng / ẩn" },
  { key: "fanpage", label: "Đăng bài fanpage", href: "/admin/fanpage/", description: "Soạn và đăng bài sản phẩm lên Facebook Page, lên lịch / tự động" },
  { key: "inventory", label: "Kho hàng (chung)", href: "/admin/inventory/", description: "Tự có khi được một màn kho bất kỳ: tồn kho theo sản phẩm, địa chỉ kho, nhập / chuyển kho" },
  { key: "purchases", label: "② Quản lý mua hàng", href: "/admin/purchases/", description: "Đợt mua, bill, hoá đơn đồ tiêu hao" },
  { key: "kho_jp", label: "③ Kho Nhật", href: "/admin/inventory/?side=jp", description: "Tồn kho tại kho Nhật (shop)" },
  { key: "packing", label: "④ Đóng hàng JP", href: "/admin/inventory/shipments/", description: "Đóng chuyến, khoá, giao ĐVVC" },
  { key: "transit", label: "⑤ Vận chuyển JP-VN", href: "/admin/inventory/shipments/?stage=transit", description: "Chuyến đã giao ĐVVC, mã PU / KEA, đồng bộ Kiến" },
  { key: "kho_vn", label: "⑥ Kho VN", href: "/admin/inventory/?side=vn", description: "Nhận hàng vào kho VN, kiểm kho, đơn chờ giao" },
  { key: "delivery", label: "⑦ Giao hàng VN", href: "/admin/inventory/delivery/", description: "Chọn ĐVVC, mã vận đơn, bắt đầu giao / đã giao, đã thu tiền" },
  { key: "see_prices", label: "Xem giá bán & doanh thu", href: "/admin/orders/", description: "Đơn giá, tạm tính, tổng tiền, doanh thu. Không tick: đơn hàng chỉ hiện số tiền cần thu" },
  { key: "see_cost", label: "Xem giá vốn & lãi / lỗ", href: "/admin/orders/", description: "Giá vốn ¥ / VNĐ, vốn tồn kho, lãi / lỗ từng đơn" },
  { key: "accounting", label: "Kế toán", href: "/admin/accounting/", description: "Doanh thu, giá vốn, phí vận chuyển, lãi/lỗ theo đơn và theo tháng; vốn tồn kho" },
  { key: "shipping", label: "Vận chuyển", href: "/admin/shipping/", description: "Bảng phí vận chuyển" },
  { key: "users", label: "Người dùng", href: "/admin/users/", description: "Tài khoản, vai trò, quyền (chỉ admin)" },
];

export const ALL_PERMISSIONS: string[] = ADMIN_MODULES.map((m) => m.key);

/** Screens of the Vận hành flow that live under the old "inventory" module (any of them also grants "inventory"). */
export const INVENTORY_SCREENS = ["purchases", "kho_jp", "packing", "transit", "kho_vn"];
/** Keys added in 2.25 — a stored list with none of them is a pre-2.25 staff account (expanded so nothing is lost). */
const FINE_KEYS = [...INVENTORY_SCREENS, "delivery", "see_prices", "see_cost"];

/**
 * How the permission picker is laid out: one box per admin tab, a tick per screen (same order as the side menu), and
 * the money-visibility switches apart. `inventory` is not offered — it follows from the screens.
 */
export const PERMISSION_TABS: Array<{ label: string; keys: string[] }> = [
  { label: "Vận hành", keys: ["products", "orders", "purchases", "kho_jp", "packing", "transit", "kho_vn", "delivery", "categories"] },
  { label: "Cài đặt web", keys: ["theme", "banners", "posts", "fanpage"] },
  { label: "Sales", keys: ["customers", "promotions", "reviews"] },
  { label: "Kế toán", keys: ["accounting"] },
  { label: "Vận chuyển", keys: ["shipping"] },
  { label: "Xem tiền", keys: ["see_prices", "see_cost"] },
];

/** Quick presets for the staff form (a starting point; boxes stay editable). */
export const PERMISSION_PRESETS: Array<{ key: string; label: string; hint: string; keys: string[] }> = [
  { key: "kho_vn", label: "Admin kho VN", hint: "Đơn hàng (chỉ thấy tiền cần thu), lên đơn, nhận hàng vào kho, kiểm kho, giao hàng", keys: ["orders", "kho_vn", "delivery"] },
  { key: "kho_jp", label: "Admin kho Nhật", hint: "Mua hàng, kho Nhật, đóng hàng, vận chuyển JP-VN — thấy giá vốn ¥", keys: ["purchases", "kho_jp", "packing", "transit", "see_cost"] },
  { key: "sales", label: "Bán hàng", hint: "Sản phẩm, đơn hàng, khách hàng, khuyến mãi — thấy giá bán", keys: ["products", "orders", "customers", "promotions", "reviews", "see_prices"] },
];

export const ROLE_LABELS: Record<UserRole, string> = { owner: "Chủ sở hữu", admin: "Quản trị viên", staff: "Nhân viên", customer: "Khách hàng" };

/** Roles with access to /admin. */
export type AdminRole = Exclude<UserRole, "customer">;
export const isAdminRole = (r: UserRole): r is AdminRole => r === "owner" || r === "admin" || r === "staff";

/** Roles an actor may assign when creating / editing accounts (the owner role is never assigned through the UI). */
export function assignableRoles(actor: UserRole): UserRole[] {
  // customer accounts are managed in Sales › Khách hàng — the users screen only creates staff / admins
  if (actor === "owner") return ["staff", "admin"];
  if (actor === "admin") return ["staff"];
  return [];
}

/** May `actor` edit / delete an account that currently has `target` role? */
export function canManageRole(actor: UserRole, target: UserRole): boolean {
  if (actor === "owner") return target !== "owner";
  if (actor === "admin") return target === "staff" || target === "customer";
  return false;
}

export function isUserRole(v: unknown): v is UserRole {
  return v === "owner" || v === "admin" || v === "staff" || v === "customer";
}

/** Effective module permissions for a role + stored permission list. */
export function effectivePermissions(role: UserRole, permissions: string[]): string[] {
  if (role === "owner" || role === "admin") return ALL_PERMISSIONS;
  if (role !== "staff") return [];
  const out = new Set(permissions.filter((p) => ALL_PERMISSIONS.includes(p) && p !== "users"));
  // pre-2.25 account: "inventory" meant every warehouse screen, orders / shipping opened ⑦, and money was always shown
  if (!permissions.some((p) => FINE_KEYS.includes(p))) {
    if (out.has("inventory")) for (const k of INVENTORY_SCREENS) out.add(k);
    if (out.has("orders") || out.has("shipping")) out.add("delivery");
    out.add("see_prices");
    out.add("see_cost");
  }
  // any warehouse screen brings the shared warehouse module (its actions, Tồn kho theo sản phẩm, địa chỉ kho)
  if (INVENTORY_SCREENS.some((k) => out.has(k))) out.add("inventory");
  return [...out];
}

export function sanitizePermissions(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values.filter((v): v is string => typeof v === "string" && ALL_PERMISSIONS.includes(v))));
}
