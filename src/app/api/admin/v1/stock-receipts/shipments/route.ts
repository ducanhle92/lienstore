import { apiRoute } from "@/lib/api-http";
import { receivableShipments } from "@/lib/scan-docs";

export const dynamic = "force-dynamic";

/** GET — packing runs handed to the carrier that still have units to receive at Kho VN. */
export const GET = apiRoute({ scope: "inventory:read" }, async () => ({ data: receivableShipments() }));
