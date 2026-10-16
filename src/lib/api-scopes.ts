/** Admin API v1 token scopes — pure constants, safe to import from client components. */
export const API_SCOPES = ["products:read", "products:write", "media:write", "inventory:read", "inventory:write"] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export const API_SCOPE_LABELS: Record<ApiScope, string> = {
  "products:read": "Đọc sản phẩm, danh mục",
  "products:write": "Tạo / sửa sản phẩm (kể cả cập nhật hàng loạt), liên kết mã vạch",
  "media:write": "Upload ảnh sản phẩm",
  "inventory:read": "Tra mã, xem tồn kho và phiếu quét",
  "inventory:write": "Phiếu nhập hàng, kiểm kho, soạn/xuất hàng (theo quyền kho của tài khoản)",
};

/**
 * Admin modules that make a scope usable — the account behind a token (or the signed-in admin) needs ANY of them.
 * Finer checks (which warehouse, delivery) happen in the services.
 */
export const SCOPE_MODULE: Record<ApiScope, string[]> = {
  "products:read": ["products"],
  "products:write": ["products"],
  "media:write": ["products"],
  "inventory:read": ["inventory", "products", "orders", "delivery", "kho_jp", "kho_vn", "packing"],
  "inventory:write": ["inventory", "kho_jp", "kho_vn", "delivery", "packing"],
};

export function scopeAllowed(scope: ApiScope, permissions: string[]): boolean {
  return SCOPE_MODULE[scope].some((m) => permissions.includes(m));
}

export const isApiScope = (v: unknown): v is ApiScope => typeof v === "string" && (API_SCOPES as readonly string[]).includes(v);

export function sanitizeScopes(values: unknown): ApiScope[] {
  if (!Array.isArray(values)) return [];
  return API_SCOPES.filter((s) => values.includes(s));
}
