// Calibration against one real utility bill.
//
// This is the cheapest credibility in the whole app. Until a bill is entered, every
// dollar figure downstream rests on a state-average price and a published wattage
// table - defensible, but assumption stacked on assumption. One line off one bill
// replaces the largest of those assumptions with a measurement.
//
// What it deliberately does NOT do is invent a fudge factor. The audit measures
// phantom load in specific rooms; a bill measures the whole building including HVAC,
// kitchens and everything never photographed. There is no honest way to divide one
// by the other and call the result a correction. So this module does three things it
// can actually stand behind:
//
//   1. Derives the true blended $/kWh, which replaces the state average outright.
//   2. Computes the building's real EUI and benchmarks it against CBECS peers.
//   3. States what share of the metered bill the audit's findings account for -
//      which is a sanity check on the model rather than an adjustment to it. If a
//      photo audit claims 60% of a school's electricity, the model is wrong, and
//      the app should be the one to say so.

import { BUILDING_TYPE_BY_ID, BUILDING_TYPES } from "./benchmark";

/** One line off one utility bill. Everything here comes from the paper. */
export interface UtilityBill {
  /** Metered consumption for the period, kWh. */
  kwh: number;
  /** Total amount billed for the period, USD. */
  dollars: number;
  /** Length of the billing period, days. */
  days: number;
  /** ISO date the period ended. Used only for display. */
  periodEnd: string;
}

export interface Calibration {
  /** True blended price actually paid, USD/kWh. */
  ratePerKwh: number;
  /** How far the state average was off, as a signed fraction. */
  rateErrorVsAssumed: number;
  /** Metered consumption scaled to a full year, kWh. */
  annualKwh: number;
  /** Annual electricity spend implied by this bill, USD. */
  annualDollars: number;
  /** Real electricity EUI, kBtu/sq ft/yr. Null without a floor area. */
  eui: number | null;
  /** CBECS median for this building type, kBtu/sq ft/yr. */
  medianEui: number;
  /** Real EUI as a fraction of the peer median. Null without a floor area. */
  vsMedian: number | null;
  /** Share of the metered bill the audit's findings account for, 0-1. */
  shareOfBill: number;
  /** Whether that share is believable. */
  plausibility: "believable" | "high" | "implausible";
  /** Plain-language reading of the above. */
  message: string;
}

const KWH_TO_KBTU = 3.412;

/**
 * Read one bill against one audit.
 *
 * `auditKwhPerYear` is the annualised waste the audit found. `assumedRate` is the
 * figure the report currently uses, so the caller can show how wrong it was.
 */
export function calibrate(
  bill: UtilityBill,
  auditKwhPerYear: number,
  assumedRate: number,
  floorAreaSqFt: number,
  typeId: string,
): Calibration | null {
  if (!(bill.kwh > 0) || !(bill.dollars > 0) || !(bill.days > 0)) return null;

  const ratePerKwh = bill.dollars / bill.kwh;
  const annualKwh = (bill.kwh / bill.days) * 365;
  const annualDollars = (bill.dollars / bill.days) * 365;

  const type = BUILDING_TYPE_BY_ID[typeId] ?? BUILDING_TYPES[0];
  const eui = floorAreaSqFt > 0 ? (annualKwh * KWH_TO_KBTU) / floorAreaSqFt : null;
  const vsMedian = eui === null ? null : eui / type.medianEui;

  const shareOfBill = annualKwh > 0 ? auditKwhPerYear / annualKwh : 0;

  // Bounds chosen from what phantom load actually is in commercial buildings.
  // Plug and lighting load is typically a third to a half of total electricity,
  // and only part of that is after-hours waste. A photo audit of a few rooms
  // landing above a quarter of the entire meter is a signal to distrust it.
  let plausibility: Calibration["plausibility"];
  if (shareOfBill <= 0.15) plausibility = "believable";
  else if (shareOfBill <= 0.25) plausibility = "high";
  else plausibility = "implausible";

  const pct = (shareOfBill * 100).toFixed(1);
  const rateErrorVsAssumed =
    assumedRate > 0 ? (ratePerKwh - assumedRate) / assumedRate : 0;

  let message: string;
  if (plausibility === "believable") {
    message =
      `The waste in this audit accounts for ${pct}% of the building's metered electricity. ` +
      `That is a plausible share for after-hours plug and lighting load, which is the ` +
      `weakest evidence this model is behaving sensibly - and it passes.`;
  } else if (plausibility === "high") {
    message =
      `The waste in this audit accounts for ${pct}% of the building's metered electricity. ` +
      `That is high but not impossible for a building with a serious after-hours problem. ` +
      `Worth confirming the audited rooms are representative before quoting the total.`;
  } else {
    message =
      `The waste in this audit accounts for ${pct}% of the building's entire metered ` +
      `electricity, which is not credible for phantom load. Most likely a device count or ` +
      `the unoccupied-hours figure is too high, or the bill covers only part of the campus. ` +
      `Treat the ranking as useful and the total as unreliable until that is resolved.`;
  }

  return {
    ratePerKwh,
    rateErrorVsAssumed,
    annualKwh,
    annualDollars,
    eui,
    medianEui: type.medianEui,
    vsMedian,
    shareOfBill,
    plausibility,
    message,
  };
}

/** How the real EUI reads against peers, in words. */
export function euiVerdict(vsMedian: number | null, typeLabel: string): string | null {
  if (vsMedian === null) return null;
  const pct = Math.round(Math.abs(vsMedian - 1) * 100);
  if (vsMedian < 0.8) {
    return `This building uses ${pct}% less electricity per square foot than a median ${typeLabel.toLowerCase()}. It is already efficient - which makes the waste below the part still worth chasing.`;
  }
  if (vsMedian <= 1.2) {
    return `This building sits within ${pct}% of the median ${typeLabel.toLowerCase()} for electricity per square foot. Typical, in other words, which is exactly why the after-hours findings matter.`;
  }
  return `This building uses ${pct}% more electricity per square foot than a median ${typeLabel.toLowerCase()}. That gap is larger than phantom load alone explains, and is worth a look at HVAC scheduling too.`;
}
