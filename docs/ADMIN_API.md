# Admin API v1 + CLI `lienstore`

Cho agent (T3 Code, Claude, script) quản trị **sản phẩm và ảnh** bằng dòng lệnh, không cần mở web admin.

```
lienstore CLI (scripts/lienstore.mjs)  ──HTTPS + Bearer──►  /api/admin/v1/**  ──►  lib/product-service.ts  ──►  SQLite
                                                           (route handlers)       (dùng chung với Server Actions admin)
```

- Nghiệp vụ nằm ở `src/lib/product-service.ts`, `src/lib/product-rules.ts`, `src/lib/media-service.ts` — admin web
  (`app/admin/products/actions.ts`, `/api/admin/upload`) dùng cùng các hàm/luật này. CLI **không** chạm database.
- Phạm vi v1: sản phẩm (tìm, xem, tạo, sửa, sửa hàng loạt), upload ảnh, danh mục (đọc), nhật ký. **Chưa** có đơn hàng,
  khách hàng, tồn kho (tồn kho chỉ đọc: `stock`, `stockVn`).

## 1. Cấu hình CLI

1. Cấp token (chỉ hiện **một lần**):
   - Web: đăng nhập tài khoản **owner/admin** → *Cài đặt web › API tokens (CLI)* (`/admin/api-tokens/`) → chọn quyền,
     hạn dùng → *Cấp token* → chép vào file cấu hình.
   - Local (máy có file DB): `npm run api-token -- create --name "T3 Code agent" --scopes products:read,products:write,media:write --days 90 --write-env .env.lienstore.local`
     (`--write-env` ghi token thẳng vào file, không in ra màn hình; `--owner <ID đăng nhập>` mặc định `owner`;
     DB = `LIEN_DB_PATH`, mặc định `data/lienstore.db`).
2. File `.env.lienstore.local` ở gốc repo (đã git-ignore, quyền 600):
   ```
   LIENSTORE_API_URL=http://localhost:3000
   LIENSTORE_API_TOKEN=lsk_…
   LIENSTORE_ENV=local
   ```
   Nhiều môi trường: `.env.lienstore.prod.local` + `--profile prod` (hoặc `LIENSTORE_PROFILE=prod`). Biến môi trường
   ghi đè file. **Không** truyền token bằng tham số dòng lệnh (CLI từ chối `--token`).
3. Kiểm tra: `npm run -s lienstore -- whoami` (hoặc `node scripts/lienstore.mjs whoami`).

Mỗi lệnh in dòng đích ra stderr: `[lienstore] → https://… [PRODUCTION] profile=prod token=lsk_ab12cd34…`.
Đích **production** (URL không phải localhost, hoặc `LIENSTORE_ENV=production`): lệnh ghi phải có `--yes`
(`--dry-run` thì không cần) → chạy `--dry-run` trước, xác nhận, rồi `--yes`.

## 2. Lệnh

| Việc | Lệnh |
| --- | --- |
| Ai đang dùng / server nào | `lienstore whoami` |
| Tìm sản phẩm | `lienstore products list --search "Hada Labo"` (`--category`, `--status publish\|draft\|all`, `--sale-status`, `--sku`, `--ids 1,2`, `--has-image false`, `--price-min/--price-max`, `--updated-since 2026-10-01`, `--sort -updated\|price\|name\|id\|created`, `--page`, `--per-page ≤200`, `--fields id,name,price\|all`, `--all-pages`) |
| Xem chi tiết | `lienstore products get 2710` (`--fields …`) |
| Đổi giá | `lienstore products update 2710 --set price=185000` |
| Sửa nhiều trường | `lienstore products update 2710 --file patch.json` (có thể kèm `--set`) |
| Xem trước | thêm `--dry-run` (trả `changes` trước/sau, không ghi) |
| Chống ghi đè | `--if-version <version>` (version lấy từ `get`/`list`) |
| Tạo sản phẩm | `lienstore products create --file product.json` (`--dry-run`, `--allow-duplicate-sku`) |
| Sửa hàng loạt | `lienstore products bulk-update --file changes.json --dry-run --out plan.json` rồi `lienstore products bulk-update --file plan.json` |
| Upload ảnh | `lienstore media upload ./anh1.jpg ./anh2.png` (`--folder products\|categories\|posts`) |
| Danh mục | `lienstore categories list` |
| Ai đã sửa | `lienstore audit --product 2710` |

`--set key=value`: value được đọc như JSON nếu được (`price=185000`, `promoPrice=null`, `categories='["my-pham"]'`,
`status=publish`), còn lại là chuỗi; `sku` và chuỗi số bắt đầu bằng 0 luôn giữ dạng chuỗi. `--file -` đọc stdin.

**Đầu ra**: JSON trên stdout — thành công `{ "ok": true, "data": …, "meta": {…}, "target": {…} }`, lỗi
`{ "ok": false, "error": { "code", "message", "status", "fields"? … }, "target": … }`.
**Exit code**: 0 ok · 1 lỗi API (4xx/5xx) · 2 sai cú pháp/thiếu cấu hình · 3 ghi production thiếu `--yes` · 4 lỗi mạng/timeout.
Timeout mặc định 30 s (`LIENSTORE_TIMEOUT_MS`, `--timeout`; upload ×4). Tự thử lại tối đa 3 lần **chỉ** khi an toàn:
GET, và lệnh ghi có `Idempotency-Key` (CLI luôn gửi) khi lỗi mạng / 502-504 / `IDEMPOTENCY_IN_PROGRESS`.
CLI không bao giờ tự mở trình duyệt.

## 3. Trường sản phẩm

| Trường | Ghi? | Ý nghĩa |
| --- | --- | --- |
| `name`, `nameJa` | ✓ | Tên VI / JA (`name` bắt buộc khi tạo) |
| `slug` | ✓ | Đường dẫn `/product/<slug>/`; tạo mới: mặc định từ tên |
| `sku` | ✓ | Chuỗi ≤64 ký tự hoặc `null` |
| `price` | ✓ | **Giá bán trên web** (giá kỳ vọng), số nguyên VNĐ; `0` = "Liên hệ" |
| `promoPrice` | ✓ | Giá khuyến mại đang chạy, `null` = tắt; phải < `marketPrice` nếu có |
| `marketPrice` | ✓ | Giá thị trường (gạch ngang), `null` = không |
| `currentPrice` | – | Giá khách trả lúc này (khuyến mại nếu có) |
| `shortDescription`, `shortDescriptionJa` | ✓ | Văn bản thường (đoạn cách nhau dòng trống) → HTML `<p>` như form admin |
| `description`, `descriptionJa` | ✓ | HTML |
| `categories` | ✓ | Mảng slug (hoặc đúng tên) danh mục, ≥1 — xem `categories list` |
| `tags` | ✓ | Mảng chuỗi |
| `images` | ✓ | Mảng URL ảnh **đã upload** (`/api/files/…`) hoặc file trong `public/`; ảnh đầu tiên làm ảnh đại diện, thumb 300×300 tự lấy |
| `thumb` | ✓ | Tuỳ chọn, mặc định suy ra từ ảnh đầu |
| `status` | ✓ | `publish` (đang bán) / `draft` (ẩn). Tạo mới mặc định `draft` |
| `saleStatus` | ✓ | `instock` / `discontinued` (ngừng bán tại Nhật) |
| `weightG`, `dimsCm` | ✓ | Gram (>0) / `"12x8x5"` cm; đổi thì giá vốn VNĐ tính lại như form admin |
| `stock`, `stockVn`, `fulfillment`, `labelId`, `groupId`, `variantAttrs` | – | Chỉ đọc trong v1 |
| `costPrice`, `costJpy`, `costSource`, `marginPct` | – | Chỉ đọc, chỉ trả khi tài khoản chủ token có quyền "Xem giá vốn" |
| `version` | – | Phiên bản dữ liệu (đổi khi bất kỳ ai ghi sản phẩm) |

Gửi trường lạ hoặc chỉ-đọc → 422 kèm `fields` (bắt lỗi gõ nhầm). Tự động tính giá (`Công thức giá`, cron
`/api/cron/pricing`) vẫn chạy như khi sửa ở web: nếu bật "tự cập nhật giá bán", giá nhập tay có thể bị công thức ghi lại.

### Ví dụ

`product.json` (tạo mới kèm ảnh — upload trước, lấy `image`):
```json
{
  "name": "Toner bã rượu dưỡng ẩm PDC Wafood Made 190ml",
  "sku": "4961989409139",
  "price": 185000,
  "categories": ["my-pham"],
  "images": ["/api/files/products/2026-10/toner-pdc-1a2b3c4d.jpg"],
  "shortDescription": "Toner bã rượu hai lớp, cấp ẩm.\n\nLắc đều trước khi dùng.",
  "status": "publish"
}
```
`patch.json`: `{ "price": 185000, "promoPrice": null, "tags": ["toner", "pdc"] }`

`changes.json` (hàng loạt): `{ "items": [ { "id": 2710, "set": { "price": 185000 } }, { "id": 2711, "set": { "status": "draft" } } ] }`
hoặc cùng một thay đổi: `{ "ids": [2710, 2711], "set": { "saleStatus": "discontinued" } }`.

## 4. Quy tắc an toàn

- **PATCH** chỉ đổi trường được gửi; các trường khác giữ nguyên (merge trên bản đang lưu, ghi qua `saveProduct` với
  lịch sử thay đổi `product_changes`, actor `API <tên token> (<chủ token>)`).
- **Chống ghi đè**: mỗi lần ghi kiểm tra trong transaction rằng sản phẩm vẫn đúng `version` đã đọc. Có `If-Match`/
  `--if-version` → khác thì 409 `VERSION_CONFLICT`. Không gửi version → server đọc lại bản mới nhất và áp lại thay đổi
  (tối đa 3 lần), không bao giờ ghi đè trường người khác vừa sửa.
- **Hàng loạt là NGUYÊN TỬ**: kiểm tra hết các mục trước; một mục lỗi/không tồn tại/xung đột → **không ghi mục nào**
  (422/404/409 `BULK_REJECTED` kèm kết quả từng mục). Thành công → tất cả ghi trong một transaction. Tối đa 200 mục.
  `--dry-run --out plan.json` lưu kế hoạch đã **khoá version** từng mục: nếu sau dry-run có ai sửa, áp dụng kế hoạch sẽ
  bị từ chối thay vì ghi đè. Không có gì thay đổi → không sinh `plan.json`.
- **Chống tạo trùng**: CLI gửi `Idempotency-Key` = băm nội dung file → chạy lại cùng file (sau timeout, mất mạng…) trả
  lại đúng sản phẩm đã tạo (`meta.idempotentReplay: true`), không tạo bản thứ hai. Thêm vào đó server từ chối tạo khi
  slug đã có (409 `DUPLICATE_SLUG`, kèm `existingId`) hoặc SKU đã dùng (409 `DUPLICATE_SKU`, trừ `--allow-duplicate-sku`).
  Cùng key nhưng nội dung khác → 422 `IDEMPOTENCY_KEY_REUSED`. Kết quả idempotency lưu 24 h (bảng `api_idempotency`).
- **Upload**: JPEG/PNG/WebP/AVIF/GIF, ≤ 10 MB (như admin), kiểm tra cả nội dung file; server thu ≤1200 px, cắt viền
  trắng ảnh sản phẩm và tạo thumb 300×300. Upload lại cùng file trong 24 h trả lại URL cũ.
- **Ảnh ngoài** (`https://…`) không nhận — upload trước.

## 5. Token & phân quyền

- Scope: `products:read` (đọc sản phẩm, danh mục, nhật ký), `products:write` (tạo/sửa/hàng loạt, liên kết mã vạch),
  `media:write` (upload), `inventory:read` (tra mã, tồn, phiếu quét), `inventory:write` (phiếu nhập / kiểm kê / soạn hàng —
  còn cần quyền kho tương ứng của tài khoản: ③ Kho Nhật, ⑥ Kho VN, ⑦ Giao hàng VN).
- Token **thuộc về tài khoản đã cấp** và mỗi request kiểm tra lại: tài khoản bị khoá / hạ quyền / mất module "Sản phẩm"
  → token mất quyền tương ứng (401 `TOKEN_OWNER_INACTIVE` hoặc 403 `FORBIDDEN`).
- Lưu `sha256` của token (bảng `api_tokens`), không lưu/ghi log token thô. Hết hạn → 401 `TOKEN_EXPIRED`; thu hồi
  (nút *Thu hồi* hoặc `npm run api-token -- revoke <id>`) → 401 `TOKEN_REVOKED` ngay lập tức.
- Chỉ **owner/admin** cấp/thu hồi token. `npm run api-token` cần quyền truy cập file DB (máy chủ/máy dev).
- Nhật ký `api_audit_log`: thời điểm, actor, token, thao tác (`products.create|update|bulk-update`, `media.upload`,
  `token.create|revoke`), đối tượng, thay đổi trước/sau (bỏ các khoá giống secret, cắt chuỗi dài), requestId, IP.
  Xem ở trang API tokens hoặc `lienstore audit`.
- Route cũng nhận **phiên đăng nhập admin** (cookie) — dùng cho trang web nội bộ; khi đó request ghi phải có header
  `X-Lien-Csrf: 1` và cùng origin (chống CSRF). Bearer không cần.

## 6. HTTP API (cho client khác CLI)

Base: `<site>/api/admin/v1/` (luôn có dấu `/` cuối — site dùng `trailingSlash`). Header: `Authorization: Bearer lsk_…`.

| Method | Path | Scope | Ghi chú |
| --- | --- | --- | --- |
| GET | `/` | – | Mục lục |
| GET | `/me/` | bất kỳ | Token, scope, server |
| GET | `/products/` | products:read | Query như CLI (`search`, `category`, `status`, `saleStatus`, `sku`, `ids`, `hasImage`, `priceMin`, `priceMax`, `updatedSince`, `sort`, `page`, `perPage`, `fields`) → `data[]`, `meta.total/page/perPage/totalPages` |
| POST | `/products/` | products:write | Body = trường sản phẩm; `?dryRun=1`, `?allowDuplicateSku=1`; 201 `{ created, product }` |
| GET | `/products/{id}/` | products:read | `?fields=` |
| PATCH | `/products/{id}/` | products:write | `If-Match: <version>` hoặc `"version"` trong body; `?dryRun=1` → `{ changes, product, unchanged, dryRun }` |
| POST | `/products/bulk-update/` | products:write | `{ items:[{id, version?, set}] }` hoặc `{ ids, set }`; `?dryRun=1` → `{ summary, results[], apply? }` |
| POST | `/media/` | media:write | multipart: `file`, `folder?`, `name?` → 201 `{ image, thumb, size, mime, width, height }` |
| GET | `/categories/` | products:read | `{ slug, name, nameJa, parent, count }` |
| GET | `/audit/` | products:read | `?product=<id>&limit=` |

Lệnh ghi nhận `Idempotency-Key` (8–200 ký tự `[A-Za-z0-9._:-]`). Mã lỗi: `UNAUTHORIZED`, `TOKEN_INVALID`,
`TOKEN_EXPIRED`, `TOKEN_REVOKED`, `TOKEN_OWNER_INACTIVE` (401) · `FORBIDDEN`, `CSRF_FAILED` (403) · `NOT_FOUND` (404) ·
`VERSION_CONFLICT`, `DUPLICATE_SLUG`, `DUPLICATE_SKU`, `IDEMPOTENCY_IN_PROGRESS`, `BULK_REJECTED` (409) ·
`PAYLOAD_TOO_LARGE`, `FILE_TOO_LARGE` (413) · `UNSUPPORTED_MEDIA_TYPE` (415) · `VALIDATION_FAILED`, `INVALID_IMAGE`,
`IDEMPOTENCY_KEY_REUSED` (422) · `BAD_REQUEST`, `INVALID_JSON`, `MISSING_FILE` (400) · `INTERNAL` (500, kèm requestId).

## 7. Chạy local & kiểm thử

```bash
npm run dev                                   # http://localhost:3000, DB data/lienstore.db
npm run api-token -- create --name "agent local" \
  --scopes products:read,products:write,media:write --write-env .env.lienstore.local
echo "LIENSTORE_API_URL=http://localhost:3000" >> .env.lienstore.local
npm run -s lienstore -- whoami
npm run -s lienstore -- products list --search "Hada Labo"
```
Muốn thử trên bản sao DB: `cp data/lienstore.db /tmp/t.db && LIEN_DB_PATH=/tmp/t.db LIEN_UPLOAD_DIR=/tmp/up npm run dev`
(cấp token cũng với `LIEN_DB_PATH=/tmp/t.db`).

Test: `npm run test:admin-api` (service, DB tạm) · `npm run test:admin-api:e2e` (CLI → HTTP → DB tạm; tự bật
`next dev` cổng 3197 — cần tắt `npm run dev` đang chạy vì Next chỉ cho một dev server mỗi thư mục).

## 8. Production (khi triển khai — chưa làm tự động)

- Migration 75 tự chạy khi container khởi động (bảng `api_tokens`, `api_audit_log`, `api_idempotency`).
- Cấp token trên web prod `/admin/api-tokens/` bằng tài khoản owner/admin; chọn quyền tối thiểu và hạn dùng.
- Máy agent: `.env.lienstore.prod.local` với `LIENSTORE_API_URL=https://<domain>`, `LIENSTORE_ENV=production`,
  token → dùng `--profile prod`, luôn `--dry-run` rồi `--yes`.
- Cloudflare/WAF: cho phép header `Authorization`, `Idempotency-Key`, `If-Match` tới `/api/admin/v1/*`; không cache
  đường dẫn này (server trả `Cache-Control: no-store`). Nên đặt giới hạn tốc độ cho `/api/admin/v1/*`.
- Tuỳ chọn `LIEN_ENV_LABEL=production` để `whoami` hiện đúng nhãn.

## 9. Quét mã, tồn kho và phiếu kho (v1, thêm cho màn quét điện thoại)

Chi tiết nghiệp vụ: `docs/architecture/mobile-scanning.md`, hướng dẫn: `docs/SCANNING.md`. Màn `/admin/scan/` dùng
chính các endpoint này bằng phiên đăng nhập (+ `X-Lien-Csrf: 1`); agent dùng Bearer token.

| Method | Path | Scope | |
| --- | --- | --- | --- |
| GET | `/codes/resolve/?code=` | inventory:read | `kind`: product / unit / unknown / conflict / invalid / unsupported_qr |
| GET | `/products/{id}/stock/` | inventory:read | tồn theo kho, hạn dùng, giữ cho đơn, đang về |
| GET / POST | `/products/{id}/barcodes/` | products:read / write | `{ code, packQty?, packLabel?, force? }` |
| DELETE | `/barcodes/{id}/` | products:write | ngừng dùng liên kết |
| GET / POST | `/stock-receipts/` · `/stock-counts/` · `/picks/` | inventory:read / write | danh sách (`?status=draft`) / tạo |
| GET | `/stock-receipts/shipments/` · `/picks/orders/` | inventory:read | chuyến chờ nhận / đơn sẵn sàng giao |
| GET | `/{family}/{id}/` | inventory:read | phiếu + dòng + `version` + `blockers` |
| POST | `/{family}/{id}/scans/` | inventory:write | `{ code, opId, qty? }` — cùng `opId` = cùng kết quả |
| POST | `/{family}/{id}/lines/` | inventory:write | `{ productId }` |
| PATCH / DELETE | `/{family}/{id}/lines/{lineId}/` | inventory:write | `{ rev, qty?, expiry?, unitCostJpy?, billCode?, recount?, acceptDrift? }` |
| POST | `/{family}/{id}/undo/` | inventory:write | hoàn tác lần quét gần nhất |
| POST | `/stock-receipts/{id}/confirm/` · `/stock-counts/{id}/close/` · `/picks/{id}/complete/` | inventory:write | `{ version }` — một transaction, gọi lại trả kết quả cũ. Picks thêm `method` (id ĐVVC hoặc `"pickup"`, bắt buộc nếu đơn chưa có ĐVVC) và `tracking` (mã vận đơn), ghi như ⑦ Giao hàng VN |
| GET | `/picks/carriers/` | inventory:read | ĐVVC chặng nội địa VN (`value`, `label`) |
| POST | `/{family}/{id}/cancel/` | inventory:write | huỷ nháp |
| GET / POST | `/shipments/?editable=1` · `POST /shipments/` | inventory:read / write | chuyến đóng hàng đang mở / tạo chuyến (cần quyền `packing`) |
| GET | `/shipments/{id}/` | inventory:read | tóm tắt + dòng theo SP |
| POST | `/shipments/{id}/pack/` | inventory:write | `{ code?, productId?, qty? }` — đóng FEFO; JAN = qty cái (mặc định 1) |
| POST | `/shipments/{id}/unpack/` | inventory:write | `{ productId, qty? }` hoặc `{ unitIds }` |

CLI:
```bash
lienstore codes resolve 4961989409139
lienstore stock 2710
lienstore barcodes add 2710 4961989409139 [--pack-qty 12 --pack-label thùng]
lienstore receipts create --warehouse vn                 # hàng mới; nhận chuyến: --mode shipment --shipment <id>
lienstore receipts scan <docId> 4961989409139 --qty 2
lienstore receipts get <docId>                          # xem lại, lấy "version"
lienstore receipts confirm <docId> --version <v>
lienstore counts create --warehouse vn · counts scan … · counts set-line <docId> <lineId> --rev R --qty 0 · counts confirm …
lienstore picks orders · picks carriers · picks create --order-number 1234 · picks scan …
lienstore picks confirm <docId> --version <v> --method <id|pickup> [--tracking GHN123]
lienstore shipments list · shipments create [--label …] · shipments get <id>
lienstore shipments pack <id> 4961989409139 [--qty 1]   # hoặc --product <id>
lienstore shipments unpack <id> --product <id> [--qty 1]
```
Mã lỗi thêm: `INVALID_CODE`, `UNKNOWN_CODE`, `CODE_CONFLICT`, `CODE_LINKED_ELSEWHERE`, `CODE_IS_SKU_OF_OTHER`,
`WAREHOUSE_FORBIDDEN`, `DOC_EXISTS`, `DOC_NOT_DRAFT`, `DOC_CHANGED`, `LINE_CHANGED`, `OP_ID_REUSED`, `OVER_QUANTITY`,
`WRONG_PRODUCT`, `WRONG_UNIT`, `UNIT_NOT_IN_SHIPMENT`, `COUNT_DRIFT`, `COUNT_SHORT_HELD`, `PICK_INCOMPLETE`,
`ORDER_NOT_READY`, `STOCK_CHANGED`, `CARRIER_REQUIRED`.
