import { NextResponse } from "next/server";
import { lookupSolar } from "@/lib/solar";

export const runtime = "nodejs";

/**
 * Rooftop solar resource for a location.
 *
 * ?lat=&lon=  preferred - gives a figure specific to this roof
 * ?state=CA   fallback when the building has no coordinates
 *
 * Returns kWh per installed kW per year. The sizing arithmetic that turns this
 * into a costed proposal runs in the browser, because it depends on the audit
 * result and the user's own rate - both of which are client-side by design.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const latRaw = url.searchParams.get("lat");
  const lonRaw = url.searchParams.get("lon");
  const state = (url.searchParams.get("state") ?? "US").trim().toUpperCase();

  const lat = latRaw === null ? undefined : Number(latRaw);
  const lon = lonRaw === null ? undefined : Number(lonRaw);

  const ok = (v: number | undefined) => typeof v === "number" && Number.isFinite(v);
  const inRange = ok(lat) && ok(lon) && Math.abs(lat!) <= 90 && Math.abs(lon!) <= 180;

  const result = await lookupSolar(
    inRange ? lat : undefined,
    inRange ? lon : undefined,
    state,
  );

  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
