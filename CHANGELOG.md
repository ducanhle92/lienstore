# Changelog

Tất cả thay đổi đáng chú ý của LienStore được ghi tại đây.
Định dạng theo [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), phiên bản theo [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- Menu: nhóm **Kho hàng** đổi tên **Vận hành** và lên đầu; nhóm **Tổng quan** đổi tên **Cài đặt web** và xuống ngay dưới Vận hành.
- Mọi ô ngày trong admin (ngày mua, dự kiến gửi, ngày gửi, ngày phiếu, khoảng ngày tìm đợt, lọc ngày mua trong bảng đợt) là ô **chọn ngày trên lịch** thay vì gõ tay `2026-09-27`. Riêng **HSD** vẫn gõ tay vì ghi theo tháng / năm trên bao bì (vd `03/2027`).

## [1.103.0] - 2026-09-29

### Changed
- **④ Đóng hàng JP › khung chuyến**: chuyến “Đã đóng xong” là chuyến **đã khoá** — không thêm / rút hàng được (máy chủ cũng từ chối), khung thêm hàng và nút rút ẩn đi, đầu chuyến ghi “Đã khoá”. Nút **Khoá / Mở khoá** nằm giữa Xoá chuyến và Thu gọn (Mở khoá = về Đang đóng). Các nút đầu chuyến có viền và màu; thêm nút **✎ Sửa** cạnh tên chuyến để mở form thông tin chuyến (tên, ngày gửi, mã vận đơn, ghi chú).
- Khung thêm hàng: bỏ nhãn “Thêm hàng vào CH-…” (đã nằm trong chuyến); ô tìm kiếm đứng trước “Theo đơn → Xem” và “Theo đợt mua → Xem”.

## [1.102.1] - 2026-09-29

### Changed
- **Kế toán › Theo đơn**: ba cột Ship khách trả · Nhập 3 chặng · Giao VN trả hãng gộp thành một cột **Vận chuyển (shop chịu)** = nhập 3 chặng + giao VN trả hãng − phần ship khách trả shop; di chuột vào số để xem từng phần, dưới số ghi “khách trả shipper” hoặc “khách trả …”. Lãi / lỗ = doanh thu sau voucher − giá vốn − cột này (không đổi giá trị). CSV giữ cả cột gộp lẫn ba phần.

## [1.102.0] - 2026-09-28

### Changed
- **Menu Kho hàng**: **⓪ Sản phẩm** đứng đầu chuỗi (① Đơn hàng … ⑦ Giao hàng VN), thanh bước có thêm bước 0 (số sản phẩm đang bán · nháp) và hiện trên trang Sản phẩm; nhóm **Chung** đổi tên **Khác** và xuống cuối. Nhãn trên thanh bước rút gọn (Kho Nhật, Đóng hàng, JP → VN, Kho VN, Giao hàng) để 8 bước nằm một hàng.
- **Đơn hàng**: bỏ hàng nút “Trạng thái đơn” phía trên (lọc trạng thái bằng ▾ ở cột **Trạng thái đơn** của bảng); bỏ ô tick **Khách quen** (nhãn “Khách quen” trên từng dòng vẫn còn); số đơn · doanh thu bộ lọc hiện màu xanh ngay cạnh tiêu đề, không xuống dòng.

## [1.101.0] - 2026-09-28

### Changed
- **Đơn hàng** có hai cách xem, chọn ở góc phải tiêu đề: **Lãi / lỗ** (danh sách như trước) và **Theo kho hàng** (mỗi đơn đang xử lý: hàng của từng dòng đang ở đâu, dòng nào còn “Cần mua”, ghép lại nguồn hàng — chính là “Hàng theo đơn” trước đây ở Tồn kho). Link cũ `Tồn kho › Hàng theo đơn` tự chuyển sang đây.
- **Tồn kho Nhật** / **Tồn kho VN** chỉ còn nhãn kho của chính màn đó (bỏ hai tab “Kho Việt Nam” / “Hàng theo đơn” ở Tồn kho Nhật và ngược lại) — mỗi kho đã là một bước ③ / ⑥ của chuỗi.

## [1.100.1] - 2026-09-28

### Changed
- **④ Đóng hàng JP**: khung “Thêm hàng vào chuyến” trở lại dưới mỗi chuyến, viền đỏ, ghim đầu màn hình khi cuộn danh sách: nút **+ Thêm vào chuyến**, số dòng · số cái, rồi các bộ lọc **Theo đơn → Xem**, **Theo đợt mua → Xem**, ô tìm **→ Lọc** (các bộ lọc giữ nhau, vẫn có “Không theo đơn / Không theo đợt mua” và “bỏ lọc”). Thanh dưới đáy chỉ còn **+ Chuyến mới** (cùng Lưu thay đổi / Huỷ).

## [1.100.0] - 2026-09-28

### Changed
- **Đóng hàng theo đợt mua**: mỗi đợt ở Quản lý mua hàng có nút **Đóng hàng đợt này** → mở ④ Đóng hàng JP lọc sẵn hàng của đợt (gồm hàng theo đơn) vào chuyến đang đóng. Lọc theo một đợt (hoặc một đơn) thì **mọi dòng được tick sẵn** và danh sách hàng tồn kho mở ra — bỏ tick vài cái không đóng rồi bấm **+ Thêm vào chuyến**. Dòng ghi chú cho biết cả đợt có bao nhiêu cái, bao nhiêu cái đang ở Kho Nhật chờ đóng (đang liệt kê), bao nhiêu đã đóng vào chuyến nào, đã gửi / đang về, hay chưa mua.

## [1.99.0] - 2026-09-28

### Changed
- **④ Đóng hàng JP › thanh dưới**: bộ lọc hàng để đóng gộp thành một: **Theo đơn** (tất cả · **Không theo đơn** · từng đơn) × **Theo đợt mua** (tất cả · **Không theo đợt mua** · từng đợt — đã gồm hàng giữ cho đơn của đợt đó) × ô tìm, bấm **Lọc** (hoặc Enter) để áp dụng cùng lúc; “bỏ lọc” khi đang lọc.
- **Mua theo đợt**: cột Sản phẩm · bill · mã đứng yên cạnh ô tick khi cuộn bảng sang ngang (màn hình hẹp), không còn bị trượt mất tên.

## [1.98.1] - 2026-09-28

### Changed
- Trang đơn: khung **Trao đổi với khách** (kèm bill) chuyển sang cột bên phải, dưới Khách hàng.
- **Kế toán › Theo đơn**: thêm cột **Tiền hàng** và **Voucher**, cột doanh thu ghi rõ **Doanh thu (sau voucher)**, thêm dòng **Tổng cộng** cuối bảng. Lãi / lỗ vẫn tính như trước (đã trừ voucher): doanh thu sau voucher + ship khách trả − giá vốn − nhập 3 chặng − giao VN trả hãng. Bảng theo tháng ghi “Voucher (đã trừ)”.

### Fixed
- CSV lãi / lỗ: hai cột cuối (voucher, giảm giá SP) không có tiêu đề; nay có đủ cột Tiền hàng · Voucher · Doanh thu sau voucher.

## [1.98.0] - 2026-09-28

### Added
- Trang đơn › **Sản phẩm** có nút **Sửa**: đổi số lượng, đơn giá từng dòng, xoá dòng, thêm sản phẩm (tìm theo tên / SKU; để trống đơn giá = giá web), rồi **Lưu sản phẩm** (hoặc Lưu thay đổi ở thanh dưới). Tạm tính và Tổng tính lại (giảm giá không vượt tạm tính, phí ship đã tính giữ nguyên); hàng của dòng bớt / xoá trở về tồn kho, dòng thêm được giữ hàng tự động theo quy tắc thường. Không sửa được khi đơn đã huỷ, đang giao hoặc đã giao; đơn phải còn ít nhất một sản phẩm. Đơn đã thanh toán có nhắc báo khách phần chênh lệch.

## [1.97.0] - 2026-09-28

### Added
- **Lọc / sắp xếp kiểu Excel ở mọi bảng admin** (như Hàng theo đơn): nút ▾ ở tiêu đề từng cột — sắp xếp tăng / giảm (tự nhận cột số, ngày, chữ), ô tìm, tick chọn giá trị kèm số dòng, Bỏ lọc cột; dòng “Đang lọc n / m · Bỏ lọc & sắp xếp” khi đang lọc; nhớ theo tab trình duyệt và giữ nguyên khi lưu thay đổi. Áp dụng: Tổng quan, Đơn hàng (danh sách + sản phẩm của đơn), Tồn kho (theo sản phẩm, Kho Nhật / VN, hàng của sản phẩm), Quản lý mua hàng (mua theo đợt — lọc theo cả sản phẩm cùng các dòng bill / mã, hàng lưu kho, bill), Đóng hàng JP (chuyến, hàng để đóng), Vận chuyển JP-VN, Giao hàng VN, Vận chuyển (4 chặng, sheet từng chặng, lô gom), Sản phẩm, Nhóm biến thể, Công thức giá, Nguồn mua, Bài viết, Fanpage, Đánh giá, Giảm giá, Flash Sales, Nhãn, Tìm kiếm, Người dùng, Khách hàng, Kế toán, Thanh toán, khoá API, hãng vận chuyển.
- Các ô bộ lọc / nút lọc sẵn có phía trên bảng vẫn giữ (lọc trên máy chủ, ví dụ theo ngày).

## [1.96.0] - 2026-09-28

### Changed
- **④ Đóng hàng JP / ⑤ Vận chuyển JP-VN** gọn hơn:
  - Timeline của chuyến chỉ còn các mốc (bấm mốc để chuyển); bỏ hàng “Lùi · tên trạng thái · Tiếp: …”.
  - Đầu mỗi chuyến: mã · tên chuyến, ô **Dự kiến gửi** (chọn ngày rồi **Lưu thay đổi**), ngày đã gửi nếu có; bên phải **Xoá chuyến** và nút **Thu gọn / Mở chuyến** (trình duyệt nhớ chuyến nào đang thu gọn). Bỏ nhãn trạng thái cạnh “Xoá chuyến”.
  - Bỏ nút **Cách dùng** và **Tồn kho Nhật / Tồn kho VN** ở đầu trang (thanh bước đã có).
  - Thanh dưới đáy một hàng: Lưu thay đổi · Huỷ · **+ Chuyến mới** · **+ Thêm vào chuyến** · lọc Theo đơn / Theo đợt mua (chọn là lọc ngay, bỏ nút “Xem”) · ô tìm (Enter). Mã chuyến chỉ hiện khi đang đóng nhiều chuyến.

## [1.95.1] - 2026-09-28

### Added
- Trang đơn › **Khách hàng** có nút **Sửa**: đổi họ tên, điện thoại, email, địa chỉ, ghi chú của khách trên đơn khi khách yêu cầu (phí ship đã báo không tự tính lại).

### Fixed
- **Phí ship “khách trả cho shipper”**: đơn như vậy không cộng phí giao nội địa VN vào Tổng (đúng thiết kế — khách trả shipper khi nhận; bắt buộc khi hãng chỉ báo giá “Từ …”, hoặc do khách chọn khi thanh toán). Sửa hai chỗ sai liên quan:
  - Lưu chặng ④ trên trang đơn với ô “Áp phí vào đơn khách” (mặc định tick) cộng phí vào Tổng trong khi đơn vẫn ghi “khách trả shipper” → khách có thể bị thu hai lần. Giờ với đơn trả shipper ô này mặc định **không tick** và ghi rõ “Tính phí này vào Tổng (khách trả shop, không trả shipper nữa)”; tick thì đơn chuyển sang shop thu phí.
  - Áp phí chặng ④ không còn làm mất phần phí chặng Nhật (chế độ tính phí theo đơn); khi đặt hàng, phí chặng Nhật luôn nằm trong Tổng, chỉ phí giao VN trả shipper mới nằm ngoài (khớp trang thanh toán).

## [1.95.0] - 2026-09-28

### Changed
- Menu Kho hàng: **Nhóm biến thể** chuyển vào nhóm **Chung** (cùng Danh mục, Nguồn nhập, Địa chỉ kho, Công thức giá).
- **Mua theo đợt** (cả “Theo sản phẩm” lẫn “Từng mã”): thứ tự cột mới — Sản phẩm · SL · **¥/ĐV** · HSD · Trạng thái · **Ngày mua** · **Mua ở / cửa hàng** · Bill · cho đơn; dòng tổng cộng đặt ¥ ngay sau SL.
- Ô **Trạng thái** của dòng bill hiện luôn trạng thái hiện tại của cả dòng (bỏ lựa chọn “— cả dòng: giữ nguyên —”); chọn trạng thái khác rồi **Lưu thay đổi** = mọi cái của dòng bill chuyển theo. Dòng có nhiều trạng thái khác nhau mới hiện “— n cái, nhiều trạng thái —” kèm các nhãn. Danh sách chỉ còn các bước mua → Tại kho Việt Nam (giao cho khách làm ở ⑦ Giao hàng VN).
- Trang Quản lý mua hàng: **CSV cần mua** và **+ Mở đợt mua mới** nằm ở đầu thanh dưới đáy (bên trái Lưu thay đổi); bỏ nút **Tồn kho** và **Cách dùng**; nguồn mặc định của đợt mới là **OS Drug Store**; nút **Tìm** màu đỏ.

## [1.94.1] - 2026-09-28

### Changed
- Trang đơn hàng gọn hơn:
  - Phần giải thích bước hiện tại (“Hiện tại: …”, luồng trả trước / COD, khi nào mở bước “Đã gửi hàng”) nằm sau nút **ⓘ** cạnh tiêu đề “Trạng thái đơn hàng”.
  - **Vận chuyển đơn này** thu gọn mặc định, chỉ còn một dòng trạng thái 4 chặng (① … ④); bấm để mở, lưu một chặng xong khung vẫn mở.
  - Bỏ khung **Ghi chú nội bộ** (ghi chú cũ vẫn giữ trong dữ liệu).

## [1.94.0] - 2026-09-28

### Added
- **⑦ Giao hàng VN** (Kho hàng, bước cuối của chuỗi) — màn cho admin shop ở Việt Nam giao hàng theo đơn: tab **Chờ giao** (đơn đã thanh toán / COD có đủ hàng tại Kho VN), **Đang giao**, **Đã giao (30 ngày)**. Mỗi đơn: khách, điện thoại, địa chỉ (hoặc nhận tại kho), hàng kèm mã từng cái, cách giao, số tiền **thu hộ** (COD), mã vận đơn + ghi chú cho khách. Nút **Bắt đầu giao** / **Đã giao** (**Khách đã nhận** với đơn nhận tại kho) theo từng đơn hoặc tick nhiều đơn; **Đã thu tiền** cho đơn COD đã giao. Mọi nút đi qua chặng ④ Nội địa Việt Nam nên hàng, tiến độ đơn và trang của khách tự cập nhật.

### Changed
- Chuỗi bước đổi tên: **④ Đóng hàng JP**, **⑤ Vận chuyển JP-VN**; thêm **⑦ Giao hàng VN** vào menu và thanh bước (thanh bước gọn lại để 7 bước nằm một hàng).
- Đơn hàng: bộ lọc **Thanh toán** có thêm **Chưa thanh toán** (chưa nhận chuyển khoản / chưa thu COD, trừ đơn đã huỷ); bỏ nút **Xoá lọc**.
- Tồn kho: bỏ dòng “Đã giao ĐVVC / đang bay … xem ở ⑤ Vận chuyển”; Tồn kho VN bỏ khung “Đơn cần giao có hàng sẵn” (đã có ở ⑦ Giao hàng VN).

## [1.93.1] - 2026-09-28

### Removed
- Quản lý mua hàng › Mua theo đợt: bỏ khung “Làm lại từ đầu — xoá toàn bộ dữ liệu mua hàng” (và thao tác phía máy chủ của nó) để không thể xoá nhầm toàn bộ dữ liệu mua hàng.

## [1.93.0] - 2026-09-28

### Changed
- **“Có sẵn” trên trang khách** (thẻ sản phẩm, trang sản phẩm, xem nhanh) chỉ hiện khi sản phẩm có hàng **đang ở Kho Việt Nam (shop), lưu kho và chưa giữ cho đơn nào** (migration 66, cột `products.stock_vn`, tự cập nhật theo từng cái). Hàng còn ở Nhật / đang về / đã giữ cho đơn khác hiện là “Hàng order”. “còn n hàng” đếm theo số đó.
- Thanh toán: dòng không đủ hàng sẵn ở Kho VN được tính là hàng order (cần chuyển khoản trước 100%, trừ khách quen) — cả trên trang thanh toán lẫn khi tạo đơn.
- Tồn kho trong admin (Tồn kho, cảnh báo tồn thấp, cần mua) vẫn đếm mọi cái tự do từ Nhật tới kho shop như trước.

## [1.92.0] - 2026-09-28

### Changed
- **Nguồn hàng khi nhiều đơn cùng muốn một sản phẩm**:
  - Đơn **đã thanh toán / COD được giữ hàng trước** đơn chưa thanh toán (sau đó mới tới đơn đặt trước). Đơn đã thanh toán còn thiếu hàng tự lấy cả cái **đã đóng kiện** đang giữ cho đơn chưa thanh toán (đơn chưa thanh toán mới nhất nhường trước).
  - Dòng “Cần mua” trên trang đơn giải thích lý do khi kho có hàng: “Kho có hàng nhưng đang giữ cho #…”.
  - **Đổi nguồn** có thêm lựa chọn “… đang giữ cho #1020 — lấy n cho đơn này” (kể cả hàng đã đóng kiện): hàng chuyển sang đơn đang xem, đơn kia tự tìm hàng khác hoặc về “Cần mua”. Hàng của đơn đã thanh toán không bị lấy.
- **Thanh dưới đáy trang đơn**: “Xóa đơn hàng” nằm cạnh Huỷ; bên phải là thanh toán và một ô **Trạng thái** gồm tiến độ (Đã đặt hàng → Đã gửi hàng → Đang vận chuyển về kho shop VN → Đã về kho VN → Đang giao hàng → Đã giao hàng thành công), **Đã nhận chuyển khoản**, **Cho thanh toán khi nhận hàng (COD)**, Hoàn tất thanh toán COD và Huỷ / Khôi phục đơn — chọn rồi bấm **Lưu thay đổi**. Bỏ “Chọn bước khác” trong khung Trạng thái đơn hàng (đã có ở thanh dưới).

## [1.91.0] - 2026-09-28

### Changed
- **Dòng chảy kho rõ ràng**: Tồn kho chỉ còn hàng đang nằm tại kho shop; hàng đã giao ĐVVC / đang bay / ở kho ĐVVC VN / đang về kho shop nằm ở **⑤ Vận chuyển**.
  - **Tồn kho Nhật**: bỏ khung “Kho ĐVVC Nhật” và dải “Đang bay”; thay bằng một dòng “Đã giao ĐVVC / đang bay: n cái — xem ở ⑤ Vận chuyển →”. Số ở tab Kho Nhật / Kho VN chỉ đếm hàng tại kho shop.
  - Hàng đã đóng chờ xuất ĐVVC hiện gọn theo **kiện** (mã chuyến, vd “Kiện CH-260928-01 · 5 cái · 2 dòng bill · 5 cái cho đơn khách · ≈ ¥”), bấm để mở danh sách hàng trong kiện. Ô số liệu mới: “Đã đóng kiện, chờ xuất”.
  - Bỏ cột **SL chuyển** (đóng / chuyển một phần làm ở ④ Đóng hàng); tick dòng là chuyển cả dòng.
  - **Tồn kho VN**: khung “Kho ĐVVC VN / đang về kho shop” chuyển sang ⑤ Vận chuyển; ô số liệu mới “Đơn đủ hàng để giao”.
- **⑤ Vận chuyển** có tab theo nơi hàng đang ở: Tất cả chuyến · **Kho ĐVVC Nhật** · **Đang bay NB→VN** · **Kho ĐVVC VN** · **Đang về kho shop** (kèm số cái) — mỗi tab là bảng hàng ở đó (dòng bill, mã, số cái, đơn giữ, chuyến) và các chuyến đang ở chặng đó.
- **Hàng theo đơn**: lọc / sắp xếp kiểu Excel ngay trên tiêu đề cột (▾ ở Đơn, Khách · ngày, Thanh toán, Sản phẩm, SL, Hàng đang ở đâu, Tiến độ đơn): sắp xếp tăng / giảm, ô tìm, tick chọn giá trị (có số đơn mỗi giá trị); nhớ theo tab trình duyệt. Bỏ ô tìm và các nút Tất cả / Còn chờ hàng / Đủ hàng; “Ghép lại tất cả đơn đang chờ” lên thanh dưới đáy. “Chọn tất cả” chỉ tick các đơn đang hiện.

## [1.90.0] - 2026-09-28

### Changed
- **Mua theo đợt**: nút **Ẩn đợt / Hiện đợt** ở đầu mỗi đợt — ẩn thì chỉ còn dòng tiêu đề (số cái, giữ cho đơn, lưu kho, ¥, Sửa, trạng thái); trình duyệt nhớ đợt nào đang ẩn.
- **Xoá sản phẩm** trên thanh dưới đáy, cạnh “+ Thêm sản phẩm”: tick dòng (ở một hoặc nhiều đợt) → Xoá sản phẩm (hỏi lại trước khi xoá). **Xoá đợt** chuyển vào trong nút **Sửa** của đợt (cùng “Cập nhật theo đơn hàng”) để tránh bấm nhầm.
- **Trang đơn hàng**:
  - Khung “Trạng thái” bỏ; trạng thái đơn (chọn rồi **Lưu thay đổi**), thanh toán (Đã nhận chuyển khoản / Cho thanh toán khi nhận (COD) / Hoàn tất thanh toán COD) và **Xoá đơn hàng** nằm trên thanh cố định dưới đáy.
  - “Tiến độ đơn hàng” đổi tên **Trạng thái đơn hàng**; **Vận chuyển đơn này** chuyển xuống ngay dưới, bốn chặng xếp dọc.
  - Bỏ ô “Ghi chú cho khách” khi chuyển bước: mã vận đơn và **ghi chú cho khách** ghi ở từng chặng; khách thấy ghi chú cạnh mã vận đơn của chặng đó (ghi chú tự động về phí / báo giá vẫn chỉ admin thấy).
  - **Bill mua hàng tại Nhật gộp vào Trao đổi với khách**: nút **Đính kèm bill** trong khung chat (ảnh / PDF, nhiều file, ¥ và ghi chú tuỳ chọn), bill hiện trong luồng tin nhắn theo thời gian, có ảnh thu nhỏ và nút Xoá; gửi kèm tin nhắn “📎 Đã đính kèm bill…” cho khách.

### Fixed
- Tin nhắn của shop trong khung chat hiện tên cửa hàng theo giao diện (“Store Lienanh”) thay vì tên cố định.

## [1.89.0] - 2026-09-28

### Changed
- **Thanh cố định dưới đáy cho mọi màn quản trị** (giống trang sản phẩm): màn nào có ô sửa đều có “Lưu thay đổi (n ô)” + “Huỷ”; tự nhận mọi form trên màn, sửa nhiều dòng / nhiều khối rồi bấm Lưu một lần là lưu hết, Huỷ trả mọi ô về giá trị đang lưu. Thanh ẩn ở màn chỉ xem (tổng quan, danh sách đơn khi chưa tick…).
- **Thao tác cho dòng đã tick nằm trên thanh đó** và chỉ hiện khi có dòng được tick: “Đã tick n → …” + “Bỏ tick”, cho mọi bảng có ô chọn (Đơn hàng, Tồn kho, hàng của sản phẩm, Quản lý mua hàng, Vận chuyển — gom lô / đổi trạng thái chặng, Bài viết, Fanpage, Đánh giá, Sản phẩm, Nhóm biến thể, Giảm giá, Flash Sales, Nhãn, Tìm kiếm, Công thức giá, Nguồn mua).
- **Đóng hàng**: chuyến đang đóng đưa “+ Thêm vào chuyến”, số dòng · số cái và bộ lọc Theo đơn / Theo đợt mua / Tìm lên thanh dưới đáy; tick hàng trong chuyến → “✕ Rút khỏi chuyến” hiện trên thanh. Trên điện thoại bộ lọc ở lại trong khung chuyến để thanh gọn.
- Thông báo nổi (toast) hiện phía trên thanh, không che nút.

## [1.88.0] - 2026-09-28

### Changed
- **Chuỗi kho hàng có thêm bước Đơn hàng**: menu Kho hàng và thanh bước đi theo thứ tự ① Đơn hàng → ② Quản lý mua hàng → ③ Tồn kho Nhật → ④ Đóng hàng → ⑤ Vận chuyển → ⑥ Tồn kho VN; trang Đơn hàng hiện thanh bước (số đơn đang xử lý / chờ).
- **Đóng hàng**: trạng thái chuyến là một timeline (Đang đóng → Đã đóng xong → Đã giao ĐVVC → NB→VN → Kho ĐVVC VN → Về kho VN), bấm mốc để chuyển, nút “Lùi về” / “Tiếp”. Khung thêm hàng gộp với nút “+ Thêm vào chuyến” trên một thanh ghim khi cuộn (lọc theo đơn / đợt mua / tìm). Cuối bảng chuyến có dòng **Tổng cộng**: số cái · số dòng bill · số cái cho đơn khách · ≈ ¥. Tick dòng → “Rút khỏi chuyến”.
- **Mọi bảng thao tác có ô chọn tất cả + chọn từng dòng**, thanh “Đã tick →” ở trên bảng, nút chỉ bật khi đã tick, bỏ các câu chú thích quanh bảng: Tồn kho theo sản phẩm (đặt mức tồn tối thiểu hàng loạt), hàng của sản phẩm (loại khỏi tồn), Tồn kho Nhật / VN, Hàng theo đơn (ghép lại các đơn đã tick), Quản lý mua hàng (theo đơn, hàng lưu kho), Vận chuyển (gom lô; sheet từng chặng đổi trạng thái hàng loạt), Bài viết (đăng / ẩn / xoá), Fanpage (đăng ngay / huỷ lịch), Đánh giá (duyệt / từ chối / xoá), Sản phẩm (gộp nhóm biến thể luôn hiện), Nhóm biến thể (tách khỏi nhóm), Giảm giá (bỏ giảm), Flash Sales (bỏ khỏi), Nhãn (gỡ nhãn), Tìm kiếm (ẩn / hiện từ khoá), Tỉ lệ theo danh mục (bỏ), Nguồn mua (xoá). Bảng báo cáo chỉ đọc (kế toán, tổng quan, khách hàng…) giữ nguyên.
- Trang đơn: khung **Ghi chú nội bộ** xuống cuối cột phải.

### Fixed
- Sales › Nhãn: thông báo sau khi lưu / gỡ nhãn không hiện khi trang đang mở một nhãn (URL có sẵn `?open=`).

## [1.87.0] - 2026-09-28

### Changed
- **Từng cái có mã riêng** (migration 65, bảng `stock_units` + nhật ký `stock_unit_events`): mỗi món hàng mua về là một dòng với mã ngắn `H` + 6 số + 1 số kiểm tra (Damm) — vd `H0001235`, gõ sai một số hoặc đảo hai số liền nhau đều bị từ chối, hợp in tem / QR. Mỗi cái mang nguồn gốc (bill, đợt mua, nơi mua, cửa hàng, ngày mua, HSD, ¥), vị trí (dự định mua → đã đặt mua → Kho Nhật → ĐVVC Nhật → đang bay → ĐVVC HN → đang về → Kho VN → đang giao → khách nhận), chuyến đóng hàng và đơn đang giữ nó. Bỏ khái niệm “lô” và “phiếu mua lưu kho”; dữ liệu cũ chuyển sang từng cái (tồn kho từng sản phẩm và phần giữ cho từng dòng đơn không đổi), bảng cũ giữ nguyên để quay lại được.
- **Một nguồn sự thật, tự đồng bộ**: mọi thay đổi ở từng cái (đợt mua, Tồn kho, Đóng hàng / Vận chuyển, đơn hàng) tự tính lại: đơn nào giữ cái nào (đơn cũ trước; gần khách nhất → hạn dùng gần nhất → bill sớm hơn; bỏ qua hàng hết hạn; hàng đã thanh toán / đã đóng chuyến / chọn tay không bị đổi), trạng thái dòng đơn, tiến độ đơn + 4 chặng (chỉ tiến, và chỉ khi đơn đã thanh toán hoặc COD), trạng thái đợt, tồn web. Đổi tiến độ / chặng bằng tay trên đơn thì hàng của đơn đi theo — hết lệch giữa các màn. Huỷ đơn: hàng về tồn và đơn đang chờ được giữ ngay. Khởi động lại cũng tự tính lại toàn bộ.
- **Quản lý mua hàng › Mua theo đợt** dạng cây: sản phẩm (gộp SL) → dòng bill (sửa nơi mua, cửa hàng, HSD, ngày mua, ¥, bill, SL, trạng thái cho mọi cái) → từng mã (trạng thái riêng, đơn giữ, chuyến). Hai cách xem “Theo sản phẩm” / “Từng mã”; lọc thêm theo **Kênh** (đặt online / mua tại cửa hàng), mã H…, Loại (hàng theo đơn / lưu kho / cần mua); tick theo sản phẩm / dòng bill / từng mã; thao tác Cập nhật trạng thái · Thất lạc · Xoá (nhập nhầm). Dòng “cần mua” của đơn trong đợt: tick + trạng thái = tạo mã cho đơn. Dòng thêm sản phẩm có ô trạng thái (mua tại quầy = Tại kho Nhật, đặt online = Đã đặt mua).
- Tab **Hàng lưu kho** (thay Mua lưu kho): mọi cái chưa có khách theo dòng bill, chuyển trạng thái / đưa vào đợt; form nhập hàng lưu kho không theo đợt.
- **Tồn kho Nhật / VN**, **Đóng hàng**, **Vận chuyển**: theo dòng bill × vị trí, mở ra xem từng mã; chuyển / đóng một phần theo số cái; chuyến đổi trạng thái là mọi cái trong chuyến đổi vị trí, đơn và đợt đổi theo.
- Trang **hàng của sản phẩm** (từ tên sản phẩm): mọi cái theo dòng bill, sửa một lần, loại khỏi tồn (thất lạc / hỏng / loại bỏ) và khôi phục, nhập hàng trực tiếp / khách trả lại, đính ảnh bill theo dòng. Trang **mã hàng** `/admin/inventory/units/H…`: nguồn gốc + lịch sử từng lần đổi (nền cho quét tem / kiểm hàng sau này), ô “Tra mã”.
- Kiểm kê / sửa tồn bằng tay: thừa → cái mới trên bill kiểm kê `KK-yymmdd`; thiếu → cái hạn gần nhất được đánh dấu thất lạc (giữ mã và lịch sử).
- Trang đơn: nguồn hàng hiện mã từng cái; “đổi nguồn” chọn theo dòng bill (hoặc Cần mua); “Tự động phân bổ” bỏ chọn tay và xếp lại.
- **Mã nhóm biến thể** tự sinh theo tên (vd `SUA-TAM-HATOMUGI`), sửa được ở trang nhóm, hiện cạnh sản phẩm trong bảng mua hàng / tồn kho.

## [1.86.0] - 2026-09-28

### Changed
- **Tiến độ đơn hàng theo hình thức thanh toán** (migration 64, cột `orders.paid_at`): thanh toán là một mốc riêng, không còn là một bước vận chuyển.
  - Trả trước (chuyển khoản): Đã đặt hàng → **Đã thanh toán** → Đã gửi hàng → Đang vận chuyển về kho shop VN → Đã về kho VN → Đã giao hàng thành công.
  - COD (chỉ admin cho phép): Đã đặt hàng → Đã gửi hàng → Đang vận chuyển về kho shop VN → Đã về kho VN → Đã giao hàng thành công → **Hoàn tất thanh toán** (nút “Hoàn tất thanh toán (đã thu tiền)” khi đã giao). Đơn COD đã giao nhưng chưa thu tiền vẫn “Đang xử lý”.
  - Bước mới **Đã gửi hàng**; chặng ① “Đã gửi” tự chuyển đơn sang bước này, chặng ① “Đã đến” (kho Kiến Nhật) sang “Đang vận chuyển về kho shop VN”. Admin thấy thêm chặng nhỏ (Kho Kiến Nhật / Đang bay / Kho ĐVVC Hà Nội / Đang về kho shop) và bước “Đang giao hàng”; khách chỉ thấy các bước chính.
  - Đơn cũ ở bước “Đã xác nhận thanh toán” chuyển thành “Đã đặt hàng” + đã thanh toán (giữ ngày). Tồn kho trừ khi đã thanh toán, khi chọn COD, hoặc khi hàng đã gửi đi.
- Trang đơn: nút **Tự động phân bổ** (gần khách nhất trước: Kho VN → ĐVVC VN → đang về → đang bay → ĐVVC Nhật → Kho Nhật → phiếu mua → đợt đang gom → cần mua; cùng chỗ thì hạn dùng gần nhất, rồi bill mua sớm hơn); báo lại từng sản phẩm lấy từ đâu. **Lô đã hết hạn không còn được phân bổ tự động** (vẫn chọn tay được).
- Thanh toán: bỏ ô “Đánh dấu khách quen” khi chọn COD; COD là nút có xác nhận. Trang thanh toán của khách chỉ nhận chuyển khoản (server cũng chặn COD gửi từ form).
- Chặng ④ Ship nội địa VN có lựa chọn **Khách tới kho lấy — 0đ** (đơn chuyển sang nhận tại kho).

## [1.85.0] - 2026-09-28

### Changed
- **Quy trình nhập hàng 5 bước**: menu Kho hàng xếp theo đường đi của hàng — ① Quản lý mua hàng → ② Tồn kho Nhật → ③ Đóng hàng → ④ Vận chuyển → ⑤ Tồn kho VN. Mỗi trang có thanh bước ở trên cùng (số đv / chuyến ở từng bước, bấm để sang bước khác).
- ③ Đóng hàng chỉ còn chuyến đang đóng / đã đóng xong; chuyến đã giao ĐVVC sang **④ Vận chuyển** (kho Kiến Nhật → bay NB→VN → kho ĐVVC Hà Nội → về kho shop VN). Mỗi chuyến có nút **bước tiếp** một bấm (vd “Đã chuyển cho ĐVVC”, “Đã về kho shop VN”). ④ liệt kê cả lô đang ở ĐVVC mà không nằm trong chuyến nào.
- Mua theo đợt: bộ lọc thêm **Loại** (Hàng theo đơn / Lưu kho ở Nhật) và **Đơn** (#đơn · khách).

### Fixed
- Đơn đã huỷ không còn nằm trong đợt mua (dòng #1010, #1011 làm số đợt lệch với Tồn kho): huỷ đơn giờ đưa dòng ra khỏi đợt; dòng của các đơn huỷ trước đây được dọn khi khởi động. Số hàng của đợt khớp với Tồn kho.

## [1.84.0] - 2026-09-28

### Changed
- Mua theo đợt — thẻ đợt gọn hơn: bỏ “Cả đợt → Cập nhật”; chỉ còn **Dòng đã tick → [trạng thái] Cập nhật trạng thái · Xoá dòng đã tick**, bị khoá cho tới khi tick ít nhất một dòng (tick ô đầu bảng = cả đợt; mọi dòng cùng trạng thái thì trạng thái đợt tự theo). Thêm nút **Cập nhật theo đơn hàng**: trả chỗ giữ của đơn đã huỷ về tồn và ghép lại các đơn đang chờ theo quy tắc vị trí → hạn dùng → bill.
- Số tổng ở đầu đợt không còn đếm trùng dòng đơn đã nằm trong lô: “hàng đã mua (lô) · phiếu · dòng đơn chưa có lô · tổng”, khớp với dòng Tổng cộng của bảng.
- **Bill** thành nút ở góc phải thẻ đợt (“Bill (n)”), bấm mở danh sách / nhập bill / ảnh; bỏ dãy mã bill ở tiêu đề.
- **+ Thêm sản phẩm** (thanh cố định) mở một dòng nhập ngay cuối bảng, trên dòng Tổng cộng, của đợt đang xem; bỏ khối “+ Thêm sản phẩm đã mua” và khối “Gán tay dòng đơn ‘Chưa mua’ vào đợt”. Dòng đơn được phiếu (hàng chưa nhập kho) giữ đủ cũng gộp vào dòng phiếu (“Hàng cho đơn #…”).
- **Sửa** thông tin đợt là nút cạnh tên đợt (mở khung sửa), bỏ khối cuối thẻ.
- Bỏ link “Xem cả đợt đã về kho”: ô tìm đợt có dropdown **Đợt đang mở / Đợt đã về kho VN / Tất cả**; bộ lọc bảng thêm dropdown **Trạng thái** dòng.

## [1.83.0] - 2026-09-28

### Changed
- Mua theo đợt — bảng đợt gọn lại: bộ lọc là **ô tìm (sản phẩm / #đơn / khách) · Mua ở (dropdown) · Ngày mua · Bill**; bỏ các chip Loại / Mua ở / Chỉ dòng có ghi chú / Chỉ SL ≥ 2. **Ô tick ở đầu bảng chọn tất cả** dòng đang hiện (như màn Đơn hàng); thanh “Đã tick →” chỉ còn chọn trạng thái → **Cập nhật** và **Xoá dòng đã tick** (bỏ Bỏ khỏi đợt, Gắn bill, Chuyển sang đợt). Cột **sắp xếp được** (bấm tiêu đề): Sản phẩm, SL, Mua ở, HSD, Ngày mua, ¥/đv, Trạng thái, Bill; HSD · Ngày mua · ¥/đv tách thành ba cột; cửa hàng ghi ngay dưới ô Mua ở; bỏ cột Ghi chú. **Dòng Tổng cộng** cuối bảng (số dòng · đv · ¥) tự tính lại theo bộ lọc. Nút **+ Thêm sản phẩm** nằm cạnh Lưu thay đổi ở thanh cố định, mở dòng nhập của đợt đang sửa.

## [1.82.3] - 2026-09-28

### Changed
- Tồn kho quản lý theo **mã bill**: cột “Lô #” thành **Bill · lô** (mã bill bấm mở trong đợt mua; “chưa có bill” khi chưa gắn; số lô ghi nhỏ bên dưới), ô tìm khớp cả mã bill. Nguồn hàng của dòng đơn (trang đơn, Hàng theo đơn, Mua theo đặt hàng) ghi “bill …” thay cho “lô #…”, và “đợt DG-…” thay cho “chuyến”. Bảng chuyến Đóng hàng cũng hiện mã bill.

## [1.82.2] - 2026-09-28

### Changed
- Tốc độ tải: trang chủ nhẹ hơn — 4 hàng danh mục × 8 sản phẩm (trước 6 × 12), đoạn mô tả xem nhanh ngắn hơn; ảnh thẻ sản phẩm khai báo đúng kích thước hiển thị (điện thoại tải bản 256/384 px thay vì 640 px); ảnh tối ưu giữ trong cache trình duyệt / Cloudflare 30 ngày (`images.minimumCacheTTL`). Kết hợp với Cloudflare Cache Rule cho `/_next/image` (đã tạo 28/09) để ảnh phục vụ từ edge.

## [1.82.1] - 2026-09-28

### Changed
- Mua theo đợt: bảng đợt có cột **Bill** sửa được trên từng dòng (dòng đơn, phiếu, lô): gõ mã bill của cửa hàng (vd `BILL_260927_1454` giống tên ảnh) → mã mới tạo bill trong đợt (ngày lấy từ mã), mã có sẵn gắn vào bill đó, xoá trống bỏ gắn; có gợi ý các mã của đợt; lưu bằng Lưu thay đổi. Bỏ huy hiệu bill dưới tên sản phẩm.
- Mua theo đợt › Bill: **đổi mã bill** ngay trong khối Bill (mã PM-… tự sinh đổi thành mã riêng; mã phải duy nhất).

## [1.82.0] - 2026-09-28

### Changed
- Phân bổ nguồn hàng: **vị trí trước, hạn dùng sau** — đơn mới lấy hàng ở Kho VN (shop) trước, rồi kho ĐVVC VN, đang về kho shop, đang bay, kho ĐVVC Nhật, Kho Nhật; trong cùng vị trí mới xét hạn dùng gần trước, rồi bill mua sớm trước. Hàng có sẵn ở VN luôn được giao ngay; hàng ở Nhật chỉ dùng khi VN hết.

### Added
- Tồn kho › Hàng theo đơn: nút **Ghép lại tất cả đơn đang chờ** (xếp lại giữ chỗ tự động cho mọi đơn chưa trừ tồn, đơn cũ trước, theo quy tắc mới; phần đã trừ tồn và nguồn chọn tay giữ nguyên) và link **ghép lại** từng đơn.

## [1.81.1] - 2026-09-28

### Changed
- Mua theo đợt: dòng đơn đã có lô của đợt giữ hàng **gộp vào dòng lô** (huy hiệu “Hàng cho đơn #… · tên khách ×n”), không còn dòng đơn trùng; dòng đơn riêng chỉ hiện khi chưa có lô. Lọc theo đơn / tên khách vẫn tìm được dòng lô đó.
- Tồn kho › Hàng theo đơn: **một bảng thẳng cột** — Đơn · Khách · ngày · Thanh toán · Sản phẩm · SL · Hàng đang ở đâu · Tiến độ đơn (ô đơn gộp theo số dòng của đơn).

## [1.81.0] - 2026-09-27

### Added
- Mua theo đợt: **Làm lại từ đầu** (chỉ chủ shop, gõ XOA để xác nhận) — xoá mọi đợt mua, phiếu, bill (kèm ảnh), lô hàng, chuyến đóng hàng; dòng của đơn đang xử lý trở về “Cần mua”; sản phẩm chỉ có tồn từ lô trở về hàng order.
- Mua theo đợt: **Xoá dòng đã tick** (dòng đơn về “Cần mua” và rời đợt, phiếu và lô bị xoá) bên cạnh Bỏ khỏi đợt; ô “chọn tất cả đang hiện” tick cả lô.
- Mua theo đợt › Bill: **Nhập nhanh nhiều bill** — dán danh sách, mỗi dòng `mã | cửa hàng | nội dung | tổng` (tab hoặc | ngăn cách), dòng `@ Tên nguồn` đặt nơi mua cho các dòng dưới (nguồn chưa có được tạo là cửa hàng); ngày lấy từ mã BILL-yymmdd-…, tổng ¥ và cách trả (tiền mặt / PayPay) ghi vào bill; mã đã có thì bỏ qua.

### Changed
- Phân bổ nguồn hàng: cùng hạn dùng và cùng vị trí thì **hàng mua trước (ngày bill sớm hơn) gán cho đơn trước**, phần còn lại là tồn kho.

## [1.80.4] - 2026-09-27

### Changed
- Đóng hàng: khối chọn hàng **mở sẵn** cho mỗi chuyến đang mở và chia hai nhóm — **① Hàng theo đơn đang ở Kho Nhật** (hiện trước, **tick sẵn**, SL điền sẵn đúng số khách cần; hàng đã thanh toán đi cùng) và **② Hàng tồn kho không theo đơn** (thu gọn, bấm mở). Bấm “Thêm vào chuyến (đã tick)” ở thanh cố định là đóng ngay hàng cho khách; chọn theo đơn / đợt mua / tìm để thu hẹp.

## [1.80.3] - 2026-09-27

### Changed
- Trang lô của sản phẩm: cột **Bill** là ô **mã bill gõ tay** (mã của cửa hàng; gõ mã mới → tạo bill, gõ mã có sẵn → gắn vào bill đó, xoá trống → bỏ gắn; lưu bằng thanh Lưu thay đổi) kèm thumbnail ảnh, link “mở bill” và nút **đính ảnh** ngay trên từng dòng — lô chưa có bill thì bill được tạo luôn khi đính ảnh (mã PM-… tự sinh).

## [1.80.2] - 2026-09-27

### Changed
- Đóng hàng: thay ô tìm sản phẩm bằng khối **Chọn hàng đóng vào chuyến** với ba cách: **theo đơn** (mọi sản phẩm của đơn đang có ở Kho Nhật), **theo đợt mua** (mọi hàng của đợt còn ở Kho Nhật), **tìm** sản phẩm / #đơn / tên khách. Danh sách có ô tick từng dòng và **chọn tất cả**, cột SL đóng (theo đơn thì điền sẵn đúng số của đơn; hàng khách đã thanh toán luôn đi cùng), đơn, đợt, HSD, mua ở · ¥. Hàng mua theo đơn từ đợt mà chưa có lô (dòng “Đã mua” cũ) cũng hiện và được tạo lô khi đóng, đơn giữ đúng lô đó.
- **Thanh Lưu / Huỷ cố định dưới màn hình** (như màn Sản phẩm) cho trang lô sản phẩm, tab Mua theo đợt (một thanh chung, lưu khối vừa sửa, đếm số ô đã đổi) và Đóng hàng (“Thêm vào chuyến (đã tick)” / “Bỏ tick”); bỏ các thanh dính trong từng khối.

## [1.80.1] - 2026-09-27

### Added
- Tồn kho: sheet thứ ba **Hàng theo đơn** — mỗi đơn đang xử lý một khối (số đơn, khách, ngày, thanh toán, tiến độ) với từng sản phẩm và **hàng đang ở đâu** (lô · vị trí · đợt / chuyến, đã trừ tồn hay chỉ giữ chỗ, Cần mua); ô tổng và chip “Còn chờ hàng” / “Đủ hàng tại kho VN”, ô tìm.

### Changed
- Trang lô của sản phẩm: bảng là **một form** — sửa nhiều ô rồi bấm **Lưu thay đổi** (thanh đỏ dính cuối màn) hoặc **Huỷ** (trả về giá trị đang lưu); bỏ nút Lưu từng dòng (giữ nút xoá lô có hỏi lại). Mỗi lô có cột **Bill** (chọn bill của đợt mua) và hiện mã bill + thumbnail ảnh bill + nút đính ảnh. Bỏ cột “Vị trí trong kho” (cả trong khung Nhập lô trực tiếp).
- Tồn kho › Kho Nhật: bỏ cột “Gửi SL” và “Tách” — chuyển / đóng theo cả lô; đóng một phần theo số lượng làm ở màn Đóng hàng.

## [1.80.0] - 2026-09-27

### Added
- **Kho hàng › Đóng hàng** (menu cuối nhóm Kho hàng, migration 63): chuyến đóng hàng CH-… từ Kho Nhật (shop) gửi ĐVVC. Mở chuyến (tên, ngày dự kiến gửi, ghi chú), trong chuyến **tìm sản phẩm theo tên và nhập số lượng đóng** → hàng rời kệ Kho Nhật ngay (lấy lô hạn dùng gần trước, hàng khách đã thanh toán đi trước, tách lô khi chỉ lấy một phần; thiếu thì báo còn thiếu bao nhiêu). Bảng chuyến: sản phẩm, SL đóng (kèm số đã thanh toán), lô #, HSD, đơn khách, mua ở · ¥, vị trí; rút từng lô khi chuyến chưa xuất (phần tách tự gộp về lô gốc). Trạng thái chuyến: Đang đóng → **Đã đóng xong** → **Đã chuyển cho ĐVVC** → NB→VN → Kho ĐVVC VN → Về kho shop VN — từ “Đã chuyển cho ĐVVC” mọi lô đổi vị trí theo, dòng đơn khách cập nhật theo. Sửa thông tin chuyến (ngày gửi, mã vận đơn…); xoá chuyến chưa xuất trả hàng về kệ.
- Tồn kho › Kho Nhật: bảng “tại kho shop” chỉ còn hàng **trên kệ**; hàng đã đóng nằm ở nhánh **“Đã đóng hàng, chờ xuất ĐVVC”** (lô, SL, chuyến, đơn). Thanh “Lô đã tick →” có thêm **Đóng vào chuyến** (chọn chuyến đang mở; SL nhập = phần chưa bán, hàng đã thanh toán đi cùng). Tồn web không đổi khi đóng hàng (hàng vẫn còn, chỉ đã vào thùng).

## [1.79.4] - 2026-09-27

### Changed
- Mua theo đợt: **bảng của mỗi đợt là một form** — sửa bao nhiêu ô cũng được rồi bấm **Lưu thay đổi** (thanh đỏ dính cuối màn hình khi đợt đang hiện, như màn Sản phẩm). Bỏ hết nút ✓ ✕ / SL tách trên từng dòng; chỉ ghi những ô thực sự đổi (đổi trạng thái → lô đổi vị trí theo). Bỏ dòng “Nguồn mặc định · ngày mua · gửi NB→VN” dưới tiêu đề (tổng đv · ¥ chuyển lên cạnh tiêu đề).
- Mua theo đợt: **Bill là đơn vị đánh số** (PM-…) mà từng dòng sản phẩm tham chiếu — badge mã bill trên mỗi dòng (dòng đơn, phiếu, lô), “chưa có bill” khi chưa gắn. Khối **Bill (n)** ngay trong đợt (bấm mở): danh sách bill với ngày, nguồn, ¥, số sản phẩm, số dòng trong đợt, **ảnh chụp bill** (thêm / gỡ tại chỗ), nhập bill mới bằng cách dán nội dung (tự tách sản phẩm → phiếu nháp xác nhận ngay phía trên đợt) hoặc **Tạo bill trống** để đính ảnh. Form “+ Thêm sản phẩm đã mua” (thu gọn, bấm mới mở) có ô **Bill**: chọn bill có sẵn / “+ bill mới” tự tạo / không gắn. Dòng đã tick → **Gắn bill**.
- Mua theo đợt: bỏ khung “Phiếu mua hàng · nhập bill” cuối trang ở tab này (còn trên hai tab kia); phiếu nháp cần xác nhận hiện ngay trên danh sách đợt.
- Tồn kho › trang lô của sản phẩm: mỗi lô hiện mã bill (thay “phiếu mua #…”) kèm nút **ảnh bill** đính kèm ảnh chụp ngay tại đó.

## [1.79.3] - 2026-09-27

### Changed
- Menu quản trị › Kho hàng: nhóm con **Chung** (Danh mục, Nguồn nhập, Địa chỉ kho, Công thức giá) đứng đầu, rồi Sản phẩm, Nhóm biến thể, **Quản lý mua hàng**, **Tồn kho** (tên mới của mục “Kho hàng”). Nhóm con mở/đóng như nhóm cha, tự mở khi đang ở trang bên trong.
- Mua theo đợt: bỏ khối “Giữ lại tại Nhật từ đợt này” (không còn khái niệm giữ lại).
- Khởi động: dọn phiếu mua / phân bổ còn trỏ tới lô đã bị xoá tay (phiếu bị xoá, dòng đơn được gán nguồn lại) — chạy mỗi lần khởi động, không đổi gì khi dữ liệu sạch.

## [1.79.2] - 2026-09-27

### Added
- Mua theo đợt: dòng đơn khách trong đợt cũng nhập được **HSD, ngày mua, ¥/đv** (lưu trên dòng đơn, migration 62 — nền cho tính lãi từng đơn); ✓ lưu cùng nguồn / trạng thái / ghi chú.
- Mua theo đợt: mỗi đợt có dòng **Bill:** liệt kê phiếu mua đã gắn vào đợt (mã PM-…, ngày, nguồn, số ảnh) bấm mở phiếu, và nút **Nhập bill vào đợt này** (mở khung Phiếu mua hàng với đợt chọn sẵn). Dòng lô / dòng đơn hiện mã bill thay cho nhãn “Lô #… · vị trí” (lô không có bill chỉ ghi nhỏ “lô #…”).
- Phiếu mua hàng: **đính kèm ảnh chụp bill / PDF** (nhiều tệp, ≤ 10 MB/tệp, lưu trong uploads/receipts), xem thumbnail, gỡ từng tệp.
- Mua theo đợt: **tìm đợt** theo tên / mã và khoảng ngày mua (tìm cả đợt đã về kho).
- Mua theo đợt: tick mọi loại dòng (dòng đơn, phiếu, lô) → **Đã tick → [trạng thái] Áp dụng** đặt một trạng thái cho tất cả (lô đổi vị trí theo; lô đã mua không lùi về “Chưa mua / Đã đặt mua”).

### Changed
- Mua theo đợt: khung “Mở đợt mua mới” và “Cách dùng” thu thành hai nút bấm mở (tự mở khi chưa có đợt) để danh sách đợt được nhiều chỗ hơn; ô tìm đợt nằm ngay trên.
- Mua theo đợt: các chip lọc (Loại, Mua ở, Trạng thái, Chỉ dòng có ghi chú, Chỉ SL ≥ 2) nằm cùng hàng với ô tìm sản phẩm / đơn hàng.

## [1.79.1] - 2026-09-27

### Changed
- Quản lý mua hàng: tab **Mua theo đợt** đứng đầu và là tab mặc định (một đợt = một lần đi mua / một bill, hàng nằm ở shop Nhật chờ gửi về); tab Mua theo đặt hàng và Mua lưu kho đứng sau.
- Mua theo đợt: bỏ khái niệm “chuyến hàng NB→VN” (1.79.0). Dòng lô trong đợt **sửa được mọi trường như trước**: SL chưa bán (kèm “+n đã TT” = hàng khách đã thanh toán còn trong lô), mua ở, HSD, ngày mua, ¥/đv, trạng thái (= vị trí lô: Tại kho Nhật → ĐVVC Nhật → NB→VN → kho ĐVVC VN → Tại kho VN), cột **Cửa hàng · ghi chú**, nút ✓ lưu và tách lô. Dòng đơn trong đợt sửa như cũ. Form **Thêm sản phẩm đã mua vào đợt** trở lại (tìm tên, mua ở, SL, HSD, ngày mua, ¥, ghi chú) — hàng thêm thành lô ở Kho Nhật (shop) ngay và tự gán cho đơn đang chờ. Bỏ hoàn toàn “Giữ Nhật” (từng dòng và hàng loạt) và khung “Chọn lô từ Kho Nhật”; “Cả đợt →” vẫn đổi trạng thái mọi dòng một lần.
- Mua lưu kho: thêm bảng **Hàng lưu kho từ các đợt mua** (lô còn hàng chưa bán: vị trí, đợt, HSD, chưa bán / còn, mua ở · ¥) ăn theo tab Mua theo đợt; phía dưới vẫn là phiếu chưa thành lô.
- Kho hàng › Kho Nhật › tại kho shop: thanh “Lô đã tick → [vị trí] Chuyển” thay cho Đưa vào chuyến / Giữ lại; SL nhập = phần chưa bán chuyển đi (0 = chỉ hàng khách đã thanh toán), đợt mua của lô giữ nguyên; cột “Chuyến” đổi thành “Đợt mua”.

## [1.79.0] - 2026-09-27

### Changed
- **Mô hình kho theo lô, 4 vị trí** (migration 61): mỗi lô ở một trong `Kho Nhật (shop)` → `Kho ĐVVC Nhật` → `Kho ĐVVC VN` → `Kho Việt Nam (shop)`, cờ “đang bay NB→VN” giữa hai kho ĐVVC. Hàng **đã mua tại Nhật thành lô ngay** ở Kho Nhật (shop) (ngày nhập = ngày mua, nguồn, HSD, ¥); trước đây phải tới “Đã nhận (kho shop)” mới có lô nên Kho Nhật luôn 0. Chuỗi trạng thái phiếu/dòng: Chưa mua → **Đã đặt mua (chưa nhận)** (mới) → Tại kho Nhật (shop) → Đã gửi ĐVVC Nhật → NB→VN → Tại kho ĐVVC VN → Về kho shop VN → Đang giao → Đã nhận. “Đã mua” cũ = Tại kho Nhật (shop).
- **Chuyến hàng (DG-…) = một lần chuyển lô qua các vị trí**: đổi trạng thái chuyến → mọi lô trong chuyến đổi vị trí theo (Đang gom = Kho Nhật shop; Đã gửi ĐVVC Nhật = Kho ĐVVC Nhật; NB→VN = đang bay; Tới kho ĐVVC VN; Tại kho VN = chuyến kết thúc). Lô không thuộc chuyến nào đứng ở Kho Nhật (shop) (“giữ lại Nhật” = rút khỏi chuyến, thêm lại được); **rút lô khỏi chuyến chỉ trước NB→VN**, sau đó bị từ chối. Xoá chuyến đang gom trả lô về Kho Nhật, không mất lô.
- **Kho hàng** mặc định là bảng lô, hai tab màu **Kho Nhật** (xanh) / **Kho Việt Nam** (đỏ), mỗi tab có khối “Tại kho shop” (thao tác) và “Tại kho ĐVVC” (chỉ xem), dải “Đang bay NB→VN”, ô tổng (lô, tại kho shop, tại kho ĐVVC, giữ cho đơn, tồn tự do, vốn), bộ lọc sản phẩm/SKU · nguồn · HSD · chỉ hàng theo đơn / chỉ tồn tự do, sắp xếp FEFO. Cột: sản phẩm, lô #, ngày nhập, nguồn, HSD (tô màu ≤ 90 ngày), Còn (kèm “n đã TT” = hàng khách đã thanh toán còn nằm trong lô), Giữ cho đơn (#đơn×n bấm được, xanh = đã thanh toán / COD, vàng = chỉ giữ chỗ), Tự do, ¥/đv, chuyến, ghi chú.
- Kho Nhật › tại kho shop: tick lô (hoặc nhập SL chưa bán, **0 = chỉ hàng khách đã thanh toán**) → **Đưa vào chuyến / gộp lại** (chọn chuyến đang gom hoặc “+ Chuyến mới”), **Giữ lại**, tách lô, **Gộp về lô gốc**; nút **Tự chọn theo đơn** tự tick đúng lô đang giữ hàng của đơn đã thanh toán / COD (FEFO). Rút phần lô đã tách khỏi chuyến tự gộp lại về lô gốc nếu lô gốc còn ở Kho Nhật ngoài chuyến.
- Kho Việt Nam › tại kho shop: danh sách **Đơn cần giao có hàng sẵn** (đơn đã thanh toán / COD mà mọi lô đã về kho shop VN — lô còn ở kho ĐVVC VN chưa tính) với nút Đóng gói giao; khối Nhập lại / Điều chỉnh. Bảng theo sản phẩm (kiểm kê, CSV) chuyển sang nút “Theo sản phẩm · kiểm kê · CSV”; kiểm kê theo 4 vị trí.
- Trang lô của từng sản phẩm: chia khối **Kho Nhật (shop · ĐVVC Nhật)** / **Kho Việt Nam (ĐVVC VN · shop)**, hiện “đang bay” và chuyến của lô.
- Quản lý mua hàng › tab **Mua theo đặt hàng** đổi thành **bảng theo đơn**: mỗi đơn một khối (số đơn, khách, ngày, thanh toán, “cần mua n đv” / “đủ hàng”) với mọi dòng và cột **Nguồn hàng** giống trang đơn (Có sẵn · Kho Nhật · chuyến DG-…, Sắp về kho shop, Cần mua…). Mặc định hiện mọi đơn đang xử lý; một ô tìm (#đơn, khách, sản phẩm, SKU) + chip **Tất cả / Chỉ đơn còn dòng Cần mua / Chỉ đơn đủ hàng**; ô tổng Đơn đủ hàng / Đơn thiếu hàng / Đơn vị cần mua. Bỏ bộ lọc ngày / nguồn cũ; dòng “Cần mua” vẫn tick được để tạo phiếu mua / đưa vào chuyến.
- Quản lý mua hàng › tab **Mua theo đợt** đổi thành **Chuyến hàng NB→VN**: bảng chuyến liệt kê **lô / phần lô** đi chuyến này (badge “Lô #… · vị trí”, #đơn×n giữ trong lô, tự do), phiếu chưa mua và dòng đơn; nút **Giữ Nhật** / tách cho lô (khoá khi chuyến đã bay). Bỏ form “Thêm sản phẩm đã mua vào đợt”; thay bằng khung **Chọn lô từ Kho Nhật (shop) đưa vào chuyến này** (tick, SL chưa bán gửi kèm). Giữ lại hàng loạt (tick) áp dụng cho cả lô.
- Quản lý mua hàng › tab **Mua lưu kho** chỉ còn **phiếu chưa thành lô** (Chưa mua / Đã đặt mua); form bỏ ô “Nhập vào kho”, tình trạng thu về **Đã đặt mua online** (chờ nhận) / **Đã cầm hàng (tại quầy)** (thành lô Kho Nhật ngay) / Chưa mua; cột SL ghi “giữ cho #đơn×n”; phiếu đã thành lô có link “Xem lô đã nhập”. Bỏ nhãn “→ Kho Việt Nam” trên phiếu.
- Nhập bill: khi xác nhận chọn **Đã cầm hàng (tại quầy)** → lô ở Kho Nhật (shop) ngay, hoặc **Đã đặt mua online** → phiếu chờ nhận (mặc định theo loại nguồn: cửa hàng = đã cầm, website = đặt mua).
- Trang đơn / dòng đơn: nguồn hàng đọc “Có sẵn · Kho Nhật (shop) · chuyến DG-…”, “Sắp về kho shop · Kho ĐVVC VN”, “Đang bay NB→VN”; dòng lấy từ lô trong chuyến tự gắn với chuyến.
- Tồn kho ngoài web = tổng “còn” của mọi lô ở cả 4 vị trí trừ phần đang giữ cho đơn chưa thanh toán (**sau nâng cấp tồn web của sản phẩm có lô Nhật mới sẽ tăng đúng bằng phần chưa bán của các lô đó** — trước đây hàng ở Nhật chưa được tính). Tách lô vẫn giữ tham chiếu lô gốc; hàng khách đã thanh toán đi cùng phần được tách khi đưa vào chuyến.

### Migration
- 61 `lot-locations`: `stock_lots` thêm `in_transit`, `batch_id`, `parent_lot_id`; mọi phiếu mua từ “Đã mua” trở đi chưa có lô → tạo lô ở vị trí tương ứng (đã mua → Kho Nhật shop; đã gửi ĐVVC Nhật → Kho ĐVVC Nhật; NB→VN → Kho ĐVVC Nhật + đang bay; tới kho ĐVVC VN → Kho ĐVVC VN; về kho shop → Kho ĐVVC VN + đang về), giữ nguồn / ¥ / HSD / ghi chú / chuyến; phiếu trỏ tới lô; phân bổ dòng đơn từ phiếu chuyển sang lô. Sau khi khởi động, việc một lần tính lại tồn web cho sản phẩm có lô và gán nguồn cho dòng đang chờ (`settings.lots_resync_rev`).
- Kiểm thử: `scripts/smoke/smoke6.ts` (FEFO chọn lô cho đơn và cho chuyến; tách một phần vào chuyến rồi gộp lại; đổi trạng thái chuyến → vị trí lô; rút lô trước / sau NB→VN; xoá chuyến trả lô; đơn nhận tại kho chỉ sẵn sàng khi lô ở Kho VN shop) và `smoke7.ts` (migration 61 trên bản sao DB lùi về schema 60: 137 đv Kho Nhật = 136 trong chuyến + 1 giữ lại, các vị trí khác theo trạng thái, đơn đọc “Kho Nhật · chuyến DG-…”), chạy với `LIEN_DB_PATH=<bản sao> npx -y tsx --conditions=react-server scripts/smoke/smoke6.ts`.

## [1.78.3] - 2026-09-27

### Changed
- Mua theo đợt: **bảng dòng vừa một màn 1920px** (kể cả khi sidebar mở) — cột Sản phẩm rút gọn (ảnh 32px, tên 2 dòng, “#id · SKU · đổi sản phẩm” một dòng, badge Đơn #… / Lưu kho · phiếu #… dưới tên), HSD · ngày mua · ¥/đv gộp thành cột “Mua”, select Mua ở / Trạng thái thu hẹp (badge trạng thái chỉ hiện khi khác trạng thái đợt), ghi chú w-32 mở rộng khi focus. Cột thao tác (✓ ✕ + ô SL tách + nút Giữ Nhật / Tách dòng) và ô tick **ghim hai bên** khi bảng phải cuộn ngang (1440px vẫn dùng được). Dưới 1200px bảng chuyển thành **card 2 cột**.
- Mua theo đợt: thanh “Cả đợt →” và “Đã tick →” gộp thành **một hàng công cụ dính trên** khi cuộn; khung Mở đợt mới / Cách dùng chuyển lên trên, đợt chiếm trọn chiều ngang.
- Mua theo đợt: nút **Giữ Nhật** với ô SL trống = giữ cả dòng (có hộp xác nhận), dòng SL=1 cũng có nút; chỉ báo lỗi khi nhập số vượt SL.
- Admin: vùng nội dung rộng hơn trên màn lớn (1400px từ 1200px màn hình, 1600px từ 1536px) để các bảng có thêm chỗ.

## [1.78.2] - 2026-09-27

### Added
- Mua theo đợt: **khung lọc** ngay trên bảng dòng của đợt, lọc tức thì không tải lại trang và ghi vào URL (F5 không mất): ô tìm sản phẩm / SKU / #id (không dấu, tên Nhật cũng khớp, gõ đến đâu lọc đến đó), ô Đơn hàng (#số hoặc tên khách, có gợi ý; hiện dòng đơn đó và các dòng lưu kho cùng sản phẩm), chip Loại dòng / Mua ở / Trạng thái, “Chỉ dòng có ghi chú”, “Chỉ SL ≥ 2”. Đếm “Đang hiện x/y dòng · đv · ≈¥”, nút Xoá lọc, ô “chọn tất cả đang hiện” cho thao tác hàng loạt; khung Giữ lại tại Nhật dùng chung bộ lọc. Đợt dưới 8 dòng chỉ hiện ô tìm sản phẩm.
- Mua theo đợt: lọc còn đúng 1 dòng thì con trỏ nhảy vào ô SL tách; Enter = Giữ Nhật, Shift+Enter = Tách dòng.

### Changed
- Mua theo đợt: ô Ghi chú ẩn tiền tố “Đợt DG-… ·” (vẫn lưu trong dữ liệu) để đọc nhanh nơi mua.

## [1.78.1] - 2026-09-27

### Changed
- Trang đơn: khung “Tiến độ vận chuyển” đổi thành **Tiến độ đơn hàng**; ở bước Đã đặt hàng có hai lựa chọn cạnh nhau **Đã nhận chuyển khoản** / **Thanh toán khi nhận hàng (COD)**. Chọn COD → đơn thành thu khi giao, tồn kho trừ ngay, tiến độ qua bước thanh toán (hiện “Thu khi giao”, cả ngoài web cho khách), kèm ô “Đánh dấu khách quen cho các đơn sau” (tick sẵn): khách có tài khoản → gắn cờ tài khoản, khách vãng lai → ghi nhớ theo số điện thoại (migration 60). Không còn bắt buộc là khách quen mới được COD; khách quen chỉ được chọn sẵn.
- Trang đơn: khung Trạng thái hiện gọn “Thanh toán: Chuyển khoản · chưa nhận / Đã nhận chuyển khoản lúc … / Thu khi giao (COD) · đã trừ tồn kho lúc …” với link “đổi” mở lại lựa chọn (đến trước Đang giao). Đơn COD mà khách chuyển khoản trước khi giao: bấm “Đã nhận chuyển khoản” chỉ đổi hình thức, không trừ tồn lần hai.
- Danh sách đơn: badge **COD** ở cột Thanh toán, badge **quen** cạnh tên khách, bộ lọc “Khách quen”.

## [1.78.0] - 2026-09-27

### Added
- **Phân bổ nguồn hàng cho dòng đơn** (migration 59, bảng order_item_allocations): mỗi dòng đơn biết hàng lấy từ đâu — lô có sẵn (Kho VN / ĐVVC / Nhật, theo hạn dùng gần nhất trước, cùng HSD thì kho gần VN hơn), phiếu mua đang về, đợt đang gom, hay “Cần mua”. Một dòng SL>1 có thể tách nhiều nguồn; không bao giờ giữ vượt số trống.
- Đơn mới chỉ **giữ chỗ** (tồn kho ngoài web đã trừ phần giữ); **trừ tồn thật** khi đơn sang “Đã xác nhận thanh toán” hoặc admin đổi sang thu khi giao. Huỷ trước đó → trả lại chỗ; huỷ sau khi trừ → tạo lô nhập lại. Đang giao / Đã nhận không đụng tồn nữa.
- **Khách quen**: checkbox ở Admin › Khách hàng (tài khoản); badge trên trang đơn; khách quen được chọn thanh toán khi nhận hàng ở checkout; nút “Đổi sang thanh toán khi nhận hàng” trên trang đơn trừ tồn ngay.
- Trang đơn: cột **Nguồn hàng** (badge + chi tiết lô / phiếu / đợt), ô đổi nguồn thủ công, nút **Phân bổ lại**, nhãn “Đang giữ chỗ / Đã trừ tồn kho”.
- Kho hàng › Lô hàng: cột **Đã giữ cho đơn** trên từng lô, khối “Đang mua theo đơn”, phiếu mua lưu kho hiện đơn đang giữ.
- Mua theo đặt hàng: mặc định chỉ dòng **Cần mua** (ô “Xem cả dòng đã có nguồn”); Mua theo đợt: thêm sản phẩm / nhập bill đều đi qua phân bổ chung, dòng lưu kho hiện đơn đang giữ; trạng thái dòng đơn đổi theo phiếu / đợt / lô, không phải sửa tay.

### Changed
- Dữ liệu cũ được chuyển sang phân bổ: dòng đã thuộc đợt → nguồn “đợt”; dòng “Tại kho” do trừ lô lúc đặt → ghi nhận đã trừ; dòng “Chưa mua” → “Cần mua” rồi tự tìm nguồn có sẵn một lần sau khi cập nhật.

## [1.77.2] - 2026-09-27

### Changed
- Admin: thông báo “Đã lưu…” / lỗi hiện thành **toast nổi ở góc dưới phải** (tự ẩn sau 7 giây, lỗi giữ tới khi đóng) thay vì một dải trên đầu trang — bảng phía dưới cao thêm.
- Admin › Sản phẩm: thanh **Gộp nhóm biến thể** không hiện mặc định nữa; bấm nút “Gộp nhóm biến thể” ở hàng nút phía trên để mở, tick sản phẩm rồi gộp; nút ✕ Đóng để thu lại.

## [1.77.1] - 2026-09-27

### Added
- Kho hàng › Địa chỉ kho: mục **Địa chỉ khác của shop** — bấm “Thêm địa chỉ” để ghi thêm bao nhiêu điểm cũng được (kho VN thứ hai, nhà / điểm gom ở Nhật, kho tạm, điểm giao nhận…), mỗi địa chỉ có tên, loại (kho Nhật / ĐVVC Nhật / ĐVVC VN / kho shop VN / khác), địa chỉ và ghi chú; bỏ từng dòng được. Bốn kho chính giữ nguyên.

## [1.77.0] - 2026-09-27

### Changed
- Mua theo đợt: bảng đợt thành **bảng chỉnh sửa từng dòng** — mỗi dòng đơn / dòng lưu kho có ô tick, SL, **nguồn nhập**, HSD, ngày mua, ¥, trạng thái, ghi chú và nút ✓ lưu; dòng lưu kho có “đổi sản phẩm” (tìm theo tên).
- Mua theo đợt: **Tách** trên từng dòng lưu kho — *Giữ Nhật* (phần đó ở lại Nhật chờ đợt sau, rời đợt, trạng thái về “Đã mua”) hoặc *Tách dòng* (thành dòng riêng trong đợt, ví dụ HSD khác). Nhánh **“Giữ lại tại Nhật từ đợt này”** dưới bảng liệt kê hàng chờ và hàng đã đi đợt khác; có nút “Đưa vào đợt”.
- Mua theo đợt: tick nhiều dòng → **Giữ lại Nhật / Bỏ khỏi đợt / Chuyển sang đợt khác**. Khung “Tổng theo sản phẩm” thu gọn bên dưới.
- Mua lưu kho: tick phiếu → **Đưa vào đợt** (hàng giữ lại Nhật từ đợt trước cũng nằm ở đây); phiếu ghi nhớ đợt gốc (migration 58).

## [1.76.5] - 2026-09-27

### Changed
- Mua theo đợt: **mỗi sản phẩm thêm vào đợt chọn nguồn mua riêng** (ô “Mua ở” trong khung thêm sản phẩm; Amazon, drugstore, siêu thị… trong cùng một đợt). Dòng đơn được gán tự động và hàng lưu kho ghi đúng nguồn của dòng đó; “Lấy từ đợt” cũng lấy nguồn của hàng dư. Nguồn của đợt chỉ còn là nguồn chọn sẵn.

## [1.76.4] - 2026-09-27

### Changed
- Admin › Nhóm biến thể: cột **Thứ tự** có nút ▲ / ▼ ở hai bên — bấm là đổi chỗ với dòng kề và lưu ngay, không phải gõ số. Bảng biến thể sắp theo thứ tự này (cây phân nhánh bên trái vẫn theo thuộc tính).

## [1.76.3] - 2026-09-27

### Changed
- Trang web cho khách không hiển thị **khối lượng / kích thước** sản phẩm nữa: bỏ hai thẻ dưới mô tả, khung báo giá vận chuyển chỉ hiện nơi nhận và cân tính phí (không hiện cân thực, cân quy đổi, kích thước kiện). Số liệu vẫn xem và sửa trong admin.

## [1.76.2] - 2026-09-27

### Changed
- Admin › Sản phẩm: ô tìm không giãn hết chiều ngang nữa nên nút **Lọc** nằm cùng hàng với các ô lọc — bảng bên dưới cao thêm một hàng.

## [1.76.1] - 2026-09-27

### Added
- Nhập bill: khớp sản phẩm theo **mã vạch JAN** in trên bill (đọc từ mô tả / từ khoá sản phẩm) — bill giấy drugstore, siêu thị khớp chính xác hơn tên.
- Nhập bill: khung **“Prompt cho Claude đọc ảnh bill”** dưới form — chép prompt, gửi kèm ảnh bill cho Claude, dán kết quả vào ô Nội dung bill (giá đã gồm thuế, JAN dưới từng dòng; hạn dùng nhập sau).

## [1.76.0] - 2026-09-27

### Changed
- Admin › Quản lý mua hàng: đổi tên 3 tab thành **Mua theo đặt hàng**, **Mua lưu kho**, **Mua theo đợt**; khung **Phiếu mua hàng · nhập bill** nằm dưới cả 3 tab (không còn tab riêng, link cũ vẫn mở đúng).
- Mua theo đợt: khung “Thêm sản phẩm đã mua vào đợt” — tìm theo tên, nhập tổng SL, HSD, ngày mua, ¥; cùng sản phẩm khác HSD thì thêm từng dòng. Hệ thống **tự gán cho các đơn đang chờ trước** (dòng đơn vào đợt, ghi chú “Tự động lấy từ mua theo đợt DG-…”), phần còn lại là hàng lưu kho theo từng HSD.
- Nhập bill có ô **Đưa vào đợt gửi**: hàng trên bill vào đợt, tự gán đơn trước, phần dư lưu kho theo đợt (migration 57).
- Mua theo đặt hàng: dòng “Chưa mua” mà một đợt đang đi còn hàng lưu kho → nút **Lấy từ đợt DG-…**; dòng đã gán tự động hiện “DG-… · tự động”.
- Khách đặt hàng mới: nếu tồn kho không đủ nhưng một đợt đang đi còn hàng lưu kho, dòng đơn **tự lấy từ đợt** (ghi chú tự động) — admin không phải nhập tay.

## [1.75.2] - 2026-09-27

### Fixed
- Trang sản phẩm (tiếng Nhật): mã JAN viết sau dấu “／” trong 内容量 cũng được lược khỏi thẻ thông số.

## [1.75.1] - 2026-09-27

### Changed
- Trang sản phẩm: **Khối lượng** và **Kích thước** không còn nằm cạnh “Tình trạng” mà chuyển xuống các thẻ thông số dưới mô tả (cùng Thương hiệu, Xuất xứ, Quy cách…).
- Trang sản phẩm: **mã JAN / mã vạch** không hiển thị cho khách nữa — bị lược khỏi thẻ Quy cách, khỏi danh sách Từ khóa và các dòng “Mã vạch (JAN): …” trong mô tả (dữ liệu trong admin giữ nguyên).

## [1.75.0] - 2026-09-27

### Added
- Admin › Kho hàng › Quản lý mua hàng: tab mới **Đợt gửi · đơn + lưu kho** — một đợt gom các dòng đơn “Chưa mua” và **hàng mua dư để lưu kho** đi chung một chuyến Nhật → kho shop (tiết kiệm phí gửi). Mã đợt DG-YYMMDD-NN, nguồn mua, ngày mua, ngày gửi, tracking.
  - Cập nhật trạng thái **cả đợt** một lần (Đã mua → tới ĐVVC Nhật → NB→VN → kho ĐVVC → về kho shop → Tại kho): mọi dòng đơn và hàng dư trong đợt chuyển theo.
  - Tới **Tại kho**: hàng dư tự nhập kho thành **lô** với hạn dùng, ngày mua tại Nhật, nguồn và ¥ (tồn kho tăng, bán theo hạn gần trước).
  - Khách đặt khi đợt còn trên đường → nút **Lấy từ hàng dư**: hàng dư giảm, dòng đơn vào đợt và lấy trạng thái của đợt.
  - Tab Theo đơn hàng: tick dòng → **Thêm vào đợt gửi**; dòng đã thuộc đợt hiện mã DG-… cạnh mã phiếu.
- Kho hàng › Lô hàng: lô ghi thêm **ngày mua tại Nhật** (hiện dưới ngày nhập) để truy xuất từng lô; phiếu mua lưu kho cũng lưu ngày mua và chuyển sang lô.
- Cơ sở dữ liệu: migration 56 (bảng purchase_batches, cột batch_id trên dòng đơn và phiếu mua lưu kho, cột bought_at trên phiếu mua và lô).

## [1.74.4] - 2026-09-27

### Changed
- Thanh menu: bỏ dòng slogan chữ dưới logo (logo header đã có sẵn slogan nên bị hiện 2 lần); slogan chữ chuyển xuống dưới logo ở chân trang.
- Admin › Sản phẩm: khối lọc thu gọn thành một hàng (ô tìm + các ô chọn nhỏ, tự xuống dòng khi hẹp) để bảng sản phẩm bên dưới rộng và hiện nhiều dòng hơn.

## [1.74.3] - 2026-09-25

### Fixed
- Slogan cũ “ĐẸP MỖI GIÂY – KHỎE MỖI NGÀY” vẫn còn trong tiêu đề trang Shop (/shop/, /shop/page/N/) — nay tiêu đề lấy slogan trong Admin › Giao diện & Logo: “Shop – Chuyên hàng Nhật nội địa – Store Lienanh”.
- Slogan để trống trong admin làm tiêu đề trang chủ, thanh menu và web app (PWA) thiếu slogan — nay trống sẽ tự dùng “Chuyên hàng Nhật nội địa”; tiêu đề trang chủ, mô tả chia sẻ, manifest PWA và tên ứng dụng khi thêm vào màn hình chính iOS đều thống nhất theo tên shop + slogan.

## [1.74.2] - 2026-09-21

### Added
- Admin › Sản phẩm: bộ lọc **Giá thực tế trên website** — Chưa có giá (Liên hệ), dưới 100k, 100–200k, 200–500k, 500k–1 triệu, trên 1 triệu; áp dụng cho cả Xuất CSV theo bộ lọc.

## [1.74.1] - 2026-09-21

### Changed
- Admin › Sản phẩm: ô tìm tìm được cả **tên tiếng Nhật** (VD フルグラ) bên cạnh tên Việt, slug, SKU; tên Việt tìm không cần dấu. Các ô chọn sản phẩm khác trong admin (Giảm giá, Nhãn, Mua hàng, Fanpage…) cũng tìm theo tên Nhật.

## [1.74.0] - 2026-09-21

### Added
- **Nhân bản sản phẩm**: trong chi tiết sản phẩm có nút “Nhân bản sang sản phẩm mới” — mở form tạo mới đã chép sẵn tên, mô tả, danh mục, từ khoá, nhóm biến thể, giá, giá vốn theo nguồn, kích thước… chỉ cần sửa vài chi tiết (vị, khối lượng, giá) và thêm ảnh mới; ảnh không chép, SKU để trống để tạo mới, trạng thái mặc định Bản nháp.
- Chi tiết sản phẩm › Nhóm biến thể: ô “Thuộc dòng sản phẩm” đổi thành ô tìm gõ chữ (lọc theo tên nhóm / thuộc tính) thay cho danh sách thả dài; vẫn chọn được “Sản phẩm độc lập” và “Tạo nhóm mới”.

## [1.73.1] - 2026-09-21

### Fixed
- Admin trên điện thoại: thanh trên cùng (tên shop + ☰) kéo hết chiều ngang màn hình và dính ở trên khi cuộn; trang không còn bị tràn ngang do nội dung rộng.

## [1.73.0] - 2026-09-21

### Fixed
- iPhone: bấm vào ô tìm kiếm (và các ô nhập trong admin) không còn bị Safari tự phóng to trang — chữ trong ô nhập trên điện thoại đặt 16px.

### Changed
- Admin trên điện thoại: thanh trên cùng gọn (tên shop + nút ☰), menu mở dạng ngăn trượt từ trái với đủ các nhóm (Tổng quan, Kho hàng, Đơn hàng, Kế toán, Sales, Vận chuyển…), tự đóng khi chuyển trang; nội dung bớt lề, tiêu đề nhỏ hơn; bảng dài trong thẻ kéo ngang được thay vì bị ép cột. Máy tính giữ nguyên thanh bên.

## [1.72.0] - 2026-09-19

### Added
- **Gợi ý khi tìm kiếm**: bấm vào ô tìm kiếm (máy tính và bản mobile) hiện bảng “Xu hướng tìm kiếm” (từ khoá khách hay tìm 30 ngày gần đây, chưa có thì lấy từ khoá sản phẩm phổ biến, cộng từ khoá bạn ghim) và “Thương hiệu nổi bật” (danh sách bạn nhập, chưa nhập thì web tự đoán từ tên sản phẩm); gõ chữ thì lọc chip, bấm chip là tìm ngay. Lượt tìm của khách được ghi lại.
- **Sales › Gợi ý tìm kiếm**: xem bảng đang hiện cho khách, ghim từ khoá, nhập danh sách thương hiệu, xem từ khoá khách đã tìm 30 ngày và ẩn từ khoá không muốn gợi ý.

## [1.71.3] - 2026-09-18

### Changed
- Thẻ sản phẩm (trang chủ, danh mục, dải cuộn) không hiện ảnh nhãn nữa để khỏi chồng với nhãn Hot; nhãn chỉ hiện trên trang chi tiết sản phẩm.

## [1.71.2] - 2026-09-18

### Changed
- Nhãn sản phẩm: bù phần trong suốt quanh thẻ trong file GIF nên hình thẻ đỏ chạm hẳn góc trên trái ảnh, không còn khoảng trắng bên trái/trên (trang sản phẩm và thẻ sản phẩm).

## [1.71.1] - 2026-09-18

### Changed
- Nhãn sản phẩm ghim sát góc trên trái ảnh (trang sản phẩm và thẻ) và nhỏ hơn một chút để không che ảnh; áp dụng cho mọi nhãn.

## [1.71.0] - 2026-09-18

### Changed
- Gộp **Sản phẩm bán chạy** vào **Nhãn sản phẩm**: nhãn được đánh dấu “bán chạy” (mặc định BEST SELLER) chính là cờ Hot — sản phẩm mang nhãn này đứng đầu dải “Bán chạy nhất” trang chủ và có nhãn Hot đỏ trên thẻ; các sản phẩm từng tích Hot được gắn nhãn BEST SELLER tự động. Bỏ tab Sản phẩm bán chạy, ô tích Hot trong chi tiết sản phẩm và ảnh nhãn Best seller riêng. Tab Nhãn sản phẩm chuyển xuống giữa Chính sách vận chuyển và Feedback khách hàng; mỗi nhãn có ô “Nhãn bán chạy” để đổi nhãn nào giữ vai trò này, và cột Đã bán trong danh sách sản phẩm.

## [1.70.0] - 2026-09-18

### Added
- **Nhãn sản phẩm** (Sales › Nhãn sản phẩm): bộ 16 nhãn động dạng thẻ đỏ (BEST SELLER, BEST DEAL, SALE, BEST PRICE, BIG SALE, BLACK SALE, FLASH SALE, HALF PRICE, HOT DEAL, HUGE DISCOUNT, MEGA SALE, NEW ARRIVAL, NEW COLLECTION, NEW OFFER, ONLY TODAY SALE, ORDER NOW!) — mỗi nhãn có danh sách sản phẩm riêng (thêm bằng ô tìm, gỡ từng dòng), đổi tên/ảnh/thứ tự/ẩn, thêm nhãn mới, xoá nhãn. Mỗi sản phẩm mang tối đa một nhãn; chọn được ngay trong chi tiết sản phẩm (ô “Nhãn trên ảnh”). Nhãn hiện ở góc trên trái ảnh trên thẻ sản phẩm và trang sản phẩm (GIF giữ chuyển động).

### Changed
- Nhãn Best seller mặc định của sản phẩm Hot đổi sang thẻ động BEST SELLER trong bộ mới; sản phẩm có nhãn riêng thì nhãn riêng được ưu tiên.

## [1.69.1] - 2026-09-18

### Fixed
- Sales › Sản phẩm bán chạy: nhãn Best seller tải lên không hiển thị (đường dẫn /api/files/badges chưa được phục vụ) — đã sửa; ảnh đã tải trước đó hiện lại bình thường.

### Changed
- Sales › Sản phẩm bán chạy: nút **Chọn ảnh nhãn** thay ô chọn tệp thô, nhận PNG / WebP / SVG / GIF / JPG / AVIF / BMP tới 5 MB; danh sách đang Hot có ô tích từng dòng, tích tất cả và nút **Bỏ Hot đã chọn** (hỏi xác nhận) bên cạnh nút Bỏ Hot từng dòng.

## [1.69.0] - 2026-09-18

### Added
- **Sản phẩm Hot (bán chạy)**: ô tích trong chi tiết sản phẩm (mục Mã SKU & trạng thái) và tab mới **Sales › Sản phẩm bán chạy** — chọn sản phẩm để đánh dấu, danh sách đang Hot (kèm số đã bán, nút Bỏ Hot), tải/đổi ảnh nhãn Best seller. Sản phẩm Hot đứng đầu dải “Bán chạy nhất” ở trang chủ (thiếu thì bù bằng sản phẩm đánh giá cao), nhãn Hot trên thẻ đổi sang màu đỏ, trang sản phẩm có nhãn Best seller ở góc trên trái ảnh. Sản phẩm đang gắn tag hot/bán chạy được chuyển sang cờ mới tự động.

## [1.68.0] - 2026-09-18

### Fixed
- Tạo sản phẩm mới không còn bắt buộc ảnh và giá: để trống giá thì sản phẩm hiện **“Liên hệ”** (thẻ, xem nhanh, trang sản phẩm), chưa có ảnh thì dùng ảnh “Ảnh đang cập nhật” cho tới khi thêm ảnh thật.
- Bấm “Liên hệ” / “Liên hệ đặt hàng” (nút điện thoại trên thẻ, nút ở xem nhanh và trang sản phẩm) mở Zalo của shop trong tab mới thay vì nút bị vô hiệu.

## [1.67.1] - 2026-09-18

### Fixed
- Phát hành lại 1.67.0 (chương trình voucher): CI của bản trước lỗi tạm thời ở bước build Docker image nên prod không nhận được bản mới; nội dung không đổi.

## [1.67.0] - 2026-09-18

### Added
- **Chương trình voucher** (Sales › Voucher): gom mã theo chương trình, mỗi chương trình là một banner riêng trên trang chủ với tiêu đề là tên chương trình, dòng phụ, màu banner tự chọn (8 màu), thứ tự và bật/tắt. Có nhiều chương trình thì trang chủ xếp nhiều banner. Voucher chọn chương trình khi tạo/sửa; các mã hiện có nằm trong chương trình mặc định “Ưu đãi độc quyền”. Xoá chương trình không xoá mã (chuyển sang chương trình đầu).

## [1.66.0] - 2026-09-17

### Changed
- Giỏ hàng (ngăn trượt) › “Thường được mua cùng với”: hiện 3 sản phẩm một lượt, kéo chuột / vuốt như các dải sản phẩm ở trang chủ, dùng đúng thẻ sản phẩm chuẩn (rê chuột hiện nút giỏ xanh, rê vào nút thì chuyển cam “Thêm vào giỏ”; hết hàng / chưa có giá hiện đúng nhãn).
- Trạng thái “Liên hệ” (sản phẩm chưa có giá) đổi sang màu xanh nước biển thống nhất ở thẻ sản phẩm, nút điện thoại trên thẻ, xem nhanh và trang sản phẩm; “Hết hàng” vẫn màu xám.
- Trang chủ: “Ưu đãi độc quyền website” rút gọn thành “Ưu đãi độc quyền”.

## [1.65.0] - 2026-09-17

### Changed
- Đổi tên thương hiệu triệt để: mọi chỗ trên web khách còn ghi “LienStore” (tiêu đề trang, mô tả SEO, trang Hướng dẫn đặt hàng, Giới thiệu, Chính sách, Liên hệ, bài viết, mô tả sản phẩm, tên phương thức vận chuyển, ghi chú phí ship, địa chỉ kho…) nay lấy theo tên shop trong Giao diện & Logo (hiện “Store Lienanh”). Nội dung đã lưu trong CSDL được đổi một lần khi máy chủ khởi động (chữ thường “lienstore” trong đường dẫn/slug giữ nguyên); các câu cố định trong code chuyển sang “shop” để không phụ thuộc tên.

## [1.64.1] - 2026-09-17

### Changed
- Trang Về chúng tôi: bỏ con số “hơn 149 sản phẩm” (thay đổi mỗi ngày), viết “rất nhiều sản phẩm đang bán và bổ sung liên tục”.

## [1.64.0] - 2026-09-17

### Changed
- Tổng quan: ô số liệu sắp lại thành hai nhóm **Bán hàng** (Doanh thu, Lãi/lỗ, Đơn hàng, Chờ xử lý, Khách hàng) và **Sản phẩm** (Tổng, Đang bán, Hết hàng); mỗi ô có ⓘ giải thích cách tính, dòng phụ (hôm nay, đã hủy, thiếu giá vốn…), tiền hiện dạng gọn “16,77 tr” không tràn ô (số đầy đủ ở dòng dưới). Đơn hàng và doanh thu trừ đơn đã hủy; Khách hàng chỉ đếm tài khoản khách (không tính chủ shop / quản trị).

## [1.63.0] - 2026-09-17

### Changed
- Đơn hàng: bỏ hai nút Chi tiết / Xóa trên từng dòng (bấm mã đơn để xem chi tiết); nút xóa hàng loạt đổi tên **Xóa đơn hàng**. Chỉ **chủ cửa hàng** thấy ô tích và nút xóa (cả trong chi tiết đơn); tài khoản admin không xóa được đơn, kể cả gửi thẳng yêu cầu.
- Hộp xác nhận xóa (đơn hàng, file, danh mục, bài viết, sản phẩm…) đổi từ cửa sổ mặc định của trình duyệt sang hộp thoại riêng: tiêu đề, mô tả những gì sẽ bị xóa, nút Hủy / Xóa màu đỏ, đóng bằng Esc hoặc bấm ra ngoài.

## [1.62.0] - 2026-09-17

### Added
- Đơn hàng: ô tích đầu dòng (và tích tất cả ở đầu bảng) để chọn nhiều đơn, nút **Xóa đã chọn (n)** phía trên bảng — chọn một dòng thì chỉ xóa dòng đó; hai nút Chi tiết / Xóa ở cột Xử lý được đóng khung, tô màu.

## [1.61.0] - 2026-09-17

### Added
- Nút **Xóa đơn hàng** ở danh sách Đơn hàng (cột Xử lý) và trong chi tiết đơn (dưới thẻ Trạng thái): hỏi xác nhận, xóa vĩnh viễn đơn cùng sản phẩm, chặng vận chuyển, tin nhắn và bill đính kèm; không tính vào doanh thu / lãi lỗ. Muốn giữ lịch sử thì dùng trạng thái “Đã hủy”.

## [1.60.1] - 2026-09-17

### Fixed
- Fanpage › “Lưu & kiểm tra” báo lỗi Facebook 2500 “Expected end of string instead of ?” vì URL ghép `?fields=name,link?access_token=…`; nay nối bằng `&` nên kiểm tra kết nối chạy đúng với token đã lưu.

## [1.60.0] - 2026-09-17

### Changed
- Thanh toán chỉ còn 3 hãng cho khách chọn: **GHN, J&T (qua Goship) và Viettel Post (API Viettel)** — Best, VNPost, SPX, EMS, GHTK tắt sẵn (job chạy một lần; bật lại được ở Vận chuyển › ④ › Khách được chọn). Bỏ dòng cảnh báo dài trên thẻ Viettel Post.

## [1.59.3] - 2026-09-17

### Changed
- Viettel Post ở thanh toán chỉ còn **một thẻ** — Chuyển phát tiêu chuẩn (STK, giá niêm yết đã gồm VAT). Các dịch vụ “thỏa thuận” (VTK/VCN/VHT/LCOD/NCOD) chỉ áp dụng cho tài khoản có hợp đồng nên không hiện nữa; thẻ ghi rõ giá đúng khi tạo vận đơn qua app/API Viettel Post với tài khoản shop.
- Viettel Post luôn lấy từ API Viettel Post, không lấy qua Goship dù tài khoản Goship có Viettel.

## [1.59.2] - 2026-09-17

### Changed
- Viettel Post: kiểm chứng API getPriceAll/getPrice của hãng là công khai (trả cùng kết quả có/không có token), nên cước Viettel Post ở trang sản phẩm, thanh toán và “Báo giá chặng ③” lấy thẳng từ API mà **không cần token**; thẻ ④ đổi thành “Viettel Post — cước lấy từ API công khai”, token chỉ còn là tùy chọn (dùng khi tạo vận đơn), “Lưu & kiểm tra” báo rõ Viettel có nhận token ở API tài khoản hay không và không chặn lưu.

## [1.59.1] - 2026-09-17

### Fixed
- Báo cước nội địa: khi đã kết nối Goship, các hãng mà tài khoản Goship không trả về (SPX, Viettel Post, VNPost) bị ẩn khỏi trang sản phẩm / thanh toán. Nay Goship vẫn ưu tiên, nhưng hãng thiếu được lấy từ nguồn riêng (API Viettel Post, biểu phí SPX/VNPost, GHN trực tiếp) nên khách luôn thấy đủ hãng, mỗi hãng một giá.

### Added
- Thẻ Kết nối Goship hiện danh sách hãng tài khoản Goship thực trả cước (ghi lại từ lần báo giá gần nhất) và hướng dẫn bật SPX qua Goship › Kết nối tài khoản riêng.

## [1.59.0] - 2026-09-17

### Added
- Vận chuyển › ④: thẻ **Khóa API đã lưu** (chỉ chủ cửa hàng thấy) liệt kê mọi khóa đã nhập (Goship, GHN, Viettel Post, SPX, Facebook Page) dạng 4 ký tự cuối; nhập lại mật khẩu đăng nhập là hiện đầy đủ trong 3 phút để sao chép — không cần giữ khóa trong file text.

### Security
- Token/khóa API trong bảng settings được mã hóa AES-256-GCM (khóa dẫn xuất từ ADMIN_SESSION_SECRET); giá trị cũ dạng chữ thường được mã hóa lại khi máy chủ khởi động, đọc ra vẫn tương thích.

## [1.58.1] - 2026-09-17

### Changed
- Tên gọi giá thống nhất: ô “Giá kỳ vọng bán ra trên website” trong chi tiết sản phẩm và “Giá kỳ vọng” ở Bán hàng › Giảm giá sản phẩm đổi thành **Giá bán trên web**; “Giá kỳ vọng” chỉ còn là giá gợi ý theo công thức ở mục 3.
- Chi tiết sản phẩm › mục 1: Giá khuyến mại đứng trước Giá thị trường; bỏ dòng “Khách thấy …”.
- Giảm giá sản phẩm: ghi rõ % giảm tính so với giá thị trường (chưa có thì so với giá bán trên web); giá khuyến mại đặt ở đây lưu thẳng vào sản phẩm và hiện ở ô Giá khuyến mại trong chi tiết.

## [1.58.0] - 2026-09-17

### Added
- Vận chuyển › ④ Nội địa Việt Nam: thẻ **Kết nối Viettel Post (Open API đối tác)** — dán token từ viettelpost.vn › Quản lý token, “Lưu & kiểm tra” gọi danh mục tỉnh của Viettel để xác nhận token và tự tìm mã tỉnh/huyện kho gửi (Hoằng Hóa); token chỉ lưu trên máy chủ (biến môi trường VTP_TOKEN chỉ còn là dự phòng).

### Changed
- Viettel Post: địa chỉ khách (tỉnh → xã/phường mới) được ánh xạ sang mã tỉnh/quận/huyện của Viettel theo tên (như Goship), nên có token là thẻ Viettel Post ở trang sản phẩm / thanh toán và báo giá chặng ③ lấy cước thật từ getPriceAll; nhận diện lỗi token cả khi API trả 200 + error.

## [1.57.0] - 2026-09-17

### Added
- Kho hàng › **Địa chỉ kho** (tab mới): sửa 4 địa chỉ — kho shop tại Nhật, kho ĐVVC tại Nhật (Kiến Express), kho ĐVVC tại Việt Nam (Kiến Express Hà Nội), kho shop tại Việt Nam (đồng bộ với địa chỉ "Nhận tại kho" ở thanh toán).
- Kho hàng: bộ lọc **Lưu kho** thêm "Sản phẩm lưu kho (có theo dõi tồn)" và "Không lưu kho — hàng order"; bỏ cột SKU khỏi bảng (vẫn có trong CSV).

### Changed
- Theo xác nhận của Kiến Express: kho ĐVVC tại Việt Nam là **Khu đô thị Xuân Phương Viglacera, Nam Từ Liêm, Hà Nội**; chặng ③ mặc định **Viettel Post** từ kho đó về kho shop — áp cho công thức giá (giá kỳ vọng mọi sản phẩm tính lại khi lên bản này), ô chặng ③ của đơn mới, và các đơn đang mở chưa gửi chặng ③ được chuyển sang Viettel Post với phí theo cân của đơn. Nút "Báo giá chặng ③" dùng địa chỉ này làm điểm gửi.
- Trang sửa sản phẩm: mọi chú thích còn lại (tên Nhật, mô tả, nhóm biến thể, giá thị trường / khuyến mại, giá vốn, tỉ lệ lãi, SKU, kho, ảnh) chuyển vào nút ⓘ.

## [1.56.0] - 2026-09-17

### Added
- Kế toán: hai ô mới **Chi phí voucher** (mã giảm giá khách dùng) và **Chi phí giảm giá sản phẩm** (Σ (giá kỳ vọng − giá khuyến mại) × số lượng); bảng theo tháng và CSV có thêm hai cột này. Dòng đơn hàng nay ghi lại giá kỳ vọng lúc đặt để tính đúng phần giảm.
- Đơn hàng (danh sách): cột **Lãi / lỗ** cho từng đơn (cùng cách tính với Kế toán, rê chuột xem doanh thu / vốn / ship) và **dòng tổng theo bộ lọc** ở cuối bảng (doanh thu, giá vốn, vận chuyển, voucher, giảm giá, lãi) — tự tính theo khoảng thời gian đang lọc.
- Chi tiết đơn › chặng ③ Kho ĐVVC → kho shop: nút **"Báo giá chặng ③"** hỏi cước các hãng qua API (Goship / GHN…) cho kiện của đơn từ kho ĐVVC Hà Nội về kho shop, hiện danh sách giá như bước thanh toán của khách, bấm **Chọn** để ghi vào đơn.
- Trao đổi với khách: hộp **"Chèn mẫu tin nhắn…"** thay các chip gợi ý; thêm mẫu "Cảm ơn anh/chị đã mua hàng… đơn đã xác nhận thanh toán, đang xử lý", "đang đặt mua tại Nhật, dự kiến 7–14 ngày", "đã giao thành công"; mẫu dùng tên cửa hàng và số đơn.

### Changed
- Chi tiết đơn › chặng ④ Nội địa Việt Nam mặc định theo **phương án khách đã chọn khi thanh toán** (hãng, gói, phí) — admin chỉ đổi khi khách yêu cầu.
- Chi tiết đơn: khung "Ghi chú nội bộ" chuyển lên cột phải.
- Gọn chú thích trong admin: Kho hàng, Vận chuyển (bảng 4 chặng), Phiếu mua / nhập bill, Đăng bài fanpage, chi tiết đơn — dòng ngắn + nút ⓘ mở phần giải thích dài.

## [1.55.3] - 2026-09-17

### Changed
- Giỏ hàng nhanh: khối "Thường được mua cùng với" có nhãn "Gợi ý", viền đứt màu xanh và nền riêng để không lẫn với sản phẩm trong giỏ.
- Trang của tôi: bỏ mục "Trang của tôi" thừa; **Thông tin cá nhân gộp vào "Tài khoản & mật khẩu"** (họ tên, điện thoại, địa chỉ, ảnh đại diện, mật khẩu ở cùng một trang); thứ tự menu: Tài khoản & mật khẩu → Đơn hàng đã mua → Voucher → Yêu thích → Đăng xuất (menu tài khoản trên header cũng vậy). Link cũ `?tab=profile` vẫn mở đúng.
- Bỏ khối "Lọc theo giá" ở mọi màn hình.
- Chân trang gọn hơn: cột liên hệ chỉ còn địa chỉ, hotline VN/JP, email, giờ làm việc với icon tròn; khối "Kết nối" bỏ hai nút gọi trùng lặp.
- Thanh trên: hotline và email thành các thẻ tròn có icon; chuyển ngữ VI/JP hiện cờ nhỏ và tô màu ngôn ngữ đang dùng.
- Ô tìm kiếm trên header rộng hơn, kéo dài về phía menu để khách dễ gõ tìm.

## [1.55.2] - 2026-09-17

### Changed
- Trang sửa sản phẩm sắp lại cho dễ nhìn: **Thông tin cơ bản** chỉ hiện Tên và Tên tiếng Nhật, phần đường dẫn / mô tả / nội dung Nhật và **Nhóm biến thể** nằm trong mục bấm để mở ngay bên dưới. **Bán hàng** tách thành 3 khối đánh số từ trên xuống — ① Giá bán cho khách · ② Giá vốn (mua tại Nhật) · ③ Tỉ lệ lãi & giá kỳ vọng — mọi chú thích dài chuyển vào nút ⓘ. Kích thước & khối lượng, Mã SKU & trạng thái, Kho hàng thành các khung gấp gọn bên phải (dòng tóm tắt hiện giá trị hiện tại). **Xu hướng mua** chuyển xuống cột trái, ngay trên Lịch sử thay đổi.

## [1.55.1] - 2026-09-17

### Fixed
- Ba mức giá theo đúng ý chủ shop: **Giá thị trường** luôn là giá bị gạch; khách thấy Giá kỳ vọng bán ra, hoặc Giá khuyến mại khi có chương trình (có thể cao hay thấp hơn giá kỳ vọng, nhưng thấp hơn giá thị trường); % giảm tính so với giá thị trường. Giá gạch cũ của các sản phẩm đang giảm giá (VD 275.000đ của Mentholatum) được chuyển thành giá thị trường khi lên bản này; giá 152.000đ giữ làm giá kỳ vọng.
- Sales › Giảm giá sản phẩm: % giảm tính trên giá thị trường (nếu có), kiểm tra giá KM thấp hơn giá thị trường thay cho giá gốc; bảng có cột "Giá thị trường (gạch)".

## [1.55.0] - 2026-09-17

### Added
- **Lịch sử thay đổi sản phẩm**: mọi lần đổi giá bán trên web, giá gạch, giá thị trường, giá vốn (VNĐ / ¥), nguồn mua, tồn kho, mức tồn tiêu chuẩn, trạng thái, tên, hình thức, tỉ lệ lãi, SKU đều được ghi lại kèm người / hệ thống thực hiện (admin lưu form, Giảm giá sản phẩm, Flash Sales, Kho hàng, job tỉ giá / công thức giá). Xem ở trang sửa sản phẩm › khung "Lịch sử thay đổi" (thu gọn, bấm mở).
- **Ba mức giá** trên trang sản phẩm admin: **Giá thị trường** (tham khảo), **Giá kỳ vọng bán ra trên website** (bắt buộc — giá bán bình thường) và **Giá khuyến mại** (khi có chương trình). Ô xem trước "Khách thấy" hiện đúng cách gạch giá.

### Changed
- Quy tắc hiển thị giá cho khách: có giá thị trường cao hơn → gạch giá thị trường, hiện % rẻ hơn (kèm chữ "so với giá thị trường" trên trang sản phẩm); đang khuyến mại → khách trả giá khuyến mại, gạch giá kỳ vọng và hiện % giảm — không "tăng rồi giảm". Áp cho thẻ sản phẩm, trang sản phẩm, xem nhanh, gợi ý trong giỏ.
- Sales › Giảm giá sản phẩm: thống nhất tên gọi "Giá kỳ vọng — giá gạch" / "Giá khuyến mại".

## [1.54.0] - 2026-09-17

### Added
- Quản lý mua hàng › **Phiếu mua hàng** (tab mới): mỗi lần mua một lố tại một nguồn là một phiếu mã tự sinh **PM-YYMMDD-NN** — ngày mua, nguồn, mã đơn của nguồn, sản phẩm × số lượng × ¥, rồi ngày gửi ĐVVC + mã vận đơn. Tạo phiếu từ các dòng đơn đã tick (dòng chuyển sang "Đã mua", ghi nguồn); điền ngày gửi thì mọi dòng đơn / phiếu lưu kho trong phiếu chuyển sang "Tới ĐVVC Nhật". Dòng đơn hiện mã phiếu; tìm được theo mã phiếu.
- Quản lý mua hàng › **Nhập bill**: dán email đặt hàng Amazon / Rakuten hoặc danh sách tay (tên · số lượng · giá) → hệ thống đọc mã đơn, ngày mua, từng dòng sản phẩm (số lượng, giá ¥), khớp sản phẩm trên web theo mã ASIN trong link mua hoặc theo tên (Việt / Nhật) → phiếu nháp để kiểm tra, sửa khớp rồi **Xác nhận**: số lượng mua gán cho các đơn khách đang chờ (đơn cũ trước), phần dư thành phiếu mua lưu kho (kho Nhật) cùng phiếu.

### Changed
- Quản lý mua hàng: lọc thêm theo **khoảng ngày đặt đơn** và **nơi mua**; cột "Mua ở" là ô chọn nguồn nhập cho từng dòng (lưu cùng nút ✓), link mua và mã phiếu hiện bên dưới.

## [1.53.0] - 2026-09-17

### Added
- **Tổng quan › Đăng bài fanpage** (module quyền mới `fanpage`): chọn sản phẩm → hệ thống soạn bài Facebook (câu mở, công dụng từ mô tả, cách dùng, giá / giảm giá, link đặt hàng, hotline, hashtag tiếng Việt; 3 cách viết luân phiên), đính kèm ảnh sản phẩm (chọn ảnh), sửa tuỳ ý rồi **Đăng ngay** hoặc **Lên lịch** giờ cụ thể. Chế độ **tự động đăng theo lịch** (giờ trong ngày, ưu tiên sản phẩm chưa đăng / mới nhất / ngẫu nhiên, hashtag chung); hàng chờ & lịch sử (trạng thái, link bài trên Facebook, lỗi, thử lại, huỷ). Kết nối bằng Page ID + Page access token (lưu trên máy chủ, có nút kiểm tra; hướng dẫn lấy token ngay trong trang). Bộ lập lịch chạy nền mỗi phút.

## [1.52.2] - 2026-09-17

### Changed
- Sales › Giảm giá sản phẩm: chọn sản phẩm bằng ô gõ tìm (tên, SKU, #id) như Flash Sales thay cho danh sách thả xuống dài; khi sửa giảm giá sản phẩm đã được chọn sẵn.

## [1.52.1] - 2026-09-17

### Changed
- Trang sửa sản phẩm gọn hơn: khung Danh mục, Từ khóa và Nhóm biến thể thu gọn thành một dòng tóm tắt (danh mục đã chọn, số từ khoá, tên nhóm), bấm để mở; chú thích dưới bảng nguồn mua rút còn một dòng (chi tiết trong ⓘ); hàng nút **Lưu thay đổi · Huỷ · Xoá sản phẩm** dính đáy màn hình, bấm được ở bất kỳ vị trí cuộn.

## [1.52.0] - 2026-09-17

### Added
- Nguồn nhập: **nhiều phụ phí cho một nguồn**, mỗi dòng có cách tính riêng — ¥ / sản phẩm, ¥ / kg (theo cân tính phí của sản phẩm, đã tính thể tích) hoặc ¥ / lần gửi (một lần ship nhiều món, chia cho từng sản phẩm theo cân trên cân một lần gửi). Cộng vào giá vốn tại Nhật khi lưu sản phẩm, khi job tỉ giá hằng đêm chạy, khi nhập CSV và khi so nguồn rẻ nhất.
- Trang sản phẩm › Giá kỳ vọng: dòng **"trong đó phụ phí nguồn"** dưới Giá vốn tại Nhật, bấm ⓘ xem từng phụ phí được tính thế nào cho sản phẩm này.
- Vận chuyển: chặng ① tách thành hai sheet **①a Nội địa Nhật → kho Nhật** (từ nơi mua về kho shop tại Nhật) và **①b Kho Nhật → kho ĐVVC** (từ kho shop tới Kiến Express); mỗi phương thức chọn nhánh khi sửa/thêm. Phương thức cũ tự xếp: LienStore gom tại nhà, Tự mang tới kho Nhật → ①b, còn lại → ①a.

### Changed
- Nhóm biến thể › Sửa nhóm: điền thuộc tính / thứ tự của mọi biến thể rồi bấm **"Lưu tất cả"** một lần (không còn nút Lưu từng dòng; "Tách" vẫn riêng từng dòng).

## [1.51.1] - 2026-09-17

### Changed
- Giỏ hàng nhanh › "Thường được mua cùng với": gợi ý căn giữa (ảnh, tên, giá) và chỉ còn một dòng "Thêm vào giỏ" — bỏ cột nút giỏ / xem nhanh để không lẫn với các sản phẩm đang trong giỏ.
- Thanh liên hệ nổi bên phải: bỏ Facebook, Messenger lên đầu rồi Zalo, gọi điện; icon nhỏ hơn trên màn hình lớn.
- Chân trang › "Kết nối với …": thêm nút gọi điện (hotline VN và JP) bên cạnh Facebook / Zalo / Messenger.

## [1.51.0] - 2026-09-17

### Added
- Vận chuyển › **trạng thái theo từng chặng**: mỗi chặng của đơn (nội địa Nhật · Nhật → Việt · kho ĐVVC → kho shop · nội địa VN) có trạng thái riêng *Chưa gửi → Đã gửi → Đã đến* với thời điểm và **lịch sử** từng lần đổi (ai, lúc nào, mã vận đơn). Đổi trạng thái chặng thì sản phẩm trong đơn (Quản lý mua hàng) và tiến độ đơn cho khách tự nhích theo.
- Vận chuyển: cột **"Hàng đang ở"** (Chưa gửi tại Nhật · Đang tới kho ĐVVC Nhật · Kho ĐVVC Nhật · Đang bay NB → VN · Kho ĐVVC Việt Nam · Đang về kho shop · Kho Việt Nam · Đang giao · Khách đã nhận) suy từ chặng xa nhất đã đi, kèm bộ lọc theo vị trí; sheet của từng chặng có bảng **"Đơn hàng qua chặng này"** để lọc theo trạng thái, nhập mã vận đơn / ghi chú và đổi trạng thái ngay tại chỗ.

### Changed
- Luồng nhập hàng mặc định: chặng ① **LienStore gom tại nhà** thay cho Japan Post ゆうパック — áp cho công thức giá của mọi sản phẩm (kể cả nháp, giá bán tính lại khi lên bản này), cho ô chặng ① của đơn mới, và chuyển các đơn đang mở còn để Japan Post (chưa có mã vận đơn, chưa gửi) sang phương thức mới. Cột giá của phương thức này được coi là **phí trọn một lần gom** (đơn vị "/kg" nếu có bị bỏ) để không nhân theo cân.
- Chân trang: "Kết nối với …" và dòng bản quyền lấy tên cửa hàng theo Giao diện & Logo.

### Fixed
- Sữa tắm Reihaku Hatomugi High Moisture: bản sửa 800ml nay áp cả khi đường dẫn đã đổi trước đó (tên, từ khoá, thuộc tính "Thể tích" 600ml → 800ml).

## [1.50.0] - 2026-09-17

### Added
- **Kho hàng theo 3 kho** — Kho Nhật (shop tại Chiba) · Kho ĐVVC (Kiến Express) · Kho Việt Nam (Hoằng Hóa): mỗi lô ghi rõ kho (sửa ở Quản lý lô), phiếu mua lưu kho chọn "Nhập vào kho"; bộ lọc Trạng thái nay chỉ rõ *lưu kho ở đâu* (theo kho) và *đang về đến đâu* (còn tại Nhật / NB → VN / kho ĐVVC VN); cột Tình trạng hiện tồn từng kho; **xuất CSV kiểm kê riêng từng kho** (cột "Kho kiểm kê") và nhập lại cập nhật đúng kho đó; CSV bảng có thêm cột tồn theo kho.
- Nguồn nhập: **phụ phí ¥/đơn vị** theo nguồn (VD iHerb: phí ship về kho Nhật) — cộng vào giá vốn khi tính tay, khi job tỉ giá hằng đêm chạy, khi nhập CSV và khi so "nguồn rẻ nhất".
- Sản phẩm › khung **Kho hàng**: chọn *Hàng order* hay *Lưu kho* (lưu bao nhiêu = mức tồn tiêu chuẩn), kèm biểu đồ số bán 6 tháng gần đây và gợi ý mức lưu kho ("Dùng mức này") để quyết định đổi từ order sang lưu kho.
- Nhóm biến thể: ô tìm kiếm nhóm (theo tên nhóm, tên / SKU sản phẩm trong nhóm) ở góc trên bên phải.
- Menu tài khoản (drawer): thêm mục **Voucher** — voucher chung của web và voucher admin gửi riêng cho tài khoản xem ở Tài khoản › Voucher.

### Changed
- Trang sửa sản phẩm: mô tả chi tiết (Việt / Nhật) thu gọn, bấm để mở; đường dẫn tự sinh từ tên (bấm "Đổi" khi thật cần); mô tả ngắn và phần giới thiệu viết bằng ngôn ngữ tự nhiên (không cần HTML — hệ thống tự chia đoạn); nút "Lưu thay đổi" và "Xoá sản phẩm" đặt cạnh nhau.
- Thanh toán: mặc định **Giao tận nhà**; thứ tự Họ tên (một ô) → Địa chỉ nhận hàng → Số điện thoại → Email (tuỳ chọn); thẻ cước từng hãng gọn hơn (giá, dự kiến, nút chọn, "Xem cách tính"); bỏ khối "Lọc theo giá" ở cột bên.
- Trang sản phẩm: bỏ dòng "Mỗi lựa chọn có ảnh…", bỏ mã SKU; "Từ khóa" chỉ hiện từ khoá tiếng Việt (bỏ tiếng Nhật, không dấu trùng, dung tích…).
- Về chúng tôi: tên cửa hàng và slogan lấy theo Giao diện & Logo (Store Lienanh — Chuyên hàng Nhật nội địa) thay cho tên cũ.
- Hướng dẫn 5 bước: bước 3 thành "Chọn hình thức nhận hàng và thanh toán"; mục Bán chạy nhất gắn nhãn **Hot** thay cho "Mới".

### Fixed
- Sữa tắm Reihaku Hatomugi High Moisture là chai **800ml** (trước ghi 600ml) — tên, tên Nhật, từ khoá, thuộc tính biến thể và mô tả được sửa khi lên bản này (đường dẫn giữ nguyên).

## [1.49.0] - 2026-09-17

### Fixed
- Thẻ nhóm biến thể hiện "Từ 0đ" khi có một biến thể giá "Liên hệ" — nay giá "Từ …" lấy biến thể có giá thấp nhất, chỉ hiện "Liên hệ" khi cả nhóm chưa có giá; số lựa chọn = số biến thể đang bán.
- Tab "Chi phí vận chuyển" trên trang sản phẩm không còn tự tính cước theo địa chỉ nhớ trong trình duyệt — khách xác nhận địa chỉ và bấm "Xem cước" thì mới tính.

### Added
- Kho hàng › **Nhập CSV kiểm kê**: xuất "CSV bảng này", điền cột "Kiểm đếm thực tế", nhập lại để cập nhật tồn hàng loạt (dòng để trống bỏ qua, lô hàng tự điều chỉnh theo số đếm).
- Kho hàng: bộ lọc **Hạn dùng** (còn ≤ 1 / 3 / 6 tháng / 1 năm theo lô gần hết hạn nhất) và **Nên lưu kho** (bán ≥ 3 trong 30 ngày) thay cho lọc "Cần mua"; cột Bán ra và Lô hàng sắp xếp được.

### Changed
- Quản lý mua hàng: ô thống kê trạng thái thu gọn một hàng để bảng bên dưới có nhiều diện tích hơn (giống Kho hàng).

## [1.48.1] - 2026-09-17

### Fixed
- Sản phẩm bản nháp (ẩn) không còn mở được bằng link trực tiếp — trang sản phẩm trả 404 (trước chỉ ẩn khỏi danh sách).

## [1.48.0] - 2026-09-17

### Changed
- **Chỉ bán hàng OS Drug Store và iHerb**: thêm nguồn nhập iHerb (jp.iherb.com) và gắn cho 3 sản phẩm mua ở đó; toàn bộ sản phẩm khác chuyển về bản nháp (ẩn) khi lên bản này — danh sách id đã ẩn lưu ở cài đặt `catalog_scope_hidden_ids` để khôi phục được.
- **Kho hàng về mô hình hàng order**: xoá dữ liệu lô / phiếu mua lưu kho chưa có thật, mọi sản phẩm về "không lưu kho — hàng order" (bản lưu dự phòng ở `inventory_clean_backup`). Có hàng trong kho hoặc lô đang về thì luôn bán từ kho trước; admin có thể lên phiếu mua lưu kho ở Quản lý mua hàng.
- Màn Kho hàng (đổi tên tab từ "Tồn kho"): 6 ô thống kê mới — Đang lưu kho · Đang về kho (lô) · Lô chờ mua · Cần mua theo đơn · Cần mua bù kho · Hạn dùng; nhãn tình trạng: Hàng order / Đang về kho / Có trong kho / Sắp hết kho / Hết kho. CSV cần mua thêm cột **Lô lưu kho chờ mua** và liệt kê cả phiếu mua lưu kho chưa mua để admin bên Nhật đi mua.
- Menu: nhãn nhỏ **Sale** cạnh "Danh mục", **New** cạnh "Tin tức".
- Thẻ sản phẩm: rê vào ảnh hiện nút giỏ hàng xanh; rê tiếp vào nút mới chuyển cam và hiện "Thêm vào giỏ".

## [1.47.0] - 2026-09-17

### Changed
- Tỉ giá ¥→đ **khóa cố định 170** (ghi ở ô "Tỉ giá cố định — nhập tay" trong Công thức giá; xóa ô đó và Lưu để quay về tỉ giá DCOM tự lấy). Khi lên bản này, hệ thống tự tính lại giá vốn và giá bán theo công thức cho toàn bộ sản phẩm có giá ¥ một lần (bỏ qua sản phẩm đang giảm giá / Flash Sales) — không cần bấm tay từng sản phẩm.
- Mô tả 137 sản phẩm đợt OS Drug Store được tách từ một đoạn thành các mục **Công dụng / Thành phần / Hướng dẫn sử dụng / Lưu ý & bảo quản** (giữ nguyên nội dung đã tra cứu), nên trang sản phẩm và ô "Soạn theo mục" trong admin hiện đủ các mục.

## [1.46.0] - 2026-09-17

### Fixed
- Trang chủ › "Giảm giá đặc biệt" chỉ lấy sản phẩm giảm giá nằm trong top 60 bán chạy, nên sản phẩm mới giảm giá chưa bán được lần nào không hiện; nay lấy toàn bộ sản phẩm đang giảm giá (bán chạy xếp trước), "Xem thêm" mở danh sách đang giảm giá.

### Added
- Flash Sales: mỗi sản phẩm có thể đặt **giá flash hoặc % giảm riêng** — áp thẳng vào giá bán nên badge -%, giỏ hàng, thanh toán đều khớp; hết giờ hoặc bỏ khỏi Flash Sales thì giá cũ tự trở lại.

### Changed
- Admin › Flash Sales: ô chọn giờ mặc định là giờ hiện tại; dòng chưa đặt giờ (còn mốc 1970 từ bản trước) hiện "chưa đặt giờ" và mở ở giờ hiện tại; sửa giờ và giá flash trên cùng một dòng.

## [1.45.0] - 2026-09-15

### Changed
- Flash Sales: mỗi sản phẩm có giờ kết thúc riêng thay vì 1 giờ chung cho cả đợt; trang chủ gộp Flash Sales vào chung khối "Giảm giá đặc biệt" (sản phẩm Flash Sales lên trước, có thêm nhãn đếm ngược + % giảm giá nếu có).
- Admin › Sales › Flash Sales: đổi ô chọn sản phẩm dạng dropdown thành ô tìm kiếm gõ tên/SKU; mỗi dòng sản phẩm có ô sửa giờ kết thúc riêng.

## [1.44.0] - 2026-09-15

### Added
- **Flash Sales**: khối trang chủ mới (giữa "Ưu đãi độc quyền website" và "Giảm giá đặc biệt") — sản phẩm chọn tay, có đếm ngược thời gian, quản lý ở Sales › Flash Sales.

### Changed
- Trạng thái sản phẩm cho khách: "Hết hàng" bỏ chú thích "— mẫu này không còn bán tại Nhật"; "Có sẵn" không hiện số lượng tồn cụ thể.
- Báo giá vận chuyển ở trang sản phẩm/giỏ hàng/thanh toán: chỉ hiện hãng có API thật (GHN, qua Goship…), bỏ báo giá theo công thức/biểu phí (SPX, VNPost) vì không chính xác.

## [1.43.0] - 2026-09-15

### Changed
- Kho hàng: thu nhỏ 7 ô thống kê, gộp 2 dải bộ lọc "Trạng thái theo dõi"/"Cần mua" thành 2 ô chọn gọn trong hàng lọc chính — nhường diện tích cho bảng.
- "Trạng thái theo dõi" đổi thành theo luồng nguồn hàng: **Đang lưu kho** (còn tồn) / **Đang về** (đã đặt lô lưu kho, chưa tới kho) / **Chưa mua** (cần mua, chưa có gì). "Cần mua" đổi nhãn: Theo đơn hàng / Để lưu kho.

## [1.42.0] - 2026-09-15

### Fixed
- Kho hàng › Tồn kho: bù về mức tồn tối thiểu không tính hàng đã mua đang về, khiến "Cần mua" hiện sai dù đã có lô lớn sắp về kho.
- Kho hàng › Quản lý mua hàng: dòng đơn hàng lấy đủ từ tồn kho nay bắt đầu ở trạng thái "Tại kho" thay vì "Chưa mua".

### Added
- Kho hàng › Tồn kho + CSV cần mua: thêm cột **Tồn kho tiêu chuẩn**, **Bán ra gần đây (30 ngày)**, **Dự trữ dự kiến sau bán**; **Tổng hàng mua** chuyển ra cột cuối = tồn kho + hàng đã mua chưa giao khách.

## [1.41.2] - 2026-09-15

### Added
- Admin › Sản phẩm: bộ lọc theo **nguồn nhập** (chỉ liệt kê nguồn đang có sản phẩm, cộng "Chưa gắn nguồn"); áp dụng cho cả bảng và Xuất CSV.

## [1.41.1] - 2026-09-15

### Fixed
- Dữ liệu nhập OS Drug Store (v1.41.0) không chạy trên dev/prod vì file nằm trong volume `/app/data` cũ (đã có từ trước) đè lên file mới trong image — chuyển ra `/app/seed/` như `seed.json`.

## [1.41.0] - 2026-09-15

### Added
- Giá "Liên hệ" cho sản phẩm chưa có giá vốn: ẩn giá số, disable nút mua, hiện nút liên hệ trên card sản phẩm, trang chi tiết và Quick View.
- 140 sản phẩm mới từ đợt nhập hàng OS Drug Store (đối chiếu ảnh chụp kệ hàng), nguồn nhập "OS Drug Store" mới trong Kho hàng › Nguồn nhập.

### Fixed
- Sửa giá vốn khớp nhầm theo giá lô/bundle trên Amazon cho 2 sản phẩm ("Vitamin C DHC 60 Ngày", "Dầu Cá Omega 3 Orihiro 180 Viên"), theo giá thực tế đối chiếu từ OS Drug Store.

## [1.40.3] - 2026-09-14

## [1.40.2] - 2026-09-14

## [1.40.1] - 2026-09-14

## [1.40.0] - 2026-09-13

## [1.39.0] - 2026-09-13

## [1.38.2] - 2026-09-13

## [1.38.1] - 2026-09-13

## [1.38.0] - 2026-09-13

## [1.37.0] - 2026-09-12

## [1.36.0] - 2026-09-12

## [1.35.1] - 2026-09-12

## [1.35.0] - 2026-09-12

## [1.34.2] - 2026-09-12

## [1.34.1] - 2026-09-12

## [1.34.0] - 2026-09-12

## [1.33.4] - 2026-09-12

## [1.33.3] - 2026-09-12

## [1.33.2] - 2026-09-12

## [1.33.1] - 2026-09-12

## [1.33.0] - 2026-09-11

## [1.32.0] - 2026-09-11

## [1.31.0] - 2026-09-11

## [1.30.9] - 2026-09-11

## [1.30.8] - 2026-09-11

## [1.30.7] - 2026-09-11

## [1.30.6] - 2026-09-11

## [1.30.5] - 2026-09-11

## [1.30.4] - 2026-09-11

## [1.30.3] - 2026-09-11

## [1.30.2] - 2026-09-11

## [1.30.1] - 2026-09-11

## [1.30.0] - 2026-09-11

## [1.29.0] - 2026-09-11

## [1.28.2] - 2026-09-11

## [1.28.1] - 2026-09-11

## [1.28.0] - 2026-09-11

## [1.27.0] - 2026-09-11

## [1.26.0] - 2026-09-11

## [1.25.0] - 2026-09-11

## [1.24.1] - 2026-09-11

## [1.24.0] - 2026-09-11

## [1.23.1] - 2026-09-11

## [1.23.0] - 2026-09-11

## [1.22.0] - 2026-09-11

## [1.21.2] - 2026-09-11

## [1.21.1] - 2026-09-11

## [1.21.0] - 2026-09-11

## [1.20.2] - 2026-09-10

## [1.20.1] - 2026-09-10

## [1.20.0] - 2026-09-10

## [1.19.1] - 2026-09-10

## [1.19.0] - 2026-09-10

## [1.18.3] - 2026-09-10

## [1.18.2] - 2026-09-10

### Changed
- Thanh trạng thái trình duyệt / web app (theme-color, manifest) đổi từ xanh biển cũ sang xanh lá #458500 cho đồng màu với header.

## [1.18.1] - 2026-09-10

### Changed
- Dữ liệu: cập nhật khối lượng, kích thước và độ tin cậy cho 44 sản phẩm mới theo file cào ngày 09/09 (`docs/reports/kich-thuoc-khoi-luong-44-san-pham-moi-2026-09-09.csv`): 13 Cao, 24 Trung bình, 7 Thấp; 8 sản phẩm trước đó chưa có số đo nay đã có.

## [1.18.0] - 2026-09-10

### Added
- Trang **Hướng dẫn mua hàng** (`/huong-dan-dat-hang/`) với hình 5 bước dựng bằng CSS (chọn sản phẩm / xác nhận đơn / thanh toán / theo dõi & bill / nhận hàng), giải thích từng bước, có bản tiếng Nhật; khối "Hướng dẫn mua hàng" trên trang chủ dẫn tới trang này.
- Nhãn **Bán chạy** trên thẻ sản phẩm (sản phẩm có từ khoá "bán chạy" / "bestseller"; 12 sản phẩm điểm cao nhất đã được gắn).
- `ProductCarousel`: dải sản phẩm ngang cho các khối trang chủ — mũi tên hai bên, kéo chuột trên máy tính, vuốt trên điện thoại.

### Changed
- Banner trang chủ chạy hết chiều ngang màn hình (ảnh gốc ở giữa, hai bên là ảnh mờ), cao tối đa 520px.
- Các khối Hàng mới về / Bán chạy / Giảm giá / theo danh mục chuyển từ lưới 2 hàng sang dải trượt 1 hàng; nút cuối khối chỉ ghi "Xem thêm".
- Dải danh mục kéo được bằng chuột (không chỉ bấm mũi tên).
- Bỏ khối "Góc chia sẻ" khỏi trang chủ (vẫn còn trong menu Tin tức); bỏ trang và link "Cài LienStore lên điện thoại" (migration v16).
- Footer: tên danh mục viết thường, bỏ phần tiếng Anh; icon Facebook/Zalo/Messenger bo tròn như dock; dock liên hệ nằm sát góc dưới phải.
- Nút chuyển VI | JP dùng chuyển hướng tương đối, hết lỗi nhảy sang 0.0.0.0:3000 khi chạy local hoặc sau proxy.

## [1.17.0] - 2026-09-09

### Added
- Ảnh danh mục: gán **bộ A · Fluent Emoji 3D** cho toàn bộ 42 danh mục (PNG 300×300 nền trắng).
- Nội dung tiếng Nhật cho **toàn bộ sản phẩm**: 204 sản phẩm chưa có nguồn Amazon được dịch từ tiếng Việt sang tiếng Nhật (tên, mô tả ngắn, mô tả chi tiết theo bố cục 商品情報 / 特徴 / 成分 / 使用方法 / ご注意); cùng 157 sản phẩm lấy từ Amazon trước đó → 100% catalogue có bản tiếng Nhật.

### Changed
- 日本語: các khối trang chủ (Hàng mới về, Bán chạy, Giảm giá) hiện tên tiếng Nhật; tab 配送料 dịch tiêu đề chặng, câu ước tính, nhãn "Kho", và các cụm dữ liệu quen (Toàn Nhật Bản, Miền Bắc, 1–2 ngày…); tab レビュー dịch toàn bộ form; footer/giới thiệu hiện địa chỉ tiếng Nhật; "Hotline" thành 電話.
- Mobile (màn cảm ứng): nút thêm vào giỏ trên thẻ sản phẩm thu nhỏ về góc phải dưới, bỏ nhãn "Thêm vào giỏ" và nút xem nhanh để không che ảnh; trên máy tính vẫn hiện khi rê chuột.

## [1.16.0] - 2026-09-09

### Added
- **Nội dung tiếng Nhật cho sản phẩm và danh mục**: cột `name_ja`, `short_description_ja`, `description_ja` (products) và `name_ja` (categories) — migration v15; form sản phẩm/danh mục trong admin có ô tiếng Nhật; Excel có 3 cột tiếng Nhật. Khi khách chọn 日本語, tên/mô tả tiếng Nhật được hiển thị (thiếu thì về tiếng Việt).
- Cào nội dung gốc tiếng Nhật từ Amazon.co.jp cho 178 sản phẩm có link hoặc khớp tên Nhật (`scripts/xlsx/fetch_ja_content.py` → `data/ja-source.json`), dịch sang tiếng Việt theo bố cục Thông tin sản phẩm / Công dụng / Thành phần / Hướng dẫn sử dụng / Lưu ý; thay mô tả tiếng Việt cho sản phẩm có mô tả cũ dưới 300 ký tự và sản phẩm mới nhập, giữ mô tả dài đã có. Báo cáo `docs/reports/ja-translation-2026-09-09.html`. 11 sản phẩm mới thiếu ảnh lấy ảnh chính từ Amazon.
- 42 tên danh mục tiếng Nhật.
- **Giao diện 日本語 hoàn thiện trên mọi trang**: trang chủ (tiêu đề khối, cam kết, thẻ đăng ký/mua hộ), danh sách sản phẩm (đếm kết quả, sắp xếp, sidebar), trang sản phẩm (tab, tình trạng, hộp thông tin, mục lục mô tả, tiêu đề mục), giỏ hàng, thanh toán, tài khoản, danh sách yêu thích, chi phí vận chuyển (bảng phí), giới thiệu (bản dịch đầy đủ), footer, breadcrumb, tiến độ đơn hàng.
- 4 bộ icon danh mục (Fluent Emoji 3D, Noto, Tabler line, Fluent Flat) xuất PNG 300×300 tại `public/sites/lienstore/shared/categories/icons/<bộ>/`; `scripts/xlsx/apply_category_icons.py <bộ>` gán cho toàn bộ danh mục sau khi chọn.

## [1.15.0] - 2026-09-09

### Added
- **Độ tin cậy kích thước / khối lượng** cho từng sản phẩm (Cao · Trung bình · Thấp + cơ sở/nguồn): cột `dims_confidence`, `dims_source` (migration v14), trường trong form sản phẩm, cột "Cân / KT" ở danh sách sản phẩm, cột Excel "Độ tin cậy KT", "Nguồn KT". Hệ số an toàn khi tính phí: Cao ×1,2 · Trung bình ×1,5 · Thấp/chưa đánh giá ×2. Khách chỉ thấy số đo trên trang sản phẩm khi độ tin cậy là Cao.
- Dữ liệu: nạp bảng kích thước/khối lượng cào ngày 09/09 cho 316 sản phẩm (139 Cao, 109 Trung bình, 69 Thấp); giữ số liệu Amazon đã có cho 13 sản phẩm.
- **Phí vận chuyển 3 chặng ở trang thanh toán** (chế độ "Tính riêng 3 chặng theo đơn", bật mặc định): ship nội địa Nhật + Nhật → Việt Nam (phương thức đang bật đứng đầu mỗi chặng, cột theo mốc cân hoặc /kg, giá ¥ đổi theo tỷ giá) + giao nội địa Việt Nam; chọn "Nhận tại kho" thì bỏ chặng nội địa Việt Nam. Server tính lại khi tạo đơn và ghi sẵn 3 chặng vào bảng vận chuyển của đơn. Cài đặt chế độ và tỷ giá ¥→đ ở Vận chuyển › Hiển thị cho khách.
- 44 sản phẩm mới từ 2 file Facebook (Lê Thu Trang 27, My Chinh Nguyen 17) ở trạng thái Bản nháp (chưa có giá); 4 danh mục con mới (Tinh chất dưỡng, Chăm sóc sức khỏe, Chăm sóc cơ thể, Dầu gội – dầu xả). Danh mục **Đồ chơi & sưu tập › Thẻ bài Pokémon** và sản phẩm nháp "Thẻ bài Pokémon TCG bản Nhật (hàng order)".
- `fetch_dimensions.py --jp-names`: tìm Amazon.co.jp theo tên tiếng Nhật khi sản phẩm chưa có link.

### Changed
- **Giao diện xanh lá kiểu iHerb**: thanh header xanh (#458500) chữ trắng, ô tìm kiếm trắng, màu chủ đạo/nút/link chuyển sang xanh lá, footer và sidebar admin xanh đậm.

## [1.14.0] - 2026-09-09

### Added
- **Tiến độ vận chuyển từng đơn** (kiểu Mercari): 7 bước Đã đặt hàng → Đã mua tại Nhật → Đã tới kho Nhật → Đang về Việt Nam → Đã tới kho Việt Nam → Đang giao → Đã nhận hàng. Admin bấm "Chuyển sang bước tiếp" (kèm ghi chú cho khách) ở cột phải trang đơn; khách thấy thanh tiến độ với ngày giờ ở trang "Đơn hàng đã nhận", mục Đơn hàng của tài khoản và tra cứu đơn. Tới "Đã nhận hàng" thì đơn tự chuyển Hoàn thành. Bảng `order_stage_log`, cột `orders.ship_stage` (migration v13).
- **Chat theo đơn hàng**: khách nhắn với LienStore ngay dưới đơn (trang đơn hàng đã nhận và tài khoản), admin trả lời trong trang đơn với 4 câu mẫu; tự làm mới 20 giây; danh sách đơn admin có huy hiệu số tin chưa đọc. Bảng `order_messages`.
- **Phương thức mặc định cho cả 3 chặng** (chỉ thêm khi chưa có): nội địa Nhật — Yamato 宅急便, Japan Post ゆうパック, Sagawa (giá ¥ theo size 60/80/100/120), Tự mang tới kho, LienStore gom tại nhà; Nhật → Việt — Japan Post EMS (¥ theo kg) bên cạnh Kiến Express; nội địa Việt Nam — Bưu điện Việt Nam (VNPost) và "Khách tự tới kho lấy" (tắt hiển thị cho khách, admin chọn khi khách đổi ý).
- Trang chủ: **danh mục dạng băng trượt** 8 ô/trang, ô nền xám nhạt, ảnh lớn, tên đậm, số mặt hàng, chấm chuyển trang và mũi tên.

### Changed
- Trang đơn hàng admin: khung **Bill mua hàng tại Nhật** chuyển sang cột phải (dưới Khách hàng), cột trái có khung Trao đổi với khách.
- Link "Xem thêm ≫" ở tiêu đề khối trang chủ không còn xuống dòng, có gạch chân xanh.

## [1.13.0] - 2026-09-09

### Added
- **Chuyển ngôn ngữ VI | JP** trên thanh trên cùng (thay cụm icon Facebook/Zalo/Messenger; các icon này vẫn ở dock bên phải và footer). Dịch phần khung: menu, tìm kiếm, ngăn kéo tài khoản, giỏ hàng, nút "Thêm vào giỏ", tiêu đề footer. Tên/mô tả sản phẩm giữ nguyên tiếng Việt. Lưu bằng cookie `lien_lang`, đổi qua `/api/lang/`.
- **Ngăn kéo tài khoản** bên phải khi bấm icon người ở header: đăng nhập (ID hoặc email), đăng ký (Tên đệm & tên, Họ, **Tên đăng nhập (ID) bắt buộc**, Email không bắt buộc, Mật khẩu), quên mật khẩu; khi đã đăng nhập hiện menu ngắn (Tài khoản, Đơn hàng, Yêu thích, Giỏ hàng, Đăng xuất). Đăng nhập/đăng ký xong ở lại trang đang xem.
- **Sales › Giảm giá sản phẩm** (`/admin/promotions/discounts/`): danh sách đang giảm, đặt giảm theo giá hoặc %, bỏ giảm.
- **Sales › Voucher** (`/admin/promotions/vouchers/`): mã giảm % hoặc số tiền, đơn tối thiểu, giảm tối đa, thời hạn, số lượt, tắt/mở. Khách nhập mã ở trang thanh toán (kiểm tra qua `/api/voucher/`), server kiểm tra lại khi tạo đơn; đơn hàng lưu `discount` + `voucher_code`, hiển thị dòng Giảm giá ở trang cảm ơn, tài khoản và admin. Quyền mới **promotions** (Khuyến mãi). Migration v12.

### Changed
- **Menu admin** gom nhóm: **Kho hàng** (Danh mục, Sản phẩm, Tồn kho), **Đơn hàng**, **Sales** (Khách hàng, Giảm giá sản phẩm, Voucher), **Vận chuyển** (Đơn hàng · 3 chặng, 3 chặng, Hiển thị cho khách), **Người dùng**. Bấm vào tab cha mới hiện tab con; nhóm chứa trang đang mở tự mở.
- Đăng nhập khách hàng chấp nhận **ID hoặc email**; đăng ký ở `/my-account/` cũng dùng bộ trường mới (email không bắt buộc). Email ở trang thanh toán không bắt buộc (chỉ cần khi tick "Tạo tài khoản").
- **Nền giao diện** đổi sang xám trắng trung tính kiểu iHerb (thanh trên, ô tìm kiếm, viền, footer); màu chủ đạo xanh biển giữ nguyên.

## [1.12.0] - 2026-09-09

### Added
- **Vận chuyển theo đơn hàng**: tab đầu của Vận chuyển đổi thành bảng **Đơn hàng** — mỗi đơn một dòng, 3 chặng theo chiều ngang; từng ô chọn phương thức · cột, phí (để trống thì tự tính theo cột và khối lượng đơn), mã vận đơn, ghi chú; ô nội địa Việt Nam có thể áp phí vào tổng tiền khách trả. Trang chi tiết đơn có khung "Vận chuyển đơn này (3 chặng)". Bảng `order_legs` (migration v11).
- Trang thanh toán tính phí giao theo **khối lượng toàn đơn** (khối lượng hoặc cân quy đổi thể tích × số lượng, làm tròn lên kg) cho các cột tính /kg; server tính lại tương tự.

### Changed
- Khung "Thêm phương thức" và "Thêm đơn vị vận chuyển" gấp gọn thành nút, bấm mới mở ra.

## [1.11.1] - 2026-09-09

### Changed
- **Admin › Vận chuyển**: mỗi tab chặng chỉ hiện nội dung của chặng đó (phương thức, nút thêm phương thức, đơn vị vận chuyển của chặng, và riêng chặng nội địa VN có ô địa chỉ nhận tại kho); tab mới **Hiển thị cho khách** gồm lưu ý chung và xem trước đúng như tab "Chi phí vận chuyển" trên trang sản phẩm. **Đơn vị vận chuyển gắn theo chặng** (migration v10): nội địa Nhật có Yamato, Japan Post (郵便), Sagawa, Tự mang tới kho, LienStore gom tại nhà (bán kính 30 km, từ 20 kg); Nhật → Việt có Kiến Express, Japan Post EMS; nội địa Việt Nam có Viettel Post, Bưu điện Việt Nam, GHTK, Khách tự tới kho lấy. Dropdown đơn vị trong từng phương thức chỉ liệt kê đơn vị của chặng đó.

## [1.11.0] - 2026-09-09

### Added
- **Trang thanh toán**: chọn **Nhận tại kho** (miễn phí, hiện địa chỉ kho do admin đặt ở Vận chuyển → Nhận tại kho) hoặc **Giao tận nhà** với dropdown khu vực lấy từ các phương thức chặng Nội địa Việt Nam (phí theo cột, miễn phí khi đạt mức; cột "/kg" nhân theo khối lượng đơn). Phí giao hiện thành dòng riêng và cộng vào Tổng; server tính lại, lưu vào đơn (`shipping_fee`, `shipping_label`, `delivery`). Migration v9.
- **Chuyển khoản**: sau khi đặt hàng, trang "Đơn hàng đã nhận" hiện tài khoản BIDV (LE THI LIEN · 26010000748323 · CN Mỹ Đình), **mã VietQR** đã điền sẵn số tiền và **nội dung chuyển khoản tự sinh** `LIENSTORE <mã đơn>`; admin thấy nội dung CK ở chi tiết đơn.
- **Hàng order phải thanh toán trước 100%**: đơn có sản phẩm không theo dõi tồn hoặc không đủ tồn được đánh dấu "Hàng order", ẩn/khoá thanh toán khi nhận hàng, server từ chối COD; đơn lưu cờ `prepaid_required`.
- Menu admin có 3 mục con dưới Vận chuyển (Nội địa Nhật · Nhật → Việt Nam · Nội địa Việt Nam) lọc theo chặng; trang Vận chuyển có thanh tab tương ứng.
- **Nút liên hệ nhanh** bo tròn cố định bên phải màn hình: Facebook, Zalo, Messenger, gọi điện, lên đầu trang (thay các ô giỏ/yêu thích/tài khoản cũ).

### Changed
- Fanpage đổi sang facebook.com/lienanh.taphoa (Messenger m.me/lienanh.taphoa) ở thanh trên, footer, trang Về chúng tôi, nút liên hệ nhanh.
- Ghi chú giá trên trang sản phẩm: "Giá đã gồm phí mua hộ và vận chuyển Nhật → Việt Nam · phí giao nội địa tính khi thanh toán".

## [1.10.0] - 2026-09-09

### Added
- **Khối lượng & kích thước sản phẩm**: hai trường mới trong form sản phẩm (gram; D x R x C cm), cột Excel "Khối lượng (g)" / "Kích thước (cm, DxRxC)". Trang sản phẩm hiện khối lượng/kích thước và tab "Chi phí vận chuyển" **ước tính phí gửi cho sản phẩm đó** trên các cột tính theo kg (làm tròn lên từng kg, lấy số lớn hơn giữa cân thật và cân quy đổi thể tích D×R×C/6000). Migration v8: `products.weight_g`, `products.dims_cm`.
- **Vận chuyển tổ chức theo 3 chặng**: Ship nội địa Nhật · Ship Nhật → Việt Nam · Ship nội địa Việt Nam. Mỗi phương thức có **đơn vị vận chuyển** (dropdown, thêm đơn vị mới ngay tại chỗ hoặc trong khung "Đơn vị vận chuyển" với điện thoại/website/ghi chú), **giá đã gồm 2 đầu hay chưa**, **kho / địa điểm nhận & giao**, **giao tận nhà hay nhận tại kho**, lưu ý riêng theo dòng. Cột của bảng dùng được cho khu vực hoặc bậc cân nặng (VD "4–5 kg", "6–10 kg"). Trang khách hiển thị theo chặng với nhãn đơn vị và các chip trạng thái. Bảng `shipping_carriers` + 5 đơn vị mặc định (Kiến Express, Japan Post/EMS, Yamato, Viettel Post, GHTK).

## [1.9.1] - 2026-09-09

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
- Thông tin liên hệ thật: hotline VN 0964 839 769, Facebook facebook.com/lienanh.taphoa, Zalo zalo.me/0964839769, Messenger m.me/lienanh.taphoa (thanh liên hệ, footer, trang Liên hệ).

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
