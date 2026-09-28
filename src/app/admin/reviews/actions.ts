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

/** Tick rows › "Duyệt" / "Từ chối" / "Xoá" (same as the per-row buttons, once per ticked review). */
export async function bulkReviewsAction(formData: FormData): Promise<void> {
  await requireAdmin("reviews");
  const ids = [...new Set(formData.getAll("ids").map((v) => Number.parseInt(String(v), 10)).filter(Number.isInteger))];
  const op = String(formData.get("op") ?? "");
  if (!ids.length) back("error", "Chưa tick đánh giá nào.");
  if (op === "approved" || op === "rejected") {
    for (const id of ids) await setReviewStatus(id, op);
    revalidatePath("/", "layout");
    back("saved", op === "approved" ? `Đã duyệt ${ids.length} đánh giá — khách sẽ thấy trên trang sản phẩm.` : `Đã từ chối ${ids.length} đánh giá.`);
  }
  if (op === "delete") {
    for (const id of ids) await deleteReview(id);
    revalidatePath("/", "layout");
    back("saved", `Đã xoá ${ids.length} đánh giá.`);
  }
  back("error", "Yêu cầu không hợp lệ.");
}
