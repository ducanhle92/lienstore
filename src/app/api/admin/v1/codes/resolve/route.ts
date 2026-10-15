import { ApiError, apiRoute } from "@/lib/api-http";
import { resolveCode } from "@/lib/barcodes-db";
import { MAX_CODE_LENGTH } from "@/lib/barcodes";

export const dynamic = "force-dynamic";

/** GET /api/admin/v1/codes/resolve/?code=… — normalise + identify a scanned / typed code (read-only). */
export const GET = apiRoute({ scope: "inventory:read" }, async ({ req }) => {
  const code = req.nextUrl.searchParams.get("code");
  if (code === null) throw new ApiError(400, "BAD_REQUEST", "Thiếu tham số code.");
  if (code.length > MAX_CODE_LENGTH * 2) throw new ApiError(400, "BAD_REQUEST", "Mã quá dài.");
  return { data: resolveCode(code) };
});
