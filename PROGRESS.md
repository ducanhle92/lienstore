# Tiến độ
## Mục tiêu
API quản trị có version (`/api/admin/v1/`) + CLI `lienstore` để agent trong T3 Code thao tác sản phẩm/ảnh bằng
Bearer token riêng (không mở web preview), dùng chung nghiệp vụ với Server Actions của admin.

## Đã xong
- [x] Khảo sát: `saveProduct` ghi cả dòng (PATCH phải merge trên bản hiện tại), `withTransaction` chưa lồng được,
      upload ảnh do trình duyệt resize (API cần resize bằng sharp), SKU không unique, slug unique.

## Đang làm
- Nhánh `feat/admin-api-cli`.

## Tiếp theo
- [ ] B1. Hạ tầng DB: migration 73 (api_tokens, api_audit_log, api_idempotency), withTransaction lồng (SAVEPOINT),
      `productVersion` + `expectedVersion` trong `saveProduct` (chống ghi đè).
- [ ] B2. Token: `src/lib/api-tokens.ts` (sinh/hash/verify/thu hồi/hết hạn, scope products:read|products:write|media:write).
- [ ] B3. Nghiệp vụ dùng chung `src/lib/product-service.ts` (validate giá/slug/danh mục/ảnh, create/update/bulk, dọn ảnh,
      revalidate) — Server Action gọi lại các helper này.
- [ ] B4. Media service dùng chung cho `/api/admin/upload` và API v1 (resize + thumb bằng sharp).
- [ ] B5. Route handlers `/api/admin/v1/*` (envelope JSON, lỗi rõ ràng, idempotency, audit).
- [ ] B6. Cấp/thu hồi token: trang `/admin/api-tokens` (owner/admin) + script `npm run api-token`.
- [ ] B7. CLI `scripts/lienstore.mjs` (+ `npm run -s lienstore --`), `.env.example`.
- [ ] B8. Test (tsx, DB tạm) + e2e CLI → dev server với DB tạm.
- [ ] B9. Tài liệu `docs/ADMIN_API.md`, AGENTS.md (+ sync), PROGRESS cuối.

## Ghi chú / quyết định
- Không deploy/release/push main trong việc này (user yêu cầu rõ).
- Không đụng các file untracked có sẵn (agent-credentials.txt, scratch*, tools/, data/ocr_test…).
