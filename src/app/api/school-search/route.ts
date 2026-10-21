import { NextResponse } from "next/server";
import { RULES, checkLimits, clientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";

const UA = "GhostWatt/1.0 (school energy audit; github.com/BoyTiger-1/ghost-watt)";
const cache = new Map<string, { at: number; body: unknown }>();
const CACHE_MS = 7 * 24 * 3600 * 1000;

export interface SchoolResult {
  name: string;
  /** "San Francisco, California" */
  place: string;
  lat: number;
  lon: number;
  /** The school's outline, when mapped: its grounds or its main building. */
  outline: [number, number][] | null;
  /** "grounds" (the school's land) or "building". */
  kind: "grounds" | "building" | "point";
  osmId: string;
  levels: number | null;
}

interface Place {
  name?: string;
  display_name?: string;
  category?: string;
  type?: string;
  lat?: string;
  lon?: string;
  osm_type?: string;
  osm_id?: number;
  address?: Record<string, string>;
  geojson?: { type: string; coordinates: unknown };
  extratags?: Record<string, string>;
}

function ring(g: Place["geojson"]): [number, number][] | null {
  if (!g) return null;
  if (g.type === "Polygon") return ((g.coordinates as number[][][])[0] ?? []).map(([x, y]) => [x, y]);
  if (g.type === "MultiPolygon") {
    const rings = (g.coordinates as number[][][][]).map((p) => p[0] ?? []);
    return (rings.sort((a, b) => b.length - a.length)[0] ?? []).map(([x, y]) => [x, y]);
  }
  return null;
}

const EDUCATION = /^(school|college|university|kindergarten)$/;

/**
 * GET /api/school-search?q=Lincoln High School Portland
 *
 * Schools by name, from OpenStreetMap's Nominatim: each with where it is and,
 * when mapped, its outline. Schools come first; anything else that matched
 * (a named building, say) follows, so an unusual name still finds the place.
 */
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 120);
  if (q.length < 3) return NextResponse.json({ results: [] });
  const key = q.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return NextResponse.json(hit.body);

  const verdict = await checkLimits([{ key: "school-search:" + clientIp(req), rule: RULES.schoolSearchIp, scope: "ip" }]);
  if (!verdict.ok) return NextResponse.json({ error: "Too many searches; wait a minute and try again." }, { status: 429 });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(q)}&limit=12&addressdetails=1&extratags=1&polygon_geojson=1&polygon_threshold=0.00002`;
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: controller.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const places = (await res.json()) as Place[];
    const results: SchoolResult[] = places
      .filter((p) => p.lat && p.lon && (p.name || p.display_name))
      .map((p) => {
        const a = p.address ?? {};
        const town = a.city ?? a.town ?? a.village ?? a.suburb ?? a.county ?? "";
        const outline = ring(p.geojson);
        const levels = Number(p.extratags?.["building:levels"]);
        return {
          name: p.name || p.display_name!.split(",")[0],
          place: [town, a.state ?? a.country].filter(Boolean).join(", "),
          lat: Number(p.lat),
          lon: Number(p.lon),
          outline: outline && outline.length >= 4 ? outline : null,
          kind: (!outline ? "point" : p.category === "building" ? "building" : "grounds") as SchoolResult["kind"],
          osmId: `${p.osm_type}/${p.osm_id}`,
          levels: Number.isFinite(levels) && levels > 0 && levels < 60 ? Math.round(levels) : null,
          school: EDUCATION.test(p.type ?? "") || p.category === "amenity",
        };
      })
      .sort((x, y) => Number(y.school) - Number(x.school))
      .slice(0, 8)
      .map((r) => ({ name: r.name, place: r.place, lat: r.lat, lon: r.lon, outline: r.outline, kind: r.kind, osmId: r.osmId, levels: r.levels }));
    const body = { results, attribution: "© OpenStreetMap contributors" };
    cache.set(key, { at: Date.now(), body });
    return NextResponse.json(body);
  } catch {
    return NextResponse.json({ error: "School search didn't answer. Try again in a moment." }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
