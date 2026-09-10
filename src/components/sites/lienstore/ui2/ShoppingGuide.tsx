import Link from "next/link";
import { Fa, type FaName } from "@/components/sites/lienstore/shared/icons";
import type { Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface Step {
  icon: FaName;
  vi: string;
  ja: string;
  detailVi: string;
  detailJa: string;
}

/** The five steps of buying at LienStore (also drives the illustrated banner). */
export const GUIDE_STEPS: Step[] = [
  { icon: "shopping-cart", vi: "Chọn sản phẩm hoặc gửi link cần mua hộ", ja: "商品を選ぶ／購入代行のリンクを送る", detailVi: "Tìm theo danh mục, tìm kiếm hoặc bấm “Thêm vào giỏ”. Chưa có món cần? Gửi link Amazon / ảnh qua Zalo, LienStore báo giá trong ngày.", detailJa: "カテゴリーや検索から商品を選び「カートに入れる」。取り扱いのない商品はAmazonのリンクや写真をZaloで送ってください。当日中にお見積りします。" },
  { icon: "file-text-o", vi: "Xác nhận thông tin đặt hàng", ja: "ご注文内容の確認", detailVi: "Điền tên, số điện thoại, địa chỉ hoặc chọn nhận tại kho Thanh Hóa. Phí vận chuyển được tính tự động theo cân nặng đơn.", detailJa: "お名前・電話番号・住所を入力、またはタインホア倉庫での受け取りを選択。送料は注文の重量から自動計算されます。" },
  { icon: "credit-card", vi: "Chọn hình thức thanh toán", ja: "お支払い方法を選ぶ", detailVi: "Chuyển khoản BIDV theo mã QR có sẵn nội dung “LIENSTORE + mã đơn”, hoặc thanh toán khi nhận hàng. Hàng order cần thanh toán trước 100%.", detailJa: "注文番号入りQRコードでBIDVへ銀行振込、または代金引換。お取り寄せ商品は全額前払いです。" },
  { icon: "plane", vi: "Theo dõi đơn & nhận bill mua hàng tại Nhật", ja: "注文の追跡と日本での購入レシート", detailVi: "Trang đơn hàng hiện tiến độ 7 bước (mua tại Nhật → kho Nhật → về Việt Nam → kho VN → giao). Bill mua tại Nhật được đính kèm; có thể chat với shop ngay trong đơn.", detailJa: "注文ページで7段階の進捗を確認（日本で購入→日本倉庫→輸送→ベトナム倉庫→配達）。購入レシートを添付、注文内でショップとチャットできます。" },
  { icon: "truck", vi: "Nhận hàng", ja: "商品のお受け取り", detailVi: "Giao tận nhà qua Viettel Post / Bưu điện hoặc tự tới kho. Kiểm tra hàng khi nhận; đổi trả nếu không đúng mô tả.", detailJa: "Viettel Post／郵便でご自宅へ配送、または倉庫でお受け取り。受け取り時にご確認ください。説明と異なる場合は返品・交換します。" },
];

const TONE = ["bg-lien-blue", "bg-lien-sale", "bg-lien-blue", "bg-lien-sale", "bg-lien-blue"];

/** Illustrated "5 bước mua hàng" graphic: title badge + five coloured step bars with icons (pure CSS, no image). */
export function GuideSteps({ lang, className }: { lang: Lang; className?: string }) {
  const ja = lang === "ja";
  return (
    <div className={cn("rounded-2xl bg-[radial-gradient(circle_at_20%_10%,#eef6e6,transparent_60%),radial-gradient(circle_at_90%_90%,#fff1e6,transparent_55%)] p-5 sm:p-7", className)}>
      <div className="mb-5 text-center">
        <span className="inline-block -rotate-1 rounded-lg bg-lien-sale px-4 py-1.5 text-[24px] font-black uppercase tracking-wide text-white shadow-[0_6px_0_#c93d00] sm:text-[30px]">{ja ? "5ステップでお買い物" : "5 bước mua hàng"}</span>
        <span className="mt-2 block text-[14px] font-bold uppercase tracking-[0.2em] text-lien-blue sm:text-[16px]">{ja ? "かんたん・スピーディー" : "nhanh chóng & tiện lợi"}</span>
      </div>
      <ol className="m-0 flex list-none flex-col gap-3 p-0">
        {GUIDE_STEPS.map((s, i) => (
          <li key={s.vi} className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-[20px] text-lien-blue shadow-sm">
              <Fa name={s.icon} />
            </span>
            <span className={cn("relative flex h-11 flex-1 items-center rounded-full pr-4 pl-14 text-[13px] font-bold uppercase leading-tight tracking-wide text-white sm:text-[14px]", TONE[i])}>
              <span className="absolute top-1 left-1 flex h-9 w-9 items-center justify-center rounded-full bg-white text-[18px] font-black text-lien-heading">{i + 1}</span>
              {ja ? s.ja : s.vi}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Home block: graphic on the left, short intro + button on the right (sesofoods "Shopping Guide" layout). */
export function ShoppingGuideBlock({ lang }: { lang: Lang }) {
  const ja = lang === "ja";
  return (
    <section className="my-10 grid items-center gap-8 md:grid-cols-2" aria-label={ja ? "お買い物ガイド" : "Hướng dẫn mua hàng"}>
      <GuideSteps lang={lang} />
      <div className="text-center md:text-left">
        <h2 className="m-0 mb-4 text-[26px] font-bold leading-8 text-lien-heading sm:text-[30px]">{ja ? "お買い物ガイド" : "Hướng dẫn mua hàng"}</h2>
        <p className="m-0 mb-3 text-[15px] leading-7 text-lien-text">
          {ja
            ? "LienStoreは日本国内の商品を日本で直接購入し、購入レシートを添付してベトナムへお届けするショップです。会員登録なしでも注文でき、銀行振込（QRコード）または代金引換でお支払いいただけます。"
            : "LienStore mua hàng trực tiếp tại Nhật, đính kèm bill cho từng đơn và gửi về Việt Nam. Bạn có thể đặt hàng không cần tài khoản, thanh toán chuyển khoản theo mã QR hoặc trả tiền khi nhận hàng."}
        </p>
        <p className="m-0 mb-6 text-[15px] leading-7 text-lien-text">
          {ja ? "オンライン購入が初めての方も、次の5つのステップで安心してご利用いただけます。" : "Ngay cả khi chưa quen mua hàng online, bạn vẫn hoàn toàn yên tâm với 5 bước đơn giản sau đây:"}
        </p>
        <Link href="/huong-dan-dat-hang/" className="inline-flex h-11 items-center rounded-full bg-lien-blue px-7 text-[14px] font-bold text-white no-underline hover:bg-lien-blue-hover">
          {ja ? "もっと見る…" : "Xem thêm…"}
        </Link>
      </div>
    </section>
  );
}

/** Full guide: each step with its explanation. */
export function GuideDetails({ lang }: { lang: Lang }) {
  const ja = lang === "ja";
  return (
    <ol className="m-0 grid list-none gap-4 p-0 md:grid-cols-2">
      {GUIDE_STEPS.map((s, i) => (
        <li key={s.vi} className="flex gap-4 rounded-md border border-lien-line bg-white p-5">
          <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[20px] text-white", TONE[i])}>
            <Fa name={s.icon} />
          </span>
          <div>
            <h3 className="m-0 text-[15px] font-bold leading-6 text-lien-heading">
              {i + 1}. {ja ? s.ja : s.vi}
            </h3>
            <p className="m-0 mt-1 text-[14px] leading-6 text-lien-muted">{ja ? s.detailJa : s.detailVi}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
