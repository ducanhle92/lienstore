# Quản lý catalogue bằng Excel (xuất → điền → nhập)

Luồng làm việc khi muốn bổ sung/sửa hàng loạt sản phẩm, giá, giá vốn, danh mục, ảnh mà không phải bấm từng sản phẩm trong admin:

```
npm run xlsx:export -- "D:\lienstore-san-pham.xlsx"   # 1. xuất toàn bộ catalogue ra Excel
   → mở file, tự điền hoặc giao cho Claude (Opus) trong Excel điều tra & điền
npm run xlsx:import -- "D:\lienstore-san-pham.xlsx"   # 2. nhập lại vào data/seed.json (+ tải ảnh URL về public/)
npm run dev                                           # 3. kiểm tra trên máy dev (seed sync tự cập nhật DB local)
git commit -am "data: ..." && npm version minor && git push --follow-tags   # 4. phát hành → prod tự đồng bộ
```

Yêu cầu Python 3.10+ với `pip install -r scripts/xlsx/requirements.txt`.

## Cấu trúc file Excel (hợp đồng nhập liệu)

Sheet **`Sản phẩm`** — script đọc theo **tên cột**, thứ tự không quan trọng:

| Cột | Bắt buộc | Quy tắc |
| --- | --- | --- |
| `ID` | | Giữ nguyên với sản phẩm cũ. Dòng mới để trống. |
| `Tên sản phẩm *` | ✔ | |
| `Đường dẫn (slug)` | | Trống → tạo từ tên. Không đổi slug sản phẩm cũ. |
| `Danh mục *` | ✔ | Tên đúng như sheet `Danh mục`, nhiều danh mục cách nhau bằng `;`. |
| `Giá bán (VNĐ) *` | ✔ để bán | Số nguyên, ví dụ `350000`. Thiếu → sản phẩm bị ép về Bản nháp. |
| `Giá gốc (VNĐ)` | | Chỉ khi đang giảm giá, phải lớn hơn giá bán. `-` để xoá. |
| `Giá vốn (VNĐ)` | | Giá nhập; chỉ hiện trong admin để tính lợi nhuận. `-` để xoá. |
| `Mã SKU`, `Tồn kho`, `Hết hàng (x)` | | Tồn kho trống = không theo dõi. |
| `Trạng thái` | | `Đang bán` hoặc `Bản nháp`. |
| `Từ khóa` | | Cách nhau bằng `,`. |
| `Ảnh` | | Mỗi ảnh một dòng (Alt+Enter) hoặc `;`. URL http(s) được tải về `public/sites/lienstore/shared/products/import/`; đường dẫn `/sites/...` giữ nguyên. Ảnh đầu = ảnh đại diện. |
| `Mô tả ngắn (HTML)`, `Mô tả chi tiết (HTML)` | | HTML đơn giản: `<p>`, `<ul><li>`, `<strong>`, `<br>`. |

Sheet **`Danh mục`**: `Tên danh mục *`, `Slug`, `Mô tả`, `Ảnh`. Thêm dòng để tạo danh mục mới (script tạo trước khi gán sản phẩm).

Ô trống **không xoá** giá trị đang có. Script không bao giờ xoá sản phẩm; muốn ẩn thì đặt `Bản nháp`.

## Prompt giao cho Claude (Opus) trong Excel

Mở file vừa xuất trong Excel có add-in Claude, chọn model Opus, dán:

```
Bạn đang làm việc trên workbook catalogue của cửa hàng LienStore (hàng Nhật nội địa). Sheet "Sản phẩm" có 258 dòng,
sheet "Danh mục" là danh sách danh mục hợp lệ, sheet "Hướng dẫn" là quy tắc điền. Hãy hoàn thiện dữ liệu theo các bước:

1. RÀ SOÁT & CHUẨN HOÁ TÊN: viết lại "Tên sản phẩm *" theo dạng Title Case tiếng Việt, ngắn gọn, có thương hiệu + tên
   sản phẩm + dung tích/số lượng (vd "Viên uống DHA EPA Orihiro 180 viên"). Bỏ hashtag, chữ IN HOA toàn bộ, câu cảm thán.
   KHÔNG sửa cột ID và "Đường dẫn (slug)".

2. DANH MỤC: với mọi dòng, điền "Danh mục *" bằng 1–2 tên lấy CHÍNH XÁC từ sheet "Danh mục" (copy nguyên văn, cách nhau
   bằng ";"). Nếu sản phẩm không khớp danh mục nào, thêm danh mục mới vào cuối sheet "Danh mục" (tên tiếng Việt + tiếng Anh
   trong ngoặc như các dòng có sẵn, slug không dấu) rồi dùng tên đó. Ghi các danh mục mới vào cột "Ghi chú" của dòng đầu
   tiên dùng nó.

3. GIÁ BÁN: các ô "Giá bán (VNĐ) *" màu vàng đang trống. Tìm giá tham khảo của đúng sản phẩm đó tại thị trường Việt Nam
   (hàng Nhật nội địa xách tay/chính hãng) và điền số nguyên VNĐ, làm tròn đến 5.000đ. Nếu không tìm được, để trống và ghi
   "Chưa rõ giá" vào "Ghi chú". Tuyệt đối không bịa số.

4. GIÁ VỐN: nếu biết giá bán lẻ tại Nhật (JPY), quy đổi theo tỷ giá hiện tại và cộng 12% phí vận chuyển, điền vào
   "Giá vốn (VNĐ)" (số nguyên, làm tròn 1.000đ) và ghi "Vốn ước tính từ ¥<giá JPY>" vào "Ghi chú". Không rõ thì để trống.

5. MÔ TẢ: với dòng có "Mô tả ngắn (HTML)" trống, viết 1 câu <p>…</p> ≤ 160 ký tự nêu công dụng chính. Với "Mô tả chi tiết
   (HTML)" ngắn hơn 200 ký tự hoặc chỉ là văn bản dán từ Facebook, viết lại thành HTML sạch gồm: <p> giới thiệu, <ul><li>
   thành phần/công dụng nổi bật, <p><strong>Hướng dẫn sử dụng:</strong></p><ul><li>…, <p><strong>Lưu ý:</strong> …</p>.
   Không dùng script, iframe, style inline. Giữ tiếng Việt có dấu.

6. TỪ KHOÁ: điền 4–8 từ khoá tìm kiếm cách nhau bằng dấu phẩy: thương hiệu, loại sản phẩm, công dụng, cách viết không dấu.

7. ẢNH: cột "Ảnh" giữ đường dẫn /sites/... đang có ở dòng đầu. Nếu tìm được ảnh sản phẩm chính hãng rõ nét (nền trắng, từ
   trang của thương hiệu Nhật hoặc nhà phân phối), thêm URL https trực tiếp tới file .jpg/.png ở các dòng tiếp theo trong
   cùng ô (Alt+Enter), tối đa 3 URL. Không dùng ảnh Facebook/Shopee có watermark.

8. TRẠNG THÁI: giữ "Bản nháp" cho dòng chưa có Giá bán. Dòng đã đủ Giá bán + Danh mục + Mô tả ngắn + Ảnh thì đổi thành
   "Đang bán".

9. Cuối cùng thêm sheet "Báo cáo" liệt kê: số dòng đã điền giá, số dòng còn thiếu giá, danh mục mới đã thêm, các dòng nghi
   trùng nhau (tên gần giống, ví dụ 2 dòng "Viên uống nhau thai cừu EX Placenta") kèm ID để tôi gộp tay.

Chỉ sửa giá trị ô, không đổi tên cột, không thêm/xoá cột, không đổi thứ tự cột, không xoá dòng. Lưu ghi đè file này.
```

Sau khi Claude xong: kiểm tra sheet "Báo cáo", gộp các dòng trùng nếu cần (đặt dòng thừa thành `Bản nháp`), rồi chạy `npm run xlsx:import`.

## Tra giá Nhật và ảnh từ Amazon.co.jp (tự động)

Claude trong Excel chỉ đọc được đoạn trích tìm kiếm nên tra giá rất chậm. Thay vào đó, để Claude điền cột **"Tên tiếng Nhật"** (tên như trên bao bì, kèm quy cách: `DHC ディープクレンジングオイル 70ml`), rồi chạy:

```bash
python scripts/xlsx/amazon_jp_lookup.py "D:\danh-sach-san-pham-fanpage.xlsx"            # báo cáo ra sheet "Amazon tra cứu" (file -amazon.xlsx)
python scripts/xlsx/amazon_jp_lookup.py "D:\danh-sach-san-pham-fanpage.xlsx" --apply    # điền Giá Nhật (JPY), Link tham khảo, ảnh Amazon (đóng Excel trước)
```

Script mở Amazon JP bằng trình duyệt ẩn, loại các kết quả dạng set/mua sỉ, ưu tiên tiêu đề khớp quy cách, ghi 3 ứng viên để đối chiếu. Cột "Giá vốn (VNĐ)" và "Giá bán đề xuất" là công thức trong sheet Tham số (tỷ giá, phí vận chuyển, hệ số) nên tự tính khi có Giá Nhật. Sau đó `xlsx:import` sẽ tải ảnh Amazon về kho web và đưa giá vốn vào admin.

## Cào sản phẩm từ fanpage bằng ChatGPT (agent duyệt web)

Prompt đầy đủ ở [`docs/CHATGPT_FANPAGE_PROMPT.txt`](CHATGPT_FANPAGE_PROMPT.txt): yêu cầu agent đọc từng bài trên fanpage, tách sản phẩm, ghi đúng tên cột của template này, mô tả HTML theo khung `<p><strong>Công dụng</strong></p><ul>…` (website tự tách mục), điền "Tên tiếng Nhật" để script tra Amazon, và đối chiếu trùng với `lienstore-san-pham.xlsx` đã xuất. Kết quả nhập bằng `xlsx:import` như thường; nếu agent chỉ đưa được CSV (`;`), đặt tên `.csv` và chạy cùng lệnh.

## Đưa lên prod

`data/seed.json` sau khi nhập được commit và phát hành bằng tag. Container prod có `LIEN_SEED_SYNC=update` (đã đặt trong `deploy/truenas-app.yaml`) sẽ ghi đè các sản phẩm có trong seed bằng giá trị mới, giữ nguyên đơn hàng, khách hàng và sản phẩm chỉ có trong DB. Nếu bạn muốn sửa sản phẩm trực tiếp trên admin prod và không bị seed ghi đè, đổi thành `LIEN_SEED_SYNC=add`.

## Ảnh đại diện nền trắng (`fetch_packshots.py`)

```bash
python scripts/xlsx/fetch_packshots.py            # chạy thử: chỉ tải ảnh + tạo trang rà soát docs/reports/packshots-review-<ngày>.html
python scripts/xlsx/fetch_packshots.py --apply    # ghi vào data/seed.json (đổi meta.seededAt)
python scripts/xlsx/fetch_packshots.py --only slug-a,slug-b --apply
```

Thứ tự ưu tiên: ảnh nền trắng sẵn có trong gallery → ảnh chính từ link Amazon JP đã có (`supplierUrl`) → tìm Amazon JP theo tên (chỉ nhận khi tiêu đề chứa tên thương hiệu và cùng quy cách). Mọi ảnh tải về được kiểm tra lại nền trắng trước khi dùng; ảnh cũ vẫn nằm sau ảnh mới trong gallery. Ảnh lưu ở `public/sites/lienstore/shared/products/packshot/<slug>.jpg` (+ `-300x300.jpg`). Các trường hợp "candidate" (khớp thương hiệu nhưng tên không có quy cách) chỉ được lưu ở `packshot/candidates/` để duyệt tay.
