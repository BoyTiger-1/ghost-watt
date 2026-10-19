// What to do, in what order, and what happens to the bill if you do it.
//
// An audit produces a list of what is running. This turns it into decisions.
// Each device line can take up to two moves: fix the after-hours habit (the
// catalogue's recommended fix: a timer, a strip, a policy) and swap the device
// for an efficient one (an LED, an ENERGY STAR model). Every move carries what
// it costs and what it saves, and the list is ranked by dollars saved per
// dollar spent, with free moves first. The simulator applies a chosen set of
// moves to the room and re-totals it, so a person can watch the annual bill,
// the payback and the carbon change as they tick things.
//
// Arithmetic only: no model, no guessing. Where the audit did not record a
// figure a move needs, the move is left out rather than estimated.

import { assessEfficiency } from "./efficiency";
import type { AuditSettings, Offender } from "./types";

export type MoveKind = "fix" | "replace";

export interface ActionItem {
  /** `${offenderId}:${kind}` */
  id: string;
  offenderId: string;
  kind: MoveKind;
  /** The device line this acts on. */
  label: string;
  icon: string;
  count: number;
  where: string;
  /** What to do, in words. */
  title: string;
  detail: string;
  cost: number;
  annualSavings: number;
  co2SavedKg: number;
  /** Dollars saved a year per dollar spent; null when the move is free. */
  savingsPerDollar: number | null;
  paybackMonths: number | null;
  confidence: Offender["confidence"];
}

/** A room's annual bill, split the way the app always splits it. */
export interface Bill {
  /** After-hours waste: what devices cost left as seen through the empty hours. */
  afterHours: number;
  /** What the same devices cost in normal use. */
  typical: number;
  total: number;
  co2Kg: number;
}

export interface Simulation {
  before: Bill;
  after: Bill;
  upfront: number;
  annualSavings: number;
  co2SavedKg: number;
  /** Months to earn the upfront cost back; null when nothing was spent. */
  paybackMonths: number | null;
  /** Fraction of the annual bill removed. */
  share: number;
}

const kwhOf = (dollars: number, s: Pick<AuditSettings, "ratePerKwh">) => (s.ratePerKwh > 0 ? dollars / s.ratePerKwh : 0);

/** How much of a line's after-hours waste a replacement removes, and of its in-use cost. */
function replacement(o: Offender, s: Pick<AuditSettings, "ratePerKwh" | "co2PerKwh">) {
  const a = assessEfficiency(o, s);
  // Only a device the efficiency check would actually tell someone to replace
  // gets a swap: an LED-for-LED trade or a 13-year payback is noise, not advice.
  if (!a.replace || (a.verdict !== "replace" && a.verdict !== "consider")) return null;
  if (a.activeWatts <= 0 || a.efficientWatts >= a.activeWatts) return null;
  const keep = a.efficientWatts / a.activeWatts;
  // In-use cost at the active draw: hours a day × watts × units.
  const typicalActive = ((o.typicalHoursPerDay ?? 0) * 365 * a.activeWatts * o.count * s.ratePerKwh) / 1000;
  // After-hours waste at the active draw shrinks with the device; standby draw does not.
  const afterHoursActive = o.afterHoursState === "on" ? o.costPerYear : 0;
  const typicalSaved = typicalActive * (1 - keep);
  const afterHoursSaved = afterHoursActive * (1 - keep);
  return { a, keep, typicalSaved, afterHoursSaved, cost: a.replace.cost, what: a.replace.what };
}

/** Every move the audit supports, unranked. */
export function listActions(offenders: readonly Offender[], s: AuditSettings): ActionItem[] {
  const out: ActionItem[] = [];
  for (const o of offenders) {
    if (o.unverified) continue;
    const where = o.source;
    if (o.annualSavings > 0.5 && o.costPerYear > 0) {
      const co2 = kwhOf(o.annualSavings, s) * s.co2PerKwh;
      out.push({
        id: `${o.id}:fix`,
        offenderId: o.id,
        kind: "fix",
        label: o.label,
        icon: o.icon,
        count: o.count,
        where,
        title: o.action.label,
        detail: o.action.note,
        cost: o.fixCost,
        annualSavings: o.annualSavings,
        co2SavedKg: co2,
        savingsPerDollar: o.fixCost > 0 ? o.annualSavings / o.fixCost : null,
        paybackMonths: o.fixCost > 0 ? (o.fixCost / o.annualSavings) * 12 : null,
        confidence: o.confidence,
      });
    }
    const r = replacement(o, s);
    if (r) {
      const saved = r.typicalSaved + r.afterHoursSaved;
      if (saved > 1) {
        out.push({
          id: `${o.id}:replace`,
          offenderId: o.id,
          kind: "replace",
          label: o.label,
          icon: o.icon,
          count: o.count,
          where,
          title: `Replace with ${r.what}`,
          detail: `${Math.round(r.a.activeWatts)} W → ${Math.round(r.a.efficientWatts)} W each in use${r.a.tech ? ` (${r.a.tech} today)` : ""}. Savings are priced at typical use, so this is what a buyer would see on the bill.`,
          cost: r.cost,
          annualSavings: saved,
          co2SavedKg: kwhOf(saved, s) * s.co2PerKwh,
          savingsPerDollar: r.cost > 0 ? saved / r.cost : null,
          paybackMonths: r.cost > 0 ? (r.cost / saved) * 12 : null,
          confidence: r.a.assumed ? "low" : o.confidence,
        });
      }
    }
  }
  return out;
}

/**
 * Free moves first (most saved first), then paid moves by dollars saved per
 * dollar spent. A $0 policy that saves $40 beats a $200 fixture that saves $300.
 */
export function rankActions(items: readonly ActionItem[]): ActionItem[] {
  return [...items].sort((x, y) => {
    const xf = x.savingsPerDollar === null;
    const yf = y.savingsPerDollar === null;
    if (xf !== yf) return xf ? -1 : 1;
    if (xf && yf) return y.annualSavings - x.annualSavings;
    return (y.savingsPerDollar ?? 0) - (x.savingsPerDollar ?? 0) || y.annualSavings - x.annualSavings;
  });
}

/** The room's bill as the audit found it. */
export function billOf(offenders: readonly Offender[]): Bill {
  const lines = offenders.filter((o) => !o.unverified);
  const afterHours = lines.reduce((s, o) => s + o.costPerYear, 0);
  const typical = lines.reduce((s, o) => s + (o.typicalCostPerYear ?? 0), 0);
  return { afterHours, typical, total: afterHours + typical, co2Kg: lines.reduce((s, o) => s + o.co2KgPerYear, 0) };
}

/**
 * Apply a set of moves and re-total the room.
 *
 * Replacement is applied first, then the after-hours fix on what is left, so a
 * person who ticks both for one device is not credited twice for the same
 * watts.
 */
export function simulate(offenders: readonly Offender[], s: AuditSettings, chosen: ReadonlySet<string>): Simulation {
  const before = billOf(offenders);
  let afterHours = before.afterHours;
  let typical = before.typical;
  let upfront = 0;
  for (const o of offenders) {
    if (o.unverified) continue;
    let lineAfterHours = o.costPerYear;
    if (chosen.has(`${o.id}:replace`)) {
      const r = replacement(o, s);
      if (r) {
        typical -= r.typicalSaved;
        afterHours -= r.afterHoursSaved;
        lineAfterHours -= r.afterHoursSaved;
        upfront += r.cost;
      }
    }
    if (chosen.has(`${o.id}:fix`) && o.costPerYear > 0) {
      const fraction = o.annualSavings / o.costPerYear;
      afterHours -= lineAfterHours * fraction;
      upfront += o.fixCost;
    }
  }
  afterHours = Math.max(0, afterHours);
  typical = Math.max(0, typical);
  const total = afterHours + typical;
  const annualSavings = before.total - total;
  const co2SavedKg = kwhOf(annualSavings, s) * s.co2PerKwh;
  return {
    before,
    after: { afterHours, typical, total, co2Kg: Math.max(0, before.co2Kg - co2SavedKg) },
    upfront,
    annualSavings,
    co2SavedKg,
    paybackMonths: upfront > 0 ? (annualSavings > 0 ? (upfront / annualSavings) * 12 : Infinity) : null,
    share: before.total > 0 ? annualSavings / before.total : 0,
  };
}
