// The energy math: turn device observations into ranked, costed offenders.
// Deterministic and transparent - this is the part of Ghost Watt that does NOT
// depend on the model being right about watts, only about *what's there*.

import { CATALOG_BY_ID } from "./devices";
import type {
  AuditSettings,
  DeviceCategory,
  DeviceGroup,
  DeviceObservation,
  DeviceState,
  Offender,
} from "./types";

/** Effective continuous draw (W) for one unit in its observed state. */
export function effectiveWatts(cat: DeviceCategory, state: DeviceState): number {
  // Thermostatic devices cycle 24/7; their "state" is always running.
  if (cat.thermostatic) return cat.wattsOn * cat.dutyCycle;
  switch (state) {
    case "on":
      return cat.wattsOn * cat.dutyCycle;
    case "standby":
      return cat.wattsStandby;
    case "off":
      return 0;
  }
}

/**
 * The plausible range of draw for one unit, from the published band for its class.
 *
 * A single wattage figure implies a precision that does not exist: "projector" covers
 * a 150 W laser unit and a 400 W lamp unit, and we cannot tell them apart from a
 * photo. Carrying the band through the math lets the UI say "$180-$480 a year"
 * instead of a falsely exact "$310", which is both more honest and, in front of a
 * facilities director, considerably more credible.
 *
 * Categories without a published band fall back to +/-25%, which is roughly the
 * spread we see across the ones that do have one.
 */
export function effectiveWattsRange(
  cat: DeviceCategory,
  state: DeviceState,
): { low: number; high: number } {
  const mid = effectiveWatts(cat, state);
  if (mid <= 0) return { low: 0, high: 0 };

  const lowOn = cat.wattsLow ?? cat.wattsOn * 0.75;
  const highOn = cat.wattsHigh ?? cat.wattsOn * 1.25;

  if (cat.thermostatic) {
    return { low: lowOn * cat.dutyCycle, high: highOn * cat.dutyCycle };
  }
  if (state === "on") {
    return { low: lowOn * cat.dutyCycle, high: highOn * cat.dutyCycle };
  }
  // Standby figures are far less variable than running figures, but not fixed.
  return { low: mid * 0.6, high: mid * 1.6 };
}

function confidenceFor(state: DeviceState, cat: DeviceCategory): Offender["confidence"] {
  // Generic catch-all categories (lights, computer) are slightly less certain.
  if (cat.id === "ceiling_light" || cat.id === "desktop") return "medium";
  return state === "on" ? "high" : "medium";
}

/** Apply the wattage table + tariff + carbon factor to one observation. */
export function scoreObservation(
  obs: DeviceObservation & { categoryId: string },
  settings: AuditSettings,
  source: string,
  index: number,
): Offender | null {
  const cat = CATALOG_BY_ID[obs.categoryId ?? ""] as DeviceCategory | undefined;
  if (!cat) return null;

  const count = Math.max(1, Math.round(obs.count || 1));
  const perUnitWatts = effectiveWatts(cat, obs.state);
  const totalWatts = perUnitWatts * count;
  if (totalWatts <= 0) return null;

  const hours = settings.unoccupiedHoursPerYear;
  const kwhPerYear = (totalWatts / 1000) * hours;
  const costPerYear = kwhPerYear * settings.ratePerKwh;
  const co2KgPerYear = kwhPerYear * settings.co2PerKwh;

  const band = effectiveWattsRange(cat, obs.state);
  const costLowPerYear = ((band.low * count) / 1000) * hours * settings.ratePerKwh;
  const costHighPerYear = ((band.high * count) / 1000) * hours * settings.ratePerKwh;

  const annualSavings = costPerYear * cat.action.savingsFraction;
  const fixCost = cat.action.cost;
  const paybackMonths =
    fixCost > 0 && annualSavings > 0 ? (fixCost / annualSavings) * 12 : null;

  return {
    id: `${source}-${cat.id}-${index}`,
    categoryId: cat.id,
    label: cat.label,
    icon: cat.icon,
    count,
    state: obs.state,
    perUnitWatts,
    totalWatts,
    kwhPerYear,
    costPerYear,
    co2KgPerYear,
    costLowPerYear,
    costHighPerYear,
    group: cat.group ?? "specialty",
    action: cat.action,
    fixCost,
    annualSavings,
    paybackMonths,
    confidence: confidenceFor(obs.state, cat),
    source,
  };
}

/** Observations (already tagged with categoryId) → ranked offenders. */
export function rankObservations(
  observations: (DeviceObservation & { categoryId: string })[],
  settings: AuditSettings,
  source: string,
): Offender[] {
  const offenders = observations
    .map((o, i) => scoreObservation(o, settings, source, i))
    .filter((o): o is Offender => o !== null);

  // Merge duplicate categories within one source (e.g. two "monitor" lines).
  const merged = new Map<string, Offender>();
  for (const o of offenders) {
    const existing = merged.get(o.categoryId);
    if (existing) {
      existing.count += o.count;
      existing.totalWatts += o.totalWatts;
      existing.kwhPerYear += o.kwhPerYear;
      existing.costPerYear += o.costPerYear;
      existing.co2KgPerYear += o.co2KgPerYear;
      existing.costLowPerYear += o.costLowPerYear;
      existing.costHighPerYear += o.costHighPerYear;
      existing.annualSavings += o.annualSavings;
      existing.paybackMonths =
        existing.fixCost > 0 && existing.annualSavings > 0
          ? (existing.fixCost / existing.annualSavings) * 12
          : null;
    } else {
      merged.set(o.categoryId, { ...o });
    }
  }

  return [...merged.values()].sort((a, b) => b.costPerYear - a.costPerYear);
}

export interface AuditTotals {
  costPerYear: number;
  co2KgPerYear: number;
  kwhPerYear: number;
  costLowPerYear: number;
  costHighPerYear: number;
  recoverableCost: number;
  totalFixCost: number;
  /** Average continuous draw across the whole audit, W. */
  averageWatts: number;
  topOffender: Offender | null;
}

export function aggregate(offenders: Offender[]): AuditTotals {
  // Don't double-count a shared room-level fix (e.g. one "smart strips" line per
  // category per source already collapsed); sum fix cost across distinct offenders.
  const totals = offenders.reduce(
    (acc, o) => {
      acc.costPerYear += o.costPerYear;
      acc.co2KgPerYear += o.co2KgPerYear;
      acc.kwhPerYear += o.kwhPerYear;
      acc.costLowPerYear += o.costLowPerYear;
      acc.costHighPerYear += o.costHighPerYear;
      acc.recoverableCost += o.annualSavings;
      acc.totalFixCost += o.fixCost;
      acc.averageWatts += o.totalWatts;
      return acc;
    },
    {
      costPerYear: 0,
      co2KgPerYear: 0,
      kwhPerYear: 0,
      costLowPerYear: 0,
      costHighPerYear: 0,
      recoverableCost: 0,
      totalFixCost: 0,
      averageWatts: 0,
    },
  );
  const topOffender = offenders.length
    ? offenders.reduce((a, b) => (b.costPerYear > a.costPerYear ? b : a))
    : null;
  return { ...totals, topOffender };
}

// ---- breakdowns ---------------------------------------------------------

export interface GroupSlice {
  group: DeviceGroup;
  costPerYear: number;
  kwhPerYear: number;
  share: number;
  count: number;
}

/**
 * Where the waste actually lives, by kind of equipment.
 *
 * The ranked list answers "what is the worst single thing?". This answers the
 * question a facilities director asks next: "is my problem screens, or is my
 * problem the kitchen?" - which is the question that decides who gets the budget.
 */
export function loadMix(offenders: Offender[]): GroupSlice[] {
  const total = offenders.reduce((s, o) => s + o.costPerYear, 0);
  const byGroup = new Map<DeviceGroup, GroupSlice>();

  for (const o of offenders) {
    const cur = byGroup.get(o.group);
    if (cur) {
      cur.costPerYear += o.costPerYear;
      cur.kwhPerYear += o.kwhPerYear;
      cur.count += o.count;
    } else {
      byGroup.set(o.group, {
        group: o.group,
        costPerYear: o.costPerYear,
        kwhPerYear: o.kwhPerYear,
        share: 0,
        count: o.count,
      });
    }
  }

  return [...byGroup.values()]
    .map((s) => ({ ...s, share: total > 0 ? s.costPerYear / total : 0 }))
    .sort((a, b) => b.costPerYear - a.costPerYear);
}

/**
 * How concentrated the waste is: the share carried by the top N offenders.
 * Usually a small number of devices carry most of it, which is the single most
 * actionable fact in the whole report.
 */
export function concentration(offenders: Offender[], topN = 3): number {
  const total = offenders.reduce((s, o) => s + o.costPerYear, 0);
  if (total <= 0) return 0;
  const top = offenders
    .slice()
    .sort((a, b) => b.costPerYear - a.costPerYear)
    .slice(0, topN)
    .reduce((s, o) => s + o.costPerYear, 0);
  return top / total;
}

/**
 * Peak-demand cost, for buildings on a commercial tariff with a demand charge.
 *
 * Most schools pay for their highest 15-minute draw of the month as well as for
 * energy, and that line item is invisible on a per-kWh estimate. Loads left running
 * during the day contribute to it; loads left running overnight usually do not,
 * so this is deliberately conservative and only counts non-thermostatic "on" loads.
 */
export function demandCost(offenders: Offender[], settings: AuditSettings): number {
  const rate = settings.demandChargePerKw ?? 0;
  if (rate <= 0) return 0;
  const contributingWatts = offenders
    .filter((o) => o.state === "on")
    .reduce((s, o) => s + o.totalWatts, 0);
  return (contributingWatts / 1000) * rate * 12;
}

// ---- formatting helpers -------------------------------------------------

export function fmtMoney(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${Math.round(n).toLocaleString()}`;
}

export function fmtMoneyFull(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

export function fmtRange(low: number, high: number): string {
  return `${fmtMoney(low)} - ${fmtMoney(high)}`;
}

export function fmtCo2(kg: number): string {
  if (kg >= 1000) return `${(kg / 1000).toFixed(2)} t`;
  return `${Math.round(kg)} kg`;
}

export function fmtKwh(kwh: number): string {
  if (kwh >= 1000) return `${(kwh / 1000).toFixed(1)} MWh`;
  return `${Math.round(kwh).toLocaleString()} kWh`;
}

export function fmtWatts(w: number): string {
  if (w >= 1000) return `${(w / 1000).toFixed(1)} kW`;
  return `${Math.round(w)} W`;
}

export function fmtPayback(months: number | null): string {
  if (months === null) return "instant";
  if (months < 1) return "< 1 mo";
  if (months < 24) return `${Math.round(months)} mo`;
  return `${(months / 12).toFixed(1)} yr`;
}

export function fmtPct(f: number): string {
  return `${Math.round(f * 100)}%`;
}
