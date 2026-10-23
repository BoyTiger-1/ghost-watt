// How much does one unit draw, and how sure are we?
//
// The catalog gives a published band for every device class: a 24-inch LED
// monitor and a 32-inch CCFL one are both "computer monitor", 18 W and 45 W.
// A photo usually says which one it is - size, bezel, age, lamp or laser - and
// the vision model is asked to read that. No source is trusted alone:
//
//   catalog band   a prior: what devices of this class draw, across the market
//   technology     evidence: "T8 fluorescent", "CRT", "laser" - which member of
//                  the class this is (lib/tech.ts)
//   screen size    evidence: a diagonal, through the area law display power follows
//   AI estimate    evidence: the model's own guess at this unit's wattage
//   user figure    a measurement, off a nameplate or a plug-in meter
//
// The channels are combined as log-normal beliefs (watts are multiplicative:
// "twice as much" is the natural error, not "+20 W"), which is the textbook
// conjugate update. The posterior is tighter than any single input when they
// agree and lands between them when they do not. A measurement replaces the lot.
// An AI figure wildly outside the class band is treated as a misreading and
// dropped, so one hallucinated "2000 W monitor" cannot move a report.
//
// The weights are deliberately unequal. A named technology is worth more than a
// named wattage, because "is that a fluorescent tube or an LED panel?" is a
// perceptual question a vision model answers well and "how many watts is that?"
// is an arithmetic question it cannot answer at all. Treating the two as equally
// good evidence - or, as the first version of this file did, using the wattage
// and discarding the technology - throws away the better of the two signals.
//
// The money range is then propagated by Monte Carlo rather than by adding up
// every low and every high: summing worst cases assumes every device is at the
// bottom of its band at once, which overstates the spread of a ten-device room
// several times over. But the draws are *correlated*, because the errors are: if
// this catalog's monitor figure is 20% high, it is 20% high for all twenty-eight
// monitors in the building at once, and sampling them independently would let
// that error average itself away into a falsely narrow band.

import { readScreenSize, readTech } from "./tech";
import type { DeviceCategory, DeviceState } from "./types";

/** 90% of a normal distribution lies within this many standard deviations. */
const Z90 = 1.645;
/** Spread of a vision model's wattage read, as a log-normal sigma (≈ ×/÷ 1.8 at 90%). */
export const AI_SIGMA = 0.36;
/** A measured figure still carries meter and nameplate error. */
export const MEASURED_SIGMA = 0.04;
/** AI figures further than this factor outside the class band are discarded. */
const PLAUSIBLE_FACTOR = 3;

export type WattBasis = "measured" | "tech" | "ai" | "catalog";

export interface UnitWatts {
  /** Headline per-unit draw in the observed state, W. */
  mid: number;
  /** 5th / 95th percentile per-unit draw, W. */
  low: number;
  high: number;
  basis: WattBasis;
  /** The technology or size that moved the figure, when one did. */
  techLabel?: string;
  /** The posterior spread, as a log-normal sigma. Drives the correlated cost range. */
  sigma?: number;
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

function fromLog(mu: number, sigma: number, basis: WattBasis, techLabel?: string): UnitWatts {
  return {
    mid: Math.exp(mu),
    low: Math.exp(mu - Z90 * sigma),
    high: Math.exp(mu + Z90 * sigma),
    basis,
    sigma,
    ...(techLabel ? { techLabel } : {}),
  };
}

export interface WattEvidence {
  /** The model's read of this unit's draw while running, W. */
  aiWatts?: number;
  /** A figure the user supplied, W per unit in the observed state. */
  userWatts?: number;
  /**
   * Everything the engine said about the device - its technology field, its
   * evidence phrase, its own label - which lib/tech.ts reads a technology and a
   * screen size out of.
   */
  words?: string;
}

/** One log-normal belief about the running draw. */
interface Channel {
  mu: number;
  sigma: number;
  basis: WattBasis;
  label?: string;
}

/**
 * Best per-unit draw for one device, from whatever evidence there is.
 *
 * Everything but the user's own figure informs the *running* draw only. Standby
 * draw is a property of the power supply, and no photograph shows it: a 2010
 * television and a 2024 one look alike from across a classroom and differ by a
 * factor of three asleep. `userWatts` is taken as the draw in the observed state.
 */
export function estimateUnitWatts(
  cat: DeviceCategory,
  state: DeviceState,
  evidence: WattEvidence = {},
): UnitWatts {
  if (state === "off" && !cat.thermostatic) return { mid: 0, low: 0, high: 0, basis: "catalog" };

  const user = evidence.userWatts;
  if (user !== undefined && Number.isFinite(user) && user > 0) {
    return fromLog(Math.log(user), MEASURED_SIGMA, "measured");
  }

  const prior = catalogWatts(cat, state);
  const running = cat.thermostatic || state === "on";
  // Nothing to update: a non-running state is a property of the power supply that
  // no photograph shows, and a zero-watt prior has no logarithm to work in.
  if (!running || !(prior.mid > 0)) return prior;

  const priorSigma = sigmaOf(prior.low, prior.high);
  const channels: Channel[] = [{ mu: Math.log(prior.mid), sigma: priorSigma, basis: "catalog" }];

  // The catalog band is active draw before duty cycle, and so is every reading
  // below, so each is duty-cycled on the way in to match the prior's scale.
  const duty = cat.dutyCycle;
  const bandLow = cat.wattsLow ?? cat.wattsOn * 0.75;
  const bandHigh = cat.wattsHigh ?? cat.wattsOn * 1.25;

  const words = evidence.words;
  if (words) {
    const tech = readTech(cat.id, words);
    if (tech && tech.watts > 0) {
      channels.push({ mu: Math.log(tech.watts * duty), sigma: tech.sigma, basis: "tech", label: tech.label });
    }
    const size = readScreenSize(cat.id, words);
    if (size && size.watts > 0) {
      channels.push({
        mu: Math.log(size.watts * duty),
        sigma: size.sigma,
        basis: "tech",
        label: `${size.inches}-inch panel`,
      });
    }
  }

  const ai = evidence.aiWatts;
  if (ai !== undefined && Number.isFinite(ai) && ai > 0 && ai >= bandLow / PLAUSIBLE_FACTOR && ai <= bandHigh * PLAUSIBLE_FACTOR) {
    channels.push({ mu: Math.log(ai * duty), sigma: AI_SIGMA, basis: "ai" });
  }

  if (channels.length === 1) return prior;

  // Precision-weighted mean of every channel: the conjugate posterior for
  // log-normal beliefs with known spreads.
  let precision = 0;
  let weighted = 0;
  for (const c of channels) {
    // A floor on the spread, so no channel can claim infinite precision and
    // silently become the only one that counts. Only a measurement is allowed to
    // overrule the rest, and it does that by returning above.
    const sigma = Math.max(MEASURED_SIGMA, c.sigma);
    const w = 1 / (sigma * sigma);
    precision += w;
    weighted += c.mu * w;
  }
  const mu = weighted / precision;
  const sigma = Math.sqrt(1 / precision);

  // The basis is the strongest kind of evidence that actually moved the figure,
  // which is what the card has to be able to say out loud.
  const named = channels.find((c) => c.basis === "tech");
  const basis: WattBasis = named ? "tech" : "ai";
  return fromLog(mu, sigma, basis, named?.label);
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
  /** The mean of the draws. Above the median, since cost is log-normal-ish. */
  mean: number;
  /** Share of the variance that is systematic - one wrong catalog figure, many devices. */
  systematicShare: number;
}

const ZERO_RANGE: CostRange = { p10: 0, p50: 0, p90: 0, spread: 0, mean: 0, systematicShare: 0 };

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
 * The share of a catalog line's wattage error that is shared with every other
 * line of the same class.
 *
 * If this file's figure for a desktop computer is wrong, it is wrong for all of
 * them: the error is in the published figure, not in the individual machine. Only
 * the rest - this particular unit being an unusual one - averages out across a
 * big audit. Two thirds systematic is the conservative read, and conservative
 * here means a wider band, which is the direction an honest estimate errs in.
 *
 * A measured line has no share of it. A meter reading carries no catalog bias.
 */
export const SYSTEMATIC_VARIANCE_SHARE = 0.65;

/** One line of annual cost with its band: an Offender satisfies this as it stands. */
export interface CostLine {
  costPerYear: number;
  costLowPerYear: number;
  costHighPerYear: number;
  /** True when the hours came from the user rather than the building schedule. */
  hoursKnown?: boolean;
  /** What the wattage rests on. A measurement is not subject to catalog bias. */
  basis?: WattBasis;
  /** The device class, which is what lines share systematic wattage error through. */
  categoryId?: string;
  /** An explicit correlation group, when the class is not the right one. */
  correlationKey?: string;
}

/**
 * The 80% range on the combined annual cost of a set of offenders.
 *
 * Three kinds of error are in play, and they correlate differently:
 *
 *   price      one building pays one tariff, so it is drawn once per sample.
 *   hours      one schedule, so the schedule error is drawn once per sample too;
 *              a line whose hours the user gave escapes it.
 *   wattage    split in two. The systematic part is drawn once per device class,
 *              because a wrong catalog figure is wrong for every unit of that
 *              class at once. The rest is drawn per line and does average out.
 *
 * Getting that structure wrong is not a rounding matter. Sampling twenty-eight
 * monitors independently shrinks their combined band by a factor of five against
 * sampling them together, and a band five times too narrow is worse than no band:
 * it invites exactly the confidence the number has not earned.
 */
export function costRange(
  offenders: readonly CostLine[],
  rateQuality: RateQuality = "state",
  draws = 2000,
  seed = 7,
): CostRange {
  const total = offenders.reduce((s, o) => s + o.costPerYear, 0);
  if (total <= 0) return { ...ZERO_RANGE };
  const rand = mulberry32(seed);
  const rateSigma = RATE_SIGMA[rateQuality];

  const keys = new Map<string, number>();
  const lines = offenders
    .filter((o) => o.costPerYear > 0)
    .map((o, i) => {
      const sigma = sigmaOf(
        Math.max(1e-6, o.costLowPerYear),
        Math.max(o.costLowPerYear * 1.0001, o.costHighPerYear),
      );
      // A measurement has no catalog bias to share; everything else shares its
      // class's. A line with no class of its own correlates with nothing.
      const key = o.correlationKey ?? o.categoryId ?? `line-${i}`;
      const shared = o.basis === "measured" ? 0 : SYSTEMATIC_VARIANCE_SHARE;
      if (!keys.has(key)) keys.set(key, keys.size);
      return {
        mid: o.costPerYear,
        sigmaShared: sigma * Math.sqrt(shared),
        sigmaOwn: sigma * Math.sqrt(1 - shared),
        sigma,
        hoursSigma: o.hoursKnown ? HOURS_SIGMA.user : HOURS_SIGMA.schedule,
        hoursKnown: o.hoursKnown === true,
        keyIndex: keys.get(key)!,
      };
    });

  const samples = new Float64Array(draws);
  const classShock = new Float64Array(keys.size);
  let sum2 = 0;
  let sharedSum2 = 0;
  for (const l of lines) {
    sum2 += (l.mid * l.sigma) ** 2;
    sharedSum2 += (l.mid * l.sigmaShared) ** 2;
  }

  for (let d = 0; d < draws; d++) {
    const rate = Math.exp(rateSigma * gauss(rand) - (rateSigma * rateSigma) / 2);
    // One schedule for the building: if the empty hours are overstated, they are
    // overstated for every line that leans on them.
    const scheduleShock = gauss(rand);
    for (let k = 0; k < classShock.length; k++) classShock[k] = gauss(rand);
    let sum = 0;
    for (const l of lines) {
      // Mean-preserving log-normal multipliers, so the median sits on the headline.
      const z = l.sigmaShared * classShock[l.keyIndex] + l.sigmaOwn * gauss(rand);
      const w = Math.exp(z - (l.sigma * l.sigma) / 2);
      const hz = l.hoursKnown ? gauss(rand) : scheduleShock;
      const h = Math.exp(l.hoursSigma * hz - (l.hoursSigma * l.hoursSigma) / 2);
      sum += l.mid * w * h;
    }
    samples[d] = sum * rate;
  }
  samples.sort();
  const q = (p: number) => samples[Math.min(draws - 1, Math.floor(p * draws))];
  const p10 = q(0.1);
  const p50 = q(0.5);
  const p90 = q(0.9);
  let mean = 0;
  for (let d = 0; d < draws; d++) mean += samples[d];
  return {
    p10,
    p50,
    p90,
    spread: p50 > 0 ? (p90 - p10) / (2 * p50) : 0,
    mean: mean / draws,
    systematicShare: sum2 > 0 ? sharedSum2 / sum2 : 0,
  };
}
