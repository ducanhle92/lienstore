import { NextResponse } from "next/server";
import { getSearchSuggestions } from "@/lib/search-suggest";

export const dynamic = "force-dynamic";

/** GET /api/search/suggest — trending search terms + featured brands for the header search dropdown. */
export async function GET() {
  const data = await getSearchSuggestions();
  return NextResponse.json(data, { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=600" } });
}
