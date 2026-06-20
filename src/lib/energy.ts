// The energy math: turn device observations into ranked, costed offenders.
// Deterministic and transparent - this is the part of Ghost Watt that does NOT
// depend on the model being right about watts, only about *what's there*.

import { CATALOG_BY_ID } from "./devices";
import type {
  AuditSettings,
  DeviceCategory,
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

  const kwhPerYear = (totalWatts / 1000) * settings.unoccupiedHoursPerYear;
  const costPerYear = kwhPerYear * settings.ratePerKwh;
  const co2KgPerYear = kwhPerYear * settings.co2PerKwh;

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
  recoverableCost: number;
  totalFixCost: number;
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
      acc.recoverableCost += o.annualSavings;
      acc.totalFixCost += o.fixCost;
      return acc;
    },
    { costPerYear: 0, co2KgPerYear: 0, kwhPerYear: 0, recoverableCost: 0, totalFixCost: 0 },
  );
  const topOffender = offenders.length
    ? offenders.reduce((a, b) => (b.costPerYear > a.costPerYear ? b : a))
    : null;
  return { ...totals, topOffender };
}

// ---- formatting helpers -------------------------------------------------

export function fmtMoney(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${Math.round(n).toLocaleString()}`;
}

export function fmtMoneyFull(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

export function fmtCo2(kg: number): string {
  if (kg >= 1000) return `${(kg / 1000).toFixed(2)} t`;
  return `${Math.round(kg)} kg`;
}

export function fmtKwh(kwh: number): string {
  if (kwh >= 1000) return `${(kwh / 1000).toFixed(1)} MWh`;
  return `${Math.round(kwh).toLocaleString()} kWh`;
}

export function fmtPayback(months: number | null): string {
  if (months === null) return "instant";
  if (months < 1) return "< 1 mo";
  if (months < 24) return `${Math.round(months)} mo`;
  return `${(months / 12).toFixed(1)} yr`;
}
