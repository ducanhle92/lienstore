# Triển khai LienStore lên TrueNAS SCALE (bản test)

Image Docker **tự chứa toàn bộ**: mã nguồn đã build + catalogue mẫu (`data/seed.json`). Lần chạy đầu, app tạo file SQLite `/app/data/lienstore.db`, chạy migration schema và nhập 120 sản phẩm / 20 danh mục / trang tĩnh / bài viết. Không cần cài DB riêng. Gắn `/app/data` vào dataset để giữ đơn hàng, tài khoản, chỉnh sửa admin khi nâng cấp image.

Có hai cách đưa image lên NAS. **Cách B** không cần GitHub/registry, phù hợp để test ngay.

## Chuẩn bị trên TrueNAS (làm một lần)

1. **Datasets → Add Dataset**: `<pool>/apps/lienstore` (Share Type: *Apps*).
2. **System → Services → SSH**: bật, cho phép user admin đăng nhập bằng password hoặc key.
3. Mở **Shell** (hoặc SSH) và chạy:

   ```sh
   mkdir -p /mnt/<pool>/apps/lienstore/data /mnt/<pool>/apps/lienstore/src
   chown -R 1000:1000 /mnt/<pool>/apps/lienstore
   openssl rand -hex 32        # copy chuỗi này làm ADMIN_SESSION_SECRET
   ```

   (uid 1000 là user `node` trong image; nếu thiếu bước chown, container sẽ báo lỗi không ghi được DB.)

## Cách B — build image ngay trên NAS (khuyên dùng để test)

1. Trên máy Windows, trong thư mục dự án, đẩy mã nguồn lên NAS (bỏ qua `node_modules`, `.next`, DB local):

   ```powershell
   .\deploy\push-source-to-truenas.ps1 -NasHost <ip-truenas> -User truenas_admin -Dest /mnt/<pool>/apps/lienstore/src
   ```

   Hoặc nếu đã đưa code lên GitHub: `ssh truenas_admin@<ip> "git clone https://github.com/<owner>/lienstore /mnt/<pool>/apps/lienstore/src"`.

2. Build image trên NAS (khoảng 3–6 phút lần đầu; script tự chạy smoke test trên cổng 30081):

   ```sh
   ssh truenas_admin@<ip-truenas> "sh /mnt/<pool>/apps/lienstore/src/deploy/truenas-build.sh /mnt/<pool>/apps/lienstore/src"
   ```

   Kết quả mong đợi: `healthy: {"ok":true,"version":"…","db":{"engine":"sqlite","schemaVersion":1,…},"products":120,…}`.

3. **Apps → Discover Apps → ⋮ (góc phải) → Install via YAML**. Dán nội dung [`truenas-app.local.yaml`](./truenas-app.local.yaml), sửa:
   - `<pool>` → tên pool thật (2 chỗ: volume).
   - `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`.
   - `NEXT_PUBLIC_SITE_URL` → `http://<ip-truenas>:30080` (hoặc `https://linconnn.io.vn` nếu đã có tunnel).
   Đặt tên app `lienstore` → Save.

4. Mở `http://<ip-truenas>:30080`. Trang admin: `/admin/` (user `admin`, mật khẩu vừa đặt). Kiểm tra `http://<ip-truenas>:30080/api/health/`.

5. Ra internet: Cloudflare Zero Trust → Tunnel → Public Hostname `linconnn.io.vn` → cổng của app prod (đã hướng dẫn trong `docs/DEPLOY.md`).

**Nâng cấp bản mới**: chạy lại bước 1 và 2, rồi Apps → lienstore → ⋮ → *Restart* (hoặc Stop/Start). DB nằm trong dataset nên dữ liệu giữ nguyên; migration mới (nếu có) tự chạy khi khởi động.

## Cách A — image từ GitHub Container Registry

Đẩy code lên GitHub, gắn tag `v1.x.y` (`npm version minor && git push --follow-tags`) → workflow `release.yml` build image đa kiến trúc và đẩy lên `ghcr.io/<owner>/lienstore`. Trên TrueNAS dùng [`truenas-app.yaml`](./truenas-app.yaml) (sửa `<owner>`, `<pool>`, mật khẩu). Nếu package ở chế độ private: Apps → Settings → Manage Container Images → thêm registry `ghcr.io` với Personal Access Token có quyền `read:packages`.

## Dữ liệu, backup, reset

| Việc | Cách làm |
| --- | --- |
| Xem DB | `/mnt/<pool>/apps/lienstore/data/lienstore.db` (SQLite, kèm file `-wal`/`-shm` khi đang chạy) |
| Backup | Bật *Periodic Snapshot Task* cho dataset `apps/lienstore` (ví dụ mỗi ngày, giữ 30 bản). Muốn copy tay: Stop app rồi copy `lienstore.db` (WAL đã được gộp khi đóng). Khôi phục = chép file `.db` trở lại rồi Start |
| Reset về catalogue mẫu | Stop app → xoá `lienstore.db*` trong dataset → Start (app seed lại từ `seed.json` trong image) |
| Đổi catalogue mẫu | Chỉnh sửa trong admin ở máy dev → `npm run db:export` → commit `data/seed.json` → build image mới |

## Sự cố thường gặp

- **Container restart liên tục, log báo `not writable`** → chưa `chown -R 1000:1000` dataset.
- **`pull access denied` khi dùng Cách B** → thiếu `pull_policy: never` hoặc tên image khác `lienstore:local`.
- **Trang mở được nhưng ảnh sản phẩm lỗi** → `NEXT_PUBLIC_SITE_URL` không ảnh hưởng ảnh; kiểm tra image có thư mục `public/sites/lienstore` (build từ đúng source).
- **Đăng nhập admin bị văng sau restart** → chưa đặt `ADMIN_SESSION_SECRET` cố định.
