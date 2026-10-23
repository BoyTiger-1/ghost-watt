// The other half of a commercial electricity bill.
//
// Most schools and offices are not billed for kilowatt-hours alone. They are also
// billed for their highest fifteen-minute average draw of the month, at $8 to $25
// per kilowatt, every month, whether or not that peak lasted longer than a
// quarter of an hour. On a mid-sized school that line is a fifth to a third of
// the bill, and it is completely invisible to a per-kWh estimate.
//
// The trap is that it is equally wrong to ignore it and to count it naively. The
// first version of this calculation added up every device seen running and
// charged the building for all of it, twelve times over. That assumes the
// projector, the kiln, the rooftop unit and the dishwasher all hit their maximum
// in the same fifteen minutes, which is not how a building behaves: the kiln
// fires on a Tuesday afternoon and the dishwasher runs after lunch, and the
// month's peak is whatever combination happened to collide.
//
// What utilities and load-research studies use for this is a coincidence factor:
// the share of a load's own maximum that is actually present at the building's
// peak. Lighting and servers are close to 1 - they are on whenever the building
// is. Thermostatically cycling equipment is lower, because the peak catches some
// of it between cycles. Intermittent equipment is lower still.
//
// And one thing matters more than any of the factors: a device left on *overnight*
// contributes nothing to a monthly peak, because the peak happens in the middle
// of a weekday afternoon when the whole building is running. So after-hours waste
// carries no demand charge at all, and saying otherwise would be the single
// largest overstatement available in this app.

import type { AuditSettings, DeviceCategory, DeviceGroup, Offender } from "./types";

/**
 * Share of a load's own draw that is present at the building's monthly peak.
 *
 * By device class first, then by group, then a default. Figures are the pattern
 * utility load-research studies report for commercial end uses, rounded hard -
 * they are being used to avoid a 3x overstatement, not to bill anyone.
 */
const COINCIDENCE_BY_CATEGORY: Record<string, number> = {
  // On whenever the building is, by definition.
  exit_sign: 1,
  server: 1,
  ups: 1,
  access_point: 1,
  security_recorder: 1,
  digital_signage: 1,
  // Daytime equipment, near-certain to be running at the afternoon peak.
  ceiling_light: 0.95,
  downlight: 0.9,
  monitor: 0.85,
  desktop: 0.85,
  laptop: 0.6,
  smartboard: 0.7,
  // Lit at night, off in the afternoon: a photocell light is the textbook
  // non-coincident load, and charging the building for it would be plain wrong.
  exterior_light: 0.05,
  // Intermittent by nature. A projector is on for one lesson in three.
  projector: 0.4,
  copier: 0.25,
  printer: 0.15,
  printer_3d: 0.3,
  kiln: 0.2,
  stage_light: 0.1,
  scoreboard: 0.1,
  pa_amplifier: 0.3,
  hand_dryer: 0.1,
  microwave: 0.1,
  coffee: 0.2,
  commercial_oven: 0.5,
  dishwasher_commercial: 0.3,
  steam_table: 0.6,
  // Cycling equipment: the peak catches a fraction of the fleet mid-cycle, which
  // for a group of them is close to the duty cycle itself.
  fridge: 0.6,
  vending_cold: 0.7,
  water_heater: 0.3,
  pool_pump: 0.8,
  ev_charger: 0.4,
  elevator: 0.3,
  // The cooling plant peaks with the building: hot afternoon, full occupancy.
  rtu: 0.9,
  ac_window: 0.85,
  heat_pump: 0.8,
  // A space heater peaks on a cold winter morning, which is usually not the
  // month's peak in a cooling-dominated building and is in a heating one.
  space_heater: 0.5,
};

const COINCIDENCE_BY_GROUP: Record<DeviceGroup, number> = {
  lighting: 0.9,
  display: 0.7,
  computing: 0.8,
  network: 1,
  refrigeration: 0.6,
  hvac: 0.85,
  kitchen: 0.4,
  office: 0.25,
  specialty: 0.4,
};

/** The default for a device the catalog has nothing specific to say about. */
const DEFAULT_COINCIDENCE = 0.4;

export function coincidenceFactor(cat: Pick<DeviceCategory, "id" | "group">): number {
  const byId = COINCIDENCE_BY_CATEGORY[cat.id];
  if (byId !== undefined) return byId;
  return cat.group ? COINCIDENCE_BY_GROUP[cat.group] : DEFAULT_COINCIDENCE;
}

export interface DemandLine {
  offender: Offender;
  /** Kilowatts this line adds to the building's monthly peak. */
  kwAtPeak: number;
  costPerYear: number;
  coincidence: number;
}

/**
 * What each line adds to the demand charge, and what that costs for a year.
 *
 * Only loads seen running during occupied hours are counted. A device whose waste
 * is overnight raises no peak: its demand contribution is the draw it would have
 * had anyway in the middle of the day, which the building is paying for with or
 * without the fix, so attributing it to the fix would be double-counting a saving.
 */
export function demandLines(offenders: readonly Offender[], settings: AuditSettings): DemandLine[] {
  const rate = settings.demandChargePerKw ?? 0;
  if (rate <= 0) return [];
  const out: DemandLine[] = [];
  for (const o of offenders) {
    // A thermostatic device runs whatever its observed state; everything else has
    // to have been seen on to be at the building's peak.
    const atPeak = o.state === "on";
    if (!atPeak) continue;
    const coincidence = coincidenceFactor({ id: o.categoryId, group: o.group });
    // Its draw while actually running, not its after-hours average: the peak is a
    // daytime event and the daytime figure is the one that belongs in it.
    const watts = (o.activeWattsPerUnit ?? o.perUnitWatts) * o.count;
    const kwAtPeak = (watts / 1000) * coincidence;
    out.push({ offender: o, kwAtPeak, costPerYear: kwAtPeak * rate * 12, coincidence });
  }
  return out.sort((a, b) => b.costPerYear - a.costPerYear);
}

/**
 * Peak-demand cost across the whole audit, USD per year.
 *
 * Zero without a demand charge in the settings, which is the right answer for a
 * home and for the small commercial accounts that are billed on energy alone.
 */
export function demandCost(offenders: readonly Offender[], settings: AuditSettings): number {
  return demandLines(offenders, settings).reduce((s, l) => s + l.costPerYear, 0);
}

/** One sentence on what the demand charge is doing, for the report. */
export function describeDemand(offenders: readonly Offender[], settings: AuditSettings): string | null {
  const rate = settings.demandChargePerKw ?? 0;
  if (rate <= 0) return null;
  const lines = demandLines(offenders, settings);
  if (!lines.length) return null;
  const kw = lines.reduce((s, l) => s + l.kwAtPeak, 0);
  const cost = lines.reduce((s, l) => s + l.costPerYear, 0);
  const naiveKw = lines.reduce((s, l) => s + l.kwAtPeak / Math.max(0.01, l.coincidence), 0);
  return (
    `About ${kw.toFixed(1)} kW of what was found is likely present at the building's monthly peak, ` +
    `which at $${rate.toFixed(2)}/kW costs roughly $${Math.round(cost).toLocaleString()} a year in demand charges. ` +
    `The devices add up to ${naiveKw.toFixed(1)} kW of nameplate draw, but they do not all peak together, ` +
    `so only the coincident share is counted. Overnight waste is excluded: it raises no peak.`
  );
}
