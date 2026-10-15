import { docRoutes } from "@/lib/scan-doc-routes";

export const dynamic = "force-dynamic";

/** POST { opId? } — take back the last scan (or that one). */
export const POST = docRoutes("pick").undo;
