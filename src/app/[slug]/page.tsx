import Image from "next/image";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumb } from "@/components/sites/lienstore/shop/Breadcrumb";
import { StoreSidebar } from "@/components/sites/lienstore/shop/cart/StoreSidebar";
import { PostCommentForm } from "@/components/sites/lienstore/shop/PostCommentForm";
import { SiteChrome, TwoColumnShell } from "@/components/sites/lienstore/shop/SiteChrome";
import { getPageBySlug, getPostBySlug, getPosts } from "@/lib/db";
import { formatDate } from "@/lib/format";

interface Props {
  params: Promise<{ slug: string }>;
}

/**
 * WordPress-style root-level pages and posts (e.g. /lien-he/, /gioi-thieu-ve-lienstore/,
 * /cach-uong-ket-hop-dhc-vitamin-c-va-dhc-rau-cu-hieu-qua-nhat/). Static routes such as /shop
 * or /cart take precedence over this dynamic segment.
 */
async function resolve(slug: string) {
  const page = await getPageBySlug(slug);
  if (page) return { kind: "page" as const, entry: page };
  const post = await getPostBySlug(slug);
  if (post) return { kind: "post" as const, entry: post };
  return null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const found = await resolve(slug);
  if (!found) return { title: "Không tìm thấy trang – LienStore" };
  return { title: `${found.entry.title} – LienStore` };
}

export default async function EntryPage({ params }: Props) {
  const { slug } = await params;
  const found = await resolve(slug);
  if (!found) notFound();
  const { kind, entry } = found;

  // Previous (older) / next (newer) post navigation, like the original theme's post-navigation.
  let prev: { slug: string; title: string } | null = null;
  let next: { slug: string; title: string } | null = null;
  if (kind === "post") {
    const posts = await getPosts(); // newest first
    const i = posts.findIndex((p) => p.slug === slug);
    prev = posts[i + 1] ?? null;
    next = i > 0 ? posts[i - 1] : null;
  }

  return (
    <SiteChrome>
      <TwoColumnShell sidebar={<StoreSidebar />}>
        <article className="entry-content">
          <Breadcrumb items={kind === "post" ? [{ label: "Góc Chia Sẻ", href: "/category/goc-chia-se/" }, { label: entry.title }] : [{ label: entry.title }]} />
          <header className="mb-6">
            {kind === "post" ? (
              <p className="entry-meta mb-2 text-[12px] uppercase leading-5 tracking-[1px] text-lien-muted">
                <span className="posted-on">
                  Posted on <time dateTime={entry.date}>{formatDate(entry.date)}</time>
                </span>{" "}
                <span className="byline">by LienStore</span>
              </p>
            ) : null}
            <h1 className="mb-2 text-[26px] font-bold leading-9 text-lien-heading">{entry.title}</h1>
          </header>
          {kind === "post" && entry.image ? <Image src={entry.image} alt="" width={1100} height={600} unoptimized className="mb-6 h-auto w-full rounded-md object-cover" /> : null}
          <div className="lien-prose" dangerouslySetInnerHTML={{ __html: entry.content }} />
          {kind === "post" ? (
            <>
              <PostCommentForm postTitle={entry.title} />
              <nav className="post-navigation mt-12 border-t border-lien-line pt-6" aria-label="Bài viết">
                <div className="nav-links flex flex-wrap justify-between gap-6">
                  {prev ? (
                    <div className="nav-previous max-w-[48%]">
                      <span className="block text-[11px] uppercase tracking-[1px] text-lien-muted">Previous</span>
                      <Link href={`/${prev.slug}/`} className="block text-[15px] leading-6 text-lien-text hover:text-lien-blue">
                        ← {prev.title}
                      </Link>
                    </div>
                  ) : (
                    <span />
                  )}
                  {next ? (
                    <div className="nav-next max-w-[48%] text-right">
                      <span className="block text-[11px] uppercase tracking-[1px] text-lien-muted">Next</span>
                      <Link href={`/${next.slug}/`} className="block text-[15px] leading-6 text-lien-text hover:text-lien-blue">
                        {next.title} →
                      </Link>
                    </div>
                  ) : null}
                </div>
              </nav>
            </>
          ) : null}
        </article>
      </TwoColumnShell>
    </SiteChrome>
  );
}
