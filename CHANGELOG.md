# Changelog

Tất cả thay đổi đáng chú ý của LienStore được ghi tại đây.
Định dạng theo [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), phiên bản theo [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- **Đồng bộ dữ liệu prod về repo**: 316 sản phẩm (3 sản phẩm iHerb thêm trên prod), danh mục `iherb`, 16 ảnh upload trên prod chuyển vào `public/…/uploads/`.
- **Sắp xếp lại danh mục theo góp ý**: 6 nhóm gốc — MỸ PHẨM (Chăm sóc da mặt: kem dưỡng, mặt nạ, chống nắng, sữa rửa mặt, tẩy trang, tẩy tế bào chết, nước hoa hồng, trị mụn, trị nám, mắt, dụng cụ; Chăm sóc body: dưỡng thể, sữa tắm, tóc; Trang điểm: son môi), SỨC KHỎE (thực phẩm chức năng, tủ thuốc gia đình, giảm cân, răng miệng, góc chị em, dành cho nam, iherb), MOM AND BABY, THỰC PHẨM - ĐỒ UỐNG, NHÀ CỬA & ĐỜI SỐNG (nhà bếp, gia dụng, nến thơm), THỜI TRANG & PHỤ KIỆN (thời trang, đồng hồ). Sửa chính tả: "Gốc chị em" → "Góc chị em", "Tây tế bào chết" → "Tẩy tế bào chết", "Acne Treatrment" → "Acne Treatment". Đường dẫn danh mục cũ giữ nguyên.

## [1.9.0] - 2026-09-09

### Added
- **Danh mục phân cấp (cha/con)**: mỗi danh mục có thể chọn "Danh mục cha" trong admin (không cho chọn con của chính nó; xoá danh mục cha thì con lên một cấp). Menu "Danh mục" trên header xếp theo nhóm cha → con → cháu; ô danh mục trang chủ, cột trái trang cửa hàng, footer và menu điện thoại hiển thị theo cây. Trang danh mục cha liệt kê sản phẩm của cả danh mục con, có hàng ô danh mục con phía trên và breadcrumb theo cấp. Migration v7: `categories.parent_slug`; seed có trường `parent`.
- **Xuất catalogue từ server đang chạy**: `GET /api/admin/export` (phiên admin có quyền Sản phẩm, hoặc HTTP Basic bằng tài khoản `ADMIN_USER`) trả `seed.json` của DB thật; link tải ở Tổng quan. Script `npm run sync:prod -- <url> <user> <mật khẩu>` kéo dữ liệu prod về `data/seed.json`, tải ảnh upload trên server về `public/…/uploads/` và đổi đường dẫn, giữ `meta.removedSlugs`.

## [1.8.2] - 2026-09-09

### Fixed
- **Sản phẩm tạo trực tiếp trên prod không còn bị sản phẩm mới trong seed ghi đè** khi hai bên vô tình dùng cùng mã (ID): khi đồng bộ, sản phẩm seed trùng mã với một sản phẩm khác trên server sẽ nhận mã mới; sản phẩm trên server giữ nguyên. Log `[db] seed sync gave N new product(s) a fresh id…`.

## [1.8.1] - 2026-09-09

## [1.8.0] - 2026-09-08

### Added
- **Quản lý người dùng & phân quyền** (`/admin/users/`): tạo / sửa / xoá tài khoản; sửa email, họ tên, điện thoại, địa chỉ, đặt lại mật khẩu, khoá tài khoản; ba vai trò **Quản trị viên** (toàn quyền), **Nhân viên** (chỉ các module được tick: Sản phẩm, Danh mục, Đơn hàng, Khách hàng, Kho hàng, Vận chuyển) và **Khách hàng** (chỉ mua hàng). Tài khoản admin/nhân viên đăng nhập trang quản trị bằng email + mật khẩu; menu và trang chỉ hiện module được phép, vào module không có quyền thì bị đưa về Tổng quan kèm thông báo. Không thể tự hạ quyền/tự khoá/tự xoá, không thể hạ quyền hoặc xoá quản trị viên hoạt động cuối cùng. Nhân viên / quản trị viên đăng nhập bằng **tên đăng nhập (ID) + mật khẩu** (email tuỳ chọn; khách hàng vẫn dùng email). Tài khoản `ADMIN_USER`/`ADMIN_PASSWORD` là chủ cửa hàng, toàn quyền với mọi tài khoản. Migration v5–v6: `customers.role`, `permissions`, `active`, `username`.

## [1.7.1] - 2026-09-08

### Removed
- Thanh "Mua hàng" cố định khi cuộn trên trang sản phẩm (khay giỏ hàng trượt đã thay vai trò này).

## [1.7.0] - 2026-09-08

### Changed
- **Rà soát catalogue bằng tay**: 102 sản phẩm được sửa ảnh/mô tả trong admin, 11 sản phẩm bị xoá (ghi vào `meta.removedSlugs` để xoá trên server), 4 sản phẩm đổi slug. 373 ảnh upload qua admin được chuyển vào `public/sites/lienstore/shared/products/uploads/` để đi cùng image; đường dẫn `/api/files/products/…` trong seed đổi theo. Catalogue còn 313 sản phẩm, 260 đang bán.

### Added
- **Upload ảnh danh mục** trong admin (Danh mục → sửa): chọn file từ máy, tự cắt vuông 300×300 nền trắng, lưu tại `uploads/categories/<yyyy-mm>/`, phục vụ công khai qua `/api/files/categories/…`; vẫn có thể dán đường dẫn hoặc chọn nhanh từ ảnh sản phẩm.
- **Ảnh đại diện nền trắng (packshot)** cho sản phẩm: script `scripts/xlsx/fetch_packshots.py` nhận diện ảnh chụp tay (nền không trắng), rồi lần lượt (1) đưa ảnh nền trắng sẵn có trong gallery lên đầu, (2) lấy ảnh chính từ trang Amazon JP đã xác minh (`supplierUrl`), (3) tìm Amazon JP theo tên và chỉ nhận khi khớp thương hiệu + quy cách; (4) tìm Rakuten với cùng điều kiện, (5) không có nguồn tin cậy thì **tách nền ảnh của cửa hàng bằng rembg (U2-Net, chạy offline)** và đặt sản phẩm lên nền trắng vuông; ảnh cũ giữ lại phía sau. Kết quả: 68 ảnh từ Amazon/gallery, 4 từ tìm kiếm khớp thương hiệu + quy cách, 121 tách nền, 1 chưa xử lý; 289/324 sản phẩm có ảnh chính nền trắng. Trang rà soát `docs/reports/packshots-review-<ngày>.html` liệt kê ảnh cũ/mới, nguồn và độ tin cậy.

## [1.6.2] - 2026-09-08

### Fixed
- **Sửa sản phẩm trên prod không còn bị seed ghi đè**: ở chế độ `LIEN_SEED_SYNC=update`, sản phẩm được sửa trên server (admin) sau thời điểm seed được xuất sẽ giữ bản trên server (bản nào sửa sau thì thắng); các sản phẩm khác vẫn nhận dữ liệu mới từ seed. Log `[db] seed sync kept N product(s)…` khi có sản phẩm được giữ.

## [1.6.1] - 2026-09-08

### Changed
- **Quy trình release**: `npm run release -- patch|minor|major` (bump version, chuyển CHANGELOG, commit, tag, push). Workflow Release không build lại mà gắn tag `X.Y.Z`/`latest` cho image CI đã build (`sha-<commit>`) đang chạy trên dev, kiểm tra `/api/health/` đúng version; bỏ build arm64 (QEMU, 20–30 phút). Script cron TrueNAS backup SQLite trước khi redeploy (giữ 10 bản) và báo version từ `/api/health/`; thêm `deploy/truenas-rollback.sh`. Xem docs/DEPLOY.md §4c.

## [1.6.0] - 2026-09-08

### Added
- **Popup "khách vừa mua"** góc dưới trái: lấy từ đơn thật đã xác nhận / hoàn tất (ảnh, tên sản phẩm, tỉnh/thành từ địa chỉ giao, thời gian, trạng thái), luân phiên 6 giây mỗi 20 giây, bấm ✕ tắt trong phiên; không hiện khi chưa có đơn.
- **Giỏ hàng trượt (mini cart)**: bấm "Thêm vào giỏ" ở bất kỳ đâu (thẻ sản phẩm, trang sản phẩm, gợi ý) hoặc icon giỏ trên header sẽ mở khay giỏ hàng bên phải: danh sách sản phẩm với bộ tăng/giảm (giảm về 0 = xoá), xoá nhanh, tạm tính, ghi chú phí ship, nút "Xem giỏ hàng" và "Thanh toán"; khối **"Thường được mua cùng với"** gợi ý sản phẩm cùng danh mục (API `/api/cart/suggest?ids=`), có thêm vào giỏ và xem nhanh; đóng bằng Esc/nền tối; khoá cuộn trang khi mở.
- **Thẻ sản phẩm**: rê chuột đổi sang ảnh thứ 2 của sản phẩm (nếu có) để xem thêm góc chụp; nút tròn màu cam "Thêm Vào Giỏ" nổi trên ảnh (hiện khi rê chuột trên máy tính, luôn hiện trên điện thoại), bỏ nút thêm giỏ phẳng phía dưới.
- **Chi phí vận chuyển**: bảng phí theo kiểu sesofoods (cột = khu vực; hàng = phí thường, phụ phí, khu vực, thời gian; "Miễn phí trên …" màu đỏ) ở tab "Chi phí vận chuyển" trên trang sản phẩm và trang `/van-chuyen/` (có trong menu Hỗ trợ + footer). Migration v4: bảng `shipping_methods`, `shipping_zones`, setting `shipping_notes`, kèm dữ liệu mặc định 2 phương thức (Nhật → Việt Nam: đường bay/đường biển; nội địa: Thanh Hóa / Bắc / Trung / Nam).
- **Admin › Vận chuyển** (`/admin/shipping/`): sửa tên/mô tả/nhãn phụ phí/đơn vị tiền/thứ tự/ẩn-hiện từng phương thức; thêm, sửa tại dòng, xoá, ẩn từng khu vực (phí, đơn vị "/kg", miễn phí trên, phụ phí, khu vực, thời gian); sửa danh sách lưu ý (mỗi dòng một gạch đầu dòng); xem trước đúng như khách thấy.
- **Trang "Về chúng tôi"** (`/ve-chung-toi/`) gộp giới thiệu + liên hệ với nội dung viết mới: câu chuyện LienStore, quy trình 5 bước, 4 cam kết, khối Liên hệ (hotline VN/JP, email, địa chỉ, giờ, Facebook/Zalo/Messenger, nút Zalo). `/gioi-thieu-ve-lienstore/` và `/lien-he/` chuyển hướng 301 sang trang mới.
- Menu **Tin tức** thả xuống: Hàng mới về, Sản phẩm bán chạy, Hướng dẫn đặt hàng & mua hộ, Cài LienStore lên điện thoại, Các tin tức khác.

### Changed
- Header bỏ mục "Liên hệ" riêng (đã gộp vào Về chúng tôi); menu Hỗ trợ thêm "Chi phí vận chuyển"; icon giỏ hàng mở khay giỏ thay vì chuyển trang.
- Tab đầu trang sản phẩm đổi tên "Mô tả" → "Thông tin sản phẩm"; thông báo WooCommerce "đã thêm vào giỏ" trên trang sản phẩm được thay bằng khay giỏ.
- **Giao diện v2 theo phong cách sesofoods.com** (chỉ đổi UI, giữ logo LienStore và tông xanh nước biển): font Roboto tự host (12 file woff2, có bộ ký tự tiếng Việt); thanh liên hệ màu kem với hotline VN/JP, email, nút "Đăng kí tài khoản" vàng cam, icon Facebook/Zalo/Messenger; header dính với menu "Danh mục" thả xuống 3 cột (đếm sản phẩm), "Hỗ trợ", Tin tức, Về chúng tôi, Liên hệ, ô tìm kiếm tròn, icon tài khoản / yêu thích / giỏ hàng có badge; menu trượt trên điện thoại.
- Trang chủ mới: slider, 15 ô danh mục có ảnh + ô "Tất cả danh mục" (điện thoại hiện 8), khối "Hàng mới về", "Bán chạy nhất", "Giảm giá đặc biệt" (ẩn khi < 3 sản phẩm), 2 banner CTA (đăng kí, mua hộ Zalo), 6 danh mục lớn nhất mỗi danh mục 6 sản phẩm + nút "Xem tất cả", băng 4 cam kết, 4 bài "Góc chia sẻ".
- Thẻ sản phẩm mới: viền mỏng, nhãn "-x%", "Mới" (≤ 45 ngày), "Hết hàng", nút yêu thích / xem nhanh hiện khi rê chuột, tên 2 dòng, giá sale đỏ, nút "Thêm vào giỏ" bo tròn hiện "✓ Đã thêm" sau khi bấm.
- Trang sản phẩm: dải breadcrumb, gallery vuông có viền + thumbnail, khối tóm tắt (chip danh mục, giá + nhãn "Tiết kiệm", tình trạng, mô tả ngắn có "Xem thêm", bộ tăng giảm số lượng, CTA, yêu thích), hộp thông tin COD / gom đơn / bill Nhật / Zalo, tab Mô tả–Đánh giá dạng pill trên nền kem, "Có thể bạn quan tâm" 6 sản phẩm.
- Trang danh mục / cửa hàng: dải tiêu đề màu kem + breadcrumb, cột trái danh mục (đếm số sản phẩm, đánh dấu danh mục đang xem), thanh công cụ (số kết quả + sắp xếp), lưới 4 cột, phân trang tròn.
- Giỏ hàng, thanh toán, tài khoản, quên mật khẩu, đơn đã nhận, wishlist, Góc chia sẻ: dải tiêu đề đồng nhất; tiêu đề mục đổi từ Oswald mảnh sang Roboto đậm; widget cột phải cùng một kiểu khung.
- Footer xám nhạt 5 cột (liên hệ, tài khoản, hỗ trợ, danh mục chính, kết nối) + dòng bản quyền; token màu mới `--lien-cream`, `--lien-footer2`, `--lien-sale`, `--lien-sale-text`, `--lien-amber`, `--lien-info`, `--lien-price`, `--lien-success`.
- Icon FontAwesome bổ sung (angle, th-large, gift, shield, chevron, fire, credit-card, comments-o, bolt, plane, share-alt, tags, check, cart-plus, money, globe, newspaper-o, calendar).

### Changed
- Cỡ chữ nền 14px / dòng 1.5, nền trang trắng; nút WooCommerce (`wooButtonClass`) bo tròn, chữ in hoa 14px.

- 91 sản phẩm mới từ fanpage "Japan - 大好きJP" (ChatGPT cào, tra giá Amazon JP): 6 danh mục mới (Dụng cụ nhà bếp, Đồng hồ, Đồ gia dụng, Trang điểm, Nến thơm, Thời trang), 68 sản phẩm có giá vốn và ảnh Amazon.
- Seed sync hỗ trợ `meta.removedSlugs`: sản phẩm gộp trùng bị xoá khỏi DB đang chạy.
- Script nhập Excel nhận diện sản phẩm cũ theo slug sinh từ tên (nhập lại không tạo bản "-2").

### Changed
- Gộp 25 sản phẩm trùng (cùng ASIN Amazon hoặc cùng tên): Placenta EX, DHA EPA Orihiro, DHC Lip Cream, Hatomugi, Anessa, Meishoku, Meiji Amino Collagen, Frugra, Night Diet Tea, Kobayashi Inochi no Haha, White Conc… Tổng còn 324 sản phẩm, 271 đang bán.
- 12 sản phẩm có giá bán thấp hơn giá vốn được đặt lại giá tạm = vốn × 1,35; 4 sản phẩm nghi khớp nhầm set nhiều món chuyển về nháp (Lion, Nama chocolate, Mitomo 1 miếng, Glucosamine MSM).

## [1.5.1] - 2026-09-08

### Changed
- Thông tin liên hệ thật: hotline VN 0964 839 769, Facebook facebook.com/dien.luc.809784, Zalo zalo.me/0964839769, Messenger m.me/dien.luc.809784 (thanh liên hệ, footer, trang Liên hệ).

## [1.5.0] - 2026-09-08

### Added
- **Kho hàng** (`/admin/inventory/`): thẻ tổng quan (hết hàng, sắp hết, cần đặt, không theo dõi), bảng tồn kho với bộ lọc, cập nhật tồn + mức tối thiểu ngay trên dòng, **danh sách cần đặt hàng** tính từ đơn Chờ xử lý/Đang xử lý trừ tồn kho (kèm số đơn liên quan, giá vốn, link Amazon JP) và xuất CSV cho người mua hàng bên Nhật. Migration v3: `products.supplier_url`, `products.min_stock`.
- **Khách hàng** (`/admin/customers/`): gộp khách có tài khoản và khách vãng lai theo email/điện thoại; trang chi tiết liệt kê từng đơn với sản phẩm, tổng chi tiêu, sản phẩm mua nhiều, và nút "Gửi bill Nhật" cho đơn chưa có chứng từ.
- **Bill mua hàng tại Nhật**: đính kèm ảnh/PDF vào đơn (số tiền JPY, ghi chú), ghi chú nội bộ cho đơn (`orders.admin_note`); khách xem/tải trong trang Đơn hàng đã nhận, tài khoản và tra cứu đơn qua link có chữ ký. Bảng `order_files`, route `/api/files/orders/...` kiểm tra quyền.
- **Upload ảnh sản phẩm** trong admin: chọn nhiều file, thu nhỏ trong trình duyệt (1200px + thumb 300×300), thêm bằng URL, kéo thứ tự bằng nút ↑↓, đặt ảnh đại diện, xoá; file lưu ở `LIEN_UPLOAD_DIR` (mặc định `<thư mục DB>/uploads`), phục vụ qua `/api/files/products/...`, tự dọn file khi bỏ khỏi sản phẩm.
- **Mô tả sản phẩm có cấu trúc**: bộ tách `src/lib/description.ts` nhận diện tiêu đề mục (h3, `<p><strong>`, chữ IN HOA, từ khoá) và gạch đầu dòng dạng `– / ►`, hiển thị thẻ Thông tin nhanh (Xuất xứ, Nhà sản xuất, Quy cách…) + các mục Công dụng / Thành phần / Hướng dẫn sử dụng / Đối tượng / Lưu ý với mục lục; 164/258 mô tả có tiêu đề được tách tự động, phần còn lại giữ nguyên.
- Excel: cột "Link nhà cung cấp" (xuất/nhập), `Link tham khảo` từ tra Amazon được đưa vào `supplierUrl` của 96 sản phẩm.

## [1.4.0] - 2026-09-08

### Added
- Hoàn tất định danh 138 sản phẩm fanpage: 96 sản phẩm có giá vốn (Amazon JP × 168 + 12%), 95 có ảnh chính hãng nền trắng, **100 sản phẩm chuyển sang Đang bán** với giá bán tạm = giá vốn × 1,35 (làm tròn 5.000đ, ghi chú "cần rà soát"). Tổng cửa hàng: 220 sản phẩm đang bán / 258.
- 38 sản phẩm còn Bản nháp có ghi chú "CHƯA ĐỊNH DANH" kèm lý do (không có trên Amazon JP, đã ngừng sản xuất, hàng Úc/Mỹ, không rõ hãng, set combo).
- `amazon_jp_lookup.py`: tuỳ chọn `--rows`, ghi đè dòng báo cáo khi tra lại, quy tắc nhận diện set mua sỉ theo hệ số "×N" (750g×6袋, 54袋×10個入), chỉ điền khi khớp đúng quy cách.

### Changed
- `import_products_xlsx.py`: chọn đúng cột "Giá (VNĐ) *" khi workbook có thêm cột "Giá bán đề xuất".
- Tên sản phẩm cập nhật theo quy cách hiện hành của hãng (Frugra 700g, Rohto Bofutsushosan 372 viên, Allie Chrono Beauty 90g, DHC Lip Cream 1.5g…).

## [1.3.0] - 2026-09-08

### Added
- `scripts/xlsx/amazon_jp_lookup.py`: tra giá bán lẻ Nhật và ảnh chính từ Amazon.co.jp theo cột "Tên tiếng Nhật" (loại kết quả set/mua sỉ, ưu tiên khớp quy cách, chỉ điền khi khớp chính xác, báo cáo 3 ứng viên trong sheet "Amazon tra cứu").
- Catalogue: 138 sản phẩm fanpage được chuẩn hoá tên, mô tả HTML, từ khoá; 69 sản phẩm có **giá vốn** (giá Amazon JP × tỷ giá 168 + 12% vận chuyển), 68 sản phẩm có ảnh chính hãng nền trắng từ Amazon; thêm 3 danh mục: Chăm sóc răng miệng, Thực phẩm - Đồ uống, Dụng cụ chăm sóc da (23 danh mục).

### Changed
- `import_products_xlsx.py`: đọc được file fanpage gốc (STT không phải ID, tự tìm dòng tiêu đề, danh mục phân tách bằng dấu phẩy cũ), giữ ảnh Facebook đã tải, tính giá vốn từ "Giá Nhật (JPY)" + sheet "Tham số" khi ô công thức chưa được Excel tính, chọn đúng cột "Danh sách ảnh".

## [1.2.0] - 2026-09-08

### Added
- **Giá vốn & lợi nhuận** trong quản trị: trường "Giá vốn" trên form sản phẩm (gợi ý lợi nhuận/sp và % biên ngay khi gõ), cột Giá vốn + Lợi nhuận trong danh sách sản phẩm, tổng vốn tồn kho và lợi nhuận tồn kho, cảnh báo "chưa có giá" cho sản phẩm giá 0. Migration schema v2 (`products.cost_price`). Giá vốn không xuất hiện ở storefront.
- **Vòng Excel**: `scripts/xlsx/export_products_xlsx.py` xuất catalogue (+ sheet Danh mục, Hướng dẫn, ô vàng cho dữ liệu thiếu) và `import_products_xlsx.py` nhập lại: cập nhật theo ID/slug, tạo sản phẩm và danh mục mới, tải ảnh URL về `public/`, không xoá gì, `--dry-run --diff` để xem trước. Lệnh `npm run xlsx:export` / `xlsx:import`. Tài liệu + prompt cho Claude trong Excel: `docs/EXCEL_IMPORT.md`.
- `LIEN_SEED_SYNC=update`: ghi đè các dòng có trong seed (Excel/seed là nguồn sự thật) mà vẫn giữ đơn hàng, khách hàng và sản phẩm chỉ có trong DB. YAML TrueNAS đặt sẵn chế độ này.

## [1.1.0] - 2026-09-08

### Added
- 138 sản phẩm mới từ fanpage (file `danh-sach-san-pham-fanpage.xlsx`) vào `data/seed.json` ở trạng thái **nháp**, ảnh tải về `public/sites/lienstore/shared/products/fanpage/` kèm thumbnail 300×300. 7 sản phẩm có giá, còn lại giá 0 cần điền trong admin trước khi chuyển sang "Đang bán".
- Đồng bộ seed vào DB đang chạy (`LIEN_SEED_SYNC`: `add` mặc định / `overwrite` / `off`): image mới mang seed mới sẽ tự thêm sản phẩm, danh mục, trang, bài viết còn thiếu mà không đụng đơn hàng, khách hàng hay bản admin đã sửa.

### Changed
- Giao diện đổi sang tông **xanh nước biển** (tham chiếu jifish.org): màu chính `#1c7f9e`, nền trang `#f3fafc`, footer và sidebar admin `#0d2a35`, viền/tab/pagination dùng tông aqua; toàn bộ đi qua token CSS (`--lien-*`) nên storefront và admin đổi đồng bộ, bố cục responsive giữ nguyên.
- Các màu hover/nền cứng (`#2a6bc0`, `#ebe9eb`, `#dfdcde`) chuyển thành token `lien-blue-hover`, `lien-blue-soft`.
- PWA `theme_color`/`background_color` theo bảng màu mới.

## [1.0.0] - 2026-09-04

Bản phát hành đầu tiên.

### Added
- Storefront đầy đủ: trang chủ, danh sách sản phẩm theo shop/danh mục/tag, tìm kiếm không dấu, modal tìm kiếm nhanh, Quick View, chi tiết sản phẩm (gallery zoom, sản phẩm liên quan, nút mua cố định), trang tĩnh và blog có bình luận.
- Giỏ hàng, wishlist, sản phẩm vừa xem lưu trong trình duyệt; thanh toán COD/chuyển khoản với giá tính lại phía server; trang nhận đơn và tra cứu đơn hàng.
- Tài khoản khách hàng: đăng ký, đăng nhập, quên mật khẩu, cập nhật thông tin, lịch sử đơn (scrypt + cookie HMAC).
- Trang quản trị `/admin/`: dashboard, CRUD sản phẩm, CRUD danh mục, quản lý trạng thái đơn hàng.
- Thương hiệu LienStore: bộ logo SVG/PNG, favicon, PWA manifest, thông tin liên hệ VN/JP, icon Facebook/Zalo/Messenger.
- Cơ sở dữ liệu SQLite nhúng qua `node:sqlite` với schema có phiên bản (migration) và seed tự động từ `data/seed.json`; lệnh `db:export`, `db:reset`; `/api/health/` báo phiên bản schema.
- Đóng gói Docker multi-stage tự chứa, `docker-compose.yml`, YAML TrueNAS Custom App (GHCR và build local), script build trên NAS, script đẩy source từ Windows.
- GitHub Actions: CI (lint, typecheck, build, smoke test image) và Release (tag `v*` → image đa kiến trúc lên GHCR → tuỳ chọn redeploy TrueNAS).
- Tài liệu kiến trúc, triển khai và hướng dẫn TrueNAS bằng tiếng Việt.

### Notes
- Số hotline VN, link Zalo/Facebook/Messenger còn là placeholder trong `src/components/sites/lienstore/root-8a5edab2/data.ts`.
- Dự án khởi tạo từ [ai-website-cloner-template](https://github.com/JCodesMore/ai-website-cloner-template) (MIT).

[Unreleased]: https://github.com/ducanhle92/lienstore/compare/v1.5.1...HEAD
[1.5.1]: https://github.com/ducanhle92/lienstore/compare/v1.5.0...v1.5.1
[1.5.0]: https://github.com/ducanhle92/lienstore/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/ducanhle92/lienstore/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/ducanhle92/lienstore/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/ducanhle92/lienstore/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/ducanhle92/lienstore/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/ducanhle92/lienstore/releases/tag/v1.0.0
