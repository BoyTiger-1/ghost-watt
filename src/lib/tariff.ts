// The serving utility's own current tariff, from OpenEI's Utility Rate Database.
//
// A state average is a fair first answer, but two homes a mile apart can sit on
// utilities whose prices differ by half. URDB holds the published tariff sheets of
// nearly every US utility - tiers, time-of-use periods, fuel adjustments - and
// answers by coordinates, so a photo's GPS resolves to the price that building
// actually pays.
//
// Phantom load is billed at the *marginal* rate: removing a 30 W standby load
// takes kWh off the top of the bill, out of whichever tier a typical month of use
// reaches. So the rate here is the tier a typical customer's monthly use falls in,
// weighted hour by hour across the year when the tariff varies by time of day.
//
// The parsing below is pure, so it is tested without the network.

export type Sector = "residential" | "commercial";

/** One URDB tier: `max` is the cumulative kWh ceiling of the tier, absent on the last. */
interface Tier {
  max?: number;
  rate?: number;
  adj?: number;
}

export interface UrdbItem {
  name?: string;
  utility?: string;
  startdate?: number;
  enddate?: number;
  approved?: boolean;
  energyratestructure?: Tier[][];
  energyweekdayschedule?: number[][];
  energyweekendschedule?: number[][];
  fixedchargefirstmeter?: number;
  fixedchargeunits?: string;
}

export interface Tariff {
  ratePerKwh: number;
  utility: string;
  name: string;
  /** Year the tariff took effect. */
  since: number | null;
  /** Fixed customer charge, USD per month, when the tariff states it that way. */
  fixedMonthly: number | null;
  /**
   * The price in the hours the building is open, and in the hours it is empty.
   * Present only when a schedule was supplied and the tariff varies by hour -
   * on a flat tariff both equal ratePerKwh, which is why they are optional
   * rather than always written: an absent figure says "no shaping was possible"
   * where an equal one would say "shaping found no difference".
   */
  occupiedRatePerKwh?: number;
  unoccupiedRatePerKwh?: number;
  /** Dearest period over cheapest on this sheet. 1 is a flat tariff. */
  periodSpread?: number;
}

/** A typical month of use: the tier this reaches is the one phantom load comes off. */
export const TYPICAL_MONTHLY_KWH: Record<Sector, number> = {
  // EIA: the average US home used ~860 kWh a month in recent years.
  residential: 900,
  // A small commercial account or school building, a conservative middle.
  commercial: 10000,
};

// Variants that are not what an ordinary customer is on.
const SPECIAL =
  /time[- ]of[- ]use|time[- ]of[- ]day|\btou\b|pilot|closed|low[- ]income|outside|electric vehicle|\bev\b|net[- ]meter|solar|lighting|light|experimental|optional|prepa(y|id)|green|renewable|interruptible|standby|primary|transmission|large|irrigation|farm|seasonal|controlled|heat pump|water heat|space heat|all[- ]electric|unmetered|traffic|street/i;

/** How unlike the ordinary tariff a name looks: lower is more ordinary. */
export function tariffPenalty(name: string, sector: Sector): number {
  let p = 0;
  const n = name.toLowerCase();
  if (SPECIAL.test(n)) p += 10;
  if (sector === "residential") {
    if (!/residential|domestic|home|household|\brs\b|\br-?1\b/.test(n)) p += 5;
  } else {
    if (!/general|commercial|small|business|\bgs\b|\bsgs\b/.test(n)) p += 5;
    if (/demand/.test(n)) p += 2;
  }
  return p + n.length / 200; // shorter names are usually the base tariff
}

/** The tier a month of `kwh` reaches, as rate plus adjustment. */
export function marginalTierRate(tiers: Tier[], kwh: number): number | null {
  if (!tiers?.length) return null;
  const tier = tiers.find((t) => t.max === undefined || t.max === null || t.max >= kwh) ?? tiers[tiers.length - 1];
  const r = (tier.rate ?? 0) + (tier.adj ?? 0);
  return Number.isFinite(r) ? r : null;
}

/** Marginal rate averaged over every hour of the year, weekdays 5:2 with weekends. */
export function effectiveRate(item: UrdbItem, sector: Sector): number | null {
  const periods = item.energyratestructure;
  if (!periods?.length) return null;
  const kwh = TYPICAL_MONTHLY_KWH[sector];
  const rates = periods.map((tiers) => marginalTierRate(tiers, kwh));
  const wd = item.energyweekdayschedule;
  const we = item.energyweekendschedule;
  if (!wd?.length || !we?.length) return rates[0];
  let sum = 0;
  let n = 0;
  for (let m = 0; m < Math.min(12, wd.length, we.length); m++) {
    for (let h = 0; h < 24; h++) {
      const a = rates[wd[m]?.[h] ?? 0];
      const b = rates[we[m]?.[h] ?? 0];
      if (a === null || a === undefined || b === null || b === undefined) continue;
      sum += (5 * a + 2 * b) / 7;
      n++;
    }
  }
  return n ? sum / n : rates[0];
}

// ---- the price in the hours that matter ---------------------------------

/**
 * The same tariff, split into the price it charges while the building is open
 * and the price it charges while the building is empty.
 *
 * This matters more than anything else in this file. The whole point of the app
 * is the cost of a device left running through the empty hours, and on a
 * time-of-use tariff the empty hours are not billed at the all-hours average.
 * Commercial on-peak to off-peak ratios run from about 1.3:1 up to 3:1, so the
 * gap is worth tens of percent on the headline figure.
 *
 * Which way it goes cannot be assumed, and that is the reason this is computed
 * rather than estimated. It depends on where the tariff's peak window falls
 * relative to when the building is open:
 *
 *   midday peak, school shuts at four   the school is open through the peak and
 *                                       empty through the cheap hours, so its
 *                                       overnight waste costs about a fifth less
 *                                       than the average said.
 *   evening peak, same school           it is shut for the whole peak, so the
 *                                       same waste costs about a tenth more.
 *
 * An all-hours average therefore does not merely blur the figure, it gets the
 * sign of its own error wrong half the time. The URDB sheet carries a period
 * index for every hour of every month, for weekdays and weekends separately, and
 * the building's own weekly schedule says which of those hours it is open.
 * Crossing the two is the whole calculation.
 */
export interface ShapedRates {
  /** Marginal price averaged across every hour of the year, as effectiveRate gives it. */
  allHours: number;
  /** Marginal price averaged across the hours the building is open. */
  occupied: number;
  /** Marginal price averaged across the hours the building is empty. */
  unoccupied: number;
  /** Dearest period over cheapest, across the sheet: 1 for a flat tariff. */
  periodSpread: number;
  /** Share of the year the building is empty, as the schedule describes it. */
  emptyShare: number;
}

/** Whether the building is open, by weekday (0 = Sunday) and hour. */
export type OccupancyTest = (weekday: number, hour: number) => boolean;

/** Days in each month, for weighting the hourly walk. February is not 31 days long. */
const MONTH_DAYS = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
/** Weekdays and weekend days in an average week. */
const WEEKDAYS = 5;
const WEEKEND_DAYS = 2;

export function shapedRates(item: UrdbItem, sector: Sector, occupied?: OccupancyTest): ShapedRates | null {
  const all = effectiveRate(item, sector);
  if (all === null) return null;

  const periods = item.energyratestructure;
  const kwh = TYPICAL_MONTHLY_KWH[sector];
  const rates = (periods ?? []).map((tiers) => marginalTierRate(tiers, kwh)).filter((r): r is number => r !== null);
  const periodSpread = rates.length > 1 ? Math.max(...rates) / Math.max(1e-9, Math.min(...rates)) : 1;

  const wd = item.energyweekdayschedule;
  const we = item.energyweekendschedule;
  if (!occupied || !wd?.length || !we?.length) {
    return { allHours: all, occupied: all, unoccupied: all, periodSpread, emptyShare: 0 };
  }

  let openSum = 0;
  let openHours = 0;
  let emptySum = 0;
  let emptyHours = 0;

  for (let m = 0; m < Math.min(12, wd.length, we.length); m++) {
    const days = MONTH_DAYS[m];
    for (let h = 0; h < 24; h++) {
      // A weekday hour in this month, and a weekend hour in this month, each
      // weighted by how many such days the month has.
      const weekdayRate = rates[wd[m]?.[h] ?? 0];
      const weekendRate = rates[we[m]?.[h] ?? 0];
      // Monday stands for every weekday, Sunday for every weekend day: the
      // schedule's own weekday breakdown is coarser than the tariff's anyway.
      const slots: [number | undefined, number, boolean][] = [
        [weekdayRate, (days * WEEKDAYS) / 7, occupied(1, h)],
        [weekendRate, (days * WEEKEND_DAYS) / 7, occupied(0, h)],
      ];
      for (const [rate, weight, isOpen] of slots) {
        if (rate === undefined || !Number.isFinite(rate)) continue;
        if (isOpen) {
          openSum += rate * weight;
          openHours += weight;
        } else {
          emptySum += rate * weight;
          emptyHours += weight;
        }
      }
    }
  }

  const total = openHours + emptyHours;
  return {
    allHours: all,
    // A building that is never open, or never empty, has no second price to give.
    occupied: openHours > 0 ? openSum / openHours : all,
    unoccupied: emptyHours > 0 ? emptySum / emptyHours : all,
    periodSpread,
    emptyShare: total > 0 ? emptyHours / total : 0,
  };
}

/** The ordinary, current tariff among a utility's listings, priced; or null. */
export function pickTariff(
  items: UrdbItem[],
  sector: Sector,
  nowSec = Date.now() / 1000,
  occupied?: OccupancyTest,
): Tariff | null {
  const candidates = items
    .filter((it) => it.approved !== false && it.energyratestructure?.length)
    .filter((it) => !it.enddate || it.enddate > nowSec)
    .map((it) => ({ it, rate: effectiveRate(it, sector), penalty: tariffPenalty(it.name ?? "", sector) }))
    // A rate outside this band is a parsing artefact or a units mistake in the sheet.
    .filter((c): c is typeof c & { rate: number } => c.rate !== null && c.rate >= 0.03 && c.rate <= 1)
    .sort((a, b) => a.penalty - b.penalty || (b.it.startdate ?? 0) - (a.it.startdate ?? 0));
  const best = candidates[0];
  if (!best) return null;
  const fixed = best.it.fixedchargefirstmeter;
  const shaped = shapedRates(best.it, sector, occupied);
  const round = (n: number) => Math.round(n * 10000) / 10000;
  return {
    ratePerKwh: round(best.rate),
    utility: best.it.utility ?? "Local utility",
    name: best.it.name ?? "Tariff",
    since: best.it.startdate ? new Date(best.it.startdate * 1000).getUTCFullYear() : null,
    fixedMonthly: typeof fixed === "number" && /month/i.test(best.it.fixedchargeunits ?? "$/month") ? fixed : null,
    ...(shaped
      ? {
          occupiedRatePerKwh: round(shaped.occupied),
          unoccupiedRatePerKwh: round(shaped.unoccupied),
          periodSpread: Math.round(shaped.periodSpread * 100) / 100,
        }
      : {}),
  };
}

/** Query URDB by coordinates. Any failure is a null, never a thrown error. */
export async function lookupTariff(
  lat: number,
  lon: number,
  sector: Sector,
  occupied?: OccupancyTest,
): Promise<Tariff | null> {
  const key = process.env.OPENEI_API_KEY?.trim() || process.env.NREL_API_KEY?.trim() || "DEMO_KEY";
  const url =
    `https://api.openei.org/utility_rates?version=latest&format=json&detail=full&approved=true` +
    `&orderby=startdate&direction=desc&limit=60&sector=${sector === "residential" ? "Residential" : "Commercial"}` +
    `&lat=${lat}&lon=${lon}&api_key=${encodeURIComponent(key)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as { items?: UrdbItem[] };
    return pickTariff(json.items ?? [], sector, Date.now() / 1000, occupied);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
