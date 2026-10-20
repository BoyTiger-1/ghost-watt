import { NextResponse } from "next/server";
import { REGION_BY_CODE, RATE_TABLE_SOURCE, regionOrDefault, regionRate } from "@/lib/grid";
import { lookupTariff, type Sector } from "@/lib/tariff";
import { RULES, checkLimits, clientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";

/**
 * Where a photo was taken, in the terms the money depends on.
 *
 * ?lat=..&lon=..&sector=residential|commercial
 *   -> { place, state, ratePerKwh, rateSource, rateQuality, co2PerKwh, tariff? }
 *
 * The coordinates come from the photo's own EXIF or the phone's location. The
 * place name is from OpenStreetMap. The price is the serving utility's current
 * published tariff (OpenEI URDB) at the marginal rate a typical customer pays,
 * for the right sector - a home is not on a commercial rate - and the state's
 * 2026 average for that sector when no tariff is found. Carbon is the state
 * grid's. Every step degrades rather than fails.
 */
export interface LocateResult {
  place: string | null;
  state: string | null;
  country: string | null;
  sector: Sector;
  ratePerKwh: number;
  rateSource: string;
  /** How specific the price is: the serving utility, the state, or the national average. */
  rateQuality: "utility" | "state" | "national";
  co2PerKwh: number;
  utilityName?: string;
  tariff?: { name: string; since: number | null; fixedMonthly: number | null };
  /** The state average for the same sector, for comparison. */
  stateRatePerKwh: number;
  /** 5-digit US ZIP of the rounded location, for rebate lookups. */
  zip?: string | null;
}

const cache = new Map<string, LocateResult>();

export async function GET(req: Request) {
  const url = new URL(req.url);
  // Rounded to two decimals (about 1 km) before anything leaves this server:
  // enough to find the utility and the town, not the house.
  const lat = Math.round(Number(url.searchParams.get("lat")) * 100) / 100;
  const lon = Math.round(Number(url.searchParams.get("lon")) * 100) / 100;
  const sector: Sector = url.searchParams.get("sector") === "commercial" ? "commercial" : "residential";
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return NextResponse.json({ error: "Pass lat and lon." }, { status: 400 });
  }

  // ~1 km: the same building, and the same utility, whichever corner it was shot from.
  const key = `${lat.toFixed(2)},${lon.toFixed(2)},${sector}`;
  const hit = cache.get(key);
  if (hit) return NextResponse.json(hit);

  const verdict = await checkLimits([{ key: "locate:" + clientIp(req), rule: RULES.locateIp, scope: "ip" }]);
  if (!verdict.ok) return NextResponse.json({ error: "Too many lookups; try again shortly." }, { status: 429 });

  const [geo, tariff] = await Promise.all([reverseGeocode(lat, lon), lookupTariff(lat, lon, sector)]);
  const state = geo.state && REGION_BY_CODE[geo.state] ? geo.state : null;
  const region = regionOrDefault(state ?? undefined);
  const stateRate = regionRate(region, sector);

  const result: LocateResult = tariff
    ? {
        place: geo.place,
        state,
        country: geo.country ?? "US",
        sector,
        ratePerKwh: tariff.ratePerKwh,
        rateSource: `${tariff.utility} · ${tariff.name}${tariff.since ? ` (${tariff.since})` : ""} · OpenEI URDB`,
        rateQuality: "utility",
        co2PerKwh: region.co2PerKwh,
        utilityName: tariff.utility,
        tariff: { name: tariff.name, since: tariff.since, fixedMonthly: tariff.fixedMonthly },
        stateRatePerKwh: stateRate,
        zip: geo.zip ?? null,
      }
    : {
        place: geo.place,
        state,
        country: geo.country,
        sector,
        ratePerKwh: stateRate,
        rateSource: state ? `${region.name} ${sector} average · ${RATE_TABLE_SOURCE}` : `US ${sector} average · ${RATE_TABLE_SOURCE}`,
        rateQuality: state ? "state" : "national",
        co2PerKwh: region.co2PerKwh,
        stateRatePerKwh: stateRate,
        zip: geo.zip ?? null,
      };

  if (cache.size > 2000) cache.clear();
  cache.set(key, result);
  return NextResponse.json(result);
}

async function reverseGeocode(lat: number, lon: number): Promise<{ place: string | null; state: string | null; country: string | null; zip?: string | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=16&addressdetails=1&lat=${lat}&lon=${lon}`,
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
    // A US ZIP, for rebate lookups. Only the 5-digit form, never a street address.
    const zip = country === "US" && /^\d{5}/.test(a.postcode ?? "") ? a.postcode!.slice(0, 5) : null;
    return { place, state, country, zip };
  } catch {
    return { place: null, state: null, country: null };
  } finally {
    clearTimeout(timer);
  }
}
