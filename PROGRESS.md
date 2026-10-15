# Tiến độ
## Mục tiêu
1. (xong) API quản trị `/api/admin/v1/` + CLI `lienstore` cho agent thao tác sản phẩm/ảnh bằng Bearer token.
2. (xong, chờ thử trên điện thoại thật) Quét mã trên điện thoại (`/admin/scan/`): tra cứu, nhập hàng, kiểm kho, xuất
   hàng — dùng chung nghiệp vụ kho từng cái (`stock_units`) qua API v1.

Nhánh: `feat/admin-api-cli` (chưa merge, chưa push, chưa deploy — theo yêu cầu).

## Đã xong
### Việc 1 — Admin API v1 + CLI (docs/ADMIN_API.md)
- [x] Migration 73 (api_tokens hash-only, api_audit_log, api_idempotency); `withTransaction` lồng (SAVEPOINT);
      `saveProduct(Sync)({ expectedVersion })` chống ghi đè (lib/product-version.ts).
- [x] Token/scope/hạn/thu hồi/audit/idempotency: lib/api-token-format.ts, api-scopes.ts, api-tokens.ts.
- [x] Nghiệp vụ chung: lib/product-rules.ts, product-service.ts (PATCH merge, bulk NGUYÊN TỬ + dry-run khoá version,
      chống tạo trùng slug/SKU + Idempotency-Key), media-service.ts; Server Action sản phẩm dùng lại.
- [x] lib/api-http.ts (Bearer hoặc session + CSRF `X-Lien-Csrf` + Origin; envelope; idempotency; lỗi) + routes.
- [x] /admin/api-tokens (owner/admin) + `npm run api-token -- create|list|revoke [--write-env file]`.
- [x] CLI scripts/lienstore.mjs (`npm run -s lienstore -- …`), cấu hình `.env.lienstore[.<profile>].local`.
### Việc 2 — Quét mã (docs/architecture/mobile-scanning.md, docs/SCANNING.md)
- [x] GĐ1: lib/barcodes.ts (GTIN/UPC→EAN-13/ITF-14/H/QR `LS1:`), migration 74 (product_barcodes, scan_docs,
      scan_lines, scan_ops; backfill SKU GTIN không trùng), lib/barcodes-db.ts (resolve: link thắng, SKU trùng = xung
      đột; link/unlink; tồn tra cứu), scope inventory:read|write, lib/scan-access.ts (quyền kho).
- [x] GĐ2–4: lib/scan-docs.ts (phiếu nhập direct/shipment, kiểm kê có snapshot + chặn biến động, soạn hàng →
      setOrderLegStatusSync(vn_domestic, sent)); lib/scan-doc-routes.ts + routes /stock-receipts, /stock-counts, /picks.
- [x] UI: src/components/sites/lienstore/admin/scan/* (ScanApp, CameraView, DocPanel, LinkCodePanel, ProductStockCard,
      detector [BarcodeDetector → ZXing WASM tự host public/sites/lienstore/scan/zxing_reader-3.1.3.wasm],
      scan-client, feedback), lib/scan-input.ts (PresenceGate, WedgeBuffer); trang /admin/scan, menu Vận hành.
- [x] GĐ5: nhãn QR mã H `/print/units/?product=<id>`; CLI codes/stock/barcodes/receipts/counts/picks; tài liệu.
### Kiểm chứng (2026-10-15)
- [x] Mọi file scripts/tests/*.test.ts pass (admin-api 29, scan 27, các test cũ không đổi).
- [x] `npm run test:admin-api:e2e` 20 pass (CLI→HTTP→DB tạm; đồng thời cùng opId/Idempotency-Key, CSRF, scope…).
- [x] Giao diện điện thoại kiểm bằng Chromium headless khung iPhone 12 Pro trên bản sao DB (tra cứu, mã lạ → liên kết
      → áp dụng lại, máy quét kiểu bàn phím, nhập → chốt, kiểm kê → chốt, banner mất mạng, camera giả lập + ZXing WASM).
- [x] eslint src+scripts 0 lỗi; typecheck OK; build OK.

## Đang làm
- (không)

## Tiếp theo
- [ ] Người dùng thử trên điện thoại thật theo checklist docs/SCANNING.md §5 (camera iOS/Android, BT scanner, mất mạng).
- [ ] Khi user yêu cầu: merge + deploy theo quy trình CLAUDE.md (migration 73, 74 tự chạy).
- [ ] Gợi ý sau: in nhãn hàng loạt theo phiếu nhập; tạo sản phẩm tối thiểu ngay từ mã lạ (hiện mở form admin tab mới).

## Ghi chú / quyết định
- Hàng loạt API là NGUYÊN TỬ. PATCH merge trên bản đang lưu + kiểm version trong transaction.
- Phiếu quét: nháp không đổi tồn; chốt = 1 transaction (phiếu + kho + kết quả), gọi lại trả kết quả cũ; scan idempotent
  theo `opId` (scan_ops UNIQUE); sửa số tuyệt đối cần `rev` dòng; chốt cần `version` phiếu.
- Kiểm kê: tổng sổ tại kho = mọi cái status tại kho (rảnh + giữ đơn + đóng thùng); áp dụng qua adjustUnitsToTotalSync
  (chỉ đụng cái rảnh); thiếu cả hàng giữ đơn → chặn (COUNT_SHORT_HELD). Mã H quét được ở kho khác sổ → chuyển về kho này.
- Mỗi món quét MỘT lần (mã H hoặc JAN, không cả hai). Xuất một phần không hỗ trợ (hệ thống chưa có giao một phần).
- Idempotency HTTP 24 h trong api_idempotency (session dùng key `u:<userId>:…`).
- E2E: Next 16 chỉ cho 1 `next dev` mỗi thư mục → tắt dev server trước `npm run test:admin-api:e2e`.
- `npm run build`/`dev` mở data/lienstore.db → DB local đã lên schema 74 (chỉ thêm bảng).
- Trình duyệt preview T3 không truy cập được server local trong phiên này → dùng Chromium headless (tools/node_modules/puppeteer).
- Không đụng file untracked có sẵn (agent-credentials.txt, scratch*, tools/, data/ocr_test, data/scripts…).
