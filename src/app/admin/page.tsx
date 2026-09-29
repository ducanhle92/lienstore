import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** /admin/ lands on ① Đơn hàng (the daily screen); Tổng quan lives at /admin/dashboard/. A denied-module bounce
 * (`?denied=`) and accounts without the orders module go to Tổng quan instead. */
export default async function AdminHome({ searchParams }: Props) {
  const session = await requireAdmin();
  const sp = await searchParams;
  const denied = Array.isArray(sp.denied) ? sp.denied[0] : sp.denied;
  if (denied) redirect(`/admin/dashboard/?denied=${encodeURIComponent(denied)}`);
  if (!session.permissions.includes("orders")) redirect("/admin/dashboard/");
  redirect("/admin/orders/");
}
