import { docRoutes } from "@/lib/scan-doc-routes";

export const dynamic = "force-dynamic";

const r = docRoutes("pick");
/** GET list (?status=draft|confirmed|cancelled|all&warehouse=vn|jp) · POST create — see docs/SCANNING.md */
export const GET = r.list;
export const POST = r.create;
