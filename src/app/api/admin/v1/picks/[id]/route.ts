import { docRoutes } from "@/lib/scan-doc-routes";

export const dynamic = "force-dynamic";

/** GET one document with its lines, version and what still blocks confirming. */
export const GET = docRoutes("pick").get;
