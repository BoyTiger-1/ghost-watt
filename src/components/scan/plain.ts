// Plain words for the scan results.
//
// The reader this is written for has never looked at the back of an electric
// bill. So a state is what the device is doing, a wattage is compared with light
// bulbs, hours are hours a day, and every unit that has to appear has a one-line
// explanation in GLOSSARY that the Term component shows on tap.

import type { DeviceState, Offender } from "@/lib/types";

export const STATE_PLAIN: Record<DeviceState, string> = {
  on: "Left on",
  standby: "Asleep",
  off: "Off",
};

/** Colours shared by the photo boxes, the pills and the charts. */
export const STATE_COLOR: Record<DeviceState, string> = {
  on: "#ff6a5c",
  standby: "#ffb24d",
  off: "#7d8799",
};

/**
 * A device that is meant to run all night (a fridge, a router): usage, not waste.
 * Blue, so it never reads as one of the red and amber things to switch off.
 */
export const USAGE_COLOR = "#5aa9ff";

/** What a box on the photo is, for the legend under it: a state, or usage. */
export type BoxKind = DeviceState | "usage";

export const GLOSSARY = {
  watt: "How hard a device is pulling power at one moment. A phone charger uses about 5 watts, an LED bulb about 10, a microwave about 1,000.",
  kwh: "A kilowatt-hour is the unit your electric bill charges for: 1,000 watts running for one hour. In most of the US one costs between 12 and 30 cents.",
  standby: "Asleep means switched “off” but still plugged in and using a trickle of power, like a TV waiting for its remote.",
  empty: "The hours nobody is in the room: nights, weekends and holidays. Anything left running then is paying for nothing.",
  payback: "How long the savings take to cover what the fix costs. After that, the savings are money in your pocket.",
  carbon: "Most electricity is made by burning fuel, which puts carbon dioxide (CO₂) into the air, the main gas warming the planet.",
  range: "We can’t read the exact model of every device from a photo, so we give a likely low and high. Typing in real wattages or your bill’s price narrows it.",
  needed: "What these devices cost while people are actually using them. That part isn’t waste.",
  wasted: "What they cost while the room is empty, because they were left on or asleep. This is the part the fixes go after.",
} as const;

export type GlossaryKey = keyof typeof GLOSSARY;

/** A wattage as something you can picture. */
export function wattsPicture(watts: number): string {
  if (watts <= 0) return "nothing";
  const bulbs = watts / 10;
  if (bulbs < 0.75) return "less than one LED bulb";
  if (bulbs < 1.5) return "about one LED bulb";
  if (bulbs < 60) return `about ${Math.round(bulbs)} LED bulbs`;
  if (watts < 1500) return "about as much as a microwave running";
  const heaters = Math.round(watts / 1500);
  return `about ${heaters} space heater${heaters === 1 ? "" : "s"} running`;
}

/** Hours a year as hours a day, rounded the way a person would say it. */
export function hoursPerDayWords(hoursPerYear: number): string {
  const h = hoursPerYear / 365;
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} minutes a day`;
  return `${Math.round(h)} hour${Math.round(h) === 1 ? "" : "s"} a day`;
}

export function monthsWords(months: number | null): string {
  if (months === null) return "right away";
  if (months < 1) return "under a month";
  if (months < 24) return `${Math.round(months)} month${Math.round(months) === 1 ? "" : "s"}`;
  return `${(months / 12).toFixed(1)} years`;
}

export function confidenceWords(c: Offender["confidence"]): string {
  return c === "high" ? "Clear in the photo" : c === "medium" ? "Fairly clear" : "Hard to see, worth checking";
}

/** How the wattage was known, in words. */
export function basisWords(o: Offender): string {
  if (o.basis === "measured") return "You measured it";
  if (o.basis === "tech") {
    // The strongest thing short of a meter: the photo showed which kind of unit
    // this is, and the figure is for that kind rather than for the class average.
    return o.techLabel
      ? `Recognised from the photo as ${o.techLabel}, and priced as one`
      : "Recognised from the photo, and priced as that kind of unit";
  }
  if (o.basis === "ai") return "Read from the photo by AI, checked against published figures";
  return "A typical figure for this kind of device";
}

/** How the after-hours behaviour was decided, in words. */
export function afterHoursWords(o: Offender): string {
  const what = o.afterHoursState === "on" ? "stays on" : o.afterHoursState === "standby" ? "goes to sleep" : "is switched off";
  if (o.afterHoursBasis === "assumed-standby") return `Seen while people were around, so we assume it ${what} when they leave.`;
  if (o.afterHoursBasis === "user") return `You said it ${what} when the room is empty.`;
  return `Seen like this, so we assume it ${what} when the room is empty.`;
}
