/**
 * Admin roles and module permissions (shared by server auth and client nav).
 *
 * - `admin`   : full access, including user management.
 * - `staff`   : access only to the modules listed in `permissions`.
 * - `customer`: storefront account, no admin access.
 * The bootstrap account from ADMIN_USER / ADMIN_PASSWORD is always a full admin.
 */
export type UserRole = "admin" | "staff" | "customer";

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
  { key: "inventory", label: "Kho hàng", href: "/admin/inventory/", description: "Tồn kho, danh sách cần đặt" },
  { key: "shipping", label: "Vận chuyển", href: "/admin/shipping/", description: "Bảng phí vận chuyển" },
  { key: "users", label: "Người dùng", href: "/admin/users/", description: "Tài khoản, vai trò, quyền (chỉ admin)" },
];

export const ALL_PERMISSIONS: string[] = ADMIN_MODULES.map((m) => m.key);

export const ROLE_LABELS: Record<UserRole, string> = { admin: "Quản trị viên", staff: "Nhân viên", customer: "Khách hàng" };

export function isUserRole(v: unknown): v is UserRole {
  return v === "admin" || v === "staff" || v === "customer";
}

/** Effective module permissions for a role + stored permission list. */
export function effectivePermissions(role: UserRole, permissions: string[]): string[] {
  if (role === "admin") return ALL_PERMISSIONS;
  if (role === "staff") return permissions.filter((p) => ALL_PERMISSIONS.includes(p) && p !== "users");
  return [];
}

export function sanitizePermissions(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values.filter((v): v is string => typeof v === "string" && ALL_PERMISSIONS.includes(v))));
}
