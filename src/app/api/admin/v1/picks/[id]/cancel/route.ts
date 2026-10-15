import { docRoutes } from "@/lib/scan-doc-routes";

export const dynamic = "force-dynamic";

/** POST — cancel a draft (nothing was applied to stock). */
export const POST = docRoutes("pick").cancel;
