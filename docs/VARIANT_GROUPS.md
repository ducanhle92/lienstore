# Nhóm biến thể (quy tắc bắt buộc)

Áp dụng khi agent / admin gộp sản phẩm thành **nhóm biến thể** (variant family). Tham chiếu UI: Admin › Sản phẩm › Nhóm biến thể; mẫu đúng: **DHC**, **BCL AHA Cleansing Research**.

## Nguyên tắc

1. **Một hãng / một dòng thương hiệu = một nhóm biến thể**  
   Không tạo nhiều nhóm riêng lẻ cho từng dòng con (sai: `Kobayashi Shoyo`, `Kobayashi Attonon`, `Kobayashi Netsusama`… tách 4 nhóm).  
   Đúng: một nhóm **`Kobayashi`**, bên trong phân cấp bằng thuộc tính.

2. **Phân loại bằng cấp thuộc tính (cha → con), không bằng nhiều nhóm**  
   Tối đa vài cấp (thường 2–3), ví dụ:
   - **Cấp 1 – Dòng**: dòng sản phẩm trong hãng (Kem đánh răng Shoyo, Attonon EX, Netsusama Sheet…)
   - **Cấp 2 – Loại**: biến thể trong dòng (Gel / Cream; Người lớn / Trẻ em; Không hạt mài / Ê buốt…)
   - **Cấp 3 – Quy cách**: size / số viên / dung tích khi còn khác nhau (95g / 100g; 420 / 840 viên)

3. **Cây phân nhánh trên trang nhóm phải đọc được**  
   Khách trên web chọn cấp 1 trước, rồi cấp 2 (chỉ các mức thuộc nhánh đã chọn), rồi cấp 3 nếu có — giống BCL AHA (`Dòng` → `Loại` → `Khối lượng`).

4. **Không nhét hãng khác nhau vào một nhóm**  
   Chỉ gộp sản phẩm cùng thương hiệu (hoặc cùng dòng chính thức của hãng). Anessa ≠ Kobayashi.

5. **Sản phẩm đơn lẻ thật sự** (không có anh/chị em cùng hãng trên catalogue) mới để độc lập — còn lại đưa vào nhóm hãng.

## Việc cần làm khi “rà nhóm / gom biến thể”

1. Tìm mọi SP cùng hãng (tên / SKU / tag).
2. Nếu đã có nhiều nhóm nhỏ cùng hãng → **gộp vào một nhóm**, đặt tên chung = tên hãng (vd `Kobayashi`), mã nhóm vd `KOBAYASHI`.
3. Đặt thuộc tính cấp 1–3 như trên; điền giá trị từng SP; kiểm tra “Cây phân nhánh”.
4. Xoá các nhóm cũ đã trống sau khi chuyển hết thành viên.

## Ví dụ cấu trúc (Kobayashi)

| Cấp 1 (Dòng) | Cấp 2 (Loại) | Cấp 3 (Quy cách) |
| --- | --- | --- |
| Kem đánh răng Shoyo | Không hạt mài (xanh) | 95g |
| Kem đánh răng Shoyo | Chăm sóc ê buốt (hồng) | 100g |
| Attonon EX | Gel | 15g |
| Attonon EX | Kem (Cream) | 15g |
| Netsusama Sheet | Người lớn | 16 miếng |
| Netsusama Sheet | Trẻ em | 16 miếng |
| Inochi no Haha A | Tiền mãn kinh | 420 viên / 840 viên |
| … | … | … |

## Liên quan

- Admin UI: `/admin/products/groups/`
- CLI: nhóm biến thể chưa ghi qua Admin API v1 (`groupId` chỉ đọc) — thao tác gộp/sửa cấp vẫn qua admin web cho đến khi API hỗ trợ ghi.
