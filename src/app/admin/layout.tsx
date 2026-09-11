import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { AdminNav } from "@/components/sites/lienstore/admin/AdminNav";
import { Flash } from "@/components/sites/lienstore/admin/ui";
import { getAdminSession, usingDefaultCredentials } from "@/lib/auth";
import { getSiteTheme } from "@/lib/db";
import { ROLE_LABELS } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const theme = await getSiteTheme();
  return { title: `Quản trị – ${theme.shopName}`, robots: { index: false, follow: false } };
}

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const [session, theme] = await Promise.all([getAdminSession(), getSiteTheme()]);

  if (!session) {
    return <div className="flex min-h-screen items-center justify-center bg-lien-page px-4 py-10">{children}</div>;
  }

  return (
    <div className="flex min-h-screen flex-col bg-lien-page md:flex-row md:items-start">
      <AdminNav permissions={session.permissions} userLabel={session.label} role={session.role} shopName={theme.shopName} />
      <main className="flex-1 px-4 py-6 md:px-8">
        <div className="mx-auto max-w-[1200px]">
          <div className="mb-3 flex justify-end">
            <Link href={session.isEnv ? "/admin/users/" : `/admin/users/${session.id}/`} title={ROLE_LABELS[session.role]} className="inline-flex items-center gap-2 rounded-md border border-[#e5e7eb] bg-white px-3 py-1.5 text-[12px] font-bold uppercase tracking-wide text-lien-heading no-underline hover:border-lien-blue hover:text-lien-blue">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-lien-blue text-[10px] text-white">{(session.label.trim()[0] ?? "A").toUpperCase()}</span>
              {session.label}
            </Link>
          </div>
          {usingDefaultCredentials ? (
            <Flash kind="warning">
              Đang dùng tài khoản mặc định <strong>admin / admin123</strong>. Đặt <code>ADMIN_USER</code>, <code>ADMIN_PASSWORD</code> và{" "}
              <code>ADMIN_SESSION_SECRET</code> trong <code>.env.local</code> trước khi đưa lên mạng.
            </Flash>
          ) : null}
          {children}
        </div>
      </main>
    </div>
  );
}
