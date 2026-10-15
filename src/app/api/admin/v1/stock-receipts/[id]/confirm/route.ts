import { docRoutes } from "@/lib/scan-doc-routes";

export const dynamic = "force-dynamic";

/** POST { version } — apply to stock in one transaction; calling again returns the stored result. */
export const POST = docRoutes("receive").confirm;
