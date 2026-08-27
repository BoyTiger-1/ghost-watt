// Optional live-data providers.
//
// Ghost Watt works completely offline: the static tables in grid.ts are a decent
// answer for every building in the US. These providers make the answer better when
// a key is available, and the app is designed so that a missing key degrades to the
// static table rather than to an error.
//
// Every one of these is free to obtain. None are required. All are called
// server-side so keys never reach the browser.
//
//   EIA_API_KEY            https://www.eia.gov/opendata/register.php
//   NREL_API_KEY           https://api.data.gov/signup/      (DEMO_KEY works too)
//   OPENWEATHER_API_KEY    https://openweathermap.org/api
//   ELECTRICITY_MAPS_KEY   optional override, no longer free
//
// See .env.example for the full list and what each one buys you.

import { regionOrDefault } from "./grid";
import {
  BA_BY_CODE,
  BA_BY_STATE,
  LOOKBACK_HOURS,
  cleanestHour,
  dirtiestHour,
  summarizeMix,
  type HourlyMix,
  type RawFuelRow,
} from "./balancing";

export type ProviderStatus = "live" | "static" | "error";

export interface RateLookup {
  status: ProviderStatus;
  ratePerKwh: number;
  /** Where the figure came from, shown in the UI. */
  source: string;
  utilityName?: string;
  note?: string;
}

export interface CarbonLookup {
  status: ProviderStatus;
  co2PerKwh: number;
  source: string;
  /** Share of generation currently from carbon-free sources, 0-1. */
  cleanShare?: number;
  zone?: string;
  note?: string;
  /** Hourly history, newest first, when the EIA path was used. */
  mix?: HourlyMix[];
  /** Best and worst hours in the window, for load-shifting advice. */
  best?: { period: string; co2PerKwh: number };
  worst?: { period: string; co2PerKwh: number };
  /** Balancing authority the figure describes. */
  authority?: { code: string; name: string };
}

const TIMEOUT_MS = 12000;

async function getJson(
  url: string,
  headers: Record<string, string> = {},
  timeoutMs = TIMEOUT_MS,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers, signal: controller.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ---- electricity price --------------------------------------------------

/**
 * Average commercial retail price for a state, from the EIA open-data API.
 * Falls back to the static state table when no key is configured.
 */
export async function lookupRate(stateCode: string): Promise<RateLookup> {
  const fallback = regionOrDefault(stateCode);
  const key = process.env.EIA_API_KEY;

  if (!key) {
    return {
      status: "static",
      ratePerKwh: fallback.ratePerKwh,
      source: `State average for ${fallback.name}`,
      note: "Set EIA_API_KEY for the current published figure.",
    };
  }

  try {
    const url =
      `https://api.eia.gov/v2/electricity/retail-sales/data/?api_key=${key}` +
      `&frequency=monthly&data[0]=price&facets[stateid][]=${stateCode}` +
      `&facets[sectorid][]=COM&sort[0][column]=period&sort[0][direction]=desc&length=1`;

    const json = (await getJson(url)) as {
      response?: { data?: { price?: number; period?: string }[] };
    };
    const row = json.response?.data?.[0];
    if (!row?.price) throw new Error("no data");

    return {
      status: "live",
      // EIA reports cents per kWh.
      ratePerKwh: row.price / 100,
      source: `EIA commercial retail price, ${fallback.name} (${row.period ?? "latest"})`,
    };
  } catch (err) {
    return {
      status: "error",
      ratePerKwh: fallback.ratePerKwh,
      source: `State average for ${fallback.name}`,
      note: `EIA lookup failed (${err instanceof Error ? err.message : "unknown"}). Using the static table.`,
    };
  }
}

/**
 * The specific utility serving a location, and its commercial rate, from NREL.
 * More precise than a state average - a school served by a municipal utility can
 * pay half what the state average suggests.
 *
 * NREL is fronted by api.data.gov, which accepts the literal string DEMO_KEY with
 * no signup at all. It is rate-limited to a handful of calls an hour per IP, which
 * is useless for a deployment and perfectly fine for someone trying the app once.
 * So an unkeyed install still gets the feature, just slowly.
 */
export async function lookupUtility(lat: number, lon: number): Promise<RateLookup> {
  const key = process.env.NREL_API_KEY?.trim() || "DEMO_KEY";
  const demo = key === "DEMO_KEY";

  try {
    const url =
      `https://developer.nrel.gov/api/utility_rates/v3.json?api_key=${key}` +
      `&lat=${lat}&lon=${lon}`;
    const json = (await getJson(url)) as {
      outputs?: { commercial?: number; utility_name?: string };
      errors?: string[];
    };
    const out = json.outputs;
    if (!out?.commercial) throw new Error(json.errors?.[0] ?? "no rate returned");

    return {
      status: "live",
      ratePerKwh: out.commercial,
      utilityName: out.utility_name,
      source: `NREL utility rates${out.utility_name ? ` - ${out.utility_name}` : ""}`,
      note: demo
        ? "Using the shared DEMO_KEY. Set NREL_API_KEY for a rate limit you do not share with the internet."
        : undefined,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return {
      status: "error",
      ratePerKwh: 0,
      source: "Utility lookup unavailable",
      note:
        demo && /HTTP 429/.test(message)
          ? "The shared DEMO_KEY is rate-limited right now. A free key at api.data.gov removes this."
          : `${message}. Falling back to the state average.`,
    };
  }
}

// ---- grid carbon intensity ---------------------------------------------

/**
 * Live grid carbon intensity.
 *
 * This is the one that makes people sit up: the same projector left on overnight
 * emits roughly twice as much when the wind has dropped as it does when it has
 * not. A live number turns "turn it off" into "turn it off now".
 *
 * This used to be an Electricity Maps call. Their free tier is gone, so the
 * primary path is now EIA-930 - the hourly grid monitor - which publishes
 * generation by fuel type per balancing authority and is free with the same EIA
 * key the price lookup already uses. Multiplying that mix by published per-fuel
 * emission factors gives the same figure from public data.
 *
 * That turned out to be the better source anyway: it returns the whole 24-hour
 * shape, not just the current value, so the app can say which hour to shift a
 * load *to* rather than only how bad the current one is.
 *
 * Electricity Maps is kept as an override for anyone who does hold a key.
 */
export async function lookupCarbon(zone: string): Promise<CarbonLookup> {
  const stateCode = zone.startsWith("US-") ? zone.slice(3) : zone;
  const fallback = regionOrDefault(stateCode);

  const emKey = process.env.ELECTRICITY_MAPS_KEY?.trim();
  if (emKey) {
    const live = await viaElectricityMaps(zone, emKey);
    if (live) return live;
    // Fall through to EIA rather than erroring out.
  }

  const eiaKey = process.env.EIA_API_KEY?.trim();
  const ba = BA_BY_STATE[stateCode.toUpperCase()];

  if (!eiaKey || !ba) {
    return {
      status: "static",
      co2PerKwh: fallback.co2PerKwh,
      source: `eGRID-derived average for ${fallback.name}`,
      note: eiaKey
        ? "No hourly grid feed covers this region. Using the annual average."
        : "Set EIA_API_KEY for live hourly grid intensity.",
    };
  }

  try {
    const start = new Date(Date.now() - LOOKBACK_HOURS * 3600_000)
      .toISOString()
      .slice(0, 13);
    const url =
      `https://api.eia.gov/v2/electricity/rto/fuel-type-data/data/?api_key=${eiaKey}` +
      `&frequency=hourly&data[0]=value&facets[respondent][]=${ba}` +
      `&start=${start}&sort[0][column]=period&sort[0][direction]=desc&length=400`;

    const json = (await getJson(url, {}, 20000)) as {
      response?: { data?: RawFuelRow[] };
    };
    const mix = summarizeMix(json.response?.data ?? []);
    const latest = mix[0];
    if (!latest) throw new Error("no hourly data returned");

    const best = cleanestHour(mix);
    const worst = dirtiestHour(mix);
    const authority = BA_BY_CODE[ba] ?? { code: ba, name: ba };

    return {
      status: "live",
      co2PerKwh: latest.co2PerKwh,
      cleanShare: latest.cleanShare,
      zone: ba,
      authority,
      source: `EIA hourly grid monitor - ${authority.name} (${latest.period}Z)`,
      mix,
      best: best ? { period: best.period, co2PerKwh: best.co2PerKwh } : undefined,
      worst: worst ? { period: worst.period, co2PerKwh: worst.co2PerKwh } : undefined,
    };
  } catch (err) {
    return {
      status: "error",
      co2PerKwh: fallback.co2PerKwh,
      source: `eGRID-derived average for ${fallback.name}`,
      note: `Hourly grid lookup failed (${err instanceof Error ? err.message : "unknown"}). Using the static table.`,
    };
  }
}

/** Electricity Maps, for the minority who still have a key. Null on any failure. */
async function viaElectricityMaps(zone: string, key: string): Promise<CarbonLookup | null> {
  try {
    const url = `https://api.electricitymap.org/v3/carbon-intensity/latest?zone=${encodeURIComponent(zone)}`;
    const json = (await getJson(url, { "auth-token": key })) as {
      carbonIntensity?: number;
      zone?: string;
    };
    if (typeof json.carbonIntensity !== "number") return null;
    return {
      status: "live",
      // Electricity Maps reports gCO2eq/kWh.
      co2PerKwh: json.carbonIntensity / 1000,
      zone: json.zone ?? zone,
      source: `Electricity Maps live intensity, ${json.zone ?? zone}`,
    };
  } catch {
    return null;
  }
}

// ---- weather / degree days ---------------------------------------------

export interface WeatherLookup {
  status: ProviderStatus;
  /** Current outdoor temperature, degrees F. */
  tempF?: number;
  feelsLikeF?: number;
  humidity?: number;
  conditions?: string;
  place?: string;
  /** Heating degree days accumulated today, base 65F. */
  hdd?: number;
  /** Cooling degree days accumulated today, base 65F. */
  cdd?: number;
  /**
   * What the weather implies about HVAC findings, in plain words.
   * A space heater in July is an anomaly; the same heater in January is a habit.
   */
  hvacVerdict?: "heating" | "cooling" | "neither";
  source: string;
  note?: string;
}

/**
 * Outdoor conditions, used to sanity-check HVAC and space-heater findings.
 */
export async function lookupWeather(lat: number, lon: number): Promise<WeatherLookup> {
  const key = process.env.OPENWEATHER_API_KEY?.trim();
  if (!key) {
    return {
      status: "static",
      source: "No weather provider configured",
      note: "Set OPENWEATHER_API_KEY to weight HVAC findings by outdoor conditions.",
    };
  }

  try {
    const url =
      `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}` +
      `&units=imperial&appid=${key}`;
    const json = (await getJson(url)) as {
      main?: { temp?: number; feels_like?: number; humidity?: number };
      weather?: { description?: string }[];
      name?: string;
    };
    const tempF = json.main?.temp;
    if (typeof tempF !== "number") throw new Error("no temperature returned");

    const hdd = Math.max(0, 65 - tempF);
    const cdd = Math.max(0, tempF - 65);

    return {
      status: "live",
      tempF,
      feelsLikeF: json.main?.feels_like,
      humidity: json.main?.humidity,
      conditions: json.weather?.[0]?.description,
      place: json.name,
      hdd,
      cdd,
      hvacVerdict: hdd > 5 ? "heating" : cdd > 5 ? "cooling" : "neither",
      source: `OpenWeather${json.name ? ` - ${json.name}` : ""}`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return {
      status: "error",
      source: "Weather lookup failed",
      // A brand-new OpenWeather key 401s for a while after signup. That reads as
      // "you typed it wrong", which sends people off to regenerate a key that was
      // fine, so it is worth naming the real cause.
      note: /HTTP 401/.test(message)
        ? "OpenWeather rejected the key. New keys take up to a couple of hours to activate after signup - if it was just created, this should clear on its own."
        : message,
    };
  }
}

// ---- key inventory ------------------------------------------------------

export interface KeyInfo {
  env: string;
  label: string;
  configured: boolean;
  buys: string;
  signup: string;
  required: boolean;
  /** True when the feature still works without the key, just less well. */
  optionalNote?: string;
}

/** What is configured on this server, for the settings page. Never returns key values. */
export function keyInventory(): KeyInfo[] {
  return [
    {
      env: "EIA_API_KEY",
      label: "EIA open data",
      configured: Boolean(process.env.EIA_API_KEY?.trim()),
      buys:
        "Current published electricity prices per state, and the hourly grid fuel mix " +
        "that live carbon intensity is computed from. One key, both features.",
      signup: "https://www.eia.gov/opendata/register.php",
      required: false,
    },
    {
      env: "NREL_API_KEY",
      label: "NREL utility rates",
      configured: Boolean(process.env.NREL_API_KEY?.trim()),
      buys: "The actual utility serving an address and its commercial rate.",
      signup: "https://api.data.gov/signup/",
      required: false,
      optionalNote: "Works unkeyed via the shared DEMO_KEY, at a much lower rate limit.",
    },
    {
      env: "OPENWEATHER_API_KEY",
      label: "OpenWeather",
      configured: Boolean(process.env.OPENWEATHER_API_KEY?.trim()),
      buys: "Outdoor conditions and degree days to weight HVAC and heater findings.",
      signup: "https://openweathermap.org/api",
      required: false,
    },
    {
      env: "UPSTASH_REDIS_REST_URL",
      label: "Upstash Redis",
      configured: Boolean(
        (process.env.UPSTASH_REDIS_REST_URL?.trim() || process.env.KV_REST_API_URL?.trim()) &&
          (process.env.UPSTASH_REDIS_REST_TOKEN?.trim() || process.env.KV_REST_API_TOKEN?.trim()),
      ),
      buys:
        "Class mode across more than one machine: thirty phones scanning thirty " +
        "corridors into one live building map.",
      signup: "https://console.upstash.com/",
      required: false,
      optionalNote:
        "Needs the matching UPSTASH_REDIS_REST_TOKEN. Vercel KV's KV_REST_API_* " +
        "variables are accepted instead. Without it, sessions live in server memory - " +
        "fine on a laptop, unreliable on a multi-instance deployment.",
    },
    {
      env: "ELECTRICITY_MAPS_KEY",
      label: "Electricity Maps",
      configured: Boolean(process.env.ELECTRICITY_MAPS_KEY?.trim()),
      buys:
        "Optional override for grid carbon intensity. Not needed - the EIA key above " +
        "already provides this, and Electricity Maps no longer has a free tier.",
      signup: "https://portal.electricitymaps.com/",
      required: false,
      optionalNote: "Superseded by EIA-930. Leave blank.",
    },
  ];
}
