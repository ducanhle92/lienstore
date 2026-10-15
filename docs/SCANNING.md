# Quét mã bằng điện thoại — hướng dẫn sử dụng & thử nghiệm

Thiết kế: `docs/architecture/mobile-scanning.md`. API/CLI: `docs/ADMIN_API.md` (mục 9).

## 1. Mở màn quét

- Admin › **Vận hành › Quét mã (điện thoại)** → `/admin/scan/`. Đăng nhập như admin bình thường (cookie phiên).
- Camera chỉ chạy trên **HTTPS** (hoặc `localhost`). Trên mạng LAN bằng `http://192.168…` camera bị trình duyệt chặn —
  vẫn nhập tay / dùng máy quét Bluetooth được.
- Thêm vào màn hình chính: Safari › Chia sẻ › *Thêm vào MH chính*; Chrome › ⋮ › *Thêm vào màn hình chính*. Không có
  chế độ offline (không service worker) — mất mạng thì màn hình báo đỏ và khoá các nút ghi.

## 2. Chế độ

| Chế độ | Ai dùng được | Ghi gì |
| --- | --- | --- |
| Tra cứu | mọi tài khoản có Kho / Sản phẩm / Đơn / Giao hàng | Không ghi. Tồn khả dụng (rảnh) · giữ cho đơn · thực tế trong tay, theo kho + hạn dùng, đang về; giá nếu có quyền "Xem giá bán". Nút *In nhãn mã H* |
| Nhập hàng | quyền ③ Kho Nhật (Kho Nhật) / ⑥ Kho VN (Kho VN) | *Hàng mới*: tạo mã từng cái khi **Xác nhận nhập kho**. *Nhận chuyến hàng về* (Kho VN): chuyển đúng các cái đã quét của chuyến `CH-…` vào Kho VN, nhận một phần được |
| Kiểm kho | như trên | Chỉ khi **Chốt kiểm kê**: thừa → thêm cái (bill `KK-yymmdd`), thiếu → loại cái rảnh gần hết hạn nhất ("thất lạc") |
| Xuất hàng | quyền ⑦ Giao hàng VN | Đối chiếu đơn đã sẵn sàng; **Hoàn tất & bắt đầu giao** = bước "đã gửi" của chặng giao nội địa (hàng rời kho, đơn → Đang giao) |

Trạng thái dòng trên cùng: **Đã đọc mã → Đã nhận diện → Đã lưu nháp** (máy chủ đã nhận) **→ Đã chốt**. Chỉ "Đã lưu
nháp" mới là đã lưu; phiếu nháp không bao giờ đổi tồn kho.

### Quét
- **Camera**: bấm *Camera* → *Bật camera* (camera sau). *Quét lại* = nhận lại mã đang ở trước camera. Giữ một mã trước
  camera chỉ tính **một lần**; muốn tính thêm thì đưa ra khỏi khung (> 1 giây) rồi đưa lại, hoặc sửa số lượng.
- **Máy quét Bluetooth/USB** (kiểu bàn phím, kết thúc Enter): chỉ cần quét, không cần bấm vào ô nào. Khi đang gõ trong
  một ô, máy quét gõ vào ô đó (ô "Nhập / quét mã" xử lý như quét).
- **Nhập tay**: gõ mã → OK.
- *Mỗi lần quét =* N: một lần quét mã sản phẩm cộng N × quy cách (ví dụ thùng 12). Mã từng cái `H…` luôn là 1 cái và
  chỉ tính một lần trong một phiếu. **Mỗi món chỉ quét một lần** — bằng mã H *hoặc* mã JAN, không cả hai.
- *Hoàn tác lần quét*: bỏ lần quét gần nhất. Sửa số lượng bằng − / ô số / +.
- **Mã lạ** ("Chưa liên kết"): tìm sản phẩm → *Liên kết mã* (cần quyền Sản phẩm; chọn quy cách nếu là hộp/thùng) → lần
  quét đó tự áp dụng lại vào đúng phiếu đang mở. Không có sản phẩm → *Tạo sản phẩm mới (tab mới)* rồi quay lại.
  **Mã trùng nhiều sản phẩm** (SKU trùng) → hiện danh sách, liên kết vào đúng sản phẩm để hết nhập nhằng.

### Mã được nhận
- EAN-13/JAN, EAN-8, UPC-A (tự hiểu như EAN-13 có số 0 đầu), ITF-14, Code 128, QR. Mã sai số kiểm tra bị từ chối.
- Mã từng cái `H` + 7 số (số cuối là số kiểm), hoặc QR nội bộ `LS1:U:<mã H>` / `LS1:P:<id sản phẩm>`.
- QR khác (đường link, Wi-Fi…) bị từ chối, **không bao giờ mở**.

## 3. Quy tắc an toàn (tóm tắt)

- Chốt chỉ chạy một lần: bấm lại / mất mạng rồi gửi lại → nhận lại kết quả cũ, không nhập/xuất hai lần.
- Hai điện thoại cùng một phiếu: cùng quét được (cộng dồn); sửa số tuyệt đối cùng một dòng → máy chậm hơn được báo tải
  lại; chốt khi phiếu vừa đổi ở máy khác → báo "xem lại rồi chốt".
- Mất mạng giữa chừng một lần quét → khung đỏ *Gửi lại* (cùng mã thao tác, không cộng trùng).
- Kiểm kê: chưa đếm ≠ đếm 0 (dòng chưa đếm không bị điều chỉnh). Nếu tồn thay đổi trong lúc đếm (nhập/xuất) → dòng đỏ
  "biến động", phải *Đếm lại* hoặc *Số đếm vẫn đúng* mới chốt được. Thiếu cả hàng đang giữ cho đơn → không chốt, xử lý
  tay ở trang tồn kho sản phẩm.

## 4. Chạy thử local (không đụng dữ liệu thật)

```bash
cp data/lienstore.db /tmp/scan.db
LIEN_DB_PATH=/tmp/scan.db LIEN_UPLOAD_DIR=/tmp/scan-up npm run dev        # http://localhost:3000/admin/scan/
```
Điện thoại thật cần HTTPS: cách nhanh nhất là `npx next dev --experimental-https -H 0.0.0.0` (chứng chỉ tự ký — chấp
nhận cảnh báo trên điện thoại; iOS có thể không cho camera với chứng chỉ tự ký) hoặc một đường hầm HTTPS
(`cloudflared tunnel --url http://localhost:3000`, ngrok…) rồi mở `https://…/admin/scan/` trên điện thoại.
Tạo dữ liệu thử: liên kết vài mã JAN thật với sản phẩm (*Tra cứu* → quét → *Liên kết mã*, hoặc
`lienstore barcodes add <id> <mã>`), nhập vài cái bằng *Nhập hàng › Hàng mới*, in nhãn mã H (`/print/units/?product=<id>`).

Test tự động: `npm run test:scan` (service, DB tạm) · `npm run test:admin-api:e2e` (HTTP + CLI, tự bật server :3197).

## 5. Checklist thử trên điện thoại thật (chưa kiểm được trong môi trường phát triển)

Đã kiểm trên trình duyệt headless khung iPhone 12 Pro (giao diện, nhập tay, máy quét kiểu bàn phím, camera giả lập +
bộ đọc ZXing WASM, banner mất mạng). **Chưa** kiểm trên máy thật — cần thử:

- [ ] iPhone Safari (iOS 16+): mở qua HTTPS, cho phép camera, quét JAN trên hộp thật, QR nhãn H; ánh sáng yếu + *Bật đèn* (iOS thường không hỗ trợ đèn trên web — nút sẽ ẩn).
- [ ] Android Chrome: như trên; kiểm dòng "bộ đọc của trình duyệt" (BarcodeDetector) hoặc "ZXing (WASM)".
- [ ] Từ chối quyền camera → thông báo hướng dẫn; cho phép lại trong cài đặt trang → *Bật lại camera*.
- [ ] Đổi camera (máy nhiều ống kính), xoay ngang/dọc, bàn phím mở khi nhập tay.
- [ ] Chuyển app khác / khoá màn hình rồi quay lại → camera đã tắt, bấm bật lại được; không còn đèn camera sáng.
- [ ] Giữ một hộp trước camera 10 giây → chỉ cộng 1; đưa ra rồi đưa vào → cộng thêm 1.
- [ ] Máy quét Bluetooth (chế độ HID/bàn phím, hậu tố Enter): quét liên tiếp 10 món.
- [ ] Tắt Wi-Fi giữa lúc quét → banner đỏ, không báo "Đã lưu nháp"; bật lại → *Gửi lại* → số lượng đúng (không trùng).
- [ ] Hai điện thoại cùng một phiên kiểm kê: cùng quét, một máy sửa số → máy kia được báo tải lại; chốt từ một máy.
- [ ] Nhập hàng mới → Xác nhận → xem trang tồn kho sản phẩm trên máy tính: đúng số cái, hạn dùng, bill.
- [ ] Nhận chuyến: chuyến đã "Đã giao ĐVVC"/"JP→VN"/"Kho ĐVVC VN" → quét một phần → xác nhận → còn lại vẫn chờ nhận.
- [ ] Xuất hàng: đơn đã thanh toán, đủ hàng ở Kho VN → quét sai sản phẩm (báo đỏ), thiếu (không hoàn tất được), đủ → Hoàn tất → đơn sang Đang giao ở ⑦.

## 6. Trước khi dùng trên production

- Trang phải chạy HTTPS (đã có qua Cloudflare) — camera cần HTTPS.
- Migration 74 tự chạy khi khởi động: thêm bảng mã vạch + phiếu quét; SKU là GTIN hợp lệ và **không trùng** được tự
  liên kết. Xem danh sách SKU trùng (sẽ báo "xung đột" khi quét) và liên kết lại cho đúng.
- Phân quyền nhân viên: Kho VN cần `⑥ Kho VN`, Kho Nhật `③ Kho Nhật`, xuất hàng `⑦ Giao hàng VN`, liên kết mã cần `Sản phẩm`.
- Cloudflare: không cache `/api/admin/v1/*`; cho phép header `X-Lien-Csrf`, `Idempotency-Key`.
- In nhãn mã H cho hàng lưu kho nếu muốn kiểm kê / xuất theo từng cái (khuyến nghị cho hàng có hạn dùng khác nhau).
