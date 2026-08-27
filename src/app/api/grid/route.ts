import { NextResponse } from "next/server";
import { lookupCarbon } from "@/lib/providers";

export const runtime = "nodejs";

/**
 * Grid carbon intensity for a state, plus the hourly shape behind it.
 *
 * ?zone=US-CA or ?zone=CA.
 *
 * With EIA_API_KEY set this resolves the state to its balancing authority and
 * returns the last three days of hourly fuel mix from EIA-930, so the caller can
 * show not just how dirty the grid is now but which hour to move a load to.
 * Without a key it answers with the eGRID annual average and says so.
 *
 * ?full=0 trims the hourly array off the response for callers that only want the
 * headline number - the array is ~70 entries and most callers do not need it.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const zone = (url.searchParams.get("zone") ?? "US").trim().toUpperCase();
  const full = url.searchParams.get("full") !== "0";

  const result = await lookupCarbon(zone);
  const body = full ? result : { ...result, mix: undefined };

  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
