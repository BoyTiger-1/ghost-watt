// How much does one unit draw, and how sure are we?
//
// The catalog gives a published band for every device class: a 24-inch LED
// monitor and a 32-inch CCFL one are both "computer monitor", 18 W and 45 W.
// A photo usually says which one it is - size, bezel, age, lamp or laser - and
// the vision model is asked to read that and name a wattage. Neither source is
// trusted alone:
//
//   catalog band   a prior: what devices of this class draw, across the market
//   AI estimate    evidence: what this particular unit looks like it draws
//   user figure    a measurement, off a nameplate or a plug-in meter
//
// The prior and the evidence are combined as two log-normal beliefs (watts are
// multiplicative: "twice as much" is the natural error, not "+20 W"), which is
// the textbook conjugate update. The posterior is tighter than either input when
// they agree and lands between them when they do not. A measurement replaces
// both. An AI figure wildly outside the class band is treated as a misreading
// and dropped, so one hallucinated "2000 W monitor" cannot move a report.
//
// The money range is then propagated by Monte Carlo rather than by adding up
// every low and every high: summing worst cases assumes every device is at the
// bottom of its band at once, which overstates the spread of a ten-device room
// several times over.

import type { DeviceCategory, DeviceState, Offender } from "./types";

/** 90% of a normal distribution lies within this many standard deviations. */
const Z90 = 1.645;
/** Spread of a vision model's wattage read, as a log-normal sigma (≈ ×/÷ 1.8 at 90%). */
export const AI_SIGMA = 0.36;
/** A measured figure still carries meter and nameplate error. */
export const MEASURED_SIGMA = 0.04;
/** AI figures further than this factor outside the class band are discarded. */
const PLAUSIBLE_FACTOR = 3;

export type WattBasis = "measured" | "ai" | "catalog";

export interface UnitWatts {
  /** Headline per-unit draw in the observed state, W. */
  mid: number;
  /** 5th / 95th percentile per-unit draw, W. */
  low: number;
  high: number;
  basis: WattBasis;
}

/** Catalog-only per-unit draw: the figure the app has always used. */
export function catalogWatts(cat: DeviceCategory, state: DeviceState): UnitWatts {
  const mid = cat.thermostatic || state === "on" ? cat.wattsOn * cat.dutyCycle : state === "standby" ? cat.wattsStandby : 0;
  if (mid <= 0) return { mid: 0, low: 0, high: 0, basis: "catalog" };
  if (cat.thermostatic || state === "on") {
    const lowOn = cat.wattsLow ?? cat.wattsOn * 0.75;
    const highOn = cat.wattsHigh ?? cat.wattsOn * 1.25;
    return { mid, low: lowOn * cat.dutyCycle, high: highOn * cat.dutyCycle, basis: "catalog" };
  }
  return { mid, low: mid * 0.6, high: mid * 1.6, basis: "catalog" };
}

/** A 90% band as a log-normal sigma. */
function sigmaOf(low: number, high: number): number {
  return low > 0 && high > low ? Math.log(high / low) / (2 * Z90) : 0.25;
}

function fromLog(mu: number, sigma: number, basis: WattBasis): UnitWatts {
  return { mid: Math.exp(mu), low: Math.exp(mu - Z90 * sigma), high: Math.exp(mu + Z90 * sigma), basis };
}

/**
 * Best per-unit draw for one device, from whatever evidence there is.
 *
 * `aiWatts` is the model's read of the unit's draw *while running*; it informs
 * the on-state only, because standby draw is a property of the power supply that
 * no photo shows. `userWatts` is taken as the draw in the observed state.
 */
export function estimateUnitWatts(
  cat: DeviceCategory,
  state: DeviceState,
  evidence: { aiWatts?: number; userWatts?: number } = {},
): UnitWatts {
  if (state === "off" && !cat.thermostatic) return { mid: 0, low: 0, high: 0, basis: "catalog" };

  const user = evidence.userWatts;
  if (user !== undefined && Number.isFinite(user) && user > 0) {
    return fromLog(Math.log(user), MEASURED_SIGMA, "measured");
  }

  const prior = catalogWatts(cat, state);
  const ai = evidence.aiWatts;
  const running = cat.thermostatic || state === "on";
  if (!running || ai === undefined || !Number.isFinite(ai) || ai <= 0) return prior;

  // The model reads active draw; the catalog band is active draw too, before duty cycle.
  const bandLow = cat.wattsLow ?? cat.wattsOn * 0.75;
  const bandHigh = cat.wattsHigh ?? cat.wattsOn * 1.25;
  if (ai < bandLow / PLAUSIBLE_FACTOR || ai > bandHigh * PLAUSIBLE_FACTOR) return prior;

  const sp = sigmaOf(prior.low, prior.high);
  const muP = Math.log(prior.mid);
  const muA = Math.log(ai * cat.dutyCycle);
  const wp = 1 / (sp * sp);
  const wa = 1 / (AI_SIGMA * AI_SIGMA);
  const mu = (muP * wp + muA * wa) / (wp + wa);
  return fromLog(mu, Math.sqrt(1 / (wp + wa)), "ai");
}

// ---- Monte Carlo ------------------------------------------------------------

/** Small, fast, seedable PRNG, so a report shows the same range every time it renders. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal draw (Box-Muller). */
function gauss(rand: () => number): number {
  const u = Math.max(1e-12, rand());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

export interface CostRange {
  p10: number;
  p50: number;
  p90: number;
  /** Half the 80% interval as a fraction of the median, e.g. 0.18 for "±18%". */
  spread: number;
}

/** How well the electricity price is known, as a log-normal sigma. */
export const RATE_SIGMA = {
  bill: 0.02,
  utility: 0.05,
  state: 0.1,
  national: 0.2,
} as const;
export type RateQuality = keyof typeof RATE_SIGMA;

/** How well the hours are known. */
export const HOURS_SIGMA = { user: 0.05, schedule: 0.14 } as const;

/**
 * The 80% range on the combined annual cost of a set of offenders.
 *
 * Each offender's per-unit draw is sampled from its own band (all units of one
 * line share a draw - a row of identical monitors is identical), its hours from
 * how they were obtained, and the price once per draw for everything, since one
 * building pays one tariff.
 */
export function costRange(
  offenders: (Pick<Offender, "costPerYear" | "costLowPerYear" | "costHighPerYear"> & { hoursKnown?: boolean })[],
  rateQuality: RateQuality = "state",
  draws = 2000,
  seed = 7,
): CostRange {
  const total = offenders.reduce((s, o) => s + o.costPerYear, 0);
  if (total <= 0) return { p10: 0, p50: 0, p90: 0, spread: 0 };
  const rand = mulberry32(seed);
  const rateSigma = RATE_SIGMA[rateQuality];
  const lines = offenders
    .filter((o) => o.costPerYear > 0)
    .map((o) => ({
      mid: o.costPerYear,
      // The offender's own band is a 90% interval on draw, which scales cost linearly.
      sigma: sigmaOf(Math.max(1e-6, o.costLowPerYear), Math.max(o.costLowPerYear * 1.0001, o.costHighPerYear)),
      hoursSigma: o.hoursKnown ? HOURS_SIGMA.user : HOURS_SIGMA.schedule,
    }));

  const samples = new Float64Array(draws);
  for (let d = 0; d < draws; d++) {
    const rate = Math.exp(rateSigma * gauss(rand) - (rateSigma * rateSigma) / 2);
    let sum = 0;
    for (const l of lines) {
      // Mean-preserving log-normal multipliers, so the median sits on the headline.
      const w = Math.exp(l.sigma * gauss(rand) - (l.sigma * l.sigma) / 2);
      const h = Math.exp(l.hoursSigma * gauss(rand) - (l.hoursSigma * l.hoursSigma) / 2);
      sum += l.mid * w * h;
    }
    samples[d] = sum * rate;
  }
  samples.sort();
  const q = (p: number) => samples[Math.min(draws - 1, Math.floor(p * draws))];
  const p10 = q(0.1);
  const p50 = q(0.5);
  const p90 = q(0.9);
  return { p10, p50, p90, spread: p50 > 0 ? (p90 - p10) / (2 * p50) : 0 };
}
