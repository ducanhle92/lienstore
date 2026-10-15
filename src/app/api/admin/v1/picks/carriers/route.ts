import { apiRoute } from "@/lib/api-http";
import { pickCarriers } from "@/lib/scan-docs";

export const dynamic = "force-dynamic";

/** GET — carriers for the VN-domestic leg (value = method id, or "pickup"); pass one as `method` when completing a pick. */
export const GET = apiRoute({ scope: "inventory:read" }, async () => ({ data: pickCarriers() }));
