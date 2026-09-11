# Cước vận chuyển nội địa — cách tính hiện hành (từ 12/09/2026)

Tóm tắt đặc tả "Đặc tả tính và hiển thị cước vận chuyển nội địa" (chủ shop cung cấp) và cách mã nguồn hiện thực.

## Nguyên tắc

- Không có bảng giá tĩnh theo bốn miền. Mỗi hãng là một `CarrierQuoteAdapter` (`src/lib/carriers/`).
- Cước API của hãng là nguồn quyết định; biểu phí công khai chỉ dùng khi chưa có API và phải mang nhãn "Từ …" nếu còn thiếu VAT / xăng dầu / COD.
- Không cộng thêm phụ phí vào kết quả API (GHN: dùng `data.total`).
- Báo giá lại khi vào thanh toán (`createOrder` re-quote `fresh`) và nút "Báo giá lại cước nội địa" trong đơn hàng trước khi tạo vận đơn. Cache ≤ 10 phút theo sha256(hãng, mã địa chỉ, cân, 3 chiều, giá trị khai, COD, coupon, phiên bản biểu phí).
- Token/API key chỉ ở biến môi trường máy chủ (`GHN_TOKEN`, `GHN_SHOP_ID`, `VTP_TOKEN`, `VTP_API_BASE`, `VTP_SENDER_PROVINCE/DISTRICT`).
- Địa chỉ theo mô hình 34 tỉnh → xã/phường (`src/data/vn-address.json`, provinces.open-api.vn v2); tỉnh cũ chỉ giữ trong `MERGED_PROVINCES` để tính VNPost Nội tỉnh 1/2.

## Từng hãng

| Hãng | Nguồn | Ghi chú |
|---|---|---|
| GHN | API `shipping-order/fee` (`data.total`), leadtime API cho ETA | Cân giải thích: L×W×H (làm tròn lên từng chiều) / 5000. Mã địa chỉ GHN ánh xạ theo tên xã/phường từ master data. |
| Viettel Post | Chỉ Open API đối tác (`getPriceAll`) | Không có token → "Liên hệ / tra cước", không cho chọn. |
| VNPost | Biểu phí Chuyển phát tiêu chuẩn v2026-09-12 | 5 tuyến (NT1/NT2/Nội vùng/Cận vùng/Cách vùng), nấc 50/100/250/500/1000/1500/2000 g, +1 kg trên 2 kg; hệ số cao nhất (đảo 2,0 · nặng 1,5 · cồng kềnh 1,3 · dễ vỡ 1,2); vùng xa +20%. VAT/xăng dầu/COD chưa có → luôn `from_price`. |
| SPX | Biểu phí gói/kiện v2024-02-01 | Cân quy đổi /6000; ≤17 kg, ≤60 cm; 1 kg đầu rồi mỗi 0,5 kg (18k/+2,5k nội tỉnh; 22k/+2,5k nội miền; 22k/+5k liên miền); +25.000đ khi max(COD, khai giá) ≥ 3.000.000đ. Thanh Hóa có hai cách xếp vùng trong tài liệu SPX → kiện >1 kg đi Bắc/Trung trả "Từ …". |

## Hiển thị & thanh toán

- Tab "Chi phí vận chuyển" (sản phẩm, /van-chuyen) và bước thanh toán chỉ hiện thẻ báo giá sau khi có đủ tỉnh/thành, xã/phường, số nhà.
- Thẻ: giá (hoặc "Từ …"), ETA, tuyến, cân tính cước, đã gồm / chưa gồm, nguồn giá, giờ báo giá, "Xem cách tính".
- Sắp xếp theo cước tăng dần, không tự chọn thay khách.
- Quote "Từ …" không dùng làm tổng tiền: khách trả cước cho bưu tá khi nhận (`ship_fee_payment = on_delivery`).
- Nếu re-quote lúc tạo đơn cao hơn số khách đã thấy → báo lỗi yêu cầu kiểm tra lại (không âm thầm tăng); thấp hơn → lấy số thấp hơn. Snapshot lưu trong `orders.ship_quote_json`.

## Kiểm thử

`npm run test:shipping` (scripts/tests/carriers.test.ts): mẫu Casio LTP-1177A-4A1JH 46 g 14,7×5,6×2,4 cm, ranh giới 50/100/250/500/1000/1500/2000 g, 17 kg, phân tuyến VNPost 34 tỉnh, Nội tỉnh 2, SPX /6000, giá trị cao, orchestrator/cache.

## Nguồn

1. https://api.ghn.vn/en/docs/order/calculate-fee · https://ghn.vn/pages/bang-gia-moi-sieu-tiet-kiem
2. https://partner2.viettelpost.vn/ · https://en.viettelpost.com.vn/tra-cuoc-va-thoi-gian-van-chuyen
3. https://vnpost.vn/vi/dich-vu/chuyen-phat-trong-nuoc/dich-vu-chuyen-phat-tieu-chuan-trong-nuoc
4. https://spx.vn/downloads/resource/shipping_rate_vn.pdf · https://spx.vn/vi/dieu-khoan-su-dung.html · https://spx.vn/vi/shipping/chat-luong-dich-vu-buu-chinh.html
