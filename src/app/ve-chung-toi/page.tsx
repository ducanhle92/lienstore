import type { Metadata } from "next";
import { t } from "@/lib/i18n";
import { getLang } from "@/lib/lang-server";
import Link from "next/link";
import { contact } from "@/components/sites/lienstore/root-8a5edab2/data";
import { Fa, type FaName } from "@/components/sites/lienstore/shared/icons";
import { FullWidthShell, SiteChrome } from "@/components/sites/lienstore/shop/SiteChrome";
import { PageBand } from "@/components/sites/lienstore/ui2/HomeBlocks";
import { getStats } from "@/lib/db";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Về chúng tôi & liên hệ – LienStore",
  description: "LienStore – hàng Nhật nội địa mua tận tay tại Nhật, có bill đối chiếu từng đơn. Hotline, Zalo, Facebook và địa chỉ liên hệ.",
};

const VALUES: Array<{ icon: FaName; title: string; text: string }> = [
  { icon: "shield", title: "Mua tận tay tại Nhật", text: "Từng món được chọn tại siêu thị, drugstore và Amazon Nhật. Mỗi đơn đều có bill mua hàng gốc để bạn đối chiếu." },
  { icon: "tag", title: "Giá rõ ràng", text: "Giá niêm yết đã gồm phí mua hộ. Phí vận chuyển tính riêng theo bảng công khai, không phát sinh khoản khó hiểu." },
  { icon: "plane", title: "Gom đơn hàng tuần", text: "Hàng gom tại Nhật theo tuần rồi gửi về kho Thanh Hóa, giao tận nhà toàn quốc bằng đơn vị vận chuyển uy tín." },
  { icon: "comments-o", title: "Tư vấn thật, không ép mua", text: "Chưa có món bạn cần? Gửi link hoặc ảnh qua Zalo, LienStore báo giá mua hộ trong ngày và nói rõ nếu hàng không phù hợp." },
];

const STEPS = ["Bạn chọn hàng trên web hoặc gửi link cần mua hộ", "LienStore báo giá & xác nhận đơn qua Zalo / điện thoại", "Mua hàng tại Nhật, gửi ảnh bill cho bạn", "Gom đơn hàng tuần, gửi về Việt Nam", "Giao tận nhà, thanh toán COD hoặc chuyển khoản"];

const SOCIAL_ICON: Record<string, FaName> = { facebook: "facebook", zalo: "comments-o", messenger: "comments-o" };

const JA = {
  band: "LienStore — 日本国内の商品を日本で直接購入し、すべての注文にレシートを添付してお届けします。",
  h2: "LienStoreは、とても現実的な不安から生まれました",
  p1: "ベトナムでは「日本国内品」と呼ばれる商品が増えていますが、その中には出所不明の商品や偽物も少なくありません。私たちは日本に暮らす二人のベトナム人です。家族や友人から「本物はどこで買えるの？」と何度も聞かれてきました。",
  p2: "LienStoreはその問いへの答えです。サイト上のすべての商品は、私たち自身が日本の店舗やAmazon.co.jpで購入し、レシートを撮影し、梱包してベトナムへ送っています。",
  p3: "現在、サプリメント、コスメ、ママ＆ベビー用品から日用品まで、多数の商品を販売中です。お探しの商品が見つからない場合は、Zaloでご連絡ください。購入代行のお見積りを当日中にお返しします。",
  steps: ["サイトで商品を選ぶ、または購入代行したい商品のリンクを送る", "LienStoreがZalo／電話でお見積りとご注文確認", "日本で購入し、レシートの写真をお送りします", "毎週まとめてベトナムへ発送", "ご自宅までお届け、代金引換または銀行振込でお支払い"],
  stepsTitle: "5つのステップ",
  values: [
    { title: "日本で直接購入", text: "スーパー、ドラッグストア、Amazon.co.jpで一点ずつ選んで購入。すべての注文に購入時のレシートを添付します。" },
    { title: "明確な価格", text: "表示価格には購入代行手数料が含まれます。送料は公開している料金表に基づき別途計算、不明瞭な追加費用はありません。" },
    { title: "毎週まとめて発送", text: "日本で週単位でまとめてタインホアの倉庫へ送り、信頼できる配送会社でベトナム全国へお届けします。" },
    { title: "誠実なご案内", text: "お探しの商品がない場合はZaloでリンクや写真を送ってください。当日中にお見積りし、入手できない場合は正直にお伝えします。" },
  ],
  contact: "お問い合わせ",
  contactNote: "営業時間内（ベトナム時間）はZaloが最も早くご返信できます。",
  phoneTitle: "電話・Zalo",
  addressTitle: "住所・営業時間",
  socialTitle: "SNS",
  vnWarehouse: "ベトナム倉庫：",
  jpBuying: "購入拠点：日本",
  daily: "毎日",
};

export default async function AboutPage() {
  const lang = await getLang();
  const ja = lang === "ja";
  const stats = await getStats();
  return (
    <SiteChrome>
      <PageBand title={t(lang, "aboutTitle")} crumbs={[{ label: t(lang, "aboutTitle") }]} description={ja ? JA.band : "LienStore – hàng Nhật nội địa, mua tận tay tại Nhật, có bill cho từng đơn."} />
      <FullWidthShell>
        <div className="mx-auto max-w-[1000px]">
          {/* Story */}
          <section className="grid gap-8 md:grid-cols-[1.4fr_1fr] md:items-start">
            <div className="text-[15px] leading-7 text-lien-text">
              <h2 className="m-0 mb-3 text-[22px] font-bold leading-8 text-lien-heading">{ja ? JA.h2 : "LienStore ra đời từ một nỗi lo rất thật"}</h2>
              <p className="m-0 mb-3">{ja ? JA.p1 : <>
                Hàng &ldquo;nội địa Nhật&rdquo; ở Việt Nam ngày càng nhiều, nhưng không ít trong đó là hàng trôi nổi hoặc hàng giả gắn mác. Chúng tôi là hai người Việt đang sinh sống tại Nhật, và câu hỏi ban đầu rất đơn giản: <em>làm sao để người nhà ở quê dùng đúng món mình đang dùng ở đây?</em>
              </>}</p>
              <p className="m-0 mb-3">{ja ? JA.p2 : <>
                LienStore là lời trả lời cho câu hỏi đó. Mỗi sản phẩm trên web đều do chính chúng tôi mua tại cửa hàng hoặc Amazon Nhật, chụp bill, đóng gói và gửi về. Chúng tôi không cam kết giá rẻ nhất, nhưng cam kết một điều duy nhất và không đổi: <strong>đã lên LienStore thì là hàng Nhật nội địa.</strong>
              </>}</p>
              <p className="m-0">{ja ? JA.p3 : <>
                Cửa hàng hiện có hơn {stats.published} sản phẩm đang bán, từ thực phẩm chức năng, mỹ phẩm, mẹ & bé đến đồ gia dụng. Không thấy món cần? Nhắn Zalo, chúng tôi mua hộ.
              </>}</p>
            </div>
            <aside className="rounded-md border border-lien-line bg-lien-cream p-5 text-[14px] leading-6">
              <h3 className="m-0 mb-3 text-[15px] font-bold uppercase text-lien-heading">{ja ? JA.stepsTitle : "Quy trình 5 bước"}</h3>
              <ol className="m-0 list-none space-y-2 p-0">
                {(ja ? JA.steps : STEPS).map((s, i) => (
                  <li key={s} className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-lien-blue text-[12px] font-bold text-white">{i + 1}</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
            </aside>
          </section>

          {/* Values */}
          <section className="mt-10 grid gap-4 sm:grid-cols-2" aria-label="Cam kết">
            {VALUES.map((v0, i) => {
              const v = ja ? { ...v0, ...JA.values[i] } : v0;
              return (
              <div key={v.title} className="flex gap-4 rounded-md border border-lien-line bg-white p-5">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-lien-blue-soft text-[20px] text-lien-blue">
                  <Fa name={v.icon} />
                </span>
                <div>
                  <h3 className="m-0 text-[15px] font-bold leading-6 text-lien-heading">{v.title}</h3>
                  <p className="m-0 mt-1 text-[14px] leading-6 text-lien-muted">{v.text}</p>
                </div>
              </div>
              );
            })}
          </section>

          {/* Contact */}
          <section id="lien-he" className="mt-12 scroll-mt-24" aria-labelledby="lien-he-title">
            <h2 id="lien-he-title" className="m-0 mb-1 text-center text-[24px] font-bold uppercase leading-8 text-lien-blue">
              {t(lang, "contact")}
            </h2>
            <p className="m-0 mb-6 text-center text-[14px] text-lien-muted">{ja ? `${JA.contactNote}（${contact.hours}）` : `Trả lời nhanh nhất qua Zalo trong giờ ${contact.hours} (giờ Việt Nam).`}</p>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-md border border-lien-line bg-white p-5">
                <h3 className="m-0 mb-3 text-[13px] font-bold uppercase tracking-[0.3px] text-lien-heading">{ja ? JA.phoneTitle : "Điện thoại & Zalo"}</h3>
                <ul className="m-0 list-none space-y-2 p-0 text-[14px]">
                  {contact.phones.map((p) => (
                    <li key={p.number} className="flex items-center gap-2">
                      <Fa name="phone" className="text-lien-blue" />
                      <span className="text-lien-muted">{t(lang, "hotline")} {p.label}:</span>
                      <a href={p.href} className="font-semibold text-lien-heading no-underline hover:text-lien-blue">
                        {p.number}
                      </a>
                    </li>
                  ))}
                  <li className="flex items-center gap-2">
                    <Fa name="envelope" className="text-lien-blue" />
                    <a href={`mailto:${contact.email}`} className="text-lien-heading no-underline hover:text-lien-blue">
                      {contact.email}
                    </a>
                  </li>
                </ul>
              </div>
              <div className="rounded-md border border-lien-line bg-white p-5">
                <h3 className="m-0 mb-3 text-[13px] font-bold uppercase tracking-[0.3px] text-lien-heading">{ja ? JA.addressTitle : "Địa chỉ & giờ làm việc"}</h3>
                <p className="m-0 flex items-start gap-2 text-[14px] leading-6 text-lien-text">
                  <Fa name="map-marker" className="mt-1 text-lien-blue" />
                  <span>
                    {ja ? JA.vnWarehouse : "Kho hàng Việt Nam: "}{ja && contact.addressJa ? contact.addressJa : contact.address}
                    <br />
                    {ja ? JA.jpBuying : "Điểm mua hàng: Nhật Bản"}
                  </span>
                </p>
                <p className="m-0 mt-2 flex items-center gap-2 text-[14px] text-lien-text">
                  <Fa name="clock-o" className="text-lien-blue" /> {contact.hours} {ja ? JA.daily : "hằng ngày"}
                </p>
              </div>
              <div className="rounded-md border border-lien-line bg-white p-5">
                <h3 className="m-0 mb-3 text-[13px] font-bold uppercase tracking-[0.3px] text-lien-heading">{ja ? JA.socialTitle : "Mạng xã hội"}</h3>
                <ul className="m-0 list-none space-y-2 p-0 text-[14px]">
                  {contact.socials.map((s) => (
                    <li key={s.kind}>
                      <a href={s.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-lien-heading no-underline hover:text-lien-blue">
                        <Fa name={SOCIAL_ICON[s.kind] ?? "share-alt"} className="w-4 text-lien-blue" />
                        {s.label}
                        <span className="text-[12px] text-lien-muted">{s.href.replace(/^https?:\/\//, "")}</span>
                      </a>
                    </li>
                  ))}
                </ul>
                <a href="https://zalo.me/0964839769" target="_blank" rel="noreferrer" className="mt-4 inline-flex h-10 items-center justify-center rounded-full bg-lien-blue px-5 text-[13px] font-bold uppercase tracking-[0.5px] text-white no-underline hover:bg-lien-blue-hover">
                  Nhắn Zalo ngay
                </a>
              </div>
            </div>
            <p className="m-0 mt-6 text-center text-[13px] text-lien-muted">
              Cần tra cứu đơn hoặc xem bill? Vào{" "}
              <Link href="/my-account/" className="text-lien-blue hover:underline">
                Tài khoản
              </Link>{" "}
              hoặc xem{" "}
              <Link href="/van-chuyen/" className="text-lien-blue hover:underline">
                bảng phí vận chuyển
              </Link>
              .
            </p>
          </section>
        </div>
      </FullWidthShell>
    </SiteChrome>
  );
}
