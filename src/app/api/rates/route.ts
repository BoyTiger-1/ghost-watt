import { NextResponse } from "next/server";
import { lookupRate, lookupUtility } from "@/lib/providers";

export const runtime = "nodejs";

function stateCode(raw: string): string {
  const s = raw.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(s) ? s : "";
}

/**
 * What a kWh costs at this building.
 *
 * ?state=CA          - state commercial average (EIA when keyed, table otherwise)
 * ?lat=..&lon=..     - the specific serving utility (NREL), which is better still
 *
 * Never fails: with no keys at all it answers from the static table.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const state = stateCode(url.searchParams.get("state") ?? "");
  const lat = Number(url.searchParams.get("lat"));
  const lon = Number(url.searchParams.get("lon"));

  if (Number.isFinite(lat) && Number.isFinite(lon) && (lat !== 0 || lon !== 0)) {
    const utility = await lookupUtility(lat, lon);
    if (utility.status === "live") {
      return NextResponse.json(utility, { headers: { "Cache-Control": "no-store" } });
    }
    // Utility lookup unavailable - fall through to the state answer rather than erroring.
  }

  const result = await lookupRate(state || "US");
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
