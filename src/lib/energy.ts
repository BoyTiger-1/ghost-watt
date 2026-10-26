// The energy math: turn device observations into ranked, costed offenders.
// Deterministic and transparent - this is the part of Ghost Watt that does NOT
// depend on the model being right about watts, only about *what's there*.

import { CATALOG_BY_ID } from "./devices";
import { estimateUnitWatts } from "./estimate";
import { evidenceWords } from "./tech";
import { hvacInteraction } from "./thermal";
import { typicalUse } from "./usage";
import { coincidenceFactor, demandCost, demandLines, describeDemand } from "./demand";
import { neededAllNight } from "./essentials";
import type {
  AuditSettings,
  DeviceCategory,
  DeviceGroup,
  DeviceObservation,
  DeviceState,
  Offender,
} from "./types";

// Peak demand lives in its own file now - it needs a coincidence factor per
// device class, which is a table, not a line of arithmetic - but it is part of
// the money math, so it is re-exported from here where callers look for it.
export { coincidenceFactor, demandCost, demandLines, describeDemand };

/**
 * The price a kilowatt-hour costs in the hours the building is empty.
 *
 * On a time-of-use tariff this differs materially from the all-hours average,
 * in whichever direction the building's opening hours and the tariff's peak
 * window imply - see lib/tariff.ts, where it is computed. Falls back to the flat
 * rate when nothing shaped is known, which is every flat tariff and every
 * building whose price came off a bill.
 */
export function wasteRate(settings: AuditSettings): number {
  const shaped = settings.unoccupiedRatePerKwh;
  return shaped !== undefined && Number.isFinite(shaped) && shaped > 0 ? shaped : settings.ratePerKwh;
}

/** The price in the hours the building is open. Falls back to the flat rate. */
export function occupiedRate(settings: AuditSettings): number {
  const shaped = settings.occupiedRatePerKwh;
  return shaped !== undefined && Number.isFinite(shaped) && shaped > 0 ? shaped : settings.ratePerKwh;
}

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

function confidenceFor(
  state: DeviceState,
  cat: DeviceCategory,
  basis: NonNullable<Offender["basis"]>,
): Offender["confidence"] {
  if (basis === "measured") return "high";
  // A named technology resolves the one thing a generic class is vague about.
  if (basis === "tech") return "high";
  // Generic catch-all categories (lights, computer) are slightly less certain.
  if (basis === "catalog" && (cat.id === "ceiling_light" || cat.id === "desktop")) return "medium";
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

  // The state this device is in through the building's empty hours. What was seen
  // is the answer when the picture was taken after hours (or the time is unknown);
  // a device seen running during the day is assumed to drop to standby at night
  // unless the user says it is left on. Thermostatic devices cycle regardless.
  let afterHoursState: DeviceState = obs.state;
  let afterHoursBasis: Offender["afterHoursBasis"] = "observed";
  if (obs.afterHours && !cat.thermostatic) {
    afterHoursState = obs.afterHours;
    afterHoursBasis = "user";
  } else if (settings.capturedAfterHours === false && obs.state === "on" && !cat.thermostatic) {
    afterHoursState = "standby";
    afterHoursBasis = "assumed-standby";
  }

  // Everything the engine said about this unit, for the technology and screen-size
  // readers in lib/tech.ts. A photo that shows a T8 tube or a 65-inch panel has
  // already answered the question the catalog band is vague about, and the old
  // version of this file read that field only to print it on the card.
  //
  // The category's own name is deliberately not evidence. It names the class, so
  // it cannot say which member of the class this is - and two of them read as a
  // technology if you let them: "Refrigerator / mini-fridge" contains
  // "mini-fridge" and "Copier / large MFP" contains "MFP". A device the user
  // re-identified carries the catalog label as its description (lib/capture.ts),
  // so without this guard every full-size fridge in the app would quietly be
  // priced as the little one under the desk.
  const described = obs.device && obs.device.trim().toLowerCase() !== cat.label.toLowerCase() ? obs.device : undefined;
  const words = evidenceWords([obs.tech, obs.evidence, described]);

  // A user's wattage is the draw in the observed state; it only applies after hours
  // if the after-hours state is that same state.
  const userWatts = afterHoursState === obs.state ? obs.userWatts : undefined;
  const unit = estimateUnitWatts(cat, afterHoursState, { aiWatts: obs.wattsHint, userWatts, words });
  const perUnitWatts = unit.mid;
  const totalWatts = perUnitWatts * count;
  // Seen on, off at night, draws nothing in standby: nothing to cost after hours.
  // The device is still reported (typical use is real) with zero waste.
  const standbyUnit = estimateUnitWatts(cat, "standby", {});

  // Waste is billed in the empty hours, which on a time-of-use tariff are the
  // cheap ones; normal use is billed mostly in the expensive ones. Both fall back
  // to the flat rate, so a building with one price gets exactly what it always got.
  const emptyRate = wasteRate(settings);
  const openRate = occupiedRate(settings);
  // Its heat is a load on the building too - or a gift to it in a heating season.
  const interaction = hvacInteraction(cat, settings);
  const hvac = interaction.factor;

  const hoursKnown = obs.hoursPerYear !== undefined && Number.isFinite(obs.hoursPerYear) && obs.hoursPerYear >= 0;
  const hours = hoursKnown ? Math.min(8760, obs.hoursPerYear!) : settings.unoccupiedHoursPerYear;
  const kwhPerYear = (totalWatts / 1000) * hours;
  const standbyCostPerYear = ((standbyUnit.mid * count) / 1000) * settings.unoccupiedHoursPerYear * emptyRate * hvac;
  const costPerYear = kwhPerYear * emptyRate * hvac;
  const co2KgPerYear = kwhPerYear * settings.co2PerKwh * hvac;

  const costLowPerYear = ((unit.low * count) / 1000) * hours * emptyRate * hvac;
  const costHighPerYear = ((unit.high * count) / 1000) * hours * emptyRate * hvac;

  const annualSavings = costPerYear * cat.action.savingsFraction;
  const fixCost = cat.action.cost;
  const paybackMonths =
    fixCost > 0 && annualSavings > 0 ? (fixCost / annualSavings) * 12 : null;

  // Typical use, for contrast with after-hours waste: hours in use where it is,
  // standby the rest. The user's own hours win when given.
  const active = estimateUnitWatts(cat, "on", {
    aiWatts: obs.wattsHint,
    userWatts: obs.state === "on" ? obs.userWatts : undefined,
    words,
  }).mid;
  const typical = typicalUse(
    cat,
    active,
    settings.usageContext ?? "school",
    settings.occupiedHoursPerYear ?? Math.max(0, 8760 - settings.unoccupiedHoursPerYear),
    settings.roomType,
  );
  // Seen switched off: not an offender (it is drawn on the photo as a sighting).
  // Seen on but asleep after hours still gets a line: its typical use is real,
  // and its after-hours waste is honestly the standby figure.
  if (obs.state === "off" && !cat.thermostatic) return null;
  const typicalHoursPerDay = hoursKnown && !cat.thermostatic ? hours / 365 : typical.hoursPerDay;
  // A thermostatic device cycles for all 8,760 of them, which is what a 24 h/day
  // figure already comes to; everything else draws standby for the rest.
  const activeHours = Math.max(0, Math.min(8760, typicalHoursPerDay * 365));
  const standbyHours = cat.thermostatic ? 0 : Math.max(0, 8760 - activeHours);
  const typicalKwhPerUnit = (activeHours * active + standbyHours * cat.wattsStandby) / 1000;
  const typicalKwhPerYear = typicalKwhPerUnit * count;
  // Priced at the price each part is billed at. In-use hours are occupied hours,
  // so they pay the open-hours price; standby happens when nobody is there, so it
  // pays the empty-hours one. A device that cycles around the clock pays the
  // time-weighted blend. All three collapse to one figure on a flat tariff.
  const emptyShare = Math.max(0, Math.min(1, settings.unoccupiedHoursPerYear / 8760));
  const blendedRate = openRate * (1 - emptyShare) + emptyRate * emptyShare;
  const activeRate = cat.thermostatic || hoursKnown ? blendedRate : openRate;
  const typicalCostPerYear =
    ((activeHours * active * activeRate + standbyHours * cat.wattsStandby * emptyRate) / 1000) * count * hvac;
  // Typical use already pays for standby through the empty hours; leaving a
  // device on adds only the draw above standby on top of it.
  const annualCostPerYear = thermostaticTotal(cat, costPerYear, typicalCostPerYear) ?? typicalCostPerYear + Math.max(0, costPerYear - standbyCostPerYear);

  const offender: Offender = {
    id: `${source}-${cat.id}-${index}`,
    categoryId: cat.id,
    // An unrecognised device keeps the name the model gave it.
    label: cat.id === "other_device" && obs.device ? obs.device.charAt(0).toUpperCase() + obs.device.slice(1, 60) : cat.label,
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
    confidence: cat.id === "other_device" ? "low" : confidenceFor(obs.state, cat, unit.basis),
    source,
    basis: unit.basis,
    hoursPerYear: hours,
    hoursKnown,
    afterHoursState,
    afterHoursBasis,
    standbyCostPerYear,
    activeWattsPerUnit: active,
    typicalHoursPerDay,
    typicalKwhPerYear,
    typicalCostPerYear,
    annualCostPerYear,
    usageBasis: hoursKnown && !cat.thermostatic ? "Your hours" : typical.basis,
    usageSource: hoursKnown && !cat.thermostatic ? "user" : typical.source,
    wasteRatePerKwh: emptyRate,
    ...(unit.techLabel ? { techLabel: unit.techLabel } : {}),
    ...(interaction.known ? { hvacFactor: hvac, hvacBasis: interaction.basis } : {}),
    ...(obs.tech ? { tech: obs.tech } : {}),
    ...(obs.evidence ? { evidence: obs.evidence } : {}),
    ...(obs.boxes?.length ? { boxes: obs.boxes } : {}),
    ...(obs.verification === "unverified" ? { unverified: true } : {}),
    ...(obs.confidence !== undefined ? { modelConfidence: obs.confidence } : {}),
  };
  // A fridge, a router or an exit sign is meant to run all night: not waste.
  const needed = neededAllNight(cat.id, obs.device ?? "");
  return needed ? asNeeded(offender, needed) : offender;
}

/**
 * A device whose job is to run all night. Everything it draws is part of what the
 * building needs, so nothing of it is waste; its fix (consolidate a spare unit,
 * right-size a server) is priced against what it costs to run instead.
 */
function asNeeded(o: Offender, why: string): Offender {
  const running = Math.max(o.annualCostPerYear ?? 0, o.costPerYear);
  // "Consolidate the spare units" needs a spare: with one fridge there is nothing to save.
  const needsSpare = o.action.type === "consolidate" || o.action.type === "remove";
  const annualSavings = needsSpare && o.count <= 1 ? 0 : running * o.action.savingsFraction;
  return {
    ...o,
    needed: why,
    costPerYear: 0,
    costLowPerYear: 0,
    costHighPerYear: 0,
    kwhPerYear: 0,
    co2KgPerYear: 0,
    standbyCostPerYear: 0,
    annualCostPerYear: running,
    annualSavings,
    paybackMonths: o.fixCost > 0 && annualSavings > 0 ? (o.fixCost / annualSavings) * 12 : null,
  };
}

/** A fridge or vending machine runs all year whatever the schedule: its year is its typical use. */
function thermostaticTotal(cat: DeviceCategory, waste: number, typical: number): number | null {
  return cat.thermostatic ? Math.max(typical, waste) : null;
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
  // Unverified lines stay separate from counted ones of the same kind.
  const merged = new Map<string, Offender>();
  for (const o of offenders) {
    const mergeKey = o.unverified ? `${o.categoryId}:unverified` : o.categoryId;
    const existing = merged.get(mergeKey);
    if (existing) {
      existing.count += o.count;
      existing.totalWatts += o.totalWatts;
      existing.kwhPerYear += o.kwhPerYear;
      existing.costPerYear += o.costPerYear;
      existing.co2KgPerYear += o.co2KgPerYear;
      existing.costLowPerYear += o.costLowPerYear;
      existing.costHighPerYear += o.costHighPerYear;
      existing.annualSavings += o.annualSavings;
      existing.typicalKwhPerYear = (existing.typicalKwhPerYear ?? 0) + (o.typicalKwhPerYear ?? 0);
      existing.typicalCostPerYear = (existing.typicalCostPerYear ?? 0) + (o.typicalCostPerYear ?? 0);
      existing.standbyCostPerYear = (existing.standbyCostPerYear ?? 0) + (o.standbyCostPerYear ?? 0);
      existing.annualCostPerYear = (existing.annualCostPerYear ?? 0) + (o.annualCostPerYear ?? 0);
      if (o.boxes?.length) existing.boxes = [...(existing.boxes ?? []), ...o.boxes];
      existing.paybackMonths =
        existing.fixCost > 0 && existing.annualSavings > 0
          ? (existing.fixCost / existing.annualSavings) * 12
          : null;
    } else {
      merged.set(mergeKey, { ...o, id: o.unverified ? `${o.id}-unverified` : o.id, ...(o.boxes ? { boxes: [...o.boxes] } : {}) });
    }
  }

  return [...merged.values()].sort((a, b) => b.costPerYear - a.costPerYear);
}

/** The lines that count: everything the user has not been told to doubt. */
export function counted<T extends { unverified?: boolean }>(offenders: readonly T[]): T[] {
  return offenders.filter((o) => !o.unverified);
}

export interface AuditTotals {
  /** What the counted devices cost to run for a year, all in. */
  annualCostPerYear: number;
  /** After-hours waste: the part of the year's cost a fix removes. */
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
  /** Annual cost of the lines left out of the total because nobody could confirm them. */
  unverifiedCost: number;
  /**
   * Peak-demand charges attributable to what was found, USD/yr. Zero unless the
   * building is on a tariff with a demand charge, which a home never is. Kept
   * apart from costPerYear because it is a different line on the bill and a fix
   * that saves kilowatt-hours overnight does not touch it.
   */
  demandCostPerYear: number;
}

export function aggregate(all: Offender[], settings?: AuditSettings): AuditTotals {
  // Unverified lines are shown, not summed: a total that quietly included a
  // device nobody could confirm would be the exact failure this app exists to avoid.
  const offenders = counted(all);
  const unverifiedCost = all.reduce((s, o) => s + (o.unverified ? o.costPerYear : 0), 0);
  const totals = offenders.reduce(
    (acc, o) => {
      acc.costPerYear += o.costPerYear;
      acc.annualCostPerYear += o.annualCostPerYear ?? (o.typicalCostPerYear ?? 0) + o.costPerYear;
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
      annualCostPerYear: 0,
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
  const demandCostPerYear = settings ? demandCost(offenders, settings) : 0;
  return { ...totals, topOffender, unverifiedCost, demandCostPerYear };
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

// Peak-demand cost now lives in lib/demand.ts, re-exported at the top of this
// file. It used to live here, and it charged the building for every watt it found
// as though the projector, the kiln and the rooftop unit all peaked in the same
// quarter of an hour. They do not, and a demand charge computed that way can
// overstate itself threefold.

// ---- one total, two parts ------------------------------------------------

/** A device's year as one total that is exactly the sum of two parts. */
export interface CostSplit {
  /** Everything it costs to run for a year. */
  total: number;
  /** The part spent while people use it. */
  used: number;
  /** The part spent while the place is empty: the part a fix removes. */
  idle: number;
}

/**
 * The year's cost split into what is used and what sits idle, so that
 * used + idle === total. Nothing is recomputed: idle is the engine's costPerYear
 * and total is its annualCostPerYear, so every surface that shows the split agrees
 * with the ranking and the payback.
 */
export function splitCost(o: Offender): CostSplit {
  const idle = o.costPerYear;
  // A device that idles more than its own total is a rounding corner; the total
  // follows so the two parts still add up.
  const total = Math.max(o.annualCostPerYear ?? (o.typicalCostPerYear ?? 0) + o.costPerYear, idle);
  return { total, used: Math.max(0, total - idle), idle };
}

/**
 * A total and its idle part, rounded for a screen so the printed figures add up:
 * each of total and idle is rounded once, and "used" is what is left. Cents while
 * the total is under $100, where a dollar of rounding is visible; whole dollars above.
 */
export function roundSplit(total: number, idle: number): CostSplit & { cents: boolean } {
  const cents = total < 100;
  const k = cents ? 100 : 1;
  const t = Math.round(Math.max(total, idle) * k);
  const i = Math.min(t, Math.round(idle * k));
  return { total: t / k, used: (t - i) / k, idle: i / k, cents };
}

/** One device's split, rounded for a screen. */
export function splitDollars(o: Offender): CostSplit & { cents: boolean } {
  const s = splitCost(o);
  return roundSplit(s.total, s.idle);
}

/** A dollar amount as printed beside the others in a split. */
export function fmtAmt(n: number, cents: boolean): string {
  return cents ? `$${n.toFixed(2)}` : fmtMoneyFull(n);
}

/** "$17 a year = $4 used + $12 idle": the one line every surface uses. */
export function splitLine(o: Offender): string {
  const d = splitDollars(o);
  return `${fmtAmt(d.total, d.cents)} a year = ${fmtAmt(d.used, d.cents)} used + ${fmtAmt(d.idle, d.cents)} idle`;
}

/** The same line for an aggregate, where only the total and idle are known. */
export function splitLineOf(total: number, idle: number): string {
  const d = roundSplit(total, idle);
  return `${fmtAmt(d.total, d.cents)} a year = ${fmtAmt(d.used, d.cents)} used + ${fmtAmt(d.idle, d.cents)} idle`;
}

/**
 * What the idle figure could be, in words; null when there is nothing to say
 * (it idles at nothing, or the range is too narrow to show).
 */
export function idleRangeLine(o: Offender): string | null {
  const { low, high } = idleRange(o);
  return idleRangeText(low, high);
}

/** The same sentence for any low and high, such as a sum over a whole view. */
export function idleRangeText(low: number, high: number): string | null {
  // An estimate between two guesses: whole dollars, unless it is all small change.
  const cents = high < 10;
  const [l, h] = [fmtAmt(cents ? low : Math.round(low), cents), fmtAmt(cents ? high : Math.round(high), cents)];
  return l === h ? null : `idle could be ${l} to ${h} depending on what it does when nobody is there`;
}

/**
 * How much the idle figure could move, depending on what the device does when
 * nobody is there. Low: it sleeps. High: it stays fully on. The engine's own idle
 * figure always sits inside the range.
 */
export function idleRange(o: Offender): { low: number; high: number } {
  const idle = o.costPerYear;
  if (o.needed) return { low: 0, high: 0 };
  const low = o.standbyCostPerYear ?? 0;
  const high =
    (((o.activeWattsPerUnit ?? 0) * o.count) / 1000) * (o.hoursPerYear ?? 0) * (o.wasteRatePerKwh ?? 0) * (o.hvacFactor ?? 1);
  return { low: Math.min(low, idle), high: Math.max(high, idle) };
}

/** The draw behind each part, in watts. */
export interface WattSplit {
  /** Around the clock, averaged over all 8,760 hours. */
  total: number;
  /** While it is in use. */
  used: number;
  /** While nobody is there, in the state it is assumed to be in. */
  idle: number;
}

export function splitWatts(o: Offender): WattSplit {
  const idle = o.totalWatts;
  const used = (o.activeWattsPerUnit ?? o.perUnitWatts) * o.count;
  const rate = (o.wasteRatePerKwh ?? 0) * (o.hvacFactor ?? 1);
  // Idle energy above the standby it would draw anyway, which typical use already counts.
  const standbyKwh = rate > 0 ? (o.standbyCostPerYear ?? 0) / rate : 0;
  const extra = Math.max(0, o.kwhPerYear - standbyKwh);
  const typical = o.typicalKwhPerYear ?? 0;
  const cat = CATALOG_BY_ID[o.categoryId];
  // Something that cycles all year is already counted in full; the larger of the two stands.
  const kwh = cat?.thermostatic ? Math.max(typical, o.kwhPerYear) : typical + extra;
  return { total: (kwh * 1000) / 8760, used, idle };
}

/**
 * Why the idle figure is what it is, in a few words, from fields the engine already
 * sets. The schedule is named by the kind of place (home, school, office) when the
 * caller knows it.
 */
export function idleCaption(o: Offender, place?: "home" | "school" | "office"): string {
  const how =
    o.afterHoursBasis === "assumed-standby" ? "assumes it sleeps overnight" : o.afterHoursBasis === "user" ? "set by you" : "as photographed";
  const empty = Math.round(o.hoursPerYear ?? 0).toLocaleString("en-US");
  const when = o.hoursKnown ? "your hours" : `${place ?? "typical"} schedule, ${empty} empty hours/yr`;
  return `${how} · ${when}`;
}

/** The split, the range and the draw for a set of devices: what a summary shows. */
export function splitAll(offenders: readonly Offender[]): { cost: CostSplit; range: { low: number; high: number }; watts: WattSplit } {
  const acc = { cost: { total: 0, used: 0, idle: 0 }, range: { low: 0, high: 0 }, watts: { total: 0, used: 0, idle: 0 } };
  for (const o of offenders) {
    const c = splitCost(o);
    const r = idleRange(o);
    const w = splitWatts(o);
    acc.cost.total += c.total;
    acc.cost.used += c.used;
    acc.cost.idle += c.idle;
    acc.range.low += r.low;
    acc.range.high += r.high;
    acc.watts.total += w.total;
    acc.watts.used += w.used;
    acc.watts.idle += w.idle;
  }
  return acc;
}

/** What a set of idle figures assumes, in a few words. */
export function idleCaptionAll(offenders: readonly Offender[], place?: "home" | "school" | "office"): string {
  const idling = offenders.filter((o) => !o.needed);
  const assumed = idling.some((o) => o.afterHoursBasis === "assumed-standby");
  const how = assumed ? "assumes daytime devices sleep overnight" : idling.length && idling.every((o) => o.afterHoursBasis === "user") ? "set by you" : "as photographed";
  const open = idling.find((o) => !o.hoursKnown);
  const when = open ? `${place ?? "typical"} schedule, ${Math.round(open.hoursPerYear ?? 0).toLocaleString("en-US")} empty hours/yr` : "your hours";
  return `${how} · ${when}`;
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
