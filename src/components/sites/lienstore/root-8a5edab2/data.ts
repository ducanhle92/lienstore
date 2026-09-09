// Content extracted verbatim from https://linconnn.io.vn/ on 2026-09-04.
// Site key lienstore, page key root-8a5edab2.
import type {
  CategoryCard,
  ContactInfo,
  FooterColumn,
  MenuLink,
  ProductSection,
  SidebarCategory,
  Slide,
} from "@/types/lienstore";

export const ASSET_ROOT = "/sites/lienstore/root-8a5edab2/images";

export const contact: ContactInfo = {
  phones: [
    { label: "VN", number: "0964 839 769", href: "tel:+84964839769" },
    { label: "JP", number: "070-9138-1512", href: "tel:+817091381512" },
  ],
  email: "contact@linconnn.io.vn",
  address: "Xã Hoằng Hóa, Tỉnh Thanh Hóa",
  hours: "8:00 - 22:00",
  socials: [
    { kind: "facebook", label: "Facebook", href: "https://www.facebook.com/lienanh.taphoa/" },
    { kind: "zalo", label: "Zalo", href: "https://zalo.me/0964839769" },
    { kind: "messenger", label: "Messenger", href: "https://m.me/lienanh.taphoa" },
  ],
};

export const branding = {
  logo: "/sites/lienstore/brand/lienstore-logo-horizontal.svg",
  logoWidth: 520,
  logoHeight: 120,
  tagline: "ĐẸP MỖI GIÂY – KHỎE MỖI NGÀY",
  siteTitle: "LienStore",
  homeHref: "/",
};

export const searchCategories: string[] = ["All Categories", "CHỐNG NẮNG ( UV )", "DƯỠNG THỂ ( BODY )", "GIẢM CÂN ( DIET )", "GỐC CHỊ EM CHÚNG MÌNH ( WOMEN )", "KEM DƯỠNG DÀNH CHO MẶT ( FACE CREAM )", "MẮT ( EYES )", "MẶT NẠ ( MASK )", "MOM AND BABY", "NƯỚC HOA HỒNG ( LOTION )", "PHỤC HỒI TÓC TẠI NHÀ ( HAIR )", "SẢN PHẨM DÀNH CHO NAM ( MEN )", "SON MÔI ( LIPSTICK )", "SỮA RỬA MẶT", "SỮA TẮM ( SHOWER GEL )", "TÂY TẾ BÀO CHẾT ( EXFOLIATE DEAD SKIN )", "TẨY TRANG ( CLEANSING )", "THỰC PHẨM CHỨC NĂNG ( FUNCTIONAL FOODS )", "TRỊ MỤN ( ACNE TREATRMENT )", "TRỊ NÁM - TÀN NHANG ( TREAT MELASMA FRECKLES )", "TỦ THUỐC GIA ĐÌNH ( FAMILY MEDICINE )"];

export const searchPlaceholder = "Search Products...";

export const categoriesMenuLabel = "Product Categories";

export const categoriesDropdown: MenuLink[] = [{"label": "CHỐNG NẮNG ( UV )", "href": "/product-category/chong-nang-uv/"}, {"label": "DƯỠNG THỂ ( BODY )", "href": "/product-category/duong-the-body/"}, {"label": "GIẢM CÂN ( DIET )", "href": "/product-category/giam-can-diet/"}, {"label": "GỐC CHỊ EM CHÚNG MÌNH ( WOMEN )", "href": "/product-category/goc-chi-em-chung-minh-women/"}, {"label": "KEM DƯỠNG DÀNH CHO MẶT ( FACE CREAM )", "href": "/product-category/kem-duong-danh-cho-mat-face-cream/"}, {"label": "MẮT ( EYES )", "href": "/product-category/mat-eyes/"}, {"label": "MẶT NẠ ( MASK )", "href": "/product-category/mat-na-mask/"}, {"label": "MOM AND BABY", "href": "/product-category/mom-and-baby/"}, {"label": "NƯỚC HOA HỒNG ( LOTION )", "href": "/product-category/nuoc-hoa-hong-lotion/"}, {"label": "PHỤC HỒI TÓC TẠI NHÀ ( HAIR )", "href": "/product-category/phuc-hoi-toc-tai-nha-hair/"}];

export const mainMenu: MenuLink[] = [{"label": "Toàn Bộ Sản Phẩm", "href": "/shop/"}, {"label": "Góc Chia Sẻ", "href": "/category/goc-chia-se/"}, {"label": "LIÊN HỆ", "href": "/ve-chung-toi/#lien-he"}, {"label": "My account", "href": "/my-account/"}];

export const slides: Slide[] = [{"image": "/sites/lienstore/root-8a5edab2/images/uvsld-1280x520-b5707f.png", "href": "/product/kem-chong-nang-skin-aqua-tone-up-uv-essence/", "alt": ""}, {"image": "/sites/lienstore/root-8a5edab2/images/vitamin-1280x520-ca9fa7.png", "href": "/product/vitamin-c-dhc-60-ngay/", "alt": ""}, {"image": "/sites/lienstore/root-8a5edab2/images/son-1-2f8444.png", "href": "/product/son-duong-tri-tham-moi-dhc/", "alt": ""}, {"image": "/sites/lienstore/root-8a5edab2/images/kids-1280x520-2d52b6.png", "href": "/product/thuoc-tri-cam-sot-cho-be-paburon-dang-goi/", "alt": ""}];

export const sidebarTitle = "Danh mục sản phẩm";

export const sidebarCategories: SidebarCategory[] = [{"name": "GIẢM CÂN ( DIET )", "count": 3, "href": "/product-category/giam-can-diet/"}, {"name": "SỮA TẮM ( SHOWER GEL )", "count": 4, "href": "/product-category/sua-tam-shower-gel/"}, {"name": "SON MÔI ( LIPSTICK )", "count": 3, "href": "/product-category/son-moi-lipstick/"}, {"name": "PHỤC HỒI TÓC TẠI NHÀ ( HAIR )", "count": 2, "href": "/product-category/phuc-hoi-toc-tai-nha-hair/"}, {"name": "SỮA RỬA MẶT", "count": 9, "href": "/product-category/sua-rua-mat/"}, {"name": "GỐC CHỊ EM CHÚNG MÌNH ( WOMEN )", "count": 3, "href": "/product-category/goc-chi-em-chung-minh-women/"}, {"name": "NƯỚC HOA HỒNG ( LOTION )", "count": 5, "href": "/product-category/nuoc-hoa-hong-lotion/"}, {"name": "SẢN PHẨM DÀNH CHO NAM ( MEN )", "count": 4, "href": "/product-category/san-pham-danh-cho-nam-men/"}, {"name": "TẨY TRANG ( CLEANSING )", "count": 3, "href": "/product-category/tay-trang-cleansing/"}, {"name": "MẮT ( EYES )", "count": 2, "href": "/product-category/mat-eyes/"}, {"name": "KEM DƯỠNG DÀNH CHO MẶT ( FACE CREAM )", "count": 7, "href": "/product-category/kem-duong-danh-cho-mat-face-cream/"}, {"name": "TÂY TẾ BÀO CHẾT ( EXFOLIATE DEAD SKIN )", "count": 4, "href": "/product-category/tay-te-bao-chet-exfoliate-dead-skin/"}, {"name": "CHỐNG NẮNG ( UV )", "count": 3, "href": "/product-category/chong-nang-uv/"}, {"name": "TRỊ NÁM - TÀN NHANG ( TREAT MELASMA FRECKLES )", "count": 2, "href": "/product-category/tri-nam-tan-nhang-treat-melasma-freckles/"}, {"name": "DƯỠNG THỂ ( BODY )", "count": 5, "href": "/product-category/duong-the-body/"}, {"name": "TRỊ MỤN ( ACNE TREATRMENT )", "count": 5, "href": "/product-category/tri-mun-acne-treatment/"}, {"name": "MẶT NẠ ( MASK )", "count": 7, "href": "/product-category/mat-na-mask/"}, {"name": "TỦ THUỐC GIA ĐÌNH ( FAMILY MEDICINE )", "count": 11, "href": "/product-category/tu-thuoc-gia-dinh-family-medicine/"}, {"name": "THỰC PHẨM CHỨC NĂNG ( FUNCTIONAL FOODS )", "count": 38, "href": "/product-category/thuc-pham-chuc-nang-functional-foods/"}, {"name": "MOM AND BABY", "count": 14, "href": "/product-category/mom-and-baby/"}];

export const priceFilter = {
  title: "Lọc theo giá",
  min: 59000,
  max: 2590000,
  currency: "VNĐ",
};

export const categoryGridTitle = "DANH MỤC SẢN PHẨM";

export const categoryCards: CategoryCard[] = [{"name": "CHỐNG NẮNG ( UV )", "count": 3, "href": "/product-category/chong-nang-uv/", "image": "/sites/lienstore/root-8a5edab2/images/uv-1-300x300-603bd9.png", "alt": "CHỐNG NẮNG ( UV )"}, {"name": "DƯỠNG THỂ ( BODY )", "count": 5, "href": "/product-category/duong-the-body/", "image": "/sites/lienstore/root-8a5edab2/images/body-1-300x300-4c9006.png", "alt": "DƯỠNG THỂ ( BODY )"}, {"name": "GIẢM CÂN ( DIET )", "count": 3, "href": "/product-category/giam-can-diet/", "image": "/sites/lienstore/root-8a5edab2/images/diet-1-300x300-b93b6f.png", "alt": "GIẢM CÂN ( DIET )"}, {"name": "GỐC CHỊ EM CHÚNG MÌNH ( WOMEN )", "count": 3, "href": "/product-category/goc-chi-em-chung-minh-women/", "image": "/sites/lienstore/root-8a5edab2/images/women-1-300x300-5fd6bf.png", "alt": "GỐC CHỊ EM CHÚNG MÌNH ( WOMEN )"}, {"name": "KEM DƯỠNG DÀNH CHO MẶT ( FACE CREAM )", "count": 7, "href": "/product-category/kem-duong-danh-cho-mat-face-cream/", "image": "/sites/lienstore/root-8a5edab2/images/face-cream-1-300x300-227252.png", "alt": "KEM DƯỠNG DÀNH CHO MẶT ( FACE CREAM )"}, {"name": "MẮT ( EYES )", "count": 2, "href": "/product-category/mat-eyes/", "image": "/sites/lienstore/root-8a5edab2/images/giam-tham-mat-hieu-qua-300x300-3fa34b.jpg", "alt": "MẮT ( EYES )"}, {"name": "MẶT NẠ ( MASK )", "count": 7, "href": "/product-category/mat-na-mask/", "image": "/sites/lienstore/root-8a5edab2/images/mask-1-300x300-3a4b61.png", "alt": "MẶT NẠ ( MASK )"}, {"name": "MOM AND BABY", "count": 14, "href": "/product-category/mom-and-baby/", "image": "/sites/lienstore/root-8a5edab2/images/babeskin-300x300-0895c6.jpg", "alt": "MOM AND BABY"}, {"name": "NƯỚC HOA HỒNG ( LOTION )", "count": 5, "href": "/product-category/nuoc-hoa-hong-lotion/", "image": "/sites/lienstore/root-8a5edab2/images/Lotion-300x300-34f9e3.png", "alt": "NƯỚC HOA HỒNG ( LOTION )"}, {"name": "PHỤC HỒI TÓC TẠI NHÀ ( HAIR )", "count": 2, "href": "/product-category/phuc-hoi-toc-tai-nha-hair/", "image": "/sites/lienstore/root-8a5edab2/images/hair-300x300-402643.png", "alt": "PHỤC HỒI TÓC TẠI NHÀ ( HAIR )"}, {"name": "SẢN PHẨM DÀNH CHO NAM ( MEN )", "count": 4, "href": "/product-category/san-pham-danh-cho-nam-men/", "image": "/sites/lienstore/root-8a5edab2/images/men-1-300x300-c8c69e.png", "alt": "SẢN PHẨM DÀNH CHO NAM ( MEN )"}, {"name": "SON MÔI ( LIPSTICK )", "count": 3, "href": "/product-category/son-moi-lipstick/", "image": "/sites/lienstore/root-8a5edab2/images/son-300x300-0b507d.png", "alt": "SON MÔI ( LIPSTICK )"}, {"name": "SỮA RỬA MẶT", "count": 9, "href": "/product-category/sua-rua-mat/", "image": "/sites/lienstore/root-8a5edab2/images/z2123472900570_c4e2de5c553e7b388c485fb6545afdf4-300x300-15ff21.jpg", "alt": "SỮA RỬA MẶT"}, {"name": "SỮA TẮM ( SHOWER GEL )", "count": 4, "href": "/product-category/sua-tam-shower-gel/", "image": "/sites/lienstore/root-8a5edab2/images/sua-tam-hatomugi-moisturizing-washing-800ml-nhat-ban-300x300-5c824c.jpg", "alt": "SỮA TẮM ( SHOWER GEL )"}, {"name": "TÂY TẾ BÀO CHẾT ( EXFOLIATE DEAD SKIN )", "count": 4, "href": "/product-category/tay-te-bao-chet-exfoliate-dead-skin/", "image": "/sites/lienstore/root-8a5edab2/images/taydachet-300x300-3bc73f.png", "alt": "TÂY TẾ BÀO CHẾT ( EXFOLIATE DEAD SKIN )"}, {"name": "TẨY TRANG ( CLEANSING )", "count": 3, "href": "/product-category/tay-trang-cleansing/", "image": "/sites/lienstore/root-8a5edab2/images/taytrang-300x300-c20df3.jpg", "alt": "TẨY TRANG ( CLEANSING )"}, {"name": "THỰC PHẨM CHỨC NĂNG ( FUNCTIONAL FOODS )", "count": 38, "href": "/product-category/thuc-pham-chuc-nang-functional-foods/", "image": "/sites/lienstore/root-8a5edab2/images/m_t-n_-g_o-1-300x300-27aeaa.png", "alt": "THỰC PHẨM CHỨC NĂNG ( FUNCTIONAL FOODS )"}, {"name": "TRỊ MỤN ( ACNE TREATRMENT )", "count": 5, "href": "/product-category/tri-mun-acne-treatment/", "image": "/sites/lienstore/root-8a5edab2/images/vien-uong-tri-mun-pair-120-vien-nhat-ban-9-700x700-1-300x300-06f7ea.jpg", "alt": "TRỊ MỤN ( ACNE TREATRMENT )"}, {"name": "TRỊ NÁM - TÀN NHANG ( TREAT MELASMA FRECKLES )", "count": 2, "href": "/product-category/tri-nam-tan-nhang-treat-melasma-freckles/", "image": "/sites/lienstore/root-8a5edab2/images/trinam-300x300-71bf1e.jpg", "alt": "TRỊ NÁM - TÀN NHANG ( TREAT MELASMA FRECKLES )"}, {"name": "TỦ THUỐC GIA ĐÌNH ( FAMILY MEDICINE )", "count": 11, "href": "/product-category/tu-thuoc-gia-dinh-family-medicine/", "image": "/sites/lienstore/root-8a5edab2/images/thuoc-cam-300x300-00c7a5.jpg", "alt": "TỦ THUỐC GIA ĐÌNH ( FAMILY MEDICINE )"}];

export const productSections: ProductSection[] = [{"key": "new", "title": "SẢN PHẨM MỚI NHẬP", "href": "/shop/", "products": [{"title": "Kem Dưỡng Trắng Da Transino Whitening Repair Cream EX", "price": "890.000", "currency": "VNĐ", "href": "/product/kem-duong-trang-da-transino-whitening-repair-cream-ex/", "image": "/sites/lienstore/root-8a5edab2/images/transinorepari-300x300-afb2f3.jpg", "addToCartHref": "?add-to-cart=1769"}, {"title": "Tinh Chất Trị Nám – Sáng Da – Transino Whitening Essence Ex II 50g", "price": "1.090.000", "currency": "VNĐ", "href": "/product/tinh-chat-tri-nam-sang-da-transino-whitening-essence-ex-ii-50g/", "image": "/sites/lienstore/root-8a5edab2/images/transino50g-300x300-d74b6c.jpg", "addToCartHref": "?add-to-cart=1767"}, {"title": "NƯỚC NGHỆ GIẢI RƯỢU-BỔ GAN-ĐẸP DA TURMERIC DRINK", "price": "220.000", "currency": "VNĐ", "href": "/product/nuoc-nghe-giai-ruou-bo-gan-dep-da-turmeric-drink/", "image": "/sites/lienstore/root-8a5edab2/images/nuocnghe-300x300-09e580.jpg", "addToCartHref": "?add-to-cart=1765"}, {"title": "THUỐC TRỊ ĐAU DẠ DÀY KOWA", "price": "490.000", "currency": "VNĐ", "href": "/product/thuoc-tri-dau-da-day-kowa/", "image": "/sites/lienstore/root-8a5edab2/images/da-day-kowa-300x300-3a572f.jpg", "addToCartHref": "?add-to-cart=1762"}, {"title": "GEL ĐẶC TRỊ HÔI NÁCH KOBAYASHI", "price": "210.000", "currency": "VNĐ", "href": "/product/gel-dac-tri-hoi-nach-kobayashi/", "image": "/sites/lienstore/root-8a5edab2/images/gelnach-300x300-69447f.jpg", "addToCartHref": "?add-to-cart=1760"}, {"title": "Canxi Hữu Cơ Nhật Bản Dear-Natura", "price": "265.000", "currency": "VNĐ", "href": "/product/canxi-huu-co-nhat-ban-dear-natura/", "image": "/sites/lienstore/root-8a5edab2/images/DearNatural-300x300-42569b.jpg", "addToCartHref": "?add-to-cart=1758"}, {"title": "Viên Uống Bổ Mắt Noguchi Lutein EX Hộp 60", "price": "390.000", "currency": "VNĐ", "href": "/product/vien-uong-bo-mat-noguchi-lutein-ex-hop-60/", "image": "/sites/lienstore/root-8a5edab2/images/Bomat-300x300-122c16.jpg", "addToCartHref": "?add-to-cart=1756"}, {"title": "THUỐC XỊT XOANG NAZAL NHẬT BẢN 30ml", "price": "225.000", "currency": "VNĐ", "href": "/product/thuoc-xit-xoang-nazal-nhat-ban-30ml/", "image": "/sites/lienstore/root-8a5edab2/images/thuocxitxoang-300x300-d72c01.jpg", "addToCartHref": "?add-to-cart=1753"}, {"title": "TẢO VÀNG EX 2000 Viên", "price": "1.700.000", "currency": "VNĐ", "href": "/product/tao-vang-ex-2000-vien/", "image": "/sites/lienstore/root-8a5edab2/images/taovang-300x300-2274ff.jpg", "addToCartHref": "?add-to-cart=1744"}, {"title": "Trà Ổi Orihiro Nhật Bản 60 Gói Giảm Cân Thanh Lọc Cơ Thể", "price": "210.000", "currency": "VNĐ", "href": "/product/tra-oi-orihiro-nhat-ban-60-goi-giam-can-thanh-loc-co-the/", "image": "/sites/lienstore/root-8a5edab2/images/tra-oi-orihiro-60-goi-300x300-9f0e65.jpg", "addToCartHref": "?add-to-cart=1742"}, {"title": "Tẩy tế bào chết Detclear Bright And Peel Nhật Bản 180ml", "price": "280.000", "currency": "VNĐ", "href": "/product/tay-te-bao-chet-detclear-bright-and-peel-nhat-ban-180ml/", "image": "/sites/lienstore/root-8a5edab2/images/gel3mau-300x300-025a78.jpg", "addToCartHref": "?add-to-cart=1737"}, {"title": "Gel Tẩy Tế Bào Chết Cure Natural Aqua Nhật Bản", "price": "495.000", "currency": "VNĐ", "href": "/product/gel-tay-te-bao-chet-cure-natural-aqua-nhat-ban/", "image": "/sites/lienstore/root-8a5edab2/images/taydachecure-300x300-23a7c7.jpg", "addToCartHref": "?add-to-cart=1735"}]}, {"key": "functional", "title": "THỰC PHẨM CHỨC NĂNG", "href": "/product-category/thuc-pham-chuc-nang-functional-foods/", "products": [{"title": "Ngũ Cốc Đỏ Calbee Nhật Bản 750g", "price": "215.000", "currency": "VNĐ", "href": "/product/ngu-coc-do-calbee-nhat-ban-750g/", "image": "/sites/lienstore/root-8a5edab2/images/ngu-coc-calbee-800g-nhat-ban-531b28bf-2779-40f7-9ada-93f23bf-3b156d.jpg", "addToCartHref": "?add-to-cart=1478"}, {"title": "Ngũ Cốc Trắng Calbee Nhật Bản 600g", "price": "215.000", "currency": "VNĐ", "href": "/product/ngu-coc-trang-calbee-nhat-ban-600g/", "image": "/sites/lienstore/root-8a5edab2/images/ngu_coc_trang1_801be01f12a84e2b8dc61b23d829ac87_grande-300x3-190e86.jpg", "addToCartHref": "?add-to-cart=1481"}, {"title": "NƯỚC NGHỆ GIẢI RƯỢU-BỔ GAN-ĐẸP DA TURMERIC DRINK", "price": "220.000", "currency": "VNĐ", "href": "/product/nuoc-nghe-giai-ruou-bo-gan-dep-da-turmeric-drink/", "image": "/sites/lienstore/root-8a5edab2/images/nuocnghe-300x300-09e580.jpg", "addToCartHref": "?add-to-cart=1765"}, {"title": "BỘT MẦM LÚA MẠCH – BỘT TRÀ LÚA NON NHẬT BẢN", "price": "250.000", "currency": "VNĐ", "href": "/product/bot-mam-lua-mach-bot-tra-lua-non-nhat-ban/", "image": "/sites/lienstore/root-8a5edab2/images/bot-lua-non-300x300-910c5f.jpg", "addToCartHref": "?add-to-cart=1623"}, {"title": "Canxi Hữu Cơ Nhật Bản Dear-Natura", "price": "265.000", "currency": "VNĐ", "href": "/product/canxi-huu-co-nhat-ban-dear-natura/", "image": "/sites/lienstore/root-8a5edab2/images/DearNatural-300x300-42569b.jpg", "addToCartHref": "?add-to-cart=1758"}, {"title": "Viên Uống Thơm Cơ Thể DHC 20 Ngày", "price": "270.000", "currency": "VNĐ", "href": "/product/vien-uong-thom-co-the-dhc-20-ngay/", "image": "/sites/lienstore/root-8a5edab2/images/thomnguoi-300x300-efe196.png", "addToCartHref": "?add-to-cart=1527"}, {"title": "Orihiro Ukon Tea Trà Nghệ 60 Gói", "price": "275.000", "currency": "VNĐ", "href": "/product/tra-nghe-orihiro/", "image": "/sites/lienstore/root-8a5edab2/images/tra-nghe-orihiro-ukon-tea-200gr-300x300-6bde1f.jpeg", "addToCartHref": "?add-to-cart=197"}, {"title": "Vitamin C DHC 60 Ngày", "price": "290.000", "currency": "VNĐ", "href": "/product/vitamin-c-dhc-60-ngay/", "image": "/sites/lienstore/root-8a5edab2/images/vitaminC-300x300-488549.jpg", "addToCartHref": "?add-to-cart=1274"}, {"title": "Viên Uống Bổ Sung Vitamin E 60 Ngày", "price": "290.000", "currency": "VNĐ", "href": "/product/vien-uong-bo-sung-vitamin-e-60-ngay/", "image": "/sites/lienstore/root-8a5edab2/images/vitamin-e-300x300-afffab.jpg", "addToCartHref": "?add-to-cart=1529"}, {"title": "Viên Uống Bổ Sung Canxi DHC 60 Ngày", "price": "300.000", "currency": "VNĐ", "href": "/product/vien-uong-bo-sung-canxi-dhc-60-ngay/", "image": "/sites/lienstore/root-8a5edab2/images/Vien-uong-DHC-bo-sung-Canxi-300x300-60fc31.jpg", "addToCartHref": "?add-to-cart=1656"}, {"title": "Viên Uống Rau Củ DHC 60 Ngày", "price": "320.000", "currency": "VNĐ", "href": "/product/vien-uong-rau-cu-dhc-60-ngay/", "image": "/sites/lienstore/root-8a5edab2/images/raucu-300x300-eefaf5.jpg", "addToCartHref": "?add-to-cart=1525"}, {"title": "Viên uống Collagen DHC 60 Ngày", "price": "350.000", "currency": "VNĐ", "href": "/product/vien-uong-collagen-dhc-60-ngay/", "image": "/sites/lienstore/root-8a5edab2/images/collagendhc-300x300-d249e4.jpg", "addToCartHref": "?add-to-cart=1533"}]}, {"key": "momBaby", "title": "Mom And Baby", "href": "/product-category/mom-and-baby/", "products": [{"title": "VIÊN NHAI BỔ SUNG CANXI VỊ SỮA CHUA MOST", "price": "320.000", "currency": "VNĐ", "href": "/product/vien-nhai-bo-sung-canxi-vi-sua-chua-most/", "image": "/sites/lienstore/root-8a5edab2/images/keocanxi-300x300-082151.jpg", "addToCartHref": "?add-to-cart=1648"}, {"title": "KẸO CHO TRẺ BIẾNG ĂN MAMA RAMUNE", "price": "300.000", "currency": "VNĐ", "href": "/product/keo-cho-tre-bieng-an-mama-ramune/", "image": "/sites/lienstore/root-8a5edab2/images/keobienganchobe-300x300-dc22b3.jpg", "addToCartHref": "?add-to-cart=1634"}, {"title": "Sữa Meji Cho Bé Từ 0-1 Tuổi Dạng Lon 800g", "price": "890.000", "currency": "VNĐ", "href": "/product/sua-meji-cho-be-tu-0-1-tuoi-dang-lon-800g/", "image": "/sites/lienstore/root-8a5edab2/images/Sua-Meiji-so-0-1-300x300-011835.jpg", "addToCartHref": "?add-to-cart=1539"}, {"title": "Sữa Meiji Cho Bé Từ 1-3 Tuổi Dạng Lon 800g", "price": "790.000", "currency": "VNĐ", "href": "/product/sua-meiji-cho-be-tu-1-3-tuoi-dang-lon-800g/", "image": "/sites/lienstore/root-8a5edab2/images/sua-meiji-so-9-800gr-1-300x300-61a529.jpg", "addToCartHref": "?add-to-cart=1536"}, {"title": "Lăn Trị Muỗi Đốt – Côn Trùng Cắn Muhi", "price": "185.000", "currency": "VNĐ", "href": "/product/lan-tri-muoi-dot-con-trung-can-muhi/", "image": "/sites/lienstore/root-8a5edab2/images/lam-boi-tri-muoi-dot-1-jpg-1481705968-14122016155928-300x300-04b726.jpg", "addToCartHref": "?add-to-cart=1476"}, {"title": "Thuốc Trị Cảm Cúm Cho Trẻ Taisho Pabron Gold A 46 gói", "price": "390.000", "currency": "VNĐ", "href": "/product/thuoc-tri-cam-cum-cho-tre-taisho-pabron-gold-a-46-goi/", "image": "/sites/lienstore/root-8a5edab2/images/goi-300x300-7c041f.jpg", "addToCartHref": "?add-to-cart=1433"}]}];

export const addToCartLabel = "Mua hàng";

export const footerColumns: FooterColumn[] = [
  {
    title: "Kết Nối Với Chúng Tôi",
    contact: true,
  },
  {
    title: "Về LienStore",
    links: [
      { label: "Về chúng tôi", href: "/ve-chung-toi/" },
      { label: "Liên hệ", href: "/ve-chung-toi/#lien-he" },
    ],
  },
  {
    title: "Hỗ Trợ Khách Hàng",
    links: [
      { label: "Hướng dẫn đặt hàng", href: "/huong-dan-dat-hang/" },
      { label: "Chính sách đổi trả", href: "/chinh-sach-doi-tra/" },
    ],
  },
  {
    title: "Đơn Vị Vận Chuyển",
    image: { src: "/sites/lienstore/root-8a5edab2/images/bietpo-edc4a0.png", alt: "viettel post", width: 200, height: 200 },
  },
];

export const footerCopyright = "Copyright 2020-2026 by LienStore. All Rights Reserved.";

export const sliderAssets = {
  directionNav: "/sites/lienstore/root-8a5edab2/images/bg_direction_nav-f14a91.png",
};

export const headerAssets = {
  selectArrow: "/sites/lienstore/root-8a5edab2/images/down-arrow-13b45a.png",
};
