/**
 * Storefront chrome language (Vietnamese default, Japanese optional).
 *
 * Only the interface strings (header, account drawer, cart, buttons, footer headings) are translated —
 * product names and descriptions stay as entered in the admin. The choice is a cookie (`lien_lang`) set by
 * `/api/lang/?to=ja&back=/…`, read on the server in `SiteChrome` / the root layout and handed to client
 * components through `LangProvider`.
 */
export type Lang = "vi" | "ja";

export const LANG_COOKIE = "lien_lang";
export const LANGS: Array<{ code: Lang; short: string; label: string }> = [
  { code: "vi", short: "VI", label: "Tiếng Việt" },
  { code: "ja", short: "JP", label: "日本語" },
];

export function isLang(v: unknown): v is Lang {
  return v === "vi" || v === "ja";
}

const DICT = {
  // header / nav
  categories: ["Danh mục", "カテゴリー"],
  support: ["Hỗ trợ", "サポート"],
  news: ["Tin tức", "ニュース"],
  about: ["Về chúng tôi", "会社紹介"],
  searchPlaceholder: ["Tìm kiếm sản phẩm", "商品を検索"],
  search: ["Tìm", "検索"],
  account: ["Tài khoản", "アカウント"],
  wishlist: ["Yêu thích", "お気に入り"],
  cart: ["Giỏ hàng", "カート"],
  menu: ["Menu", "メニュー"],
  openMenu: ["Mở menu", "メニューを開く"],
  close: ["Đóng", "閉じる"],
  allProducts: ["Tất cả sản phẩm", "全ての商品"],
  newArrivals: ["Hàng mới về", "新着商品"],
  viewAll: ["Xem tất cả sản phẩm →", "全ての商品を見る →"],
  otherNews: ["Các tin tức khác", "その他のニュース"],
  aboutContact: ["Về chúng tôi & liên hệ", "会社紹介・お問い合わせ"],
  // top bar
  hotline: ["Hotline", "ホットライン"],
  registerCta: ["Đăng kí tài khoản", "会員登録"],
  registerHint: ["ngay để nhận ưu đãi thành viên", "して会員特典を受け取る"],
  language: ["Ngôn ngữ", "言語"],
  // account drawer
  login: ["Đăng nhập", "ログイン"],
  register: ["Đăng ký", "会員登録"],
  loginId: ["Tên đăng nhập hoặc Email", "ログインIDまたはメール"],
  loginIdOnly: ["Tên đăng nhập (ID)", "ログインID"],
  loginIdHint: ["3–30 ký tự: chữ, số, dấu chấm, gạch dưới", "3〜30文字：英数字・ドット・アンダースコア"],
  password: ["Mật khẩu", "パスワード"],
  email: ["Email", "メール"],
  emailOptional: ["Email (không bắt buộc)", "メール（任意）"],
  firstName: ["Tên đệm & tên", "名"],
  lastName: ["Họ", "姓"],
  newCustomer: ["Bạn là khách hàng mới?", "初めてのお客様ですか？"],
  createAccount: ["Tạo tài khoản", "アカウントを作成"],
  forgot: ["Bạn đã quên mật khẩu?", "パスワードをお忘れですか？"],
  recover: ["Khôi phục mật khẩu", "パスワードを再設定"],
  haveAccount: ["Bạn đã có tài khoản?", "既にアカウントをお持ちですか？"],
  privacyNote: [
    "Thông tin cá nhân của bạn sẽ chỉ được dùng để hỗ trợ trải nghiệm của bạn trên website của chúng tôi. Mục đích được mô tả trong",
    "お客様の個人情報は当サイトでの体験向上のためにのみ使用されます。詳細は",
  ],
  privacyPolicy: ["Chính sách bảo mật", "プライバシーポリシー"],
  hello: ["Xin chào", "こんにちは"],
  myAccount: ["Tài khoản của tôi", "マイアカウント"],
  myOrders: ["Đơn hàng của tôi", "注文履歴"],
  logout: ["Đăng xuất", "ログアウト"],
  loggingIn: ["Đang đăng nhập…", "ログイン中…"],
  creating: ["Đang tạo tài khoản…", "作成中…"],
  // cart drawer / cards
  subtotal: ["Tạm tính", "小計"],
  cartEmpty: ["Giỏ hàng của bạn đang trống.", "カートは空です。"],
  feesNote: ["Phí ship và mã giảm giá", "送料とクーポン"],
  feesNoteTail: ["sẽ được tính ở trang thanh toán.", "はお支払いページで計算されます。"],
  viewCart: ["Xem giỏ hàng", "カートを見る"],
  checkout: ["Thanh toán", "レジに進む"],
  addToCart: ["Thêm Vào Giỏ", "カートに入れる"],
  added: ["Đã thêm vào giỏ", "追加しました"],
  outOfStock: ["Hết hàng", "在庫切れ"],
  isNew: ["Mới", "新着"],
  boughtTogether: ["Thường được mua cùng với :", "よく一緒に購入されている商品："],
  // footer
  fAccount: ["Tài khoản", "アカウント"],
  fSupport: ["Hỗ trợ khách hàng", "カスタマーサポート"],
  fCategories: ["Danh mục chính", "主なカテゴリー"],
  fConnect: ["Kết nối với LienStore", "LienStoreとつながる"],
} as const;

export type I18nKey = keyof typeof DICT;

export function t(lang: Lang, key: I18nKey): string {
  return DICT[key][lang === "ja" ? 1 : 0];
}
