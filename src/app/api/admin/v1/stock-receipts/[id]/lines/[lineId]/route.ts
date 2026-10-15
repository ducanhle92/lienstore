import { docRoutes } from "@/lib/scan-doc-routes";

export const dynamic = "force-dynamic";

const r = docRoutes("receive");
/** PATCH { rev, qty?, expiry?, unitCostJpy?, billCode?, recount?, acceptDrift? } · DELETE */
export const PATCH = r.updateLine;
export const DELETE = r.removeLine;
