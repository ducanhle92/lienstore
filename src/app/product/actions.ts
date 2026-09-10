"use server";

import { revalidatePath } from "next/cache";
import { getCurrentCustomer } from "@/lib/customer-auth";
import { addReview, getProductById, hasPendingReview } from "@/lib/db";

export type ReviewFormState = { ok: true } | { error: string } | null;

/** Signed-in customers post a star rating + comment; it is shown after an admin approves it. */
export async function submitReviewAction(_prev: ReviewFormState, formData: FormData): Promise<ReviewFormState> {
  const me = await getCurrentCustomer();
  if (!me) return { error: "Vui lòng đăng nhập để viết đánh giá." };
  const productId = Number.parseInt(String(formData.get("productId") ?? ""), 10);
  const rating = Number.parseInt(String(formData.get("rating") ?? ""), 10);
  const comment = String(formData.get("comment") ?? "").trim();
  if (!Number.isInteger(productId) || !(await getProductById(productId))) return { error: "Không tìm thấy sản phẩm." };
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { error: "Vui lòng chọn số sao đánh giá." };
  if (comment.length < 5) return { error: "Nhận xét quá ngắn." };
  if (comment.length > 2000) return { error: "Nhận xét tối đa 2000 ký tự." };
  if (await hasPendingReview(productId, me.id)) return { error: "Bạn đã gửi một đánh giá cho sản phẩm này, đang chờ duyệt." };
  const author = me.username || [me.firstName, me.lastName].filter(Boolean).join(" ") || me.email.split("@")[0];
  await addReview({ productId, customerId: me.id, author, rating, comment });
  revalidatePath("/admin/reviews/");
  return { ok: true };
}
