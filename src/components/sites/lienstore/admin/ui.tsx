import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { OrderStatus } from "@/types/shop";

export const ADMIN_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Chờ xử lý",
  processing: "Đang xử lý",
  completed: "Hoàn thành",
  cancelled: "Đã huỷ",
};

export const ADMIN_STATUSES: OrderStatus[] = ["pending", "processing", "completed", "cancelled"];

const STATUS_CLASS: Record<OrderStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  processing: "bg-blue-100 text-blue-800",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-gray-200 text-gray-700",
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={cn("inline-block rounded-full px-2.5 py-0.5 text-[12px] font-semibold leading-5", STATUS_CLASS[status])}>
      {ADMIN_STATUS_LABELS[status]}
    </span>
  );
}

export function ProductStatusBadge({ status, outOfStock }: { status: "publish" | "draft"; outOfStock?: boolean }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      <span
        className={cn(
          "inline-block rounded-full px-2.5 py-0.5 text-[12px] font-semibold leading-5",
          status === "publish" ? "bg-green-100 text-green-800" : "bg-gray-200 text-gray-700",
        )}
      >
        {status === "publish" ? "Đang bán" : "Bản nháp"}
      </span>
      {outOfStock ? <span className="inline-block rounded-full bg-red-100 px-2.5 py-0.5 text-[12px] font-semibold leading-5 text-red-800" title="Mẫu này không còn bán tại Nhật">Hết hàng · ngừng bán</span> : null}
    </span>
  );
}

export const btnPrimary =
  "inline-flex items-center gap-2 rounded-md bg-lien-blue px-4 py-2 text-[14px] font-medium leading-5 text-white no-underline hover:bg-lien-blue-hover disabled:cursor-not-allowed disabled:opacity-50";
export const btnSecondary =
  "inline-flex items-center gap-2 rounded-md border border-[#d1d5db] bg-white px-4 py-2 text-[14px] font-medium leading-5 text-lien-text no-underline hover:bg-[#f3f4f6]";
export const btnDanger =
  "inline-flex items-center gap-2 rounded-md bg-lien-heart px-4 py-2 text-[14px] font-medium leading-5 text-white no-underline hover:bg-[#c41b12] disabled:opacity-50";
export const adminInput =
  "block w-full rounded-md border border-[#d1d5db] bg-white px-3 py-2 text-[14px] leading-6 text-lien-text outline-none focus:border-lien-blue focus:ring-2 focus:ring-lien-blue/20";
export const adminLabel = "mb-1 block text-[13px] font-semibold leading-5 text-[#374151]";

export function Card({ children, className, title, actions }: { children: ReactNode; className?: string; title?: string; actions?: ReactNode }) {
  return (
    <section className={cn("rounded-lg border border-[#e5e7eb] bg-white shadow-sm", className)}>
      {title || actions ? (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5e7eb] px-5 py-3">
          {title ? <h2 className="text-[15px] font-semibold leading-6 text-lien-heading">{title}</h2> : <span />}
          {actions}
        </header>
      ) : null}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions, back }: { title: string; subtitle?: string; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {back ? (
          <Link href={back.href} className="mb-1 inline-block text-[13px] text-lien-blue hover:underline">
            ← {back.label}
          </Link>
        ) : null}
        <h1 className="font-oswald text-[28px] font-normal leading-9 text-lien-heading">{title}</h1>
        {subtitle ? <p className="mt-1 text-[14px] leading-5 text-lien-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Flash({ kind = "success", children }: { kind?: "success" | "error" | "warning"; children: ReactNode }) {
  const cls = {
    success: "border-green-200 bg-green-50 text-green-800",
    error: "border-red-200 bg-red-50 text-red-800",
    warning: "border-amber-200 bg-amber-50 text-amber-800",
  }[kind];
  return <div className={cn("mb-5 rounded-md border px-4 py-3 text-[14px] leading-5", cls)}>{children}</div>;
}

export const tableClass = "w-full border-collapse text-left text-[14px] leading-5 text-lien-text";
export const thClass = "border-b border-[#e5e7eb] bg-[#f9fafb] px-4 py-2.5 text-[12px] font-semibold uppercase tracking-wide text-[#6b7280]";
export const tdClass = "border-b border-[#f0f0f0] px-4 py-3 align-middle";
