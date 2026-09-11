import { PostForm } from "@/components/sites/lienstore/admin/PostForm";
import { Flash, PageHeader } from "@/components/sites/lienstore/admin/ui";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function NewPost({ searchParams }: Props) {
  await requireAdmin("posts");
  const sp = await searchParams;
  return (
    <>
      <PageHeader title="Viết bài mới" back={{ href: "/admin/posts/", label: "Góc chia sẻ" }} />
      {first(sp.error) ? <Flash kind="error">{first(sp.error)}</Flash> : null}
      <PostForm />
    </>
  );
}
