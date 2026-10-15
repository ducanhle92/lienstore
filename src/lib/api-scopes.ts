/** Admin API v1 token scopes — pure constants, safe to import from client components. */
export const API_SCOPES = ["products:read", "products:write", "media:write"] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export const API_SCOPE_LABELS: Record<ApiScope, string> = {
  "products:read": "Đọc sản phẩm, danh mục",
  "products:write": "Tạo / sửa sản phẩm (kể cả cập nhật hàng loạt)",
  "media:write": "Upload ảnh sản phẩm",
};

/** Admin module the token's owner must still hold for each scope (checked on every request). */
export const SCOPE_MODULE: Record<ApiScope, string> = {
  "products:read": "products",
  "products:write": "products",
  "media:write": "products",
};

export const isApiScope = (v: unknown): v is ApiScope => typeof v === "string" && (API_SCOPES as readonly string[]).includes(v);

export function sanitizeScopes(values: unknown): ApiScope[] {
  if (!Array.isArray(values)) return [];
  return API_SCOPES.filter((s) => values.includes(s));
}
