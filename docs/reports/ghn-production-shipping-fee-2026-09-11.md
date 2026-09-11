# Đặc tả Production: tính phí giao hàng nội địa Việt Nam qua GHN

> **Tài liệu bàn giao cho Fable/AI coding agent trong VS Code.** Hãy đọc toàn bộ tài liệu, kiểm tra cấu trúc dự án hiện tại rồi triển khai theo framework, convention, package manager và cơ chế API/server sẵn có. Không tạo một backend thứ hai nếu dự án đã có API routes hoặc server actions.

## 1. Kết quả cần đạt

Tích hợp **GHN Production** vào website để:

- Khách chọn địa chỉ nhận hàng theo Tỉnh/Thành → Quận/Huyện → Phường/Xã.
- Website kiểm tra tuyến GHN có dịch vụ hay không.
- Website tính và hiển thị phí giao hàng thật theo tài khoản Production của shop.
- Phí thay đổi đúng theo địa chỉ, khối lượng, kích thước, giá trị khai giá và COD.
- Token GHN và ShopId chỉ tồn tại ở server, không lộ ra trình duyệt.
- Frontend chỉ gọi API nội bộ của website; API nội bộ mới gọi GHN.

Phạm vi phiên bản này là **tra danh mục địa chỉ, dịch vụ và tính phí**. Không gọi API tạo đơn GHN và không tạo vận đơn thật.

## 2. Thông tin Production đã xác minh

### 2.1 Môi trường bắt buộc

| Thành phần | Giá trị |
|---|---|
| Developer Portal | `https://developer.ghn.vn` |
| API Base URL | `https://online-gateway.ghn.vn` |
| Header xác thực | `Token: <server-secret>` |
| Header shop | `ShopId: <production-shop-id>` |

Không dùng bất kỳ domain hoặc token Staging nào trong bản triển khai này.

### 2.2 Lần kiểm thử Production đã chạy thành công

Đã gọi API Production thật, chỉ để lấy dịch vụ và báo giá; **không tạo đơn hàng**.

| Thuộc tính | Giá trị kiểm thử |
|---|---|
| Điểm gửi | Huyện Hoằng Hóa, Thanh Hóa |
| `from_district_id` | `1748` |
| `from_ward_code` | `"282201"` |
| Điểm nhận | Quận Cầu Giấy, Hà Nội |
| `to_district_id` | `1444` |
| `to_ward_code` | `"20308"` |
| Khối lượng | `500` g |
| Kích thước | `10 × 10 × 10` cm |
| Loại dịch vụ | Hàng nhẹ, `service_type_id = 2` |
| Khai giá/COD | `0` / `0` VNĐ |
| Kết quả | `200 Success` |
| Tổng phí | **29.001 VNĐ** |
| Phụ phí vùng xa | `0` VNĐ |

Con số 29.001 VNĐ chỉ là ảnh chụp giá tại thời điểm kiểm thử với đúng dữ liệu trên. **Không hard-code giá này**. Mọi lần checkout phải gọi lại API báo giá.

### 2.3 Trạng thái shop hiện tại cần xử lý

Shop Production đang hoạt động nhưng địa chỉ lấy hàng trong hồ sơ GHN chưa đầy đủ. Vì vậy:

1. Ở phiên bản hiện tại, luôn truyền rõ `from_district_id` và `from_ward_code` từ biến môi trường server khi tính phí.
2. Trước khi tạo vận đơn thật, chủ shop phải cập nhật địa chỉ lấy hàng chính xác trên GHN.
3. Mã `1748` và `"282201"` là cặp đã dùng để kiểm thử tuyến Hoằng Hóa. Chủ shop phải xác nhận nó đúng với vị trí kho thực tế trước khi go-live.

## 3. Yêu cầu bảo mật không được vi phạm

Kiến trúc bắt buộc:

```text
Trình duyệt khách hàng
        |
        v
API/server của website
        |
        v
GHN Production API
```

Quy tắc:

- Không gọi GHN trực tiếp từ component client hoặc trình duyệt.
- Không đặt `GHN_TOKEN` trong biến môi trường public như `NEXT_PUBLIC_*`, `VITE_*`, `PUBLIC_*`.
- Không gửi token, ShopId hoặc địa chỉ kho đáng tin cậy về frontend.
- Không ghi token vào source, URL, log, analytics, exception, response hoặc Git.
- Thêm `.env*` vào `.gitignore`; chỉ commit `.env.example` không có giá trị thật.
- Nếu token từng xuất hiện trong ảnh/chát/repository, đổi token trước khi go-live.
- Khi server có IP public tĩnh, thêm đầy đủ IP máy chủ vào danh sách IP được phép trên GHN. Khi thêm IP đầu tiên, GHN sẽ chỉ nhận request từ danh sách đó.
- Mask lỗi upstream trước khi trả về cho frontend.

## 4. Cấu hình Production

Đặt các biến tương đương sau trong secret manager hoặc cấu hình server của nền tảng deploy:

```dotenv
GHN_BASE_URL=https://online-gateway.ghn.vn
GHN_TOKEN=
GHN_SHOP_ID=

# Địa chỉ lấy hàng theo bộ mã địa chỉ ba cấp của GHN.
GHN_PICKUP_DISTRICT_ID=1748
GHN_PICKUP_WARD_CODE=282201

GHN_TIMEOUT_MS=8000
```

`.env.example` được phép chứa tên biến và giá trị không bí mật như base URL, nhưng không được chứa token thật.

Khi khởi động server, phải kiểm tra:

- `GHN_BASE_URL` bằng chính xác `https://online-gateway.ghn.vn`.
- `GHN_TOKEN` không rỗng.
- `GHN_SHOP_ID` là số nguyên dương.
- `GHN_PICKUP_DISTRICT_ID` là số nguyên dương.
- `GHN_PICKUP_WARD_CODE` là chuỗi không rỗng.
- Không có tên biến public chứa token.

Nếu sai, server phải dừng với thông báo cấu hình thiếu; không âm thầm fallback sang giá cố định.

## 5. Mô hình địa chỉ dùng để tính phí

Luồng báo giá hiện dùng bộ địa chỉ GHN ba cấp:

```text
Tỉnh/Thành → Quận/Huyện → Phường/Xã
```

Các trường API báo giá cần:

- `to_district_id`
- `to_ward_code`
- `from_district_id`
- `from_ward_code`

GHN cũng có bộ địa chỉ mới hai cấp, nhưng không tự thay ID hai cấp mới vào các trường trên. Cho đến khi dự án có mapping chính thức đã kiểm chứng, UI tính phí phải dùng danh mục ba cấp trả về từ các endpoint `province`, `district`, `ward` của GHN.

Lưu `WardCode` dưới dạng **string** để không làm mất số `0` ở đầu.

Ý nghĩa `SupportType`:

| Giá trị | Ý nghĩa |
|---:|---|
| `0` | Không hỗ trợ |
| `1` | Chỉ lấy hàng |
| `2` | Chỉ giao hàng |
| `3` | Hỗ trợ lấy và giao |

Địa chỉ người nhận chỉ hợp lệ nếu phường/xã có `SupportType` bằng `2` hoặc `3`.

## 6. Chuỗi API GHN Production

Mọi request bên dưới dùng base URL:

```text
https://online-gateway.ghn.vn
```

Header mặc định:

```http
Accept: application/json
Content-Type: application/json
Token: <GHN_TOKEN>
ShopId: <GHN_SHOP_ID>
```

### 6.1 Lấy danh sách shop — chỉ dùng khi cấu hình

```http
GET /shiip/public-api/v2/shop/all?offset=0&limit=50
```

`ShopId` là trường `_id` của shop đang hoạt động. Không gọi endpoint này ở mỗi lần checkout; lấy ShopId một lần rồi lưu trong secret/config server.

### 6.2 Lấy tỉnh/thành

```http
GET /shiip/public-api/master-data/province
```

Giữ các trường:

- `ProvinceID`
- `ProvinceName`
- `NameExtension`

### 6.3 Lấy quận/huyện

```http
GET /shiip/public-api/master-data/district?province_id=<ProvinceID>
```

Giữ các trường:

- `DistrictID`
- `DistrictName`
- `SupportType`

### 6.4 Lấy phường/xã

```http
GET /shiip/public-api/master-data/ward?district_id=<DistrictID>
```

Giữ các trường:

- `WardCode`
- `WardName`
- `SupportType`
- `CanUpdateCOD`

### 6.5 Lấy dịch vụ khả dụng cho tuyến

```http
POST /shiip/public-api/v2/shipping-order/available-services
```

Body:

```json
{
  "shop_id": 123456,
  "from_district": 1748,
  "to_district": 1444
}
```

`shop_id` trong body và `ShopId` trong header đều phải lấy từ cùng biến `GHN_SHOP_ID`.

Response điển hình:

```json
[
  {
    "service_id": 53320,
    "short_name": "Hàng nhẹ",
    "service_type_id": 2
  },
  {
    "service_id": 100039,
    "short_name": "Hàng nặng",
    "service_type_id": 5
  }
]
```

Quy tắc chọn:

- Dưới 20 kg: ưu tiên `service_type_id = 2`.
- Từ 20 kg trở lên hoặc đơn nhiều kiện: ưu tiên `service_type_id = 5`.
- Chỉ chọn một loại thực sự có trong response của `available-services`.
- Nếu không có dịch vụ phù hợp, trả lỗi tuyến không được hỗ trợ; không tự bịa giá.

### 6.6 Tính phí

```http
POST /shiip/public-api/v2/shipping-order/fee
```

Body mẫu:

```json
{
  "from_district_id": 1748,
  "from_ward_code": "282201",
  "to_district_id": 1444,
  "to_ward_code": "20308",
  "service_type_id": 2,
  "weight": 500,
  "length": 10,
  "width": 10,
  "height": 10,
  "insurance_value": 0,
  "cod_value": 0
}
```

Đơn vị:

- `weight`: gram.
- `length`, `width`, `height`: centimet.
- `insurance_value`, `cod_value`: VNĐ.

Dùng `data.total` làm tổng phí GHN. Không tự cộng các trường thành phần để thay thế `total`.

Các trường cần chuẩn hóa:

```json
{
  "total": 29001,
  "service_fee": 29001,
  "insurance_fee": 0,
  "cod_fee": 0,
  "pick_station_fee": 0,
  "coupon_value": 0,
  "r2s_fee": 0,
  "pick_remote_areas_fee": 0,
  "deliver_remote_areas_fee": 0
}
```

Đây là response rút gọn để minh họa. Code phải chấp nhận GHN bổ sung trường mới mà không bị lỗi.

## 7. API nội bộ của website

Frontend chỉ được gọi các endpoint nội bộ sau hoặc endpoint tương đương theo framework hiện có.

### 7.1 Danh sách tỉnh

```http
GET /api/shipping/ghn/provinces
```

```json
{
  "data": [{ "id": 234, "name": "Thanh Hóa" }]
}
```

### 7.2 Danh sách huyện

```http
GET /api/shipping/ghn/districts?provinceId=234
```

```json
{
  "data": [
    { "id": 1748, "name": "Huyện Hoằng Hóa", "supportType": 3 }
  ]
}
```

### 7.3 Danh sách xã

```http
GET /api/shipping/ghn/wards?districtId=1748
```

```json
{
  "data": [
    {
      "code": "282201",
      "name": "Thị trấn Hoằng Hóa",
      "supportType": 3,
      "canUpdateCod": false
    }
  ]
}
```

Đây là dữ liệu ví dụ đã dùng để thử, không phải danh sách hard-code cho frontend.

### 7.4 Báo giá

```http
POST /api/shipping/ghn/quote
Content-Type: application/json
```

Request từ frontend:

```json
{
  "toDistrictId": 1444,
  "toWardCode": "20308",
  "weight": 500,
  "length": 10,
  "width": 10,
  "height": 10,
  "insuranceValue": 0,
  "codValue": 0
}
```

Không nhận từ frontend các trường sau:

- Token GHN.
- ShopId.
- `fromDistrictId` hoặc `fromWardCode`.
- Tổng phí đã tính.

Response chuẩn hóa:

```json
{
  "carrier": "GHN",
  "currency": "VND",
  "service": {
    "typeId": 2,
    "name": "Hàng nhẹ"
  },
  "fee": {
    "total": 29001,
    "shipping": 29001,
    "insurance": 0,
    "cod": 0,
    "pickupRemoteArea": 0,
    "deliveryRemoteArea": 0,
    "coupon": 0
  },
  "quotedAt": "2026-09-11T00:00:00.000Z",
  "expiresAt": "2026-09-11T00:05:00.000Z"
}
```

`quotedAt` và `expiresAt` do backend website tạo. Giá trị ví dụ trên không được hard-code.

## 8. Module server TypeScript tham khảo

Đặt module trong vùng server-only phù hợp, ví dụ `src/server/integrations/ghn.ts`. Điều chỉnh import theo codebase hiện tại.

```ts
type GhnEnvelope<T> = {
  code: number;
  message: string;
  data: T;
  code_message?: string;
  code_message_value?: string;
};

type GhnService = {
  service_id: number;
  short_name: string;
  service_type_id: number;
};

type GhnFee = {
  total: number;
  service_fee: number;
  insurance_fee: number;
  cod_fee: number;
  pick_station_fee: number;
  coupon_value: number;
  r2s_fee: number;
  pick_remote_areas_fee: number;
  deliver_remote_areas_fee: number;
};

export type GhnQuoteInput = {
  toDistrictId: number;
  toWardCode: string;
  weight: number;
  length: number;
  width: number;
  height: number;
  insuranceValue?: number;
  codValue?: number;
};

export class GhnApiError extends Error {
  constructor(
    message: string,
    public readonly httpStatus: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = "GhnApiError";
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const baseUrl = requiredEnv("GHN_BASE_URL").replace(/\/$/, "");
if (baseUrl !== "https://online-gateway.ghn.vn") {
  throw new Error("GHN_BASE_URL must point to GHN Production");
}

const config = {
  baseUrl,
  token: requiredEnv("GHN_TOKEN"),
  shopId: Number(requiredEnv("GHN_SHOP_ID")),
  pickupDistrictId: Number(requiredEnv("GHN_PICKUP_DISTRICT_ID")),
  pickupWardCode: requiredEnv("GHN_PICKUP_WARD_CODE"),
  timeoutMs: Number(process.env.GHN_TIMEOUT_MS || 8000),
};

for (const [key, value] of [
  ["GHN_SHOP_ID", config.shopId],
  ["GHN_PICKUP_DISTRICT_ID", config.pickupDistrictId],
] as const) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${key} must be a positive integer`);
  }
}

async function ghnRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(`${config.baseUrl}${path}`, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Token: config.token,
        ShopId: String(config.shopId),
        ...(init.headers as Record<string, string> | undefined),
      },
    });

    let payload: GhnEnvelope<T> | null = null;
    try {
      payload = (await response.json()) as GhnEnvelope<T>;
    } catch {
      throw new GhnApiError(
        "GHN returned an invalid response",
        502,
        "GHN_INVALID_RESPONSE",
      );
    }

    if (!response.ok || payload.code !== 200) {
      throw new GhnApiError(
        payload.code_message_value || payload.message || "GHN request failed",
        response.status >= 400 ? response.status : 502,
        payload.code_message || "GHN_REQUEST_FAILED",
      );
    }

    return payload.data;
  } catch (error) {
    if (error instanceof GhnApiError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new GhnApiError("GHN request timed out", 504, "GHN_TIMEOUT");
    }
    throw new GhnApiError("Cannot reach GHN", 502, "GHN_UNAVAILABLE");
  } finally {
    clearTimeout(timeoutId);
  }
}

function validateQuote(input: GhnQuoteInput): void {
  const positiveIntegers: Array<[string, number]> = [
    ["toDistrictId", input.toDistrictId],
    ["weight", input.weight],
    ["length", input.length],
    ["width", input.width],
    ["height", input.height],
  ];

  for (const [name, value] of positiveIntegers) {
    if (!Number.isInteger(value) || value <= 0) {
      throw new GhnApiError(`${name} is invalid`, 400, "INVALID_QUOTE_INPUT");
    }
  }

  if (!input.toWardCode?.trim()) {
    throw new GhnApiError("toWardCode is invalid", 400, "INVALID_QUOTE_INPUT");
  }

  for (const [name, value] of [
    ["insuranceValue", input.insuranceValue ?? 0],
    ["codValue", input.codValue ?? 0],
  ] as const) {
    if (!Number.isInteger(value) || value < 0) {
      throw new GhnApiError(`${name} is invalid`, 400, "INVALID_QUOTE_INPUT");
    }
  }
}

async function getAvailableServices(toDistrictId: number) {
  return ghnRequest<GhnService[]>(
    "/shiip/public-api/v2/shipping-order/available-services",
    {
      method: "POST",
      body: JSON.stringify({
        shop_id: config.shopId,
        from_district: config.pickupDistrictId,
        to_district: toDistrictId,
      }),
    },
  );
}

export async function quoteGhn(input: GhnQuoteInput) {
  validateQuote(input);

  const services = await getAvailableServices(input.toDistrictId);
  const expectedType = input.weight < 20_000 ? 2 : 5;
  const service = services.find((item) => item.service_type_id === expectedType);

  if (!service) {
    throw new GhnApiError(
      "GHN chưa hỗ trợ loại hàng trên tuyến này",
      422,
      "GHN_ROUTE_NOT_SUPPORTED",
    );
  }

  const fee = await ghnRequest<GhnFee>(
    "/shiip/public-api/v2/shipping-order/fee",
    {
      method: "POST",
      body: JSON.stringify({
        from_district_id: config.pickupDistrictId,
        from_ward_code: config.pickupWardCode,
        to_district_id: input.toDistrictId,
        to_ward_code: input.toWardCode.trim(),
        service_type_id: service.service_type_id,
        weight: input.weight,
        length: input.length,
        width: input.width,
        height: input.height,
        insurance_value: input.insuranceValue ?? 0,
        cod_value: input.codValue ?? 0,
      }),
    },
  );

  const quotedAt = new Date();
  const expiresAt = new Date(quotedAt.getTime() + 5 * 60 * 1000);

  return {
    carrier: "GHN" as const,
    currency: "VND" as const,
    service: {
      typeId: service.service_type_id,
      name: service.short_name,
    },
    fee: {
      total: fee.total,
      shipping: fee.service_fee,
      insurance: fee.insurance_fee,
      cod: fee.cod_fee,
      pickupRemoteArea: fee.pick_remote_areas_fee,
      deliveryRemoteArea: fee.deliver_remote_areas_fee,
      coupon: fee.coupon_value,
    },
    quotedAt: quotedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
}
```

Nếu framework không dùng Node/TypeScript hoặc không hỗ trợ `fetch` server-side, chuyển ý tưởng trên sang client HTTP phía server tương ứng. Không đưa module này vào client bundle.

## 9. Logic giỏ hàng và kiện hàng

Khối lượng gửi GHN phải được tính từ dữ liệu sản phẩm đáng tin cậy trong database/server:

```text
totalWeightGrams = Σ(product.weightInGrams × quantity)
```

Không nhận khối lượng hoặc kích thước cuối cùng từ frontend mà không đối chiếu lại.

Kích thước phải là kích thước kiện sau đóng gói. Nếu có nhiều sản phẩm, dự án cần quy tắc đóng gói nhất quán. Không mặc định `0 × 0 × 0` vì có thể làm báo giá thấp hơn thực tế.

Nếu sản phẩm chưa có cân nặng/kích thước:

- Chặn báo giá và yêu cầu bổ sung dữ liệu sản phẩm; hoặc
- Dùng một cấu hình đóng gói bảo thủ do chủ shop phê duyệt.

Không tự dùng số giả mà người quản trị chưa đồng ý.

## 10. Giao diện checkout

Luồng đề xuất:

1. Tải danh sách tỉnh khi mở form địa chỉ.
2. Khi đổi tỉnh, xóa huyện/xã cũ rồi tải huyện mới.
3. Khi đổi huyện, xóa xã cũ rồi tải xã mới.
4. Chỉ báo giá khi đã có huyện, xã và thông tin kiện hợp lệ.
5. Nếu tự động tính, debounce 400–600 ms và hủy request cũ khi dữ liệu thay đổi.
6. Hiển thị trạng thái đang tính phí.
7. Khi thành công, hiển thị tên dịch vụ, phí vận chuyển, phụ phí khác 0 và tổng phí.
8. Nếu tuyến không hỗ trợ, hiển thị thông báo dễ hiểu; không hiển thị stack trace.
9. Nếu GHN tạm lỗi, giữ giỏ hàng và cho phép “Thử lại”.
10. Mỗi lần địa chỉ, số lượng, COD hoặc thông tin kiện thay đổi, đánh dấu báo giá cũ hết hiệu lực.

Format VNĐ:

```ts
const formatVnd = (value: number) =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
```

Ví dụ hiển thị cho đúng ca kiểm thử:

```text
Giao Hàng Nhanh — Hàng nhẹ
Phí vận chuyển: 29.001 ₫
Tổng phí GHN: 29.001 ₫
```

Chỉ hiển thị dòng phụ phí nếu giá trị khác 0.

## 11. Chốt giá khi đặt hàng

Báo giá ở UI không được xem là dữ liệu đáng tin cậy từ client.

Khi khách bấm đặt hàng:

1. Backend đọc lại sản phẩm, số lượng, cân nặng, kích thước và địa chỉ nhận.
2. Backend gọi lại GHN nếu quote quá 5 phút hoặc dữ liệu đã thay đổi.
3. Nếu giá mới khác giá đang hiển thị, cập nhật tổng tiền và yêu cầu khách xác nhận lại theo UX của dự án.
4. Lưu snapshot báo giá gồm input, `service_type_id`, breakdown, `total`, `quotedAt` và `expiresAt`.
5. Không lấy `shippingFee` do frontend gửi làm số tiền thanh toán cuối cùng.

GHN có thể đo lại khối lượng/kích thước và áp dụng phụ phí theo vận hành thực tế. Website nên mô tả đây là phí ước tính từ dữ liệu kiện hàng đã khai báo cho tới khi vận đơn được GHN xác nhận.

## 12. Cache, giới hạn và độ ổn định

GHN không công bố trong tài liệu hiện tại một con số rate limit Production hoặc phí tính theo từng lần gọi API báo giá. Không được hiểu điều đó là gọi không giới hạn.

Áp dụng phía website:

- Cache tỉnh/huyện/xã trong 24 giờ.
- Cache `available-services` theo shop + huyện gửi + huyện nhận trong 10–30 phút.
- Cache quote trùng input trong 3–5 phút.
- Debounce frontend 400–600 ms.
- Timeout upstream 8 giây.
- Retry tối đa 1 lần cho timeout/5xx, có jitter; không retry lỗi 4xx.
- Rate-limit endpoint nội bộ theo IP/session/user.
- Dùng request coalescing để nhiều request giống nhau chỉ gọi GHN một lần.
- Theo dõi tỷ lệ lỗi và độ trễ, nhưng không log token hay toàn bộ dữ liệu cá nhân.

Nếu lưu lượng lớn, liên hệ GHN để xác nhận hạn mức áp dụng cho tài khoản trước khi mở rộng.

## 13. Chuẩn hóa lỗi

Frontend chỉ cần các mã ổn định của website:

| HTTP | Mã nội bộ | Ý nghĩa |
|---:|---|---|
| `400` | `INVALID_QUOTE_INPUT` | Dữ liệu địa chỉ/kiện không hợp lệ |
| `401`/`403` upstream | `GHN_CONFIGURATION_ERROR` | Token, ShopId hoặc IP allowlist sai |
| `422` | `GHN_ROUTE_NOT_SUPPORTED` | Không có dịch vụ phù hợp |
| `429` | `SHIPPING_RATE_LIMITED` | Website đang giới hạn tần suất |
| `502` | `GHN_UNAVAILABLE` | Không kết nối được hoặc response sai |
| `504` | `GHN_TIMEOUT` | GHN quá thời gian chờ |

Không trả nguyên `code_message_value` nhạy cảm từ upstream cho người dùng cuối. Có thể log mã lỗi đã mask để điều tra.

## 14. Kiểm thử bắt buộc

### 14.1 Unit test

- Validate số nguyên dương và mã xã dạng string.
- Chọn loại `2` khi dưới 20 kg.
- Chọn loại `5` khi từ 20 kg trở lên.
- Không có loại phù hợp thì trả `GHN_ROUTE_NOT_SUPPORTED`.
- Chuẩn hóa đầy đủ `total`, phí vận chuyển, khai giá, COD và vùng xa.
- Timeout được đổi thành `GHN_TIMEOUT`.
- Token không xuất hiện trong error/log/response.

### 14.2 Integration test với mock GHN

- Province → district → ward chạy đúng thứ tự.
- Quote thành công và format VNĐ đúng.
- GHN 400/401/403/429/500 được map đúng.
- GHN trả body không phải JSON được map thành lỗi 502.
- Request trùng được cache/coalesce.
- Thay đổi địa chỉ hoặc giỏ hàng làm quote cũ hết hiệu lực.

### 14.3 Smoke test Production có kiểm soát

Chỉ gọi:

- Danh mục địa chỉ.
- `available-services`.
- `fee`.

Không gọi endpoint tạo đơn.

Ca tham chiếu:

```json
{
  "from_district_id": 1748,
  "from_ward_code": "282201",
  "to_district_id": 1444,
  "to_ward_code": "20308",
  "service_type_id": 2,
  "weight": 500,
  "length": 10,
  "width": 10,
  "height": 10,
  "insurance_value": 0,
  "cod_value": 0
}
```

Chỉ yêu cầu response `code = 200`, `data.total` là số nguyên dương và không có rò rỉ bí mật. Không assert cứng `29.001` vì bảng giá có thể thay đổi.

## 15. Tiêu chí hoàn thành cho Fable

- [ ] Fable đã kiểm tra framework và tái sử dụng backend/API routes hiện có.
- [ ] Chỉ dùng base URL Production.
- [ ] Token/ShopId nằm trong secret server và không vào client bundle.
- [ ] Server truyền rõ địa chỉ kho gửi từ config.
- [ ] Danh mục tỉnh/huyện/xã được tải từ backend, không hard-code.
- [ ] Dịch vụ được lấy bằng `available-services` trước khi tính phí.
- [ ] Phí được lấy từ `data.total`, không dùng bảng giá cố định.
- [ ] Cân nặng/kích thước được tính lại từ dữ liệu server.
- [ ] Quote hết hạn hoặc thay đổi giỏ hàng được tính lại.
- [ ] Có timeout, cache, debounce, rate limit nội bộ và xử lý lỗi.
- [ ] Có unit/integration test.
- [ ] Không gọi API tạo đơn trong phạm vi này.
- [ ] Đã chạy kiểm tra secret trên source/build/log.
- [ ] Chủ shop đã xác nhận đúng mã kho gửi `1748` + `"282201"`.
- [ ] Chủ shop đã cập nhật địa chỉ shop GHN trước khi làm vận đơn thật.

## 16. Tài liệu GHN chính thức

- Tổng quan API: <https://developer.ghn.vn/en/docs/getting-started/overview>
- Lấy token: <https://developer.ghn.vn/en/docs/token/get-token>
- Lấy shop: <https://developer.ghn.vn/vi/docs/shop/get-shop>
- Lấy tỉnh: <https://developer.ghn.vn/vi/docs/master-data/get-province>
- Lấy huyện: <https://developer.ghn.vn/vi/docs/master-data/get-district>
- Lấy xã: <https://developer.ghn.vn/vi/docs/master-data/get-ward>
- Lấy dịch vụ: <https://developer.ghn.vn/vi/docs/master-data/get-service>
- Tính phí: <https://developer.ghn.vn/vi/docs/order/calculate-fee>

## 17. Chỉ dẫn cuối cho Fable

Hãy triển khai trực tiếp vào codebase hiện có theo từng lớp: cấu hình server → GHN server client → API nội bộ → UI checkout → cache/error handling → test. Trước khi sửa, hãy liệt kê ngắn các file sẽ chạm tới. Sau khi sửa, chạy test/lint/build liên quan và báo rõ:

1. File đã thêm hoặc sửa.
2. Biến môi trường người dùng phải cấu hình.
3. Test nào đã chạy và kết quả.
4. Phần nào còn cần chủ shop xác nhận.
5. Xác nhận không có token thật trong source, client bundle hoặc log.

