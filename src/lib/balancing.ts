// Which grid a building is actually plugged into, and what that grid burns.
//
// eGRID annual averages (grid.ts) answer "what does a kWh in Ohio emit, on
// average, over a year". That is the right number for a yearly report and the
// wrong number for a decision made at 4pm on a Tuesday. The same projector left
// on overnight in Texas emits roughly twice as much when the wind has dropped as
// it does when the wind is up.
//
// EIA's hourly grid monitor (EIA-930) publishes generation by fuel type, per
// balancing authority, per hour, for free. Multiply that mix by a per-fuel
// emission factor and you get a live carbon intensity - no paid provider needed.
//
// Two things this file had to learn the hard way:
//
//   1. The EIA-930 *region* aggregate codes (CAL, TEX, MIDW...) are not valid
//      respondents on the fuel-type dataset. Passing one does not 400 - it is
//      silently ignored, the query degrades to an unfiltered scan of ~500k rows,
//      and the request times out. Only BA codes work, so states map to BAs.
//
//   2. The feed lags real time by a good half day, and the lag differs per BA.
//      Asking for "the last 8 hours" reliably returns an empty array. The window
//      below is deliberately generous.

/** Hours of history to request. The feed can lag ~18h, and lag varies by BA. */
export const LOOKBACK_HOURS = 72;

export interface BalancingAuthority {
  code: string;
  name: string;
}

export const BA_BY_CODE: Record<string, BalancingAuthority> = {
  AZPS: { code: "AZPS", name: "Arizona Public Service" },
  BPAT: { code: "BPAT", name: "Bonneville Power Administration" },
  CISO: { code: "CISO", name: "California ISO" },
  DUK: { code: "DUK", name: "Duke Energy Carolinas" },
  ERCO: { code: "ERCO", name: "ERCOT" },
  FPL: { code: "FPL", name: "Florida Power & Light" },
  ISNE: { code: "ISNE", name: "ISO New England" },
  LDWP: { code: "LDWP", name: "LA Department of Water & Power" },
  MISO: { code: "MISO", name: "Midcontinent ISO" },
  NEVP: { code: "NEVP", name: "Nevada Power" },
  NYIS: { code: "NYIS", name: "New York ISO" },
  PACE: { code: "PACE", name: "PacifiCorp East" },
  PJM: { code: "PJM", name: "PJM Interconnection" },
  PSCO: { code: "PSCO", name: "Public Service Co of Colorado" },
  SCEG: { code: "SCEG", name: "Dominion Energy South Carolina" },
  SOCO: { code: "SOCO", name: "Southern Company" },
  SWPP: { code: "SWPP", name: "Southwest Power Pool" },
  TVA: { code: "TVA", name: "Tennessee Valley Authority" },
};

/**
 * The balancing authority that carries most of a state's load.
 *
 * Several states are genuinely split (Texas has chunks outside ERCOT; upstate
 * and downstate New York behave differently). This picks the BA serving the
 * largest share, which is the right call for a school-scale estimate and is
 * stated as such in the UI rather than implied to be exact.
 */
export const BA_BY_STATE: Record<string, string> = {
  AL: "SOCO", AR: "MISO", AZ: "AZPS", CA: "CISO", CO: "PSCO",
  CT: "ISNE", DC: "PJM", DE: "PJM", FL: "FPL", GA: "SOCO",
  IA: "MISO", ID: "BPAT", IL: "PJM", IN: "MISO", KS: "SWPP",
  KY: "TVA", LA: "MISO", MA: "ISNE", MD: "PJM", ME: "ISNE",
  MI: "MISO", MN: "MISO", MO: "MISO", MS: "MISO", MT: "BPAT",
  NC: "DUK", ND: "MISO", NE: "SWPP", NH: "ISNE", NJ: "PJM",
  NM: "PACE", NV: "NEVP", NY: "NYIS", OH: "PJM", OK: "SWPP",
  OR: "BPAT", PA: "PJM", RI: "ISNE", SC: "SCEG", SD: "SWPP",
  TN: "TVA", TX: "ERCO", UT: "PACE", VA: "PJM", VT: "ISNE",
  WA: "BPAT", WI: "MISO", WV: "PJM", WY: "PACE",
};

/**
 * Combustion emission factors, kg CO2e per MWh generated.
 *
 * Derived from EPA eGRID and AP-42 heat rates for the US fleet average of each
 * fuel. These are generation-side only: they do not include upstream methane
 * leakage or construction, which is the same convention eGRID uses, so the live
 * figure stays comparable with the annual averages in grid.ts.
 *
 * Storage and interchange codes are zero because their emissions were already
 * counted when the energy was generated - charging a battery from a coal plant
 * shows up as COL, and counting the discharge again would double-count it.
 */
const FUEL_KG_PER_MWH: Record<string, number> = {
  COL: 1000, // coal
  NG: 430,   // natural gas, combined-cycle weighted
  OIL: 970,  // petroleum
  OTH: 550,  // "other" - mixed waste heat, refinery gas, non-renewable biomass
  UNK: 550,  // unknown, treated as "other" rather than as free
  GEO: 40,   // geothermal, small but not zero
  NUC: 0, WAT: 0, SUN: 0, WND: 0,
  SNB: 0, WNB: 0,                // solar / wind paired with storage
  BAT: 0, PS: 0, OES: 0, UES: 0, // storage discharge and interchange
};

/** Fuels that emit nothing at the point of generation. */
const CARBON_FREE = new Set([
  "NUC", "WAT", "SUN", "WND", "SNB", "WNB", "BAT", "PS", "OES", "UES",
]);

export interface FuelSlice {
  fuel: string;
  label: string;
  mwh: number;
  /** Share of the hour's generation, 0-1. */
  share: number;
  carbonFree: boolean;
}

export interface HourlyMix {
  /** EIA period stamp, e.g. "2026-08-22T06" (UTC). */
  period: string;
  totalMwh: number;
  /** kg CO2e per kWh for this hour. */
  co2PerKwh: number;
  /** Share of generation from carbon-free sources, 0-1. */
  cleanShare: number;
  slices: FuelSlice[];
}

export const FUEL_LABELS: Record<string, string> = {
  COL: "Coal", NG: "Natural gas", OIL: "Oil", OTH: "Other", UNK: "Unknown",
  NUC: "Nuclear", WAT: "Hydro", SUN: "Solar", WND: "Wind", GEO: "Geothermal",
  SNB: "Solar + storage", WNB: "Wind + storage", BAT: "Battery", PS: "Pumped storage",
  OES: "Other storage", UES: "Unknown storage",
};

/** Colour per fuel, so the mix bar reads the same way every time. */
export const FUEL_COLORS: Record<string, string> = {
  COL: "#6b5b4a", NG: "#c2703d", OIL: "#8a4b3a", OTH: "#6a6a72", UNK: "#4f4f57",
  NUC: "#7a6fd0", WAT: "#3d8fc2", SUN: "#e0b13a", WND: "#4fc2a8", GEO: "#b0553f",
  SNB: "#e0b13a", WNB: "#4fc2a8", BAT: "#5aa9d6", PS: "#3d8fc2",
  OES: "#5aa9d6", UES: "#5aa9d6",
};

export interface RawFuelRow {
  period: string;
  fueltype: string;
  value: string | number | null;
}

/**
 * Collapse the raw EIA rows into one entry per hour, newest first.
 *
 * Negative values are real and meaningful - a battery charging, or a pumped
 * storage plant pumping, is consuming rather than generating. They are clamped
 * to zero for the mix so that a charging battery cannot inflate the clean share
 * or, worse, produce a negative denominator and a nonsense intensity.
 */
export function summarizeMix(rows: RawFuelRow[]): HourlyMix[] {
  const byPeriod = new Map<string, Map<string, number>>();

  for (const row of rows) {
    const mwh = Number(row.value);
    if (!Number.isFinite(mwh)) continue;
    let bucket = byPeriod.get(row.period);
    if (!bucket) byPeriod.set(row.period, (bucket = new Map()));
    bucket.set(row.fueltype, (bucket.get(row.fueltype) ?? 0) + Math.max(0, mwh));
  }

  const out: HourlyMix[] = [];
  for (const [period, bucket] of byPeriod) {
    const total = [...bucket.values()].reduce((s, v) => s + v, 0);
    if (total <= 0) continue;

    let kg = 0;
    let clean = 0;
    const slices: FuelSlice[] = [];

    for (const [fuel, mwh] of bucket) {
      if (mwh <= 0) continue;
      kg += mwh * (FUEL_KG_PER_MWH[fuel] ?? 550);
      if (CARBON_FREE.has(fuel)) clean += mwh;
      slices.push({
        fuel,
        label: FUEL_LABELS[fuel] ?? fuel,
        mwh,
        share: mwh / total,
        carbonFree: CARBON_FREE.has(fuel),
      });
    }

    slices.sort((a, b) => b.mwh - a.mwh);
    out.push({
      period,
      totalMwh: total,
      // kg per MWh -> kg per kWh.
      co2PerKwh: kg / total / 1000,
      cleanShare: clean / total,
      slices,
    });
  }

  return out.sort((a, b) => (a.period < b.period ? 1 : -1));
}

/** The hour in the window with the lowest carbon intensity. */
export function cleanestHour(mix: HourlyMix[]): HourlyMix | null {
  if (!mix.length) return null;
  return mix.reduce((best, h) => (h.co2PerKwh < best.co2PerKwh ? h : best));
}

/** The hour in the window with the highest carbon intensity. */
export function dirtiestHour(mix: HourlyMix[]): HourlyMix | null {
  if (!mix.length) return null;
  return mix.reduce((worst, h) => (h.co2PerKwh > worst.co2PerKwh ? h : worst));
}

/** "2026-08-22T06" -> 6. The stamp is UTC. */
export function periodHour(period: string): number {
  const n = Number(period.slice(11, 13));
  return Number.isFinite(n) ? n : 0;
}
