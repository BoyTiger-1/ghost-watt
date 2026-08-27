import { NextResponse } from "next/server";
import { lookupWeather } from "@/lib/providers";

export const runtime = "nodejs";

/**
 * Outdoor conditions at the building, used to sanity-check HVAC findings.
 * A space heater found running in July is a very different conversation from one
 * found in January, and the report should be able to say so.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const lat = Number(url.searchParams.get("lat"));
  const lon = Number(url.searchParams.get("lon"));

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json(
      { status: "error", source: "No location given", note: "Pass lat and lon." },
      { status: 400 },
    );
  }

  const result = await lookupWeather(lat, lon);
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
