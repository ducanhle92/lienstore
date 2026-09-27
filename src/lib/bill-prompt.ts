/**
 * Prompt the owner pastes into Claude (Fable) together with a receipt photo; the answer is text in exactly the shape
 * `parseBillText` reads (one "N x tên ¥tổng" line per product, the JAN under it). Shown under the bill form so it can be
 * copied; kept here as a plain string so it is easy to tweak and test.
 */
export const BILL_PHOTO_PROMPT = `Bạn là trợ lý nhập liệu cho cửa hàng hàng Nhật. Tôi gửi kèm ảnh một hoá đơn / bill mua hàng ở Nhật (siêu thị, drugstore, Amazon, Rakuten…). Hãy đọc ảnh và trả về DUY NHẤT một khối văn bản thuần theo đúng định dạng dưới đây, không giải thích, không bảng, không markdown.

Định dạng:
注文番号: <mã hoá đơn: số NO. / SEQ / 注文番号; không có thì bỏ dòng này>
注文日: <ngày mua trên bill, dạng YYYY/MM/DD>
店: <tên cửa hàng + chi nhánh, một dòng>
<số lượng> x <tên sản phẩm đúng như in trên bill, giữ nguyên tiếng Nhật> ¥<thành tiền của dòng đó, ĐÃ GỒM THUẾ>
JAN <mã vạch 13 số in dưới tên sản phẩm; không có thì bỏ dòng này>
(lặp lại 2 dòng trên cho từng sản phẩm)

Quy tắc:
1. Mỗi sản phẩm đúng 1 dòng "số lượng x tên ¥tiền". Bill không ghi số lượng thì hiểu là 1. Cùng một sản phẩm in nhiều dòng thì cộng lại thành một dòng.
2. Tiền là THÀNH TIỀN CẢ DÒNG, đã gồm thuế tiêu dùng. Nếu bill in giá chưa thuế (外税 / 税抜), nhân với thuế suất của mặt hàng đó: 10% mặc định, 8% cho thực phẩm – đồ uống (ký hiệu ※ hoặc 軽減). Làm tròn xuống số nguyên, viết có dấu phẩy ngàn, ví dụ ¥6,985.
3. Giữ nguyên ký tự đặc biệt đầu tên (☆, ※) nhưng KHÔNG đưa mã vạch, mã số trong ngoặc như (0101), số kệ, hay giá vào tên.
4. Bỏ qua các dòng 小計, 外税, 合計, 現金, お釣り, điểm thưởng, khuyến mãi, thông tin cửa hàng, số điện thoại, ghi chú thuế.
5. Không tự bịa sản phẩm; chữ mờ không đọc được thì ghi "?" ở vị trí đó và giữ dòng.
6. Không cần hạn sử dụng — admin sẽ nhập sau.

Ví dụ kết quả mong muốn:
注文番号: 00214883
注文日: 2026/09/27
店: オーエスドラッグ 船橋店
1 x コンドロイチンＺＳ錠 ¥6,985
JAN 4987103049340
1 x ☆パブロンゴールドＡ錠 ¥1,518
JAN 4987306045132`;
