import QRCode from "qrcode";
import { redirect } from "next/navigation";
import { AutoPrint } from "@/components/sites/lienstore/admin/AutoPrint";
import { getAdminSession } from "@/lib/auth";
import { unitQrPayload } from "@/lib/barcodes";
import { getDb } from "@/lib/sqlite";
import { parseUnitCode } from "@/lib/units";
import { listUnits } from "@/lib/units-db";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/**
 * Nhãn mã từng cái (in dán lên hàng): QR `LS1:U:<code>` + the code in text (readable / typeable when the QR is damaged)
 * + product name and expiry. /print/units/?product=<id> = every unit of the product in hand; ?codes=H…,H… = those.
 * Labels 50 × 30 mm on A4 (cut) — the phone scan screen reads them in every mode.
 */
export default async function PrintUnitLabels({ searchParams }: Props) {
  const s = await getAdminSession();
  if (!s) redirect("/admin/login/");
  if (!["inventory", "kho_jp", "kho_vn", "delivery"].some((m) => s.permissions.includes(m))) redirect("/admin/?denied=inventory");
  const sp = await searchParams;
  const db = getDb();
  const productId = Number.parseInt(first(sp.product), 10);
  const codes = first(sp.codes)
    .split(/[,\s]+/)
    .map((c) => parseUnitCode(c))
    .filter((c): c is string => !!c)
    .slice(0, 500);
  const units = Number.isInteger(productId)
    ? listUnits(db, { productId, statuses: ["bought", "to_carrier_jp", "shipped_jp_vn", "at_carrier_vn", "to_shop", "at_shop"] })
    : codes.length
      ? listUnits(db, { withDelivered: true }).filter((u) => codes.includes(u.code))
      : [];
  const labels = await Promise.all(units.slice(0, 500).map(async (u) => ({ u, svg: await QRCode.toString(unitQrPayload(u.code), { type: "svg", margin: 0, errorCorrectionLevel: "M" }) })));
  return (
    <main className="bg-white p-[5mm] text-black">
      <style>{`@page { size: A4; margin: 5mm } @media print { .no-print { display: none } }`}</style>
      <div className="no-print mb-3 text-[14px]">
        {labels.length} nhãn. In khổ A4, cắt theo viền (50 × 30 mm).
      </div>
      <AutoPrint count={labels.length} />
      {labels.length ? null : <p>Không có cái nào để in (dùng ?product=&lt;id&gt; hoặc ?codes=H…,H…).</p>}
      <div className="grid grid-cols-[repeat(auto-fill,50mm)] gap-[1mm]">
        {labels.map(({ u, svg }) => (
          <div key={u.id} className="flex h-[30mm] w-[50mm] items-center gap-[2mm] overflow-hidden border border-dashed border-gray-400 p-[1.5mm] break-inside-avoid">
            <div className="h-[24mm] w-[24mm] shrink-0 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
            <div className="min-w-0 text-[7pt] leading-[1.15]">
              <div className="font-mono text-[10pt] font-bold">{u.code}</div>
              <div className="line-clamp-3">{u.productName}</div>
              {u.expiry ? <div>HSD {u.expiry}</div> : null}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
