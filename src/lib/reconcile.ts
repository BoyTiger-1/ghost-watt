// Making the estimate answer to the meter.
//
// Everything upstream of this file is a bottom-up estimate: count the devices,
// look up what they draw, multiply by hours and a price. Every step is defensible
// and every step is an assumption, and the assumptions multiply. A utility bill
// is the one hard measurement in the entire chain - it is the building saying,
// with no modelling in between, how many kilowatt-hours it actually used.
//
// lib/calibration.ts already compares the two and prints a verdict. A verdict is
// worth something, but it changes no number: a scan that claims 40% of a school's
// entire electricity is still shown as 40%, with a paragraph underneath admitting
// it cannot be true. That is the wrong way round. If the meter says the audit has
// over-claimed, the audit should come down.
//
// What it must not do is scale everything by one blunt factor. Some lines rest on
// a plug-in meter reading and some on a catalog midpoint for a class spanning six
// to one, and squeezing both equally would take an honest measurement and make it
// wrong to make a guess look better. So the residual is distributed by how much
// each line's own uncertainty can account for it.
//
// Formally: each line has a log-normal prior on its true annual energy, with
// median m_i and spread sigma_i. We want the most probable set of values that
// also sums to the envelope the meter allows. Minimising the squared prior
// deviation subject to that sum - a Lagrange multiplier in one line - gives
//
//     x_i = m_i * (1 + lambda * m_i * sigma_i^2),    lambda = (T - S) / sum(m_i^2 sigma_i^2)
//
// so a line absorbs correction in proportion to its size times its variance. A
// measured line (sigma ~ 0.04) moves by about a thousandth of what a worst-case
// catalog line moves. That is the whole point.

import { BUILDING_TYPE_BY_ID, BUILDING_TYPES } from "./benchmark";
import type { Offender } from "./types";

export interface ReconcileLine {
  id: string;
  /** The line's annual energy as estimated bottom-up, kWh. */
  kwhPerYear: number;
  /** The log-normal spread on it. Smaller means "do not touch this one". */
  sigma: number;
}

export interface Reconciliation {
  /** Multiplier for each line, by id. Absent ids were not reconciled. */
  scale: Record<string, number>;
  /** The overall correction applied, reconciled total over bottom-up total. */
  factor: number;
  /** Plug and lighting energy the meter allows for the whole building, kWh/yr. */
  envelopeKwh: number;
  /** What the audit added up to before reconciliation, kWh/yr. */
  bottomUpKwh: number;
  /** Metered consumption for the whole building, annualised, kWh/yr. */
  meteredKwh: number;
  /** The audit as a share of the envelope. Above 1 is the over-claim this corrects. */
  coverage: number;
  verdict: "within" | "corrected";
  message: string;
}

/**
 * How much of a building's electricity is plug and lighting load, and how well
 * that share is known.
 *
 * The share comes from the building type (lib/benchmark.ts, following CBECS end-use
 * patterns). It is itself uncertain - a school with electric heat and one with a
 * gas boiler split their meter very differently - so the envelope is taken at the
 * generous end of the share rather than at its midpoint. Reconciliation should
 * only fire when the audit is over-claiming beyond any plausible reading of the
 * bill, not whenever it brushes a central estimate.
 */
const SHARE_HEADROOM = 1.35;

/**
 * Reconcile a set of lines against one bill.
 *
 * Returns null when there is nothing to reconcile against, and a `within` verdict
 * with every scale at 1 when the audit fits inside what the meter allows - which
 * is the common case, and is itself worth reporting, because it is the only
 * independent evidence in the app that the bottom-up model is behaving.
 */
export function reconcile(
  lines: readonly ReconcileLine[],
  meteredAnnualKwh: number,
  buildingTypeId: string | undefined,
): Reconciliation | null {
  if (!(meteredAnnualKwh > 0) || !lines.length) return null;

  const type = (buildingTypeId && BUILDING_TYPE_BY_ID[buildingTypeId]) || BUILDING_TYPES[0];
  const envelopeKwh = meteredAnnualKwh * Math.min(1, type.plugLoadShare * SHARE_HEADROOM);
  const bottomUpKwh = lines.reduce((s, l) => s + Math.max(0, l.kwhPerYear), 0);
  if (bottomUpKwh <= 0) return null;

  const coverage = bottomUpKwh / envelopeKwh;
  const scale: Record<string, number> = {};

  if (bottomUpKwh <= envelopeKwh) {
    for (const l of lines) scale[l.id] = 1;
    return {
      scale,
      factor: 1,
      envelopeKwh,
      bottomUpKwh,
      meteredKwh: meteredAnnualKwh,
      coverage,
      verdict: "within",
      message:
        `The audit adds up to ${Math.round(bottomUpKwh).toLocaleString()} kWh a year, which is ` +
        `${Math.round(coverage * 100)}% of the plug and lighting energy the bill leaves room for in a ` +
        `${type.label.toLowerCase()}. It fits inside the meter, so no figure has been adjusted. ` +
        `That is the only check in this app the model could have failed, and it passed.`,
    };
  }

  // Over-claimed. Pull the lines down by the Lagrange solution above: each line
  // gives up correction in proportion to its size times its own variance, so the
  // measured lines barely move and the guesses carry the reduction.
  const target = envelopeKwh;
  const denom = lines.reduce((s, l) => s + (l.kwhPerYear * l.sigma) ** 2 * (l.kwhPerYear > 0 ? 1 : 0), 0);
  if (!(denom > 0)) {
    // Every line is a measurement, so there is nothing the model is allowed to
    // bend. The right answer is to say so, not to overrule a meter with a meter.
    for (const l of lines) scale[l.id] = 1;
    return {
      scale,
      factor: 1,
      envelopeKwh,
      bottomUpKwh,
      meteredKwh: meteredAnnualKwh,
      coverage,
      verdict: "within",
      message:
        `The audit adds up to more plug and lighting energy than the bill appears to leave room for, ` +
        `but every line in it is a measurement rather than an estimate. Nothing has been adjusted: ` +
        `the more likely explanation is that the bill covers only part of the site.`,
    };
  }

  const lambda = (target - bottomUpKwh) / denom;
  let reconciled = 0;
  for (const l of lines) {
    const k = l.kwhPerYear > 0 ? 1 + lambda * l.kwhPerYear * l.sigma * l.sigma : 1;
    // A line can be reduced, never reversed. The linearised solution can overshoot
    // for a very loose line, and a negative kilowatt-hour is not a correction.
    const clamped = Math.max(0.05, Math.min(1, k));
    scale[l.id] = clamped;
    reconciled += l.kwhPerYear * clamped;
  }

  const factor = bottomUpKwh > 0 ? reconciled / bottomUpKwh : 1;
  return {
    scale,
    factor,
    envelopeKwh,
    bottomUpKwh,
    meteredKwh: meteredAnnualKwh,
    coverage,
    verdict: "corrected",
    message:
      `The audit added up to ${Math.round(bottomUpKwh).toLocaleString()} kWh a year, more than the ` +
      `${Math.round(envelopeKwh).toLocaleString()} kWh of plug and lighting energy this bill leaves room ` +
      `for. The bill is a measurement and the wattage table is not, so the estimates have been brought ` +
      `down to fit it - by ${Math.round((1 - factor) * 100)}% overall, taken mostly out of the least ` +
      `certain lines. Anything you measured with a plug-in meter was left alone.`,
  };
}

/**
 * The spread to reconcile a costed line with.
 *
 * Read off the line's own cost band, which already carries whatever the wattage
 * rests on: a measured line comes out near 0.04, a catalog line for a wide class
 * near 0.5. Falls back to a loose figure for a line with no band.
 */
export function lineSigma(o: Pick<Offender, "costPerYear" | "costLowPerYear" | "costHighPerYear" | "basis">): number {
  if (o.basis === "measured") return 0.04;
  const low = Math.max(1e-9, o.costLowPerYear);
  const high = Math.max(low * 1.0001, o.costHighPerYear);
  const sigma = Math.log(high / low) / (2 * 1.645);
  return Number.isFinite(sigma) && sigma > 0 ? Math.min(1, sigma) : 0.3;
}

/** Offenders with a reconciliation applied to every costed figure on them. */
export function applyReconciliation(offenders: readonly Offender[], r: Reconciliation | null): Offender[] {
  if (!r || r.verdict !== "corrected") return offenders.slice();
  return offenders.map((o) => {
    const k = r.scale[o.id];
    if (k === undefined || k === 1) return o;
    return {
      ...o,
      perUnitWatts: o.perUnitWatts * k,
      totalWatts: o.totalWatts * k,
      kwhPerYear: o.kwhPerYear * k,
      costPerYear: o.costPerYear * k,
      co2KgPerYear: o.co2KgPerYear * k,
      costLowPerYear: o.costLowPerYear * k,
      costHighPerYear: o.costHighPerYear * k,
      annualSavings: o.annualSavings * k,
      ...(o.typicalKwhPerYear !== undefined ? { typicalKwhPerYear: o.typicalKwhPerYear * k } : {}),
      ...(o.typicalCostPerYear !== undefined ? { typicalCostPerYear: o.typicalCostPerYear * k } : {}),
      ...(o.standbyCostPerYear !== undefined ? { standbyCostPerYear: o.standbyCostPerYear * k } : {}),
      ...(o.annualCostPerYear !== undefined ? { annualCostPerYear: o.annualCostPerYear * k } : {}),
      // Payback moves with the savings, so it has to be recomputed rather than scaled.
      paybackMonths:
        o.fixCost > 0 && o.annualSavings * k > 0 ? (o.fixCost / (o.annualSavings * k)) * 12 : null,
      reconciledBy: k,
    };
  });
}

/**
 * Lines ready for reconcile(), from costed offenders.
 *
 * The bill measures everything the building used, so what is compared against it
 * has to be everything the audit says these devices use - the whole year, not
 * just the after-hours part. The Offender carries that as a cost rather than as
 * energy, so it is converted back through the line's own price, which is exact
 * because both figures were costed at the same rate.
 *
 * A device switched off overnight has no after-hours cost to scale from, and its
 * normal use is still real: it falls back to its typical energy rather than
 * contributing nothing, which would quietly understate the bottom-up total and
 * so understate how much the audit is over-claiming.
 */
export function reconcileLines(offenders: readonly Offender[]): ReconcileLine[] {
  return offenders.map((o) => {
    const annual =
      o.annualCostPerYear !== undefined && o.costPerYear > 0
        ? (o.kwhPerYear * o.annualCostPerYear) / o.costPerYear
        : Math.max(o.kwhPerYear, o.typicalKwhPerYear ?? 0);
    return { id: o.id, kwhPerYear: Math.max(0, annual), sigma: lineSigma(o) };
  });
}
