# Quy ước mã SKU

`THƯƠNG HIỆU - DANH MỤC - THÁNG NHẬP - MÃ SẢN PHẨM`  →  ví dụ **LION-TM-2609-0173**

| Phần | Ý nghĩa | Cách sinh |
|---|---|---|
| `LION` | Thương hiệu (2–4 chữ) | Chữ đầu của tên sản phẩm nếu là tên hãng (DHC, LION, SHIS, KOSE); nếu tên bắt đầu bằng từ chung (Viên, Kem, Dầu…) thì lấy từ "Thương hiệu" trong mô tả; không có thì `SP` |
| `TM` | Danh mục | Chữ cái đầu các từ trong slug danh mục đầu tiên: `tri-mun` → TM, `thuc-pham-chuc-nang` → TPCN, `duong-da-mat` → DDM |
| `2609` | Tháng nhập (YYMM) | Tháng sản phẩm được thêm vào catalogue |
| `0173` | Mã sản phẩm | ID sản phẩm trong hệ thống, 4 chữ số — luôn duy nhất, tra ngược được |

- Sinh tự động: Kho hàng › Sản phẩm › **Tạo SKU cho N sp chưa có**; trang sửa sản phẩm gợi ý mã và cho bấm "Dùng mã đề xuất".
- Không dùng kho lưu trữ / size / màu trong mã vì cửa hàng hiện chưa quản lý biến thể; khi cần có thể thêm hậu tố `-XL-BL`.
- Mã đã sinh có thể sửa tay; tìm kiếm theo SKU có ở Sản phẩm, Tồn kho, Quản lý mua hàng và file CSV cần mua.
