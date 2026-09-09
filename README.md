<p align="center">
  <img src="public/sites/lienstore/brand/lienstore-logo-horizontal.svg" alt="LienStore" width="360" />
</p>

<h1 align="center">LienStore — web bán hàng Nhật nội địa</h1>

<p align="center">
  Cửa hàng trực tuyến hoàn chỉnh (storefront + giỏ hàng + thanh toán + tài khoản + trang quản trị) chạy bằng một ứng dụng Next.js duy nhất, cơ sở dữ liệu SQLite nhúng, đóng gói thành một image Docker để chạy trên TrueNAS SCALE.
</p>

<p align="center">
  <a href="https://github.com/ducanhle92/lienstore/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/ducanhle92/lienstore/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://github.com/ducanhle92/lienstore/releases"><img alt="Release" src="https://img.shields.io/github/v/tag/anhld-rikkei/shop_ban_hang?label=version&sort=semver"></a>
  <img alt="Next.js 16" src="https://img.shields.io/badge/Next.js-16-black">
  <img alt="Node 24" src="https://img.shields.io/badge/Node-24-339933">
  <img alt="SQLite" src="https://img.shields.io/badge/DB-SQLite%20(node%3Asqlite)-003B57">
</p>

---

## Tính năng

### Cửa hàng (khách hàng)
- **Trang chủ**: slider, ô danh mục có ảnh, khối "Hàng mới về" / "Bán chạy nhất" / "Giảm giá đặc biệt" (khi có ≥ 3 sản phẩm giảm giá), 6 danh mục lớn nhất mỗi danh mục một hàng 6 sản phẩm, băng cam kết (hàng Nhật nội địa, vận chuyển, Zalo, chính hãng), tin tức "Góc chia sẻ".
- **Danh sách sản phẩm**: `/shop/`, theo danh mục `/product-category/<slug>/`, theo tag `/product-tag/<slug>/`, phân trang, sắp xếp (mới nhất, giá tăng/giảm, đánh giá, phổ biến), tìm kiếm không dấu tiếng Việt.
- **Tìm kiếm nhanh**: modal tìm kiếm gợi ý theo từ khoá và danh mục.
- **Chi tiết sản phẩm**: gallery có zoom, giá/giá gốc, tồn kho, sản phẩm liên quan, nút thêm vào giỏ cố định khi cuộn, chia sẻ mạng xã hội, Quick View từ danh sách. **Mô tả có cấu trúc**: tự tách thành thẻ Thông tin nhanh (xuất xứ, nhà sản xuất, quy cách) và các mục Công dụng / Thành phần / Hướng dẫn sử dụng / Đối tượng / Lưu ý với mục lục nhảy nhanh; mô tả không nhận diện được vẫn hiển thị nguyên bản.
- **Bill mua hàng tại Nhật**: khách xem/tải chứng từ cửa hàng đính kèm ngay trong trang “Đơn hàng đã nhận”, mục Đơn hàng của tài khoản và khi tra cứu đơn (link có chữ ký, không cần đăng nhập).
- **Giỏ hàng**: khay giỏ trượt từ phải mở ngay khi thêm sản phẩm (tăng/giảm, xoá, tạm tính, gợi ý "Thường được mua cùng với", nút Xem giỏ / Thanh toán); trang giỏ đầy đủ; lưu trong trình duyệt, badge số lượng trên header.
- **Wishlist**: lưu sản phẩm yêu thích, chuyển sang giỏ hàng.
- **Thanh toán**: form địa chỉ giao hàng, chọn COD hoặc chuyển khoản, giá được tính lại phía server, trang "đã nhận đơn", tra cứu đơn bằng mã đơn + số điện thoại.
- **Tài khoản khách hàng**: đăng ký, đăng nhập, quên mật khẩu, cập nhật thông tin, lịch sử đơn hàng; tuỳ chọn tạo tài khoản ngay khi thanh toán. Mật khẩu băm scrypt, phiên đăng nhập ký HMAC.
- **Nội dung**: trang "Về chúng tôi & liên hệ" (`/ve-chung-toi/`), trang "Chi phí vận chuyển" (`/van-chuyen/`, bảng do admin quản lý, cũng hiện ở tab trên trang sản phẩm), trang tĩnh (hướng dẫn đặt hàng, chính sách đổi trả, chính sách bảo mật), blog "Góc chia sẻ" với bình luận.
- **Giao diện (UI v2, kiểu sesofoods.com)**: chữ Roboto tự host (không phụ thuộc Google Fonts), thanh liên hệ màu kem + header dính có menu "Danh mục" thả xuống 3 cột, ô tìm kiếm tròn, icon tài khoản/yêu thích/giỏ với badge đỏ; thẻ sản phẩm viền mỏng với nhãn "-x%" / "Mới" / "Hết hàng", nút bo tròn; trang danh mục có cột trái danh mục; trang sản phẩm 2 cột (gallery vuông + khối giá/số lượng/CTA + hộp COD, bill Nhật, Zalo), tab Mô tả/Đánh giá dạng pill; footer xám nhạt 5 cột. Tông xanh nước biển (ocean blue) và logo LienStore giữ nguyên; màu sắc gom trong token `--lien-*` ở `src/app/globals.css`. Responsive cho điện thoại và máy tính.
- **Khác**: responsive theo breakpoint gốc, thanh liên hệ (hotline VN/JP, email, địa chỉ, giờ mở cửa), icon Facebook/Zalo/Messenger, chat Messenger tuỳ chọn, PWA manifest, robots.txt, sitemap.xml, trang 404.

### Trang quản trị `/admin/`
- Đăng nhập admin bằng tài khoản cấu hình qua biến môi trường.
- **Dashboard**: số sản phẩm, đang bán, hết hàng, đơn hàng, chờ xử lý, doanh thu, khách hàng.
- **Sản phẩm**: danh sách có lọc/tìm, thêm, sửa, xoá, ảnh, giá, tồn kho, danh mục, tag, trạng thái nháp/đăng. Cột **giá vốn** và **lợi nhuận** (số tiền + % biên) trên từng dòng, tổng vốn tồn kho và lợi nhuận tồn kho ở đầu trang; giá vốn không bao giờ hiển thị ra cửa hàng.
- **Excel**: `npm run xlsx:export` xuất catalogue ra Excel, điền tay hoặc giao Claude điền, `npm run xlsx:import` nhập lại (tạo/cập nhật sản phẩm, danh mục mới, tải ảnh URL). Xem [docs/EXCEL_IMPORT.md](docs/EXCEL_IMPORT.md).
- **Danh mục**: thêm, sửa (đổi slug tự cập nhật sản phẩm), xoá, ảnh và mô tả.
- **Đơn hàng**: danh sách theo trạng thái, chi tiết đơn, đổi trạng thái (chờ xử lý → đang xử lý → hoàn thành / huỷ), ghi chú nội bộ, **đính kèm bill mua hàng tại Nhật** (ảnh/PDF) để khách xem lại trong trang đơn hàng.
- **Khách hàng**: danh sách khách có tài khoản và khách vãng lai (gộp theo email/điện thoại), số đơn, tổng chi tiêu; trang chi tiết liệt kê từng đơn với sản phẩm đã mua và trạng thái đã gửi bill.
- **Kho hàng**: tồn kho, sắp hết, hết hàng, không theo dõi; cập nhật tồn và mức tối thiểu ngay trên bảng; **danh sách cần đặt hàng** tính từ các đơn đang mở trừ tồn kho, kèm link mua (Amazon JP) và xuất CSV.
- **Vận chuyển** (`/admin/shipping/`): quản lý các phương thức vận chuyển (Nhật → Việt Nam, nội địa…) và các khu vực/cột của bảng phí (phí thường, đơn vị, miễn phí trên, phụ phí, khu vực, thời gian, ẩn/hiện), lưu ý vận chuyển; xem trước như khách thấy.
- **Người dùng & phân quyền** (`/admin/users/`): tạo, sửa (email, tên, điện thoại, địa chỉ), đặt lại mật khẩu, khoá, xoá tài khoản; vai trò Quản trị viên / Nhân viên (chọn module được phép) / Khách hàng. Nhân viên và quản trị viên đăng nhập trang quản trị bằng tên đăng nhập (ID) + mật khẩu (email tuỳ chọn); tài khoản trong `ADMIN_USER`/`ADMIN_PASSWORD` là chủ cửa hàng, toàn quyền với mọi tài khoản.
- **Danh mục phân cấp**: danh mục cha/con nhiều cấp; menu, trang chủ, cột trái, footer hiển thị theo cây; trang danh mục cha gộp sản phẩm của danh mục con.
- **Đồng bộ dữ liệu prod → dev**: `GET /api/admin/export` xuất catalogue của server; `npm run sync:prod -- https://linconnn.io.vn admin <mật-khẩu>` kéo về `data/seed.json` kèm ảnh upload.
- **Ảnh sản phẩm**: tải ảnh từ máy ngay trong form (tự thu nhỏ về 1200px + thumbnail 300×300), thêm bằng URL, sắp thứ tự, đặt ảnh đại diện, xoá; file lưu trong thư mục dữ liệu, phục vụ qua `/api/files/…`.

### Vận hành
- **Một image Docker tự chứa**: Next.js standalone + seed catalogue; lần chạy đầu tự tạo DB SQLite, chạy migration và nhập 120 sản phẩm mẫu. Không cần MySQL/Postgres.
- **Schema có phiên bản**: migration khai báo trong mã, tự nâng cấp khi khởi động image mới. `GET /api/health/` trả trạng thái và phiên bản schema.
- **CI/CD**: GitHub Actions kiểm tra lint/typecheck/build và smoke test image; gắn tag `vX.Y.Z` sẽ build image đa kiến trúc lên GitHub Container Registry và (tuỳ chọn) redeploy TrueNAS qua SSH.
- **TrueNAS SCALE**: file YAML sẵn cho Custom App, script build image ngay trên NAS, hướng dẫn Cloudflare Tunnel.

## Kiến trúc

```
Trình duyệt ──► Next.js 16 (App Router, React 19, Tailwind v4)
                 ├─ Server Components  đọc dữ liệu
                 ├─ Server Actions     ghi dữ liệu (đặt hàng, tài khoản, admin)
                 └─ src/lib/db.ts ──► src/lib/sqlite.ts ──► SQLite  data/lienstore.db
                                                              (schema + migrations, seed từ data/seed.json)
```

| Lớp | Công nghệ |
| --- | --- |
| Frontend | Next.js 16.3 App Router, React 19, TypeScript strict, Tailwind CSS v4, FontAwesome 4.7 tự host |
| Backend | Server Actions, Route Handler `/api/health/`, cookie HMAC cho admin và khách hàng |
| Database | SQLite qua `node:sqlite` (Node 24, không cần build native), WAL mode |
| Đóng gói | Docker multi-stage (`node:24-slim`), user không phải root, healthcheck |
| Hạ tầng | TrueNAS SCALE Custom App, Cloudflare Tunnel, GitHub Actions + GHCR |

Chi tiết: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · Triển khai: [docs/DEPLOY.md](docs/DEPLOY.md) · TrueNAS nhanh: [deploy/README.md](deploy/README.md) · Excel: [docs/EXCEL_IMPORT.md](docs/EXCEL_IMPORT.md)

## Chạy trên máy dev

Yêu cầu Node.js 24 (xem `.nvmrc`).

```bash
npm ci
cp .env.example .env.local      # sửa ADMIN_PASSWORD, ADMIN_SESSION_SECRET
npm run dev                      # http://localhost:3000  — admin: /admin/login/
```

Lần chạy đầu ứng dụng tạo `data/lienstore.db` và nhập `data/seed.json`. Các lệnh hữu ích:

| Lệnh | Tác dụng |
| --- | --- |
| `npm run check` | lint + typecheck + build |
| `npm run db:export` | xuất catalogue từ DB đang chạy ra `data/seed.json` (`-- --all file.json` để backup kèm khách hàng, đơn hàng) |
| `npm run db:reset` | xoá DB local, lần chạy sau seed lại |
| `npm run xlsx:export -- file.xlsx` / `xlsx:import -- file.xlsx` | vòng Excel: xuất catalogue, nhập lại sau khi điền (cần Python + `pip install -r scripts/xlsx/requirements.txt`) |
| `npm run docker:build` / `docker:run` | build và chạy image local |

## Biến môi trường

| Biến | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `ADMIN_USER` / `ADMIN_PASSWORD` | `admin` / `admin123` (chỉ dev) | tài khoản trang quản trị |
| `ADMIN_SESSION_SECRET` | ngẫu nhiên mỗi lần chạy | khoá ký cookie admin, cần đặt cố định khi chạy thật |
| `LIEN_DB_PATH` | `data/lienstore.db` | file SQLite (`/app/data/lienstore.db` trong container) |
| `LIEN_SEED_PATH` | `data/seed.json` | seed nhập khi DB trống |
| `LIEN_SEED_SYNC` | `add` | đồng bộ seed mới vào DB đang có: `add` chèn thiếu, `update` ghi đè các dòng có trong seed (Excel là nguồn sự thật), `overwrite` thay catalogue, `off` tắt |
| `LIEN_UPLOAD_DIR` | `<thư mục DB>/uploads` | nơi lưu ảnh sản phẩm tải lên và bill đơn hàng (`/app/data/uploads` trong container) |
| `LIEN_MIN_STOCK` | `2` | mức tồn tối thiểu mặc định để cảnh báo sắp hết |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | URL công khai cho robots/sitemap |
| `NEXT_PUBLIC_FB_PAGE_ID` | rỗng | bật chat Messenger |

## Triển khai lên TrueNAS

```bash
# Cách A: build ngay trên NAS (không cần registry)
sh deploy/truenas-build.sh /mnt/<pool>/lienstore/src        # tạo image lienstore:local
# rồi Apps → Discover Apps → ⋮ → Install via YAML → dán deploy/truenas-app.local.yaml

# Cách B: dùng image từ GHCR do release.yml tạo khi gắn tag
npm run release -- minor                                     # → ghcr.io/ducanhle92/lienstore:<ver> + :latest
# rồi Install via YAML → deploy/truenas-app.yaml
```

Cổng LAN mặc định `30080`, DB nằm ở `/mnt/<pool>/lienstore/data`. Ra internet qua Cloudflare Tunnel: Public Hostname `dev.linconnn.io.vn` → `http://<ip-nas>:30080`.

## Đánh phiên bản

SemVer, tag `vMAJOR.MINOR.PATCH`. Quy trình đưa bản mới lên prod gồm một lệnh:

```bash
npm run release -- minor      # hoặc patch | major | 1.7.0 ; thêm --dry-run để xem trước
```

Lệnh kiểm tra cây làm việc sạch và đang ở `main`, tăng version trong `package.json`, chuyển mục *Unreleased* của [CHANGELOG.md](CHANGELOG.md) thành mục phiên bản, commit, tag và push. Workflow **Release** không build lại: nó gắn thêm tag `X.Y.Z` / `latest` cho đúng image CI đã build và đang chạy trên dev (`sha-<commit>`), kiểm tra `/api/health/` báo đúng version, rồi tạo GitHub Release. Cron trên TrueNAS thấy `:latest` đổi → backup DB → redeploy prod. Chi tiết và cách quay lại bản cũ: [docs/DEPLOY.md](docs/DEPLOY.md) §4c.

## Cấu trúc thư mục

```
src/app/                 routes (trang chủ, shop, product, cart, checkout, my-account, admin, api)
src/components/sites/lienstore/
  root-8a5edab2/         header, top bar, slider, footer, dữ liệu tĩnh trang chủ (liên hệ, menu, logo)
  shop/                  giỏ hàng, checkout, listing, quick view, search, account, sidebar…
  admin/                 form và bảng quản trị
  shared/                icon FontAwesome, icon thương hiệu (Zalo, Messenger, TikTok…)
src/lib/                 db.ts (truy cập dữ liệu), sqlite.ts (schema/migration/seed), auth, customer-auth
data/seed.json           catalogue mẫu; data/lienstore.db được tạo khi chạy (không commit)
public/sites/lienstore/  ảnh sản phẩm, ảnh trang chủ, font, bộ logo thương hiệu
deploy/                  YAML TrueNAS, script build trên NAS, script đẩy source
scripts/xlsx/            xuất/nhập catalogue qua Excel (Python)
.github/workflows/       ci.yml (lint/typecheck/build/smoke), release.yml (tag → GHCR → TrueNAS)
```

## Giấy phép

Mã nguồn khởi tạo từ [ai-website-cloner-template](https://github.com/JCodesMore/ai-website-cloner-template) (MIT). Xem [LICENSE](LICENSE).
