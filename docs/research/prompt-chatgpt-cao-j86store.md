# Prompt cho ChatGPT (chế độ duyệt web / Agent) — cào tên & giá sản phẩm j86store.com

Dán nguyên khối dưới đây vào ChatGPT (bật duyệt web hoặc Agent mode). Kết quả là 1 file CSV để đối chiếu với linconnn.io.vn bằng `node scripts/compare-j86store.mjs <file.csv>`.

---

Bạn là trợ lý thu thập dữ liệu. Nhiệm vụ: lấy **tên và giá của toàn bộ sản phẩm** trên website https://j86store.com/ (WooCommerce, tiếng Việt) và trả về **một file CSV** để tôi đối chiếu giá với cửa hàng của tôi.

## Cách lấy danh sách sản phẩm
1. Mở sitemap sản phẩm: https://j86store.com/wp-sitemap-posts-product-1.xml — mỗi thẻ `<loc>` là một URL dạng `https://j86store.com/product/<slug>/`. Hiện có khoảng 120 URL. Nếu sitemap có thêm trang `wp-sitemap-posts-product-2.xml` thì lấy tiếp.
2. Nếu không mở được sitemap, thay bằng cách duyệt từng danh mục tại https://j86store.com/wp-sitemap-taxonomies-product_cat-1.xml và lật hết các trang `/page/2/`, `/page/3/`… của mỗi danh mục; gom tất cả link `/product/…/` rồi loại trùng.

## Cách lấy dữ liệu từng sản phẩm
Mở từng URL sản phẩm và lấy:
- **Tên**: thẻ `<h1 class="product_title">`, hoặc trường `name` trong JSON-LD `@type: Product`.
- **Giá bán** (VNĐ): ưu tiên `offers[0].price` trong JSON-LD (số nguyên, ví dụ `260000`). Nếu không có, lấy chữ trong `<p class="price">` (ví dụ `260.000 VNĐ` → ghi `260000`). Nếu có 2 giá (gạch ngang + giá mới) thì giá gạch ngang là **giá gốc**, giá còn lại là **giá bán**. Nếu là khoảng giá `a – b` thì ghi giá thấp nhất vào giá bán và ghi khoảng giá vào cột ghi chú.
- **Tình trạng**: chữ trong `<p class="stock">` (ví dụ `còn 20 hàng`, `Hết hàng`) hoặc `offers[0].availability` (InStock / OutOfStock).
- **Danh mục**: dòng `Danh mục:` (`span.posted_in`), nhiều danh mục cách nhau bằng ` | `.
- **Ngày cập nhật**: nếu sitemap có `<lastmod>` thì ghi lại, không có thì để trống.

## Quy tắc bắt buộc
- KHÔNG bịa dữ liệu. Sản phẩm không mở được hoặc không thấy giá → vẫn giữ dòng đó, để trống giá và ghi lý do vào cột `ghi_chu` (ví dụ `404`, `không thấy giá`).
- Giá ghi **số nguyên không dấu chấm, không đơn vị** (`260000`, không phải `260.000 VNĐ`).
- Giữ nguyên tên sản phẩm (có dấu tiếng Việt), không viết tắt, không sửa chính tả.
- Không bỏ sót: số dòng CSV phải bằng số URL trong sitemap. Cuối cùng in ra: tổng URL, số dòng có giá, số dòng lỗi.
- Không truy cập trang giỏ hàng/tài khoản, không gửi form, không đặt hàng. Tải chậm vừa phải (1 trang/giây) để không làm nặng web của họ.

## Định dạng file kết quả
File `j86store-gia-YYYY-MM-DD.csv`, mã hoá **UTF-8 có BOM**, phân cách bằng dấu phẩy, có dòng tiêu đề đúng thứ tự sau:

```
url,slug,ten_san_pham,gia_ban_vnd,gia_goc_vnd,tinh_trang,danh_muc,ngay_cap_nhat,ghi_chu
```

Ví dụ một dòng:

```
https://j86store.com/product/lion-pair-acne-cream-w-14g/,lion-pair-acne-cream-w-14g,Lion Pair Acne Cream W Kem Trị Mụn 14g,260000,,còn 20 hàng,TRỊ MỤN ( ACNE TREATRMENT ),2023-06-03,
```

- `slug` = phần cuối của URL (giữa `/product/` và dấu `/` cuối).
- Ô có dấu phẩy phải đặt trong dấu ngoặc kép.
- Cho tôi tải file CSV về (không chỉ in ra màn hình). Nếu công cụ không cho tạo file, in toàn bộ nội dung CSV trong **một** khối mã duy nhất.

Sau khi xong, trả lời ngắn gọn: số sản phẩm lấy được, số lỗi, và 5 sản phẩm có giá cao nhất.

---

## Sau khi có file
1. Lưu file vào `docs/reports/` (hoặc bất kỳ đâu) rồi chạy:
   ```
   node scripts/compare-j86store.mjs "đường/dẫn/j86store-gia-2026-09-14.csv"
   ```
2. Script khớp sản phẩm theo `slug` (catalogue của LienStore khởi tạo từ j86store nên 112/120 slug trùng), sau đó theo tên đã chuẩn hoá; xuất `docs/reports/so-sanh-j86store-<ngày>.csv` gồm giá hai bên, chênh lệch (đ và %), giá vốn ¥ và lãi ước tính của mình, cùng mức độ tin cậy của phép khớp.
