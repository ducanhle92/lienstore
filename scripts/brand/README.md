# Bộ nhận diện Store Lienanh

`logo.html` vẽ lại logo "Store Lienanh" (chữ Poppins 800 + vòng tròn hồng + hoa sakura) bằng HTML/CSS/SVG;
`render.py` chụp ra PNG các kích cỡ bằng Playwright (Chromium):

```
python scripts/brand/render.py public/sites/lienstore/brand
```

Sinh ra: `logo-dark-*` (chữ trắng trên nền đỏ), `logo-light-*` (chữ đỏ trên nền trắng), `logo-transparent-*` (chữ đỏ, nền trong),
`logo-white-*` (chữ trắng, nền trong — dùng trên thanh menu), `icon-*` (ô đỏ bo góc + hoa), `icon-round-*` (tròn hồng), `og-image-1200x630`.

Ảnh dùng thật được chọn trong Admin › Sales › Giao diện & Logo (upload) — không cần chạy lại script; script chỉ để tái tạo khi cần đổi chữ/màu gốc.
