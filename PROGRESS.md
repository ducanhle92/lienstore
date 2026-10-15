# Tiến độ
## Deploy bản sửa CSV cần mua — 2026-10-15
- User yêu cầu deploy. Nhánh `fix/purchase-csv-release` tách từ origin/main v2.34.1, chỉ lấy bản sửa CSV (không lấy API/CLI đang làm dở).
- Đã thêm route `/admin/purchases/export/` và kiểm thử hồi quy; không thay đổi dữ liệu kho/đơn.
- Lint đạt (0 lỗi, 25 warning có sẵn), production build đạt, 26/26 kiểm thử purchase-export/inventory/units đạt.
- Tiếp theo: merge main, push, chờ CI xanh, `npm run release -- patch`; theo dõi Release và health production.

## Mã JAN cho sản phẩm prod — 2026-10-16 (nhánh `feat/jan-codes`)
- [x] Đã ghi lên prod qua CLI (`barcodes import`, token "T3 code agent"): **647/819 sản phẩm có JAN** (641/801 đang bán),
      667 liên kết (gồm mã bao bì cũ/mới). Nguồn: mô tả/SKU của shop (311), tra web có kiểm chứng (252 cao, 105 trung bình).
- [x] Công cụ: `scripts/jan/extract-jan.mjs` (trích JAN từ mô tả/SKU), `scripts/jan/build-import.mjs` (gộp + chính sách),
      lệnh CLI `barcodes import --file … [--dry-run]`; prompt tra web `data/jan/PROMPT.md`, kết quả `data/jan/lookup/*.json`.
- Còn lại: `data/jan/chua-co-jan.csv` (172 SP: 122 không có JAN thật/không tìm thấy, 21 độ tin thấp, 23 trùng sản phẩm
  trong catalogue, 3 mô tả ghi 2 mã — Pigeon), `data/jan/link-amazon-sai.csv` (51 link Amazon trỏ sai sản phẩm).
- Xung đột: #2348 (Curel UV Essence) và #2656 (Curel Tone Up Base) cùng ghi JAN 4901301413505 trong mô tả — mã đang
  gắn #2656; cần sửa mô tả sản phẩm sai.
- [x] Trang sản phẩm: ô "Mã SKU & trạng thái" hiện/thêm/gỡ JAN (app/admin/products/barcode-actions.ts, ProductForm);
      quyết định GIỮ SKU làm mã nội bộ (485/819 SKU theo quy ước, dùng khắp CSV/đợt mua/từng cái), JAN là mã bao bì
      (172 SP không có, nhiều SP có 2) → không thay SKU bằng JAN.
- Đã merge feat/jan-codes vào main, release v2.34.6 (2026-10-16); đang chờ TrueNAS kéo bản mới.
- Token prod đã được dán vào chat → nên thu hồi và cấp lại sau khi xong việc này.

## Mục tiêu
1. (xong) API quản trị `/api/admin/v1/` + CLI `lienstore` cho agent thao tác sản phẩm/ảnh bằng Bearer token.
2. (xong, chờ thử trên điện thoại thật) Quét mã trên điện thoại (`/admin/scan/`): tra cứu, nhập hàng, kiểm kho, xuất
   hàng — dùng chung nghiệp vụ kho từng cái (`stock_units`) qua API v1.

Nhánh: `feat/admin-api-cli` — đã merge vào main và phát hành v2.34.4.

## Đã xong
### Việc 1 — Admin API v1 + CLI (docs/ADMIN_API.md)
- [x] Migration 75 (trước là 73, đổi số khi gộp main) (api_tokens hash-only, api_audit_log, api_idempotency); `withTransaction` lồng (SAVEPOINT);
      `saveProduct(Sync)({ expectedVersion })` chống ghi đè (lib/product-version.ts).
- [x] Token/scope/hạn/thu hồi/audit/idempotency: lib/api-token-format.ts, api-scopes.ts, api-tokens.ts.
- [x] Nghiệp vụ chung: lib/product-rules.ts, product-service.ts (PATCH merge, bulk NGUYÊN TỬ + dry-run khoá version,
      chống tạo trùng slug/SKU + Idempotency-Key), media-service.ts; Server Action sản phẩm dùng lại.
- [x] lib/api-http.ts (Bearer hoặc session + CSRF `X-Lien-Csrf` + Origin; envelope; idempotency; lỗi) + routes.
- [x] /admin/api-tokens (owner/admin) + `npm run api-token -- create|list|revoke [--write-env file]`.
- [x] CLI scripts/lienstore.mjs (`npm run -s lienstore -- …`), cấu hình `.env.lienstore[.<profile>].local`.
### Việc 2 — Quét mã (docs/architecture/mobile-scanning.md, docs/SCANNING.md)
- [x] GĐ1: lib/barcodes.ts (GTIN/UPC→EAN-13/ITF-14/H/QR `LS1:`), migration 76 (trước là 74) (product_barcodes, scan_docs,
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
- R1–R10 xong (2026-10-15): test unit tất cả pass (scan 31), e2e 20/20, lint 0 lỗi, typecheck, build OK; UI kiểm headless
  (BT 90 ms/phím, quét khi ô số focus, pick + ĐVVC + mã vận đơn quét, manifest riêng).
- Gộp main (v2.34.3, 20 commit) vào nhánh: main đã dùng migration 73 (bidv) & 74 (shipment-shop-fee) → migration
  của nhánh đổi thành 75 (admin-api-tokens) & 76 (scan-codes-and-documents); `migrate()` khớp cả tên để DB dev đã chạy
  số cũ vẫn nhận 73/74 của main (đã thử 2 kịch bản). Giữ quy tắc "không xoá ảnh đơn hàng còn dùng" của main trong
  product-service.cleanupRemovedUploads; trang nhãn dùng PrintOnLoad (AutoPrint của main giờ là thanh in hoá đơn).
- ĐÃ LÊN PROD v2.34.4 (2026-10-15): CI xanh, Release xanh, health = 2.34.4, schemaVersion 76 (migration 75, 76 đã chạy).
  Smoke không cần token: /api/admin/v1/ 200, API không token → 401, /admin/scan → login, /api/scan-manifest 200,
  WASM 200 application/wasm. Smoke CÓ token (whoami, codes resolve, stock, receipts shipments, picks orders) CHƯA chạy:
  máy này chưa có token prod — user cấp ở /admin/api-tokens rồi lưu .env.lienstore.prod.local.

## Đề xuất sau rà soát (Fable 5.1, 2026-10-15) — USER ĐÃ DUYỆT "làm đủ R1–R10 rồi mới deploy" → Opus làm tiếp từ R1
Kiến trúc lõi ổn (dùng lại stock_units, idempotency theo opId, version/rev, chốt 1 transaction; test 76 pass).
Lưu ý quan trọng: DB local là seed catalogue (0 đơn, 0 cái, 0 chuyến) → mọi test dùng dữ liệu tự tạo; chưa đối
chiếu với dữ liệu vận hành thật của prod. Các việc cần làm TRƯỚC khi merge/deploy (thứ tự ưu tiên):
- [x] R1 Camera kẹt khi id camera lưu trong localStorage không còn đúng (đổi máy/trình duyệt): `getUserMedia({deviceId:{exact}})`
      ném OverconstrainedError/NotFound → chỉ báo "không tìm thấy camera". Sửa: thất bại với exact id → xoá
      `lienstore:scan:camera`, thử lại `facingMode: environment` (CameraView.tsx `start`). Test tay.
- [x] R2 Máy quét Bluetooth kiểu bàn phím: ngưỡng 60 ms/ký tự (scan-input.ts WedgeBuffer) quá chặt với HID qua
      Bluetooth (iOS thường 30–100 ms) → nới ~150 ms; và khi một ô số lượng đang focus thì mã bị gõ vào ô đó
      (ScanApp.tsx listener bỏ qua khi isTypingTarget). Sửa: lắng nghe ở capture phase mọi keydown; burst nhanh +
      Enter → coi là quét, chặn ký tự vào ô không phải ô mã (hoặc khôi phục giá trị ô). Thêm test cho WedgeBuffer.
- [x] R3 Xuất hàng thiếu ĐVVC + mã vận đơn: `confirmDoc(pick)` gọi setOrderLegStatusSync(vn_domestic, sent) nhưng không
      ghi method/tracking như ⑦ (`applyMethodChoice` trong app/admin/shipping/order-actions.ts) → đơn "Đang giao" với
      ĐVVC "—". Sửa: `picks/{id}/complete` nhận `{ version, methodId?|"pickup", tracking? }`; UI pick: chọn ĐVVC (danh
      sách `getShippingMethods` leg vn_domestic) và quét/nhập mã vận đơn (mã quét không phải sản phẩm/cái trong chế độ
      pick → gợi ý "Dùng làm mã vận đơn"). CLI `picks confirm --method <id> --tracking <mã>`. Test.
- [x] R4 Mã JAN nằm trong SKU có tiền tố (3/9 SKU thật dạng `AHA-4515061013884`) → quét JAN ra "chưa liên kết".
      Sửa: resolver thêm bước khớp `sku` kết thúc bằng `-<gtin>` (COLLATE NOCASE), vẫn báo xung đột nếu >1; backfill
      migration (hoặc job một lần) liên kết GTIN nhúng khi duy nhất. Test.
- [x] R5 Lộ giá vốn ¥ trên phiếu nhập cho tài khoản không có `see_cost`: `viewOf` trả `unitCostJpy` cho mọi người.
      Sửa: truyền permissions vào view, null hoá unitCostJpy (và không cho sửa) khi thiếu see_cost; CLI/DocPanel ẩn.
- [x] R6 Kiểm kê: dòng chỉ ghi "sổ N"; N gồm cả cái giữ cho đơn và đã đóng thùng → người đếm dễ bỏ sót → COUNT_SHORT_HELD.
      Sửa: LineView.count thêm breakdown `{ free, held, boxed }` và thông điệp "sổ 12 = 8 rảnh + 3 giữ đơn + 1 đóng
      thùng (đếm cả)"; DocPanel hiển thị.
- [x] R7 Nhập hàng mới có nhiều dòng cùng sản phẩm (HSD khác): lần quét cộng vào dòng "sửa gần nhất" → mơ hồ.
      Sửa: cộng vào dòng mới nhất (id lớn nhất) và UI đánh dấu "đang nhận quét" trên dòng đó; hoặc nút "Quét vào dòng này".
- [x] R8 PWA: manifest start_url "/" → "Thêm vào màn hình chính" từ /admin/scan mở storefront. Sửa: route
      `/admin/scan/manifest.webmanifest` riêng (start_url /admin/scan/, display standalone) + `<link rel=manifest>` trong
      page scan; ghi docs/SCANNING.md.
- [x] R9 Giảm 2 vòng mạng mỗi lần quét trong chế độ phiếu (resolve rồi scans): khi đang mở phiếu, gửi thẳng /scans
      (server tự resolve) và chỉ gọi resolve khi lỗi UNKNOWN_CODE/CODE_CONFLICT để mở panel liên kết.
- [x] R10 Sau khi sửa: chạy lại test:scan, test:admin-api, test:admin-api:e2e, lint/typecheck/build; cập nhật
      docs/SCANNING.md + ADMIN_API.md §9; rồi mới merge + deploy; sau deploy chạy smoke chỉ-đọc trên prod bằng CLI
      (`whoami`, `codes resolve` một JAN thật, `stock <id>`, `receipts shipments`, `picks orders`) để đối chiếu dữ liệu thật.
Không chặn (để sau): tạo sản phẩm tối thiểu ngay từ mã lạ; xuất một phần; rate limit API (Cloudflare).

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
