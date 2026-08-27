// Rooftop solar offset.
//
// The audit answers "what are you wasting". This answers the question a facilities
// director asks straight afterwards: "and what would it take to not pay for it?"
//
// There is a real argument for putting this next to a phantom-load report rather
// than in a separate solar calculator. The waste number is the one figure in the
// building nobody disputes, because it was just measured off photographs. Sizing an
// array against *that* number - rather than against total consumption - produces a
// proposal small enough to actually happen: not "solarise the school", but "this
// wing's after-hours draw is 29 MWh, and 17 kW on the gym roof cancels it".
//
// Three tiers, same philosophy as every other provider in this app:
//
//   1. NREL PVWatts v8   most authoritative; models tilt, azimuth, array type and
//                        system losses against a TMY weather file. Needs a key,
//                        though DEMO_KEY works for a few calls an hour.
//   2. Open-Meteo        NO KEY AT ALL. Real measured shortwave irradiance for this
//                        exact coordinate over a full year, which we convert to
//                        production with an explicit, documented derate.
//   3. Stored table      Regional peak-sun-hours, so the panel still renders for a
//                        building that has not set coordinates.
//
// Tier 2 is the interesting one: it means every user gets a location-specific solar
// estimate built from measured irradiance with no signup, and the NREL key is an
// upgrade rather than a prerequisite.

export type SolarStatus = "live" | "modeled" | "static";

export interface SolarEstimate {
  status: SolarStatus;
  /** Annual AC production per kW of installed DC capacity, kWh/kW/yr. */
  kwhPerKwYear: number;
  /** Average daily peak sun hours behind the figure. */
  peakSunHours: number;
  source: string;
  note?: string;
}

/**
 * A sized proposal: the array that cancels a given annual consumption.
 * Everything here is derived arithmetic over `SolarEstimate` - no network.
 */
export interface SolarProposal {
  /** DC capacity needed to offset the target, kW. */
  systemKw: number;
  /** What that array actually produces in a year, kWh. */
  annualKwh: number;
  /** Roof area it occupies, sq ft. */
  roofSqFt: number;
  /** Roughly how many standard modules that is. */
  panelCount: number;
  /** Installed cost before incentives, USD. */
  grossCost: number;
  /** Federal credit available to the owner, USD. */
  credit: number;
  /** Cost after the federal credit, USD. */
  netCost: number;
  /** Value of the energy it displaces in year one, USD. */
  annualValue: number;
  /** Simple payback on the net cost, years. Null if the array produces nothing. */
  paybackYears: number | null;
  /** Carbon not emitted, kg/yr, at the building's grid intensity. */
  co2AvoidedKg: number;
  /** Lifetime net value over the module warranty period, USD. */
  lifetimeNet: number;
}

// ---- engineering constants ----------------------------------------------
//
// Every one of these is a stated assumption rather than a hidden constant, because
// the whole credibility argument of this app is that the arithmetic is checkable.

/** Watts DC per standard commercial module (2026 mainstream is 400-550W). */
export const WATTS_PER_PANEL = 450;

/** Sq ft per module including row spacing on a flat commercial roof. */
export const SQFT_PER_KW = 80;

/**
 * Installed cost, USD per watt DC, commercial rooftop.
 * NREL "U.S. Solar Photovoltaic System Cost Benchmark" puts commercial rooftop in
 * the $1.80-2.60/W range; the midpoint is used and surfaced in the UI.
 */
export const COST_PER_WATT = 2.2;

/**
 * Federal Investment Tax Credit, IRA 2022. 30% base.
 *
 * Worth stating plainly in a civic app: since the Inflation Reduction Act, a public
 * school district - which owes no federal tax and so historically could not use a
 * tax credit at all - can claim this as a direct cash payment under the elective-pay
 * provision (26 U.S.C. 6417). That is the single fact that turns this panel from a
 * daydream into something a district business office can act on.
 */
export const FEDERAL_CREDIT = 0.3;

/** Module performance warranty period, years. Conservative for lifetime value. */
export const WARRANTY_YEARS = 25;

/** Median annual output degradation of a modern module. */
const DEGRADATION_PER_YEAR = 0.005;

/**
 * System losses from DC nameplate to AC at the meter: soiling, wiring, inverter
 * efficiency, mismatch, availability. 14% is the PVWatts default, kept identical
 * here so tier 2 stays comparable with tier 1.
 */
const DERATE = 0.86;

/**
 * Gain from tilting an array up from horizontal toward the sun.
 *
 * Open-Meteo reports *horizontal* irradiance (GHI). A fixed array tilted near
 * latitude collects meaningfully more than that. 1.12 is a mid-latitude annual
 * average for a roughly 20 degree south-facing tilt; it understates high-latitude
 * gain and overstates it near the equator, which is an acceptable error for a
 * screening estimate and is disclosed in the UI.
 */
const TILT_GAIN = 1.12;

/** MJ/m2 -> kWh/m2. */
const MJ_TO_KWH = 1 / 3.6;

// ---- tier 3: stored regional table --------------------------------------
//
// Average daily peak sun hours by state, from NREL's national solar resource
// assessment. Used only when there are no coordinates to look anything up with.

const PSH_BY_STATE: Record<string, number> = {
  AL: 4.6, AK: 3.0, AZ: 6.6, AR: 4.7, CA: 5.6, CO: 5.6, CT: 4.3, DE: 4.5,
  DC: 4.5, FL: 5.3, GA: 4.9, HI: 5.7, ID: 5.1, IL: 4.4, IN: 4.3, IA: 4.5,
  KS: 5.2, KY: 4.4, LA: 4.8, ME: 4.2, MD: 4.5, MA: 4.3, MI: 4.1, MN: 4.4,
  MS: 4.7, MO: 4.7, MT: 4.8, NE: 5.0, NV: 6.3, NH: 4.3, NJ: 4.4, NM: 6.5,
  NY: 4.1, NC: 4.8, ND: 4.6, OH: 4.2, OK: 5.2, OR: 4.2, PA: 4.2, RI: 4.4,
  SC: 4.9, SD: 4.8, TN: 4.5, TX: 5.3, UT: 5.7, VT: 4.1, VA: 4.6, WA: 3.9,
  WV: 4.2, WI: 4.3, WY: 5.6, US: 4.7,
};

function fromPeakSunHours(psh: number, status: SolarStatus, source: string, note?: string): SolarEstimate {
  return {
    status,
    peakSunHours: psh,
    kwhPerKwYear: psh * 365 * TILT_GAIN * DERATE,
    source,
    note,
  };
}

// ---- lookup -------------------------------------------------------------

const TIMEOUT_MS = 12000;

async function getJson(url: string, timeoutMs = TIMEOUT_MS): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Tier 1. Returns null on any failure so the caller falls through quietly. */
async function viaPvWatts(lat: number, lon: number): Promise<SolarEstimate | null> {
  const key = process.env.NREL_API_KEY?.trim() || "DEMO_KEY";
  // system_capacity=1 makes the response read directly as kWh per kW per year.
  const url =
    `https://developer.nrel.gov/api/pvwatts/v8.json?api_key=${key}` +
    `&lat=${lat}&lon=${lon}&system_capacity=1&azimuth=180&tilt=20` +
    `&array_type=1&module_type=0&losses=14&timeframe=monthly`;

  try {
    const json = (await getJson(url)) as {
      outputs?: { ac_annual?: number; solrad_annual?: number };
      station_info?: { city?: string; state?: string };
      errors?: string[];
    };

    const ac = json.outputs?.ac_annual;
    const solrad = json.outputs?.solrad_annual;
    if (typeof ac !== "number" || ac <= 0) return null;

    const station = [json.station_info?.city, json.station_info?.state]
      .filter(Boolean)
      .join(", ");

    return {
      status: "live",
      kwhPerKwYear: ac,
      peakSunHours: typeof solrad === "number" ? solrad : ac / (365 * DERATE * TILT_GAIN),
      source: `NREL PVWatts v8${station ? ` - ${station} TMY` : ""}`,
      note:
        key === "DEMO_KEY"
          ? "Using NREL's shared DEMO_KEY, which is rate-limited. Add NREL_API_KEY for reliable access."
          : undefined,
    };
  } catch {
    return null;
  }
}

/** Tier 2. Measured irradiance, no key required. Null on failure. */
async function viaOpenMeteo(lat: number, lon: number): Promise<SolarEstimate | null> {
  // A full recent calendar year of measured daily shortwave radiation. Using a
  // complete year rather than a trailing window keeps seasonality balanced.
  const year = new Date().getUTCFullYear() - 1;
  const url =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}` +
    `&start_date=${year}-01-01&end_date=${year}-12-31` +
    `&daily=shortwave_radiation_sum&timezone=UTC`;

  try {
    const json = (await getJson(url, 20000)) as {
      daily?: { shortwave_radiation_sum?: (number | null)[] };
    };
    const days = (json.daily?.shortwave_radiation_sum ?? []).filter(
      (v): v is number => typeof v === "number",
    );
    // Anything much short of a year is not a usable annual figure.
    if (days.length < 300) return null;

    const totalMj = days.reduce((s, v) => s + v, 0);
    // Scale a partial year up to 365 days rather than under-reporting.
    const psh = (totalMj * MJ_TO_KWH) / days.length;

    return fromPeakSunHours(
      psh,
      "modeled",
      `Open-Meteo measured irradiance - ${days.length} days of ${year}`,
      "Computed from measured horizontal irradiance at these coordinates, with a 12% tilt gain and 14% system losses applied. No API key involved.",
    );
  } catch {
    return null;
  }
}

/**
 * Best available solar resource for a location.
 * Never throws and never returns null - the stored table is always there.
 */
export async function lookupSolar(
  lat: number | undefined,
  lon: number | undefined,
  stateCode = "US",
): Promise<SolarEstimate> {
  if (typeof lat === "number" && typeof lon === "number") {
    const live = await viaPvWatts(lat, lon);
    if (live) return live;

    const modeled = await viaOpenMeteo(lat, lon);
    if (modeled) return modeled;
  }

  const psh = PSH_BY_STATE[stateCode.toUpperCase()] ?? PSH_BY_STATE.US;
  return fromPeakSunHours(
    psh,
    "static",
    `Stored NREL solar resource average - ${stateCode.toUpperCase()}`,
    typeof lat === "number"
      ? "Both live solar lookups were unreachable; this is the state average."
      : "Set coordinates on this building for an estimate specific to its roof.",
  );
}

// ---- sizing -------------------------------------------------------------

/**
 * Size an array to cancel `targetKwh` per year, and cost it out.
 *
 * Deliberately sized against the *wasted* kWh, not total building load. That keeps
 * the proposal in the range a school can actually finance, and it keeps the claim
 * honest: this array offsets the waste this audit found, nothing more.
 */
export function sizeArray(
  estimate: SolarEstimate,
  targetKwh: number,
  ratePerKwh: number,
  co2PerKwh: number,
): SolarProposal {
  const perKw = Math.max(estimate.kwhPerKwYear, 1);
  const systemKw = targetKwh / perKw;
  const annualKwh = systemKw * perKw;

  const grossCost = systemKw * 1000 * COST_PER_WATT;
  const credit = grossCost * FEDERAL_CREDIT;
  const netCost = grossCost - credit;

  const annualValue = annualKwh * ratePerKwh;
  const paybackYears = annualValue > 0 ? netCost / annualValue : null;

  // Lifetime value with linear degradation, undiscounted and holding the rate flat.
  // Both simplifications are conservative: rates historically rise.
  let lifetimeGross = 0;
  for (let y = 0; y < WARRANTY_YEARS; y++) {
    lifetimeGross += annualValue * (1 - DEGRADATION_PER_YEAR * y);
  }

  return {
    systemKw,
    annualKwh,
    roofSqFt: systemKw * SQFT_PER_KW,
    panelCount: Math.ceil((systemKw * 1000) / WATTS_PER_PANEL),
    grossCost,
    credit,
    netCost,
    annualValue,
    paybackYears,
    co2AvoidedKg: annualKwh * co2PerKwh,
    lifetimeNet: lifetimeGross - netCost,
  };
}
