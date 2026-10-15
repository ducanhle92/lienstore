# Tiến độ
## Mục tiêu
1. (xong) API quản trị `/api/admin/v1/` + CLI `lienstore` cho agent thao tác sản phẩm/ảnh bằng Bearer token.
2. (đang làm) Quét mã sản phẩm trên điện thoại (web app admin): tra cứu, nhập hàng, kiểm kho, xuất hàng — dùng chung
   nghiệp vụ kho hiện có, qua API v1.

## Đã xong (Việc 1: Admin API v1 + CLI) — nhánh `feat/admin-api-cli`
- [x] B1 migration 73 (api_tokens, api_audit_log, api_idempotency); `withTransaction` lồng bằng SAVEPOINT;
      `saveProduct(Sync)({ expectedVersion })` chống ghi đè (src/lib/product-version.ts).
- [x] B2 token: src/lib/api-token-format.ts, api-scopes.ts, api-tokens.ts (hash sha256, scope, hạn, thu hồi, owner
      re-check mỗi request, audit + redaction, idempotency store).
- [x] B3 nghiệp vụ chung: src/lib/product-rules.ts + product-service.ts; saveProductAction dùng lại.
- [x] B4 src/lib/media-service.ts dùng chung cho /api/admin/upload và /api/admin/v1/media.
- [x] B5 src/lib/api-http.ts (Bearer hoặc session+CSRF, envelope, Idempotency-Key, lỗi) + routes src/app/api/admin/v1/**.
- [x] B6 trang /admin/api-tokens (owner/admin) + `npm run api-token -- create|list|revoke`.
- [x] B7 CLI scripts/lienstore.mjs (`npm run -s lienstore -- …`), .env.example, .gitignore `.env.lienstore*.local`.
- [x] B8 test: `npm run test:admin-api` (29 pass), `npm run test:admin-api:e2e` (15 pass, tự bật next dev :3197 trên DB tạm).
- [x] B9 docs/ADMIN_API.md, AGENTS.md (+ sync-agent-rules), CHANGELOG [Unreleased], ARCHITECTURE.
- [x] typecheck OK, eslint src+scripts 0 lỗi (lỗi lint còn lại nằm ở file untracked data/scripts, tools/), build OK.

## Đang làm
- Việc 2 (quét mã điện thoại). Thiết kế: docs/architecture/mobile-scanning.md.
  - [x] GĐ1: lib/barcodes.ts (chuẩn hoá mã), migration 74 (product_barcodes, scan_docs/lines/ops), lib/barcodes-db.ts
        (resolve, link/unlink, tồn tra cứu), API /codes/resolve, /products/{id}/stock, /products/{id}/barcodes,
        /barcodes/{id}; scope inventory:read|write; màn /admin/scan (CameraView, ScanApp, LinkCodePanel,
        ProductStockCard, scan-client, feedback, detector WASM tự host public/sites/lienstore/scan/); test:scan 14 pass.
  - [ ] GĐ2 nhập hàng: lib/scan-docs.ts (service chung) + routes /stock-receipts/** + DocPanel thật (thay stub).

## Tiếp theo
### Việc 2 (user giao 2026-10-15, làm SAU khi xong API+CLI): quét mã trên điện thoại (web app)
- [ ] Khảo sát mô hình kho thật (units/lots/stocktake/receipts/shipments/orders, mã SKU/JAN) → viết
      `docs/architecture/mobile-scanning.md` (hiện trạng, luồng, data model/migration, API, trạng thái chứng từ,
      đồng thời/retry/mất mạng/quét lặp, kế hoạch + nghiệm thu).
- [ ] GĐ1 mã sản phẩm + resolve API + màn hình quét (camera/nhập tay/BT keyboard) + tra cứu + mã lạ.
- [ ] GĐ2 nhập hàng (phiếu nháp, xác nhận idempotent). GĐ3 kiểm kho (snapshot + đối soát). GĐ4 xuất hàng/đối chiếu đơn.
- [ ] GĐ5 hoàn thiện mobile/PWA, tài liệu + checklist thử trên điện thoại thật.
- Ràng buộc chính: không đổi tồn chỉ vì quét; mọi thay đổi tồn qua nghiệp vụ/chứng từ hiện có; dùng chung service
  cho UI/API/CLI; idempotency bền; version chứng từ; session web có CSRF; không deploy/push main.

## Ghi chú / quyết định
- Hàng loạt API là NGUYÊN TỬ (một mục lỗi → không ghi gì). PATCH merge trên bản đang lưu + kiểm version trong transaction.
- Idempotency: bảng api_idempotency (24 h, theo token; session dùng key `u:<userId>:…`), 5xx nhả key để retry.
- E2E: Next 16 chỉ cho 1 `next dev` mỗi thư mục → tắt dev server trước khi `npm run test:admin-api:e2e`.
- `npm run build` mở data/lienstore.db (có sẵn từ trước) → DB local đã lên schema 73.
- Không deploy/release/push main trong việc này (user yêu cầu rõ).
- Không đụng các file untracked có sẵn (agent-credentials.txt, scratch*, tools/, data/ocr_test…).
