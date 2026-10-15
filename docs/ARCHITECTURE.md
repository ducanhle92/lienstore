# Kiến trúc dự án LienStore clone

## Tổng quan
Một ứng dụng **Next.js 16 (App Router)** duy nhất đảm nhiệm cả frontend, backend và lớp truy cập dữ liệu. Không có API server riêng: dữ liệu được đọc trong Server Components và ghi qua **Server Actions**. Cơ sở dữ liệu là **SQLite** (một file `data/lienstore.db`, dùng module `node:sqlite` có sẵn trong Node 24, không cần build native) truy cập qua `src/lib/db.ts`; schema và migration nằm trong `src/lib/sqlite.ts`. Trong container file DB nằm ở `/app/data` (gắn volume).

```
Trình duyệt
 ├─ Server Components (SSR)  ─┐
 ├─ Client Components         │  Next.js 16 (Node 24)   ── src/lib/db.ts ──► SQLite data/lienstore.db
 │   • CartProvider (localStorage: giỏ, wishlist, vừa xem)   │
 │   • forms → Server Actions ("use server")                │
 └─ /api/health ─────────────┘
```

## Frontend
| Phần | Vị trí | Ghi chú |
|---|---|---|
| Trang chủ (clone pixel) | `src/app/page.tsx` + `src/components/sites/lienstore/root-8a5edab2/*` | slider, lưới danh mục, 3 khối sản phẩm (đọc từ DB), sidebar |
| Shop / danh mục / tag / tìm kiếm | `src/app/shop`, `product-category`, `product-tag` | `ProductListing` (breadcrumb, sắp xếp, phân trang 32/trang) |
| Trang sản phẩm | `src/app/product/[slug]` + `shop/product/*` | gallery + zoom, mua hàng, wishlist, tab mô tả/đánh giá, sản phẩm tương tự, sticky bar, thông báo thêm giỏ |
| Giỏ / thanh toán / đơn đã nhận | `src/app/cart`, `checkout`, `checkout/order-received/[id]` + `shop/cart/*` | giỏ ở client (localStorage), đặt hàng qua server action `placeOrder` |
| Tài khoản | `src/app/my-account` | đăng nhập/đăng ký/quên mật khẩu, đơn hàng, địa chỉ, chi tiết tài khoản, tra cứu đơn cho khách |
| Blog + trang tĩnh | `src/app/[slug]`, `src/app/category/goc-chia-se` | nội dung HTML từ WordPress gốc, form bình luận (chỉ hiển thị) |
| Khung chung | `shop/SiteChrome.tsx` | header (danh mục từ DB), footer, widget nổi, chat Messenger tuỳ chọn |
| Admin | `src/app/admin/*` + `admin/*` components | layout riêng, dashboard, sản phẩm CRUD, danh mục CRUD, đơn hàng + trạng thái |
| Style | Tailwind CSS v4, token màu `--lien-*` trong `globals.css`, font tự host (Google Sans, Oswald, FontAwesome 4.7) | breakpoint theo Bootstrap 3: sm 768 / md 992 / lg 1200 |

## Backend (trong cùng ứng dụng Next.js)
- **Server Actions**: `checkout/actions.ts` (đặt hàng, tạo tài khoản), `my-account/actions.ts` (đăng nhập/đăng ký/cập nhật), `admin/**/actions.ts` (CRUD sản phẩm, danh mục, trạng thái đơn). Mọi action ghi dữ liệu đều kiểm tra phiên và validate phía server; giá được tính lại từ catalogue nên client không sửa được giá.
- **Route Handler**: `src/app/api/health/route.ts` cho health check.
- **Admin API v1** (`src/app/api/admin/v1/**`, Bearer token hoặc phiên admin + CSRF): sản phẩm / ảnh / danh mục cho agent và CLI `scripts/lienstore.mjs`; nghiệp vụ dùng chung với Server Actions trong `src/lib/product-service.ts`, `product-rules.ts`, `media-service.ts`; token/nhật ký/idempotency ở `src/lib/api-tokens.ts`, HTTP chung ở `src/lib/api-http.ts`. Chi tiết: `docs/ADMIN_API.md`.
- **Xác thực**: 
  - Admin: `src/lib/auth.ts` — tài khoản từ biến môi trường `ADMIN_USER`/`ADMIN_PASSWORD`, cookie `lien_admin` ký HMAC-SHA256 bằng `ADMIN_SESSION_SECRET`, hạn 12 giờ.
  - Khách hàng: `src/lib/customer-auth.ts` — bảng `customers` trong DB, mật khẩu băm **scrypt** + salt riêng, cookie `lien_customer` ký HMAC, hạn 30 ngày.
- **Render**: trang đọc DB dùng `dynamic = "force-dynamic"` hoặc được `revalidatePath("/", "layout")` sau mỗi thao tác admin, nên thay đổi hiển thị ngay.

## Dữ liệu
- **Engine**: SQLite qua `node:sqlite` (Node ≥ 22.13/24). File `data/lienstore.db` (WAL mode, `foreign_keys=ON`). Biến `LIEN_DB_PATH` trỏ file DB (container: `/app/data/lienstore.db`).
- **Schema (v1)** — `src/lib/sqlite.ts`, mảng `MIGRATIONS`, mỗi phần tử chạy đúng một lần và được ghi vào `schema_migrations`:

  | Bảng | Nội dung |
  | --- | --- |
  | `settings` | key/value (`next_order_number`, `seeded_at`) |
  | `categories` | slug (PK), name, description, image, sort_order |
  | `products` | id, slug (unique), giá bán, giá gốc, `cost_price` (giá vốn, v2), `supplier_url` + `min_stock` (v3), tồn kho, `tags`/`images`/`related` (JSON text), mô tả, rating, status, timestamps |
  | `product_categories` | N-N sản phẩm ↔ danh mục (`ON DELETE CASCADE` theo sản phẩm) |
  | `customers` | id, email (unique), `password_hash` + `salt` (scrypt), họ tên, điện thoại, địa chỉ |
  | `orders` | id, `number` (unique, tăng dần từ 1001), customer_id (FK, nullable), trạng thái, thanh toán, thông tin người nhận, tổng tiền, `admin_note` (v3) |
  | `order_files` (v3) | file đính kèm đơn (bill mua hàng Nhật): tên, đường dẫn trong thư mục uploads, mime, size, ghi chú, số tiền JPY |
  | `order_items` | dòng hàng của đơn (snapshot tên/giá tại thời điểm đặt), `ON DELETE CASCADE` |
  | `pages`, `posts` | trang tĩnh và bài viết |

- **Nâng cấp schema sau này**: thêm phần tử mới vào `MIGRATIONS` (ví dụ `{ version: 2, name: "product-variants", up: ["ALTER TABLE …", "CREATE TABLE …"] }`). Khi container khởi động với DB cũ, migration mới tự chạy trong transaction; `/api/health/` trả `db.schemaVersion` để kiểm tra.
- **Đồng bộ seed** (`LIEN_SEED_SYNC`, mặc định `add`; `update` = upsert các dòng có trong seed, dùng khi quản lý catalogue bằng Excel): khi image mới mang `seed.json` có `meta.seededAt` mới hơn, lúc khởi động app chèn thêm sản phẩm/danh mục/trang/bài viết còn thiếu (so theo slug), không đụng bản admin đã sửa, không đụng đơn hàng/khách hàng. `overwrite` thay toàn bộ catalogue theo seed; `off` tắt. Nhờ đó sản phẩm thêm trên dev rồi commit sẽ tự xuất hiện trên prod ở lần release sau.
- **Seed**: DB trống → `sqlite.ts` nhập `data/seed.json` (`LIEN_SEED_PATH`; trong image là `/app/seed/seed.json`). File seed chỉ chứa catalogue (sản phẩm, danh mục, trang, bài viết), không chứa đơn/tài khoản. `npm run db:export` tạo lại seed từ DB đang chạy (`-- --all file.json` để backup kèm khách hàng/đơn hàng); `npm run db:reset` xoá DB local để seed lại.
- **Truy cập**: `src/lib/db.ts` (`import "server-only"`) — các hàm `getAllProducts`, `queryProducts`, `saveProduct`, `createOrder`, `createCustomer`… đều `async` và giữ nguyên chữ ký cũ, nên UI/actions không đổi khi thay engine. Ghi nhiều bước dùng `withTransaction` (BEGIN IMMEDIATE … COMMIT).
- **Ảnh**: `public/sites/lienstore/**` (ảnh trang chủ, ảnh sản phẩm 300px và gốc, font) đi cùng image. **Ảnh admin tải lên** và **bill đơn hàng** lưu ở `LIEN_UPLOAD_DIR` (mặc định `<thư mục DB>/uploads`, trong container `/app/data/uploads`, cùng volume với DB) và được phục vụ qua route `/api/files/<path>` (`src/app/api/files`): ảnh sản phẩm công khai, file đơn hàng chỉ cho admin, chủ đơn đã đăng nhập hoặc link có chữ ký HMAC (`?t=`). Trình duyệt tự thu nhỏ ảnh (1200px + thumb 300×300) trước khi gửi lên `/api/admin/upload` nên server không cần thư viện xử lý ảnh.
- **Mô tả có cấu trúc**: `src/lib/description.ts` tách HTML mô tả thành facts + sections theo từ khoá tiêu đề (Công dụng, Thành phần, Hướng dẫn sử dụng, Lưu ý…), `ProductDescription.tsx` hiển thị; không nhận diện được thì hiển thị HTML gốc.
- **Kho hàng**: `src/lib/inventory.ts` tính trạng thái tồn (hết/sắp hết theo `min_stock` hoặc `LIEN_MIN_STOCK`), nhu cầu từ đơn mở (`getOpenOrderDemand`) và số cần mua; `/admin/inventory/export/` xuất CSV.
- **Giới hạn**: SQLite phù hợp 1 instance ghi (hàng chục nghìn đơn vẫn ổn). Khi cần nhiều instance hoặc full-text search lớn: chuyển `db.ts` sang Postgres (giữ chữ ký hàm), nhập dữ liệu từ `npm run db:export -- --all`.

## Trạng thái phía client
`shop/CartProvider.tsx` giữ giỏ hàng, wishlist, "vừa xem" và "vừa thêm" trong React context + `localStorage` (`lienstore:*`). Header badge, widget nổi, Quick View, trang giỏ đều dùng `useCart()`.

## Đóng gói & vận hành
- `Dockerfile` đa tầng → Next standalone + `seed/seed.json`, user `node`; app tự tạo/migrate SQLite ở `/app/data` khi khởi động (`docker-entrypoint.sh` chỉ kiểm tra quyền ghi và cảnh báo thiếu secret), `HEALTHCHECK` gọi `/api/health/`.
- `docker-compose.yml` (local/VPS), `deploy/truenas-app.yaml` (TrueNAS, image từ GHCR), `deploy/truenas-app.local.yaml` + `deploy/truenas-build.sh` + `deploy/push-source-to-truenas.ps1` (build ngay trên NAS, xem `deploy/README.md`).
- CI: `.github/workflows/ci.yml` (lint, typecheck, build, smoke test image). Release: `.github/workflows/release.yml` (tag `v*` → GHCR → redeploy TrueNAS). Chi tiết ở `docs/DEPLOY.md`.

## Branding & contact (where to edit)

| What | File |
| --- | --- |
| Logo (header), site title, tagline | `src/components/sites/lienstore/root-8a5edab2/data.ts` → `branding` |
| Phones (VN/JP), email, address, hours, social links (Facebook/Zalo/Messenger/…) | same file → `contact` (used by TopBar, footer "Kết Nối Với Chúng Tôi" block and footer social row) |
| Brand SVG/PNG assets (logo, icon, favicons, PWA icons) | `public/sites/lienstore/brand/` |
| Favicon / apple icon metadata | `src/app/layout.tsx` → `metadata.icons`; PWA icons in `src/app/manifest.ts` |
| Social icon set & colours | `src/components/sites/lienstore/shared/BrandIcons.tsx` (`SocialKind` in `src/types/lienstore.ts`) |
| "Liên hệ" page content | bảng `pages` (slug `lien-he`) trong SQLite; bản seed ở `data/seed.json` |
