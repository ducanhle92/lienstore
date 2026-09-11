import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { StoreSidebar } from "@/components/sites/lienstore/shop/cart/StoreSidebar";
import { SiteChrome, TwoColumnShell } from "@/components/sites/lienstore/shop/SiteChrome";
import { getPosts } from "@/lib/db";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "Góc Chia Sẻ – LienStore",
  description: "Bài viết chia sẻ kinh nghiệm dùng mỹ phẩm và thực phẩm chức năng Nhật Bản của LienStore.",
};

export default async function BlogCategoryPage() {
  const posts = await getPosts();
  return (
    <SiteChrome>
      <TwoColumnShell sidebar={<StoreSidebar />} title="Góc chia sẻ">
        <div className="space-y-6">
          {posts.map((post) => (
            <article key={post.slug} className="rounded-md border border-lien-line bg-white p-6">
              {post.image ? (
                <Link href={`/${post.slug}/`} className="mb-4 block overflow-hidden rounded-md">
                  <Image src={post.image} alt="" width={900} height={480} unoptimized className="h-auto max-h-[320px] w-full object-cover" />
                </Link>
              ) : null}
              <h2 className="mb-1 text-[20px] font-bold leading-7 text-lien-heading">
                <Link href={`/${post.slug}/`} className="hover:text-lien-blue">
                  {post.title}
                </Link>
              </h2>
              <p className="mb-3 text-[14px] leading-5 text-lien-muted">Đăng ngày {formatDate(post.date)}</p>
              <p className="mb-4 text-[16px] leading-6 text-lien-text">{post.excerpt}</p>
              <Link
                href={`/${post.slug}/`}
                className="inline-block rounded-[3px] bg-lien-blue px-4 py-[9.888px] text-[16px] font-bold leading-4 text-white hover:bg-lien-blue-hover"
              >
                Đọc tiếp
              </Link>
            </article>
          ))}
        </div>
      </TwoColumnShell>
    </SiteChrome>
  );
}
