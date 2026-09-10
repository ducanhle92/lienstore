import Link from "next/link";
import { deleteReviewAction, reviewStatusAction } from "@/app/admin/reviews/actions";
import { btnDanger, btnPrimary, btnSecondary, Card, Flash, PageHeader, tableClass, tdClass, thClass } from "@/components/sites/lienstore/admin/ui";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { StarRating } from "@/components/sites/lienstore/shop/StarRating";
import { requireAdmin } from "@/lib/auth";
import { getReviewsForAdmin } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { maskReviewer } from "@/lib/reviews";
import type { ProductReview } from "@/types/shop";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

const STATUS_LABEL: Record<ProductReview["status"], string> = { pending: "Chờ duyệt", approved: "Đã duyệt", rejected: "Từ chối" };
const STATUS_CLASS: Record<ProductReview["status"], string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-gray-200 text-gray-700",
};

function Row({ r }: { r: ProductReview }) {
  return (
    <tr>
      <td className={tdClass}>
        <span className="block text-[12px] text-lien-muted">{formatDateTime(r.createdAt)}</span>
        <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold ${STATUS_CLASS[r.status]}`}>{STATUS_LABEL[r.status]}</span>
      </td>
      <td className={tdClass}>
        <Link href={`/product/${r.productSlug}/`} target="_blank" className="font-semibold text-lien-heading hover:text-lien-blue">
          {r.productName}
        </Link>
      </td>
      <td className={tdClass}>
        <StarRating rating={r.rating} />
        <p className="m-0 mt-1 whitespace-pre-line text-[13px] leading-5">{r.comment}</p>
        <p className="m-0 mt-1 text-[12px] text-lien-muted">
          Tài khoản: <strong>{r.author}</strong> · hiển thị là <strong>{maskReviewer(r.author)}</strong>
        </p>
      </td>
      <td className={`${tdClass} whitespace-nowrap`}>
        <div className="flex flex-col gap-1.5">
          {r.status !== "approved" ? (
            <form action={reviewStatusAction}>
              <input type="hidden" name="id" value={r.id} />
              <input type="hidden" name="status" value="approved" />
              <button type="submit" className={`${btnPrimary} !px-2.5 !py-1 !text-[12px]`}>
                <Fa name="check" /> Duyệt
              </button>
            </form>
          ) : null}
          {r.status !== "rejected" ? (
            <form action={reviewStatusAction}>
              <input type="hidden" name="id" value={r.id} />
              <input type="hidden" name="status" value="rejected" />
              <button type="submit" className={`${btnSecondary} !px-2.5 !py-1 !text-[12px]`}>
                <Fa name="times" /> Từ chối
              </button>
            </form>
          ) : null}
          <form action={deleteReviewAction}>
            <input type="hidden" name="id" value={r.id} />
            <button type="submit" className={`${btnDanger} !px-2.5 !py-1 !text-[12px]`}>
              <Fa name="trash" /> Xoá
            </button>
          </form>
        </div>
      </td>
    </tr>
  );
}

export default async function AdminReviews({ searchParams }: Props) {
  await requireAdmin("reviews");
  const sp = await searchParams;
  const all = await getReviewsForAdmin();
  const pending = all.filter((r) => r.status === "pending");
  const rest = all.filter((r) => r.status !== "pending");
  const saved = first(sp.saved);
  const error = first(sp.error);
  return (
    <>
      <PageHeader title="Đánh giá sản phẩm" subtitle="Khách đăng nhập mới được viết đánh giá. Chỉ đánh giá đã duyệt mới hiện trên trang sản phẩm, với tên tài khoản che 3 ký tự sau." />
      {saved ? <Flash>{saved}</Flash> : null}
      {error ? <Flash kind="error">{error}</Flash> : null}
      <Card title={`Chờ duyệt (${pending.length})`} className="mb-6">
        {pending.length ? (
          <div className="overflow-x-auto">
            <table className={tableClass}>
              <thead>
                <tr>
                  <th className={thClass}>Ngày</th>
                  <th className={thClass}>Sản phẩm</th>
                  <th className={thClass}>Đánh giá</th>
                  <th className={thClass}></th>
                </tr>
              </thead>
              <tbody>{pending.map((r) => <Row key={r.id} r={r} />)}</tbody>
            </table>
          </div>
        ) : (
          <p className="m-0 text-[14px] text-lien-muted">Không có đánh giá nào chờ duyệt.</p>
        )}
      </Card>
      <Card title={`Đã xử lý (${rest.length})`}>
        {rest.length ? (
          <div className="overflow-x-auto">
            <table className={tableClass}>
              <thead>
                <tr>
                  <th className={thClass}>Ngày</th>
                  <th className={thClass}>Sản phẩm</th>
                  <th className={thClass}>Đánh giá</th>
                  <th className={thClass}></th>
                </tr>
              </thead>
              <tbody>{rest.map((r) => <Row key={r.id} r={r} />)}</tbody>
            </table>
          </div>
        ) : (
          <p className="m-0 text-[14px] text-lien-muted">Chưa có đánh giá nào.</p>
        )}
      </Card>
    </>
  );
}
