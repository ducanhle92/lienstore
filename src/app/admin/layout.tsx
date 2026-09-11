import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AdminNav } from "@/components/sites/lienstore/admin/AdminNav";
import { Flash } from "@/components/sites/lienstore/admin/ui";
import { getAdminSession, usingDefaultCredentials } from "@/lib/auth";
import { getSiteTheme } from "@/lib/db";

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
    <div className="flex min-h-screen flex-col bg-lien-page md:flex-row">
      <AdminNav permissions={session.permissions} userLabel={session.label} role={session.role} shopName={theme.shopName} />
      <main className="flex-1 px-4 py-6 md:px-8">
        <div className="mx-auto max-w-[1200px]">
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
