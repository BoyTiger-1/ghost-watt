import { firstKey } from "@/lib/keypool";
import { NextResponse } from "next/server";
import { normaliseIncentive, type Incentive } from "@/lib/rebates";
import { RULES, checkLimits, clientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";

const API = "https://api.rewiringamerica.org/api/v1";
const TIMEOUT_MS = 10000;
const ITEMS = new Set([
  "smart_thermostat", "ducted_heat_pump", "ductless_heat_pump", "heat_pump_water_heater", "heat_pump_clothes_dryer",
  "electric_stove", "electric_vehicle_charger", "efficiency_rebates", "energy_audit",
]);

interface Result {
  state: string | null;
  utility: string | null;
  incentives: Incentive[];
  /** True when the incomes asked about include income-qualified programs. */
  incomeChecked: boolean;
}

const cache = new Map<string, { at: number; result: Result }>();
const CACHE_MS = 6 * 3600 * 1000;

async function get(path: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const key = firstKey("REWIRING_AMERICA_API_KEY");
  try {
    const res = await fetch(`${API}${path}`, {
      headers: key ? { Authorization: `Bearer ${key}` } : {},
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * GET /api/rebates?zip=94110&items=heat_pump_water_heater,smart_thermostat&income=60000&size=3&owner=homeowner&utility=Pacific%20Gas
 *
 * Household incentives that apply to the fixes a scan recommends, from Rewiring
 * America. Without an income, only programs open to every household come back,
 * and the panel says so; income-qualified programs need a (rough) income.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const zip = (url.searchParams.get("zip") ?? "").trim();
  if (!/^\d{5}$/.test(zip)) return NextResponse.json({ error: "Pass a 5-digit US ZIP." }, { status: 400 });
  const items = (url.searchParams.get("items") ?? "").split(",").map((s) => s.trim()).filter((s) => ITEMS.has(s));
  const incomeRaw = Number(url.searchParams.get("income"));
  const income = Number.isFinite(incomeRaw) && incomeRaw > 0 ? Math.min(10_000_000, Math.round(incomeRaw)) : null;
  const size = Math.min(8, Math.max(1, Math.round(Number(url.searchParams.get("size")) || 1)));
  const owner = url.searchParams.get("owner") === "renter" ? "renter" : "homeowner";
  const utilityHint = (url.searchParams.get("utility") ?? "").toLowerCase().slice(0, 80);

  const key = JSON.stringify([zip, items, income, size, owner, utilityHint]);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return NextResponse.json(hit.result);

  const verdict = await checkLimits([{ key: "rebates:" + clientIp(req), rule: RULES.rebatesIp, scope: "ip" }]);
  if (!verdict.ok) return NextResponse.json({ error: "Too many lookups; try again in a few minutes." }, { status: 429 });

  try {
    // The serving utility, so its own rebates are included. Prefer the one the
    // price lookup already identified; otherwise the first listed for the ZIP.
    const u = (await get(`/utilities?zip=${zip}`).catch(() => null)) as { utilities?: Record<string, { name?: string }>; location?: { state?: string } } | null;
    const entries = Object.entries(u?.utilities ?? {});
    const match = utilityHint ? entries.find(([, v]) => (v.name ?? "").toLowerCase().split(/\W+/).some((w) => w.length > 3 && utilityHint.includes(w))) : undefined;
    const [utilityId, utility] = match ?? entries[0] ?? [null, null];

    const q = new URLSearchParams({
      zip,
      owner_status: owner,
      // No income given: a very high one, so only programs open to everyone are returned.
      household_income: String(income ?? 10_000_000),
      household_size: String(size),
    });
    if (income) q.set("tax_filing", size > 1 ? "joint" : "single");
    if (utilityId) q.set("utility", utilityId);
    for (const i of items) q.append("items", i);

    const data = (await get(`/calculator?${q}`)) as { incentives?: unknown[]; location?: { state?: string }; authorities?: Record<string, { name?: string }> };
    const incentives = (data.incentives ?? [])
      .map((i) => normaliseIncentive(i, data.authorities ?? {}))
      .filter((x): x is Incentive => x !== null)
      .sort((a, b) => b.value - a.value)
      .slice(0, 30);
    const result: Result = { state: data.location?.state ?? u?.location?.state ?? null, utility: utility?.name ?? null, incentives, incomeChecked: income !== null };
    cache.set(key, { at: Date.now(), result });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "The rebate database didn't answer. The links below still work." }, { status: 502 });
  }
}
