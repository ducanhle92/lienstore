import { apiRoute } from "@/lib/api-http";
import { pickableOrders } from "@/lib/scan-docs";

export const dynamic = "force-dynamic";

/** GET — orders ready to leave Kho VN (paid / COD, every unit at the shop, not delivering yet). */
export const GET = apiRoute({ scope: "inventory:read" }, async () => ({ data: pickableOrders() }));
