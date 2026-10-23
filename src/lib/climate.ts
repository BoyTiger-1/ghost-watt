// How much of the year this building is heating, and how much it is cooling.
//
// Needed because a watt of plug load is also a watt of heat. In July that heat
// has to be pumped back out of the building, and the air conditioner bills for
// it; in January it is heat the boiler did not have to make. Costing a device
// without that term treats a school in Phoenix and one in Fargo as the same
// building, and they are not: the same monitor left on costs money twice over
// in one and nearly pays for itself in the other.
//
// Degree days are the standard way to say "how much heating or cooling weather
// does this place get". Base 65 F: every degree the day's mean temperature sits
// below 65 is a heating degree day, every degree above it is a cooling degree
// day. The table is annual, population-weighted, in the pattern of EIA's State
// Energy Data System and NOAA's 1991-2020 normals.
//
// The figures are a compiled table and should be treated as approximate until
// checked against the primary release, in the same spirit as the price and
// carbon tables in grid.ts. They are used only to weight a correction of order
// +-20%, so a few hundred degree days either way moves no headline.

/** Annual heating and cooling degree days, base 65 F, by state. */
export interface Climate {
  hdd65: number;
  cdd65: number;
}

export const CLIMATE_BY_STATE: Record<string, Climate> = {
  AL: { hdd65: 2600, cdd65: 2000 },
  AK: { hdd65: 10500, cdd65: 10 },
  AZ: { hdd65: 1500, cdd65: 3200 },
  AR: { hdd65: 3100, cdd65: 2000 },
  CA: { hdd65: 2600, cdd65: 800 },
  CO: { hdd65: 5900, cdd65: 700 },
  CT: { hdd65: 5500, cdd65: 700 },
  DE: { hdd65: 4400, cdd65: 1200 },
  DC: { hdd65: 4000, cdd65: 1500 },
  FL: { hdd65: 600, cdd65: 3500 },
  GA: { hdd65: 2500, cdd65: 2000 },
  HI: { hdd65: 0, cdd65: 3600 },
  ID: { hdd65: 5700, cdd65: 600 },
  IL: { hdd65: 5700, cdd65: 1100 },
  IN: { hdd65: 5400, cdd65: 1000 },
  IA: { hdd65: 6200, cdd65: 1000 },
  KS: { hdd65: 4900, cdd65: 1500 },
  KY: { hdd65: 4300, cdd65: 1300 },
  LA: { hdd65: 1500, cdd65: 2800 },
  ME: { hdd65: 7200, cdd65: 300 },
  MD: { hdd65: 4400, cdd65: 1300 },
  MA: { hdd65: 5600, cdd65: 700 },
  MI: { hdd65: 6400, cdd65: 700 },
  MN: { hdd65: 7700, cdd65: 800 },
  MS: { hdd65: 2100, cdd65: 2300 },
  MO: { hdd65: 4800, cdd65: 1500 },
  MT: { hdd65: 7100, cdd65: 400 },
  NE: { hdd65: 6000, cdd65: 1200 },
  NV: { hdd65: 3100, cdd65: 2000 },
  NH: { hdd65: 6900, cdd65: 500 },
  NJ: { hdd65: 4800, cdd65: 1100 },
  NM: { hdd65: 3900, cdd65: 1400 },
  NY: { hdd65: 5700, cdd65: 800 },
  NC: { hdd65: 3300, cdd65: 1600 },
  ND: { hdd65: 8500, cdd65: 600 },
  OH: { hdd65: 5500, cdd65: 900 },
  OK: { hdd65: 3300, cdd65: 2100 },
  OR: { hdd65: 4500, cdd65: 400 },
  PA: { hdd65: 5300, cdd65: 900 },
  RI: { hdd65: 5400, cdd65: 700 },
  SC: { hdd65: 2400, cdd65: 2100 },
  SD: { hdd65: 7300, cdd65: 800 },
  TN: { hdd65: 3600, cdd65: 1700 },
  TX: { hdd65: 1800, cdd65: 2900 },
  UT: { hdd65: 5300, cdd65: 1100 },
  VT: { hdd65: 7100, cdd65: 400 },
  VA: { hdd65: 3800, cdd65: 1400 },
  WA: { hdd65: 4700, cdd65: 300 },
  WV: { hdd65: 4900, cdd65: 900 },
  WI: { hdd65: 7000, cdd65: 700 },
  WY: { hdd65: 7000, cdd65: 400 },
};

/** The US population-weighted average, for a building whose state is not known. */
export const US_CLIMATE: Climate = { hdd65: 4000, cdd65: 1400 };

export function climateOf(stateCode: string | undefined): Climate | null {
  if (!stateCode) return null;
  return CLIMATE_BY_STATE[stateCode.toUpperCase()] ?? null;
}

/**
 * Degree days at which the season runs the whole year.
 *
 * Anchored on the US average, where 4,000 HDD corresponds to a heating season of
 * roughly October to April (about 58% of the year) and 1,400 CDD to a cooling
 * season of roughly May to September (about 33%). The divisors below reproduce
 * those two anchors, and the caps stop a Fargo winter or a Phoenix summer from
 * claiming more of the year than a calendar has.
 */
const HDD_FULL_SEASON = 6900;
const CDD_FULL_SEASON = 4240;
const MAX_HEATING_SHARE = 0.75;
const MAX_COOLING_SHARE = 0.6;

export interface Seasons {
  /** Share of the year the heating system is the one working, 0-1. */
  heating: number;
  /** Share of the year the cooling system is the one working, 0-1. */
  cooling: number;
  /** The rest: mild enough that neither runs. */
  neither: number;
}

/**
 * The year split into heating, cooling and neither, from degree days alone.
 *
 * Crude next to an hourly simulation, and deliberately so: this weights a
 * correction, it does not size equipment. What it has to get right is the sign
 * and the rough magnitude - that Seattle is mostly heating and Houston is mostly
 * cooling - and degree days carry that reliably.
 */
export function seasons(c: Climate): Seasons {
  let heating = Math.min(MAX_HEATING_SHARE, Math.max(0, c.hdd65) / HDD_FULL_SEASON);
  let cooling = Math.min(MAX_COOLING_SHARE, Math.max(0, c.cdd65) / CDD_FULL_SEASON);
  // Shoulder weather is both - heating at dawn, cooling by mid-afternoon - which
  // is how the two shares can overshoot the year. Normalise rather than clip, so
  // the ratio between them, which is the part that matters, is preserved.
  const total = heating + cooling;
  if (total > 1) {
    heating /= total;
    cooling /= total;
  }
  return { heating, cooling, neither: Math.max(0, 1 - heating - cooling) };
}

/** A one-line description of the climate, for the report. */
export function describeClimate(c: Climate): string {
  const s = seasons(c);
  const pct = (f: number) => `${Math.round(f * 100)}%`;
  if (s.cooling > s.heating * 1.5) return `Cooling-dominated: ${c.cdd65.toLocaleString()} cooling degree days, cooling about ${pct(s.cooling)} of the year`;
  if (s.heating > s.cooling * 1.5) return `Heating-dominated: ${c.hdd65.toLocaleString()} heating degree days, heating about ${pct(s.heating)} of the year`;
  return `Mixed: ${c.hdd65.toLocaleString()} heating and ${c.cdd65.toLocaleString()} cooling degree days`;
}
