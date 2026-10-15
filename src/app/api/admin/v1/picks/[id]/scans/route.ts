import { docRoutes } from "@/lib/scan-doc-routes";

export const dynamic = "force-dynamic";

/** POST { code, opId, qty? } — one deliberate scan (same opId again = same result, nothing added twice). */
export const POST = docRoutes("pick").scan;
