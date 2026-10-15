import { docRoutes } from "@/lib/scan-doc-routes";

export const dynamic = "force-dynamic";

/** POST { productId } — a line without scanning (count: in scope but not counted yet). */
export const POST = docRoutes("pick").addLine;
