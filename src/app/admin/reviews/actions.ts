"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { deleteReview, setReviewStatus } from "@/lib/db";

const PAGE = "/admin/reviews/";
const back = (key: "saved" | "error", msg: string): never => redirect(`${PAGE}?${key}=${encodeURIComponent(msg)}`);

export async function reviewStatusAction(formData: FormData): Promise<void> {
  await requireAdmin("reviews");
  const id = Number.parseInt(String(formData.get("id") ?? ""), 10);
  const status = String(formData.get("status") ?? "");
  if (!Number.isInteger(id) || (status !== "approved" && status !== "rejected" && status !== "pending")) back("error", "Yêu cầu không hợp lệ.");
  await setReviewStatus(id, status as "approved" | "rejected" | "pending");
  revalidatePath("/", "layout");
  back("saved", status === "approved" ? "Đã duyệt đánh giá — khách sẽ thấy trên trang sản phẩm." : status === "rejected" ? "Đã từ chối đánh giá." : "Đã chuyển về chờ duyệt.");
}

export async function deleteReviewAction(formData: FormData): Promise<void> {
  await requireAdmin("reviews");
  const id = Number.parseInt(String(formData.get("id") ?? ""), 10);
  if (!Number.isInteger(id)) back("error", "Yêu cầu không hợp lệ.");
  await deleteReview(id);
  revalidatePath("/", "layout");
  back("saved", "Đã xoá đánh giá.");
}
