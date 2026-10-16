# Nhóm biến thể (quy tắc bắt buộc)

Áp dụng khi agent / admin gộp sản phẩm thành **nhóm biến thể** (variant family). Tham chiếu UI: Admin › Sản phẩm › Nhóm biến thể; mẫu đúng: **DHC**, **BCL AHA Cleansing Research**.

> **RAG / agent memory:** mọi chat khi tạo hoặc sửa nhóm biến thể **phải** đọc file này. Cấp 1 bắt buộc là loại sản phẩm khách hiểu được — xem §2.

## Nguyên tắc

1. **Một hãng / một dòng thương hiệu = một nhóm biến thể**  
   Không tạo nhiều nhóm riêng lẻ cho từng dòng con (sai: `Kobayashi Shoyo`, `Kobayashi Attonon`, `Kobayashi Netsusama`… tách 4 nhóm).  
   Đúng: một nhóm **`Kobayashi`**, bên trong phân cấp bằng thuộc tính.

2. **Cấp 1 = loại sản phẩm khách hiểu ngay** (bắt buộc)  
   Khách chọn cấp 1 trước trên trang SP. Giá trị cấp 1 phải trả lời câu *“đây là cái gì?”* bằng tiếng Việt thường dùng — **không** dùng mã dòng / tên thương hiệu phụ mà KH chưa biết.

   | Sai (KH không hiểu) | Đúng |
   | --- | --- |
   | Uru Up | Bột collagen |
   | Xylitol | Kẹo cao su |
   | Premium Ghana | Chocolate |
   | Hohoemi / Step | Sữa bột Hohoemi / Sữa bột Step |
   | Attonon EX | Kem trị sẹo Attonon |
   | Savas Whey Protein 100 | *(ổn — đã có “Whey Protein”)* |

   Nhãn cấp điển hình vẫn là **Dòng → Loại → Quy cách**, nhưng **nội dung** cấp 1 phải là loại SP (+ tên dòng nếu cần để phân biệt), cấp 2 mới là biến thể trong loại (vị / dạng / dòng con), cấp 3 là size / số viên.

   Ví dụ Lotte:

   | Cấp 1 (Dòng) | Cấp 2 (Loại) | Cấp 3 (Quy cách) |
   | --- | --- | --- |
   | Bột collagen | Uru Up | 185g |
   | Kẹo cao su | Xylitol 7 vị trái cây | Hũ 133g |
   | Chocolate | Ghana Matcha Uji | 45g |
   | Chocolate | Premium Ghana Whip Vanilla | 56g |

3. **Phân loại bằng cấp thuộc tính (cha → con), không bằng nhiều nhóm**  
   Tối đa vài cấp (thường 2–3):
   - **Cấp 1 – Dòng**: *loại sản phẩm* KH hiểu (Bột collagen, Kẹo cao su, Kem đánh răng Shoyo…)
   - **Cấp 2 – Loại**: biến thể trong loại (vị, Gel/Cream, Người lớn/Trẻ em…)
   - **Cấp 3 – Quy cách**: size / số viên / dung tích (95g / 100g; 420 / 840 viên)

4. **Cây phân nhánh trên trang nhóm phải đọc được**  
   Khách chọn cấp 1 trước, rồi cấp 2 (chỉ các mức thuộc nhánh đã chọn), rồi cấp 3 nếu có — giống BCL AHA.

5. **Không nhét hãng khác nhau vào một nhóm**  
   Chỉ gộp sản phẩm cùng thương hiệu (hoặc cùng dòng chính thức của hãng). Anessa ≠ Kobayashi.

6. **Sản phẩm đơn lẻ thật sự** (không có anh/chị em cùng hãng trên catalogue) mới để độc lập — còn lại đưa vào nhóm hãng.

## Kiểm tra nhanh trước khi lưu

- [ ] Đọc to cấp 1: người lạ có biết đây là *cái gì* không? (không phải chỉ biết tên dòng nội địa Nhật)
- [ ] Cùng một loại SP (vd Chocolate) dùng cùng một giá trị cấp 1; phân biệt bằng cấp 2
- [ ] Thanh/Lon/Tuổi… không đặt ở cấp 1 nếu làm lệch sang nhóm SP khác (vd sữa bột mẹ-và-bé vs protein)
- [ ] Cây phân nhánh admin không còn nhánh “(chưa điền)” thừa

## Việc cần làm khi “rà nhóm / gom biến thể”

1. Tìm mọi SP cùng hãng (tên / SKU / tag).
2. Nếu đã có nhiều nhóm nhỏ cùng hãng → **gộp vào một nhóm**, đặt tên chung = tên hãng (vd `Kobayashi`), mã nhóm vd `KOBAYASHI`.
3. Đặt thuộc tính cấp 1–3 theo §2–3; điền giá trị từng SP; kiểm tra “Cây phân nhánh”.
4. Xoá các nhóm cũ đã trống sau khi chuyển hết thành viên.

## Ví dụ cấu trúc (Kobayashi)

| Cấp 1 (Dòng) | Cấp 2 (Loại) | Cấp 3 (Quy cách) |
| --- | --- | --- |
| Kem đánh răng Shoyo | Không hạt mài (xanh) | 95g |
| Kem đánh răng Shoyo | Chăm sóc ê buốt (hồng) | 100g |
| Kem trị sẹo Attonon | Gel EX | 15g |
| Kem trị sẹo Attonon | Kem (Cream) EX | 15g |
| Miếng hạ sốt Netsusama | Người lớn | 16 miếng |
| Miếng hạ sốt Netsusama | Trẻ em | 16 miếng |
| Viên Inochi no Haha A | Tiền mãn kinh | 420 viên / 840 viên |

## Liên quan

- Admin UI: `/admin/products/groups/`
- CLI: nhóm biến thể chưa ghi qua Admin API v1 (`groupId` chỉ đọc) — thao tác gộp/sửa cấp vẫn qua admin web cho đến khi API hỗ trợ ghi.
- Audit script: `node tools/audit-variant-groups.mjs` → `/tmp/variant-groups-audit.json`
