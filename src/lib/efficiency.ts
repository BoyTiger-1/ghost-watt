// Is this device a good one, or a bad one used badly?
//
// The audit says what each device costs. This says *why*, which decides what to
// do about it:
//
//   - inefficient hardware: a halogen downlight draws 50 W to do what a 9 W LED
//     does. Switching it off helps; replacing it fixes it for good, and usually
//     pays for itself within months.
//   - a bad habit: an efficient LED monitor left on all night. Nothing to buy -
//     the fix is a sleep setting or a timer.
//   - standby: asleep but drawing. A smart strip.
//
// Each device is graded against what an efficient modern equivalent draws
// (ENERGY STAR or best-common-practice figures), and the replacement is priced
// at *typical* use - not the left-on hours - so a payback here is one a buyer
// would actually see.

import { CATALOG_BY_ID } from "./devices";
import { evidenceWords, readTech } from "./tech";
import type { AuditSettings, Offender } from "./types";

export type Grade = "A" | "B" | "C" | "D" | "F";
export type Verdict = "replace" | "consider" | "habit" | "standby" | "fine";

interface Benchmark {
  /** What an efficient unit draws in use, W (duty-cycled average for appliances). */
  efficientWatts: number;
  efficientLabel: string;
  /** What to buy, and roughly what one costs installed, USD. 0: not a buy-a-new-one fix. */
  replaceWith: string;
  replaceCost: number;
  note?: string;
}

const BENCHMARKS: Record<string, Benchmark> = {
  downlight: {
    efficientWatts: 9,
    efficientLabel: "an LED bulb (~9 W)",
    replaceWith: "LED bulbs or retrofit downlights",
    replaceCost: 6,
  },
  ceiling_light: {
    efficientWatts: 35,
    efficientLabel: "an LED troffer or panel (~35 W)",
    replaceWith: "LED troffer retrofit kits",
    replaceCost: 90,
  },
  exterior_light: { efficientWatts: 70, efficientLabel: "an LED area light (~70 W)", replaceWith: "LED area lights with photocells", replaceCost: 250 },
  exit_sign: { efficientWatts: 2, efficientLabel: "an LED exit sign (~2 W)", replaceWith: "LED exit signs", replaceCost: 30 },
  stage_light: { efficientWatts: 150, efficientLabel: "an LED PAR (~150 W)", replaceWith: "LED stage fixtures", replaceCost: 300 },
  monitor: {
    efficientWatts: 16,
    efficientLabel: "an ENERGY STAR 24-inch LED monitor (~16 W)",
    replaceWith: "ENERGY STAR LED monitors",
    replaceCost: 150,
  },
  desktop: { efficientWatts: 35, efficientLabel: "an efficient desktop or mini PC (~35 W)", replaceWith: "a mini PC or laptop at the next refresh", replaceCost: 500 },
  laptop: { efficientWatts: 20, efficientLabel: "a typical laptop (~20 W)", replaceWith: "", replaceCost: 0, note: "Laptops are already the efficient way to compute." },
  tv: { efficientWatts: 55, efficientLabel: "an ENERGY STAR 50-inch LED TV (~55 W)", replaceWith: "an ENERGY STAR LED TV", replaceCost: 400 },
  projector: { efficientWatts: 160, efficientLabel: "a laser projector (~160 W)", replaceWith: "a laser projector when the lamp dies", replaceCost: 900 },
  smartboard: { efficientWatts: 120, efficientLabel: "a current LED interactive panel (~120 W)", replaceWith: "", replaceCost: 0 },
  space_heater: { efficientWatts: 1500, efficientLabel: "any resistance heater", replaceWith: "", replaceCost: 0, note: "Every resistance heater turns a watt into the same heat; a heat pump gives about three times as much per watt." },
  vending_cold: { efficientWatts: 130, efficientLabel: "an ENERGY STAR machine with a controller (~130 W average)", replaceWith: "a vending-machine occupancy controller", replaceCost: 180 },
  fridge: { efficientWatts: 0, efficientLabel: "", replaceWith: "an ENERGY STAR refrigerator", replaceCost: 900 },
  microwave: { efficientWatts: 0, efficientLabel: "", replaceWith: "", replaceCost: 0 },
  coffee: { efficientWatts: 0, efficientLabel: "", replaceWith: "", replaceCost: 0 },
};

export interface Assessment {
  grade: Grade;
  /** Draw in use against the efficient benchmark: 2 means twice as much. */
  ratio: number;
  activeWatts: number;
  efficientWatts: number;
  efficientLabel: string;
  /** Technology, when known ("halogen", "CRT"). */
  tech: string | null;
  verdict: Verdict;
  headline: string;
  detail: string;
  replace: { what: string; cost: number; savingsPerYear: number; paybackYears: number } | null;
  /** True when the grade rests on a typical unit rather than a reading of this one. */
  assumed: boolean;
}

function gradeOf(ratio: number): Grade {
  if (ratio <= 1.2) return "A";
  if (ratio <= 1.6) return "B";
  if (ratio <= 2.2) return "C";
  if (ratio <= 3.2) return "D";
  return "F";
}

const money = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${Math.round(n)}`);
const watts = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)} kW` : `${Math.round(n)} W`);

export function assessEfficiency(o: Offender, settings: Pick<AuditSettings, "ratePerKwh">): Assessment {
  const cat = CATALOG_BY_ID[o.categoryId];
  const b: Benchmark | undefined = BENCHMARKS[o.categoryId];
  let active = o.activeWattsPerUnit ?? o.perUnitWatts;
  let tech: string | null = null;
  let assumed = o.basis === "catalog" || o.basis === undefined;

  // A technology the model named overrides a catalog-typical guess. The table it
  // is read from is the same one the cost engine uses (lib/tech.ts), so the grade
  // on this card and the dollars on it can never be based on different wattages -
  // which they were, when this file had a technology table of its own and
  // lib/energy.ts had none.
  // The label is left out on purpose: it is the class's own name, so it says
  // nothing about which member of the class this is, and two of them read as a
  // technology if you let them ("Refrigerator / mini-fridge", "Copier / large
  // MFP"). techLabel is the reading the cost engine already settled on.
  const reading = readTech(o.categoryId, evidenceWords([o.techLabel, o.tech, o.evidence]));
  if (reading) {
    tech = reading.label;
    if (assumed) {
      active = reading.watts * (cat?.thermostatic ? cat.dutyCycle : 1);
      assumed = false;
    }
  }

  // Without a specific benchmark, the best units in the catalog band are the bar.
  const efficient =
    b && b.efficientWatts > 0
      ? b.efficientWatts
      : cat
        ? (cat.wattsLow ?? cat.wattsOn * 0.75) * (cat.thermostatic ? cat.dutyCycle : 1)
        : active;
  const efficientLabel =
    b?.efficientLabel || (cat ? `the most efficient ${cat.label.toLowerCase()} units (~${watts(efficient)})` : "an efficient unit");
  const ratio = efficient > 0 ? active / efficient : 1;
  const grade = b?.note && !b.replaceCost ? (ratio > 1.6 ? gradeOf(ratio) : "B") : gradeOf(ratio);

  // Replacement, priced at typical use: what the buyer would actually save.
  const hoursPerYear = (o.typicalHoursPerDay ?? 4) * 365;
  const savingsPerYear = (Math.max(0, active - efficient) * hoursPerYear * o.count * settings.ratePerKwh) / 1000;
  const replaceCost = (b?.replaceCost ?? 0) * o.count;
  const paybackYears = savingsPerYear > 0 && replaceCost > 0 ? replaceCost / savingsPerYear : Infinity;
  const replace =
    b?.replaceWith && replaceCost > 0 && savingsPerYear > 1
      ? { what: b.replaceWith, cost: replaceCost, savingsPerYear, paybackYears }
      : null;

  let verdict: Verdict;
  if (replace && (grade === "D" || grade === "F") && paybackYears <= 6) verdict = "replace";
  else if (replace && (grade === "C" || grade === "D" || grade === "F") && paybackYears <= 10) verdict = "consider";
  else if (o.state === "standby") verdict = "standby";
  else if (o.state === "on") verdict = "habit";
  else verdict = "fine";

  const per = o.count > 1 ? " each" : "";
  const vs = `Draws ~${watts(active)}${per}${tech ? ` (${tech})` : ""}; ${efficientLabel}${ratio >= 1.25 ? ` - ${ratio.toFixed(1)}x as much` : ""}.`;
  const payback = (y: number) => (y < 1 ? `${Math.max(1, Math.round(y * 12))} months` : `${y.toFixed(1)} years`);

  const good = grade === "A" || grade === "B";
  const headline: Record<Verdict, string> = {
    replace: "Inefficient - replace it",
    consider: "Worth upgrading at the next replacement",
    habit: good
      ? "Efficient - the waste is leaving it on"
      : grade === "C"
        ? "Middling efficiency - the bigger waste is leaving it on"
        : "Inefficient, and left on",
    standby: "Fine in use - the waste is standby draw",
    fine: "Efficient - leave it",
  };
  const detail: Record<Verdict, string> = {
    replace: `${vs} Switching to ${replace?.what} saves ~${money(replace?.savingsPerYear ?? 0)}/yr in normal use and pays back in ${payback(paybackYears)}.`,
    consider: `${vs} Replacing now (~${money(replace?.cost ?? 0)}) pays back in ${payback(paybackYears)}; choose ${replace?.what} when it is due anyway.`,
    habit: `${vs} ${
      b?.note ?? (good ? "The hardware is not the problem." : "A newer unit would help a little; switching it off helps far more.")
    } Turn it off, or put it on a timer or sensor.`,
    standby: `${vs} Asleep it still draws ~${watts(cat?.wattsStandby ?? 0)}${per}; a smart power strip cuts that to zero.`,
    fine: `${vs} ${b?.note ?? ""}`.trim(),
  };

  return {
    grade,
    ratio,
    activeWatts: active,
    efficientWatts: efficient,
    efficientLabel,
    tech,
    verdict,
    headline: headline[verdict],
    detail: detail[verdict],
    replace,
    assumed,
  };
}

export interface EfficiencySummary {
  replace: { offender: Offender; a: Assessment }[];
  habit: { offender: Offender; a: Assessment }[];
  fine: { offender: Offender; a: Assessment }[];
  /** Normal-use savings from every recommended replacement, USD/yr. */
  replaceSavings: number;
  replaceCost: number;
}

/** The audit split into what to buy, what to stop doing, and what is fine. */
export function summarizeEfficiency(offenders: Offender[], settings: Pick<AuditSettings, "ratePerKwh">): EfficiencySummary {
  const out: EfficiencySummary = { replace: [], habit: [], fine: [], replaceSavings: 0, replaceCost: 0 };
  for (const o of offenders) {
    const a = assessEfficiency(o, settings);
    if (a.verdict === "replace" || a.verdict === "consider") {
      out.replace.push({ offender: o, a });
      out.replaceSavings += a.replace?.savingsPerYear ?? 0;
      out.replaceCost += a.replace?.cost ?? 0;
    } else if (a.verdict === "habit" || a.verdict === "standby") out.habit.push({ offender: o, a });
    else out.fine.push({ offender: o, a });
  }
  out.replace.sort((x, y) => (y.a.replace?.savingsPerYear ?? 0) - (x.a.replace?.savingsPerYear ?? 0));
  return out;
}
