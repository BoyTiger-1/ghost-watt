import { NextResponse } from "next/server";
import { lookupRate, lookupUtility } from "@/lib/providers";
import { REGION_BY_CODE, regionOrDefault } from "@/lib/grid";
import { RULES, checkLimits, clientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";

/**
 * Where a photo was taken, in the terms the money depends on.
 *
 * ?lat=..&lon=..  ->  { place, state, ratePerKwh, rateSource, rateQuality, co2PerKwh }
 *
 * The coordinates come from the photo's own EXIF or the phone's location. The
 * place name is from OpenStreetMap; the price is the serving utility's when NREL
 * knows it, the state average otherwise; the carbon is the state grid's. Every
 * step degrades rather than fails: with no network at all this still answers
 * with the US average, and says so.
 */
export interface LocateResult {
  place: string | null;
  state: string | null;
  country: string | null;
  ratePerKwh: number;
  rateSource: string;
  /** How specific the price is: the serving utility, the state, or the national average. */
  rateQuality: "utility" | "state" | "national";
  co2PerKwh: number;
  utilityName?: string;
}

const cache = new Map<string, LocateResult>();

export async function GET(req: Request) {
  const url = new URL(req.url);
  const lat = Number(url.searchParams.get("lat"));
  const lon = Number(url.searchParams.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return NextResponse.json({ error: "Pass lat and lon." }, { status: 400 });
  }

  // ~1 km: the same building, and the same utility, whichever corner it was shot from.
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit) return NextResponse.json(hit);

  const verdict = await checkLimits([{ key: "locate:" + clientIp(req), rule: RULES.locateIp, scope: "ip" }]);
  if (!verdict.ok) return NextResponse.json({ error: "Too many lookups; try again shortly." }, { status: 429 });

  const geo = await reverseGeocode(lat, lon);
  const state = geo.state && REGION_BY_CODE[geo.state] ? geo.state : null;
  const region = regionOrDefault(state ?? undefined);

  let result: LocateResult = {
    place: geo.place,
    state,
    country: geo.country,
    ratePerKwh: region.ratePerKwh,
    rateSource: state ? `State average for ${region.name}` : "US average",
    rateQuality: state ? "state" : "national",
    co2PerKwh: region.co2PerKwh,
  };

  // The serving utility only exists for US addresses; elsewhere NREL has nothing.
  if (geo.country === "US" || state) {
    const utility = await lookupUtility(lat, lon);
    if (utility.status === "live" && utility.ratePerKwh > 0) {
      result = {
        ...result,
        ratePerKwh: utility.ratePerKwh,
        rateSource: utility.source,
        rateQuality: "utility",
        utilityName: utility.utilityName,
      };
    } else if (state) {
      const avg = await lookupRate(state);
      result = { ...result, ratePerKwh: avg.ratePerKwh, rateSource: avg.source };
    }
  }

  if (cache.size > 2000) cache.clear();
  cache.set(key, result);
  return NextResponse.json(result);
}

async function reverseGeocode(lat: number, lon: number): Promise<{ place: string | null; state: string | null; country: string | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&addressdetails=1&lat=${lat}&lon=${lon}`,
      {
        // Nominatim's usage policy requires an identifying user agent.
        headers: { "User-Agent": "GhostWatt/1.0 (school energy audit)", "Accept-Language": "en" },
        signal: controller.signal,
      },
    );
    if (!res.ok) return { place: null, state: null, country: null };
    const json = (await res.json()) as {
      address?: Record<string, string | undefined>;
    };
    const a = json.address ?? {};
    const iso = a["ISO3166-2-lvl4"] ?? "";
    const country = (a.country_code ?? "").toUpperCase() || null;
    const state = country === "US" && /^US-[A-Z]{2}$/.test(iso) ? iso.slice(3) : null;
    const town = a.city ?? a.town ?? a.village ?? a.suburb ?? a.county ?? null;
    const region = state ?? a.state ?? a.country ?? null;
    const place = [town, region].filter(Boolean).join(", ") || null;
    return { place, state, country };
  } catch {
    return { place: null, state: null, country: null };
  } finally {
    clearTimeout(timer);
  }
}
