import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { ScanApp } from "@/components/sites/lienstore/admin/scan/ScanApp";
import { getAdminSession } from "@/lib/auth";
import { allowedWarehouses } from "@/lib/scan-access";

export const dynamic = "force-dynamic";

// own manifest: "Add to home screen" from here opens the scanner, not the shop
export const metadata: Metadata = { title: "Quét mã", manifest: "/api/scan-manifest/", appleWebApp: { capable: true, title: "Quét mã", statusBarStyle: "default" } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

/** Admin › Vận hành › Quét mã — phone screen for lookup, receiving, stock counts and picking (docs/SCANNING.md). */
export default async function ScanPage() {
  const s = await getAdminSession();
  if (!s) redirect("/admin/login/");
  const canLookup = ["inventory", "products", "orders", "delivery", "kho_jp", "kho_vn"].some((m) => s.permissions.includes(m));
  if (!canLookup) redirect("/admin/?denied=inventory");
  return (
    <ScanApp
      warehouses={allowedWarehouses(s.permissions)}
      canPick={s.permissions.includes("delivery")}
      canPack={s.permissions.includes("packing")}
      canLink={s.permissions.includes("products")}
      seeCost={s.permissions.includes("see_cost")}
      userLabel={s.label}
    />
  );
}
