import { NextResponse } from "next/server";
import { RULES, checkLimits, clientIp } from "@/lib/ratelimit";
import { pointInPolygon, polygonArea, type Footprint } from "@/lib/campus";

export const runtime = "nodejs";
export const maxDuration = 30;

const UA = "GhostWatt/1.0 (school energy audit; github.com/BoyTiger-1/ghost-watt)";
/** Public Overpass servers, tried in turn: free and often busy, so none is relied on. */
const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
const NOMINATIM = "https://nominatim.openstreetmap.org";

const cache = new Map<string, { at: number; body: unknown }>();
const CACHE_MS = 24 * 3600 * 1000;

type Candidate = Footprint & { area: number; inside: boolean; school: boolean };

async function get(url: string, init: RequestInit = {}, ms = 8000): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { ...init, headers: { "User-Agent": UA, Accept: "application/json", ...(init.headers ?? {}) }, signal: controller.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Score and shape one outline the same way whichever source it came from. */
function candidate(outline: [number, number][], tags: Record<string, string | undefined>, osmId: string, lat: number, lon: number): Candidate | null {
  if (outline.length < 4) return null;
  const kx = 111320 * Math.cos((lat * Math.PI) / 180);
  const pts = outline.map(([x, y]) => [(x - lon) * kx, (y - lat) * 110540] as [number, number]);
  const area = polygonArea(pts);
  if (area < 30 || area > 400000) return null;
  const levels = Number(tags["building:levels"]);
  return {
    outline,
    levels: Number.isFinite(levels) && levels > 0 && levels < 60 ? Math.round(levels) : null,
    name: tags.name ?? null,
    osmId,
    kind: tags.building && tags.building !== "yes" ? tags.building : (tags.amenity ?? null),
    area: Math.round(area),
    inside: pointInPolygon([0, 0], pts),
    school: /school|college|university|kindergarten/i.test(`${tags.building ?? ""} ${tags.amenity ?? ""} ${tags.name ?? ""}`),
  };
}

/** Every building within 250 m, from whichever Overpass server answers first. */
async function fromOverpass(lat: number, lon: number): Promise<Candidate[]> {
  const query = `[out:json][timeout:10];(way(around:250,${lat},${lon})["building"];);out tags geom;`;
  const ask = async (url: string) => {
    const json = (await get(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "data=" + encodeURIComponent(query) }, 6000)) as {
      elements?: { id: number; tags?: Record<string, string>; geometry?: { lat: number; lon: number }[] }[];
    };
    return (json.elements ?? [])
      .map((w) => candidate((w.geometry ?? []).map((g) => [g.lon, g.lat]), w.tags ?? {}, `way/${w.id}`, lat, lon))
      .filter((c): c is Candidate => c !== null);
  };
  // All at once, first answer wins: a busy server costs seconds, not the whole request.
  return Promise.any(OVERPASS.map(ask)).catch(() => []);
}

interface NominatimPlace {
  osm_type?: string;
  osm_id?: number;
  name?: string;
  category?: string;
  type?: string;
  geojson?: { type: string; coordinates: unknown };
  extratags?: Record<string, string>;
}

function ringOf(g: NominatimPlace["geojson"]): [number, number][] {
  if (!g) return [];
  if (g.type === "Polygon") return ((g.coordinates as number[][][])[0] ?? []).map(([x, y]) => [x, y]);
  if (g.type === "MultiPolygon") {
    const rings = (g.coordinates as number[][][][]).map((p) => p[0] ?? []);
    return (rings.sort((a, b) => b.length - a.length)[0] ?? []).map(([x, y]) => [x, y]);
  }
  return [];
}

const fromPlace = (p: NominatimPlace, lat: number, lon: number) =>
  candidate(ringOf(p.geojson), { name: p.name || undefined, building: p.category === "building" ? p.type : undefined, amenity: p.category === "amenity" ? p.type : undefined, ...(p.extratags ?? {}) }, `${p.osm_type}/${p.osm_id}`, lat, lon);

/**
 * The building at the point, and the schools around it, from Nominatim. One
 * request a second, as its usage policy asks; slower than Overpass, but it is
 * up when the Overpass servers are not.
 */
async function fromNominatim(lat: number, lon: number): Promise<Candidate[]> {
  const out: Candidate[] = [];
  try {
    const here = (await get(`${NOMINATIM}/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=18&polygon_geojson=1&extratags=1`)) as NominatimPlace;
    const c = fromPlace(here, lat, lon);
    if (c) out.push(c);
  } catch {
    // keep going
  }
  try {
    await wait(1100);
    const d = 0.006;
    const found = (await get(`${NOMINATIM}/search?format=jsonv2&q=school&viewbox=${lon - d},${lat + d},${lon + d},${lat - d}&bounded=1&limit=6`)) as NominatimPlace[];
    const ids = found.filter((f) => f.osm_type && f.osm_type !== "node").map((f) => f.osm_type![0].toUpperCase() + f.osm_id);
    if (ids.length) {
      await wait(1100);
      const shapes = (await get(`${NOMINATIM}/lookup?format=jsonv2&osm_ids=${ids.join(",")}&polygon_geojson=1&extratags=1`)) as NominatimPlace[];
      for (const s of shapes) {
        const c = fromPlace(s, lat, lon);
        if (c) out.push(c);
      }
    }
  } catch {
    // whatever we have
  }
  return out;
}

/**
 * GET /api/footprint?lat=..&lon=..
 *
 * Building outlines around a location from OpenStreetMap, best guess first:
 * the building the point is inside, then anything that is a school, then the
 * biggest nearby. Overpass gives every building around; Nominatim backs it up
 * with the one at the point and the schools nearby. Cached for a day.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const lat = Number(url.searchParams.get("lat"));
  const lon = Number(url.searchParams.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return NextResponse.json({ error: "Pass lat and lon." }, { status: 400 });
  }
  const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return NextResponse.json(hit.body);

  const verdict = await checkLimits([{ key: "footprint:" + clientIp(req), rule: RULES.footprintIp, scope: "ip" }]);
  if (!verdict.ok) return NextResponse.json({ error: "Too many lookups; try again in a few minutes." }, { status: 429 });

  const [overpass, nominatim] = await Promise.all([fromOverpass(lat, lon), fromNominatim(lat, lon)]);
  const seen = new Set<string>();
  const candidates = [...nominatim, ...overpass]
    .filter((c) => (seen.has(c.osmId) ? false : (seen.add(c.osmId), true)))
    .sort((a, b) => (b.inside ? 1e9 : 0) + (b.school ? 1e8 : 0) + b.area - ((a.inside ? 1e9 : 0) + (a.school ? 1e8 : 0) + a.area))
    .slice(0, 8);
  if (!candidates.length) {
    return NextResponse.json({ error: "OpenStreetMap had no building outlines here (or didn't answer). Try again, or use your floor plans on their own." }, { status: 502 });
  }
  const body = { candidates, attribution: "© OpenStreetMap contributors" };
  cache.set(key, { at: Date.now(), body });
  return NextResponse.json(body);
}
