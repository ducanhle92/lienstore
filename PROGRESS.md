# Tiến độ
## Deploy bản sửa CSV cần mua — 2026-10-15
- User yêu cầu deploy. Nhánh `fix/purchase-csv-release` tách từ origin/main v2.34.1, chỉ lấy bản sửa CSV (không lấy API/CLI đang làm dở).
- Đã thêm route `/admin/purchases/export/` và kiểm thử hồi quy; không thay đổi dữ liệu kho/đơn.
- Tiếp theo: lint + build + tests; merge main, push, chờ CI xanh, `npm run release -- patch`; theo dõi Release.

## Mục tiêu
Admin ⓪ Sản phẩm: thanh lọc một hàng, bỏ bộ chuyển trang phía trên bảng để bảng hiện nhiều dòng hơn.
## Đã xong
- [x] Thanh lọc `flex-nowrap`, các select `min-w-0` để co lại (src/app/admin/products/page.tsx)
- [x] Bỏ pager trên; dòng "Hiện x–y / n sản phẩm" chuyển xuống cạnh pager dưới
- [x] Lint + typecheck pass; ghi CHANGELOG [Unreleased]
## Đang làm
- (không)
## Tiếp theo
- [ ] (chờ yêu cầu mới)
- [x] Đã lên prod v2.25.1 (health check xác nhận)
## Ghi chú / quyết định
- Nhánh: fix/products-filter-one-row
