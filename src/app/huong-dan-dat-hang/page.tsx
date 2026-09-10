import type { Metadata } from "next";
import Link from "next/link";
import { FullWidthShell, SiteChrome } from "@/components/sites/lienstore/shop/SiteChrome";
import { PageBand } from "@/components/sites/lienstore/ui2/HomeBlocks";
import { GuideDetails, GuideSteps } from "@/components/sites/lienstore/ui2/ShoppingGuide";
import { getPageBySlug } from "@/lib/db";
import { getLang } from "@/lib/lang-server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Hướng dẫn mua hàng – LienStore",
  description: "5 bước mua hàng Nhật tại LienStore: chọn sản phẩm hoặc gửi link mua hộ, xác nhận đơn, thanh toán, theo dõi đơn và nhận hàng.",
};

/** /huong-dan-dat-hang/ — illustrated 5-step guide + the detailed text kept from the old site. */
export default async function GuidePage() {
  const lang = await getLang();
  const ja = lang === "ja";
  const legacy = await getPageBySlug("huong-dan-dat-hang");
  return (
    <SiteChrome>
      <PageBand
        title={ja ? "お買い物ガイド" : "Hướng dẫn mua hàng"}
        crumbs={[{ label: ja ? "お買い物ガイド" : "Hướng dẫn mua hàng" }]}
        description={ja ? "日本国内の商品を、5つのステップで簡単にご注文いただけます。" : "Mua hàng Nhật nội địa tại LienStore chỉ với 5 bước, có bill mua hàng cho từng đơn."}
      />
      <FullWidthShell>
        <div className="mx-auto max-w-[1000px]">
          <div className="grid items-start gap-8 md:grid-cols-[1fr_1.1fr]">
            <GuideSteps lang={lang} />
            <GuideDetails lang={lang} />
          </div>
          <div className="mt-8 rounded-md border border-lien-line bg-lien-cream p-5 text-[14px] leading-6 text-lien-text">
            {ja ? (
              <>
                ご不明な点は <a href="https://zalo.me/0964839769" className="font-semibold text-lien-blue">Zalo 0964 839 769</a> までお気軽にご連絡ください。配送料の目安は{" "}
                <Link href="/van-chuyen/" className="font-semibold text-lien-blue">
                  配送料ページ
                </Link>
                をご覧ください。
              </>
            ) : (
              <>
                Cần hỗ trợ? Nhắn <a href="https://zalo.me/0964839769" className="font-semibold text-lien-blue">Zalo 0964 839 769</a>. Bảng phí vận chuyển xem tại{" "}
                <Link href="/van-chuyen/" className="font-semibold text-lien-blue">
                  Chi phí vận chuyển
                </Link>
                .
              </>
            )}
          </div>
          {legacy && !ja ? (
            <details className="mt-8 rounded-md border border-lien-line bg-white">
              <summary className="cursor-pointer px-5 py-3 text-[15px] font-bold text-lien-heading select-none">Hướng dẫn chi tiết từng bước trên website</summary>
              <div className="lien-prose border-t border-lien-line px-5 py-4 text-[15px] leading-7" dangerouslySetInnerHTML={{ __html: legacy.content }} />
            </details>
          ) : null}
        </div>
      </FullWidthShell>
    </SiteChrome>
  );
}
