# Quét mã trên điện thoại (web app admin) — thiết kế

Trạng thái: GĐ1–GĐ5 theo PROGRESS.md. Tài liệu này chỉ dùng tên bảng/route/hàm có thật trong repo (hoặc được thêm
trong việc này, ghi rõ "mới").

## 1. Hiện trạng và phần tái sử dụng

**Kho đã quản lý theo TỪNG CÁI** (`stock_units`, `src/lib/units-db.ts`, `src/lib/units.ts`) — đây là sổ kho duy nhất;
quét mã KHÔNG tạo sổ thứ hai.

| Khái niệm | Thực tế trong repo | Dùng lại thế nào |
| --- | --- | --- |
| Đơn vị hàng | `stock_units`: mã `H` + 6 số + số kiểm Damm (`unitCode`, `parseUnitCode`), `status` = chặng (`not_bought … bought(Kho Nhật) … at_shop(Kho VN) … shipped_to_customer, delivered`), `removed` (thất lạc/hỏng/loại), `expiry`, `unit_cost_*`, `receipt_id` (bill), `batch_id`, `shipment_id` (chuyến đóng hàng), `order_item_id` (đang giữ cho dòng đơn), `committed_at` (đã trừ thật) | Mã H quét được trực tiếp (Code 128 / QR). Mọi thay đổi qua `createUnitsSync`, `moveUnitsSync`, `removeUnitsSync`, `adjustUnitsToTotalSync`, rồi `touchSync` |
| Lịch sử tồn | `stock_unit_events` (created/moved/held/released/removed…, actor, note) | Mọi thao tác chốt từ màn quét ghi actor = người dùng/token |
| Tồn hiển thị | `products.stock` = cái rảnh trong tay; `products.stock_vn` = rảnh tại Kho VN (`syncProductStockSync`) | Chỉ đọc; không bao giờ ghi trực tiếp |
| Kho | 4 nơi cố định (`src/lib/warehouses.ts`): `jp` Kho Nhật (shop), `jp_carrier`, `carrier`, `vn` Kho VN (shop) — suy từ `status` | Màn quét chỉ ghi ở 2 kho của shop: `jp` (status `bought`), `vn` (`at_shop`) |
| Lô / hạn dùng | Không có bảng lô riêng: "dòng bill" = nhóm cái cùng bill/giá/hạn (`billLineKey`, `lots-db.groupUnits`) | Tra cứu hiển thị theo nhóm này; nhập hàng ghi `expiry` cho từng cái |
| Quy cách đóng gói | Chưa có (mỗi cái = 1 món) | **Mới**: `product_barcodes.pack_qty` (hộp/thùng = n cái) |
| Mã sản phẩm | `products.sku` (chuỗi tự do: nhiều JAN 13 số, mã nội bộ `BRAND-CAT-YYMM-NNNN` từ `lib/sku.ts`, "N/A"…) — không unique, không có bảng mã vạch | **Mới**: `product_barcodes`; `sku` vẫn được tra (khớp chính xác) nhưng trùng → báo xung đột |
| Nhập hàng | (a) "Nhập hàng trực tiếp" `addUnitsAction` → `createUnitsSync` (origin manual/return); (b) chuyến về kho: `setShipmentStatus(done)` / "Chuyển" `moveUnitsAction` → `moveUnitsSync(at_shop)`; (c) bill/đợt mua (desktop) | Phiếu nhập điện thoại gọi đúng (a) và (b) |
| Kiểm kho | CSV kiểm kê → `setProductStockInWarehouse` → `adjustUnitsToTotalSync` (thừa → cái mới trên bill `KK-yymmdd`; thiếu → cái rảnh gần hết hạn nhất bị ghi "thất lạc") | Phiên kiểm kê điện thoại chốt bằng chính hàm này |
| Xuất hàng | ⑦ Giao hàng VN: đơn sẵn sàng (`listOrdersReadyToShip`: đã thanh toán/COD, mọi cái ở Kho VN) → `setOrderLegStatus(vn_domestic, "sent")` ⇒ các cái → `shipped_to_customer`, đơn → "delivering", `commitOrderSync` (trừ thật) | Phiếu soạn hàng chỉ đối chiếu; hoàn tất gọi đúng bước này (một lần) |
| Quyền | `kho_jp`, `kho_vn`, `delivery`, `inventory`, `products` (`lib/permissions.ts`) | Ghi ở Kho Nhật cần `kho_jp`, Kho VN `kho_vn`, xuất `delivery`, liên kết mã `products` |
| API / xác thực / audit / idempotency | `/api/admin/v1` (`lib/api-http.ts`): Bearer token hoặc session + CSRF (`X-Lien-Csrf` + Origin), `api_audit_log`, `api_idempotency` | Dùng nguyên; thêm scope `inventory:read`, `inventory:write` |

## 2. Luồng người dùng

Điểm vào: menu **Vận hành › Quét mã** → `/admin/scan/` (mới). Màn đầu: chọn chế độ **Tra cứu / Nhập hàng / Kiểm kho /
Xuất hàng**, kho (tự chọn khi tài khoản chỉ có một kho), danh sách phiếu nháp để tiếp tục.

Màn quét (mọi chế độ): khung camera phía trên (bật bằng nút, camera sau, chọn camera, đèn nếu có), kết quả gần nhất +
danh sách dòng phía dưới; ô nhập tay (máy quét Bluetooth gõ + Enter cũng vào ô này hoặc bộ nghe phím toàn cục khi
không có ô nào đang focus); nút lớn một tay. Trạng thái tách bạch: **Đã đọc mã → Đã nhận diện → Đã lưu nháp (server
xác nhận) → Đã chốt**. Mất mạng: banner đỏ, khoá nút ghi.

- **Tra cứu**: quét → ảnh, tên, SKU, mã vừa quét, quy cách; giá (nếu có quyền `see_prices`); tồn: trong tay / rảnh /
  giữ cho đơn / theo kho / đang về, nhóm theo hạn dùng; với mã H: cái đó đang ở đâu, giữ cho đơn nào. Không ghi gì.
- **Nhập hàng** (phiếu nhập):
  - *Hàng mới* (`mode=direct`): quét JAN → dòng sản phẩm (+ số lượng theo quy cách), nhập hạn dùng / giá ¥ / bill
    nếu có → **Xác nhận nhập** = `createUnitsSync` (status theo kho) trong một transaction.
  - *Nhận chuyến* (`mode=shipment`): chọn chuyến `CH-…` đã giao ĐVVC → danh sách cái dự kiến; quét mã H (đúng cái)
    hoặc JAN (sản phẩm, không vượt số dự kiến) → **Xác nhận nhận** = `moveUnitsSync(at_shop)` cho đúng các cái;
    nhận một phần được; nhận đủ → chuyến sang "Đã về kho shop VN".
- **Kiểm kho** (phiên kiểm kê): chọn kho (+ ghi chú phạm vi); quét từng món hoặc nhập tổng; dòng chưa đếm ≠ đã đếm 0;
  xem chênh lệch → **Chốt** = `adjustUnitsToTotalSync` theo từng sản phẩm đã đếm.
- **Xuất hàng** (phiếu soạn): chọn đơn sẵn sàng giao → bảng phải xuất / đã quét / còn thiếu; quét sai sản phẩm, sai
  cái, vượt số → báo đỏ; đủ → **Hoàn tất & bắt đầu giao** = `setOrderLegStatusSync(vn_domestic, sent)`.
- **Mã lạ**: hiện mã + "Chưa liên kết sản phẩm" → tìm sản phẩm → **Liên kết mã** (quyền `products`) → quay lại đúng
  phiếu và áp dụng lần quét đó. Không bao giờ tự tạo sản phẩm; nút "Tạo sản phẩm" mở form admin hiện có trong tab mới.

## 3. Mô hình dữ liệu (migration 76, mới)

```
product_barcodes  id, code TEXT (chuẩn hoá, giữ số 0 đầu), symbology TEXT (ean13|ean8|upca→ean13|itf14|code128|qr|other),
                  product_id → products ON DELETE CASCADE, pack_qty INTEGER ≥1 (1 = cái), pack_label TEXT ('', 'hộp', 'thùng'…),
                  active INTEGER, source TEXT ('manual'|'sku'|'api'), note, created_by, created_at, updated_at
                  UNIQUE(code) WHERE active = 1   ← một mã đang dùng chỉ trỏ MỘT đối tượng
scan_docs         id, code TEXT UNIQUE (PN-/KK-/XK- + yymmdd-nn… dùng tiền tố QN/QK/QX để không đụng bill KK-),
                  kind (receive|count|pick), mode (direct|shipment|null), status (draft|confirmed|cancelled),
                  warehouse (jp|vn), shipment_id, order_id, note, version INTEGER, result TEXT(JSON),
                  created_by, created_at, updated_at, confirmed_by, confirmed_at
scan_lines        id, doc_id → scan_docs ON DELETE CASCADE, product_id, qty INTEGER NULL (NULL = chưa đếm),
                  expected INTEGER NULL (snapshot hệ thống / số phải xuất), expected_at TEXT, unit_codes TEXT(JSON mảng mã H),
                  expiry, unit_cost_jpy, bill_code, rev INTEGER, created_at, updated_at   UNIQUE(doc_id, product_id, expiry)*
scan_ops          id, doc_id, op_id TEXT, line_id, kind (scan|set|remove|undo), code_raw, code, delta, unit_code,
                  actor, created_at, undone_at   UNIQUE(doc_id, op_id)
```
*Dòng nhập hàng tách theo hạn dùng (cùng sản phẩm, hai hạn = hai dòng).

Backfill trong migration: `products.sku` là GTIN hợp lệ (8/12/13/14 số, đúng số kiểm) và **không trùng** giữa các sản
phẩm → thêm vào `product_barcodes` (source `sku`). SKU trùng không backfill; khi quét sẽ ra "xung đột".

## 4. Hợp đồng API (`/api/admin/v1`, Bearer hoặc session + CSRF; JSON envelope như ADMIN_API.md)

| Method | Path | Quyền | Mô tả |
| --- | --- | --- | --- |
| GET | `/codes/resolve/?code=` | inventory:read | Chuẩn hoá + nhận diện: `kind` = `product` / `unit` / `unknown` / `conflict` / `invalid` / `unsupported_qr`; kèm sản phẩm, `packQty`, cái (mã H) |
| GET | `/products/{id}/stock/` | inventory:read | Tồn theo kho/trạng thái/hạn dùng, giữ cho đơn, (giá nếu `see_prices`) |
| GET/POST | `/products/{id}/barcodes/` | products:read / products:write | Liệt kê / liên kết mã (409 nếu mã đang trỏ đối tượng khác) |
| DELETE | `/barcodes/{id}/` | products:write | Ngừng dùng mã (giữ lịch sử, `active=0`) |
| GET/POST | `/stock-receipts/` | inventory:read / write | Danh sách nháp / tạo phiếu nhập `{warehouse, mode, shipmentId?}` |
| GET | `/stock-receipts/{id}/` | inventory:read | Phiếu + dòng + version (đọc lại sau mất mạng) |
| POST | `/stock-receipts/{id}/scans/` | inventory:write | `{code, opId, qty?}` → dòng sau khi cộng; trùng `opId` = trả lại kết quả cũ |
| PATCH/DELETE | `/stock-receipts/{id}/lines/{lineId}/` | inventory:write | Sửa số lượng/hạn/giá `{…, rev}` / bỏ dòng |
| POST | `/stock-receipts/{id}/undo/` | inventory:write | Hoàn tác thao tác quét gần nhất (hoặc `opId`) |
| POST | `/stock-receipts/{id}/confirm/` | inventory:write | `{version}` → nhập kho trong 1 transaction; gọi lại = trả kết quả đã chốt |
| POST | `/stock-receipts/{id}/cancel/` | inventory:write | Huỷ nháp |
| … | `/stock-counts/…` | như trên | `scans`, `lines` (`{qty|null}`, `recount`), `undo`, `close` `{version}`, `cancel` |
| … | `/picks/…` | như trên (cần `delivery`) | tạo `{orderId}`, `scans`, `undo`, `complete` `{version}`, `cancel` |

CLI: `lienstore codes resolve <mã>`, `lienstore stock <id>`, `lienstore barcodes add <productId> <mã> [--pack-qty 12]`,
`lienstore receipts|counts|picks …` (cùng API).

## 5. Trạng thái chứng từ

`draft` → `confirmed` (nhập: đã tạo/chuyển cái; kiểm: đã điều chỉnh; xuất: đã bắt đầu giao) · `draft` → `cancelled`.
Chỉ `draft` mới sửa được. Chốt là **một chiều**; sửa sai sau chốt bằng nghiệp vụ hiện có (loại cái `removeUnitsAction`,
kiểm kê lại, đổi chặng đơn) — không xoá lịch sử. Mỗi thay đổi tăng `version`.

## 6. Đồng thời, retry, mất mạng, quét lặp

- **Quét lặp camera**: client chỉ gửi một mã khi nó *xuất hiện* (mã đang nằm trong khung không gửi lại; phải rời khung
  ≥ 1,2 s hoặc bấm "Quét lại" mới tính lần mới). Mỗi lần quét có chủ ý mang `opId` (UUID) mới.
- **Idempotency bền**: `scan_ops UNIQUE(doc_id, op_id)` ghi cùng transaction với dòng → retry cùng `opId` trả kết quả
  cũ, không cộng lại; khác payload cùng `opId` → 422. Chốt: chuyển trạng thái `draft→confirmed` nằm CHUNG transaction
  với thay đổi kho, `result` lưu trên phiếu → gọi lại trả `result` (không chạy lần hai); thêm `Idempotency-Key`
  (bảng `api_idempotency`) cho mọi lệnh ghi.
- **Mã H**: một cái chỉ ghi nhận một lần trong một phiếu (đếm theo mã, không theo lần quét). Mã sản phẩm: mỗi lần quét
  có chủ ý +`packQty`; sửa nhanh số lượng bằng ô số.
- **Hai điện thoại**: lệnh quét (cộng dồn) không cần version; sửa số tuyệt đối cần `rev` của dòng; chốt cần `version`
  của phiếu đúng bản người dùng vừa xem → khác → 409, client tải lại để người dùng xem lại.
- **Mất mạng**: online-first; không có hàng đợi ghi offline. Lệnh ghi đang treo → client thử lại với cùng `opId` /
  `Idempotency-Key`; sau khi có mạng tải lại phiếu từ server (nguồn sự thật). Không cache API (no-store), không lưu
  token vào localStorage (web dùng cookie phiên httpOnly); localStorage chỉ nhớ id phiếu đang mở + lựa chọn camera.
- **Kiểm kê đồng thời có nhập/xuất**: mỗi dòng lưu `expected` = tổng hệ thống tại kho lúc đếm (`expected_at`). Khi
  chốt, tính lại; khác → dòng "biến động", **chặn chốt** cho tới khi người dùng *Đếm lại* hoặc *Xác nhận số đếm sau
  biến động* (cập nhật snapshot, ghi lại quyết định). Áp dụng: `rảnh_mới = rảnh_hiện_tại + (đếm − tổng_hiện_tại)`;
  nếu < 0 (thiếu cả hàng đang giữ cho đơn/đã đóng thùng) → chặn, cần xử lý tay.
- **Xuất**: hoàn tất kiểm lại trong transaction rằng đơn vẫn sẵn sàng giao và chưa "đang giao" → không trừ hai lần.

## 7. Kế hoạch, kiểm thử, nghiệm thu

GĐ1 mã + resolve + tra cứu + màn quét · GĐ2 nhập · GĐ3 kiểm kho · GĐ4 xuất · GĐ5 hoàn thiện (PWA manifest đã có
`src/app/manifest.ts`; không service worker), tài liệu + checklist điện thoại thật.

Test tự động (`npm run test:scan`, DB tạm): chuẩn hoá mã (số 0 đầu, UPC-A↔EAN-13, số kiểm sai, mã H, QR `LS1:`),
liên kết trùng/xung đột, quy đổi `pack_qty`, quyền/kho, retry & đồng thời cùng `opId`, hai thiết bị (`rev`/`version`),
chốt lặp không nhập/xuất hai lần, transaction lỗi không lệch, chưa đếm ≠ 0, biến động khi kiểm kê, xuất sai/vượt/thiếu.
Phần camera thật (iOS Safari / Chrome Android) chỉ kiểm được trên thiết bị — checklist ở `docs/SCANNING.md`.
