// The watt you pay for twice.
//
// A 30 W monitor left on overnight does not cost 30 W of electricity. It costs
// 30 W of electricity plus whatever the air conditioner spends removing 30 W of
// heat from the room - because every watt a device draws comes out of it as
// heat, and in a building that is being cooled that heat is a load. Conversely,
// in a building that is being heated the same 30 W is 30 W the heating system
// did not have to supply, so part of it comes back.
//
// This is the "interactive effect" that every measurement-and-verification
// protocol makes you account for, and it is the largest term missing from a
// naive watts x hours x rate estimate. Its size:
//
//   cooling season   + 1/COP of the device's draw. A packaged rooftop unit with
//                      a seasonal COP near 3.2 spends about a third of a watt
//                      per watt of heat removed, which is the 0.33 cooling
//                      adjustment factor used in lighting-retrofit practice.
//   heating season   - 1/COP_heat, but only if the heat is electric. Resistance
//                      heat has a COP of 1, so the credit is the full watt. A
//                      heat pump at COP 2.5 gives back 0.4 of it. A gas boiler
//                      gives back no electricity at all - the saving is therms,
//                      which is a real saving and not one this app bills for.
//   neither          nothing, and most of the year in a mild climate is neither.
//
// Two things keep this honest rather than a thumb on the scale:
//
//   1. It is identity unless the building says how it is heated and cooled. No
//      climate, no fuel, no factor. A correction nobody can check is worse than
//      no correction.
//   2. It does not apply to the heating and cooling equipment itself. An air
//      conditioner's consumption *is* the conditioning; adding an interaction
//      term on top of it would count the same energy twice.

import { climateOf, describeClimate, seasons, US_CLIMATE, type Climate } from "./climate";
import type { CoolingKind, DeviceCategory, HeatingFuel } from "./types";

export type { CoolingKind, HeatingFuel };

/**
 * Seasonal coefficient of performance of a typical installed commercial cooling
 * system. A SEER 13-14 packaged unit lands here once part-load and fan power are
 * counted, and 1/3.2 = 0.31 is within rounding of the 0.33 cooling adjustment
 * factor that lighting-retrofit practice has used for years.
 */
export const DEFAULT_COOLING_COP = 3.2;
/** A current air-source heat pump over a whole heating season, including defrost. */
export const DEFAULT_HEAT_PUMP_COP = 2.5;

/**
 * How much of the heating credit a device left on after hours actually earns.
 *
 * The cooling penalty and the heating credit are not equally certain, and
 * treating them as though they were produces a result that is correct in physics
 * and wrong in practice. The penalty is unavoidable: if a room is being cooled,
 * the heat has to be removed, full stop. The credit needs the heat to arrive
 * where and when somebody wanted it - and the device this app is costing is a
 * device nobody is using, in a room nobody is in, in a building that has usually
 * dropped to a setback temperature for the night. Its heat partly displaces
 * purchased heat and partly leaks out of an unoccupied space the heating system
 * was not trying to hold at occupied setpoint anyway.
 *
 * Halving it is a judgement, and it is the conservative direction: it keeps the
 * app from telling a school in a cold climate that its monitors are usefully
 * heating the building. Without it a heating-dominated building with resistance
 * heat comes out near a 0.35 factor, which is defensible arithmetic and ruinous
 * advice - not least because it stops being true the day anyone fits a heat pump.
 */
export const HEATING_CREDIT_DERATE = 0.5;

/**
 * No climate makes a device this much cheaper to leave running than its own
 * meter says. Below this the figure is an artefact of a degree-day approximation
 * rather than physics, and a factor that low would be read as a recommendation.
 */
const MIN_FACTOR = 0.6;

export interface ThermalContext {
  /** Two-letter state code; sets the climate when degree days are not given directly. */
  regionCode?: string;
  hdd65?: number;
  cdd65?: number;
  heating?: HeatingFuel;
  cooling?: CoolingKind;
  coolingCop?: number;
  heatingCop?: number;
}

/**
 * The share of a device's electricity that becomes heat inside the conditioned
 * space.
 *
 * Almost everything indoors is 1.0: a computer, a screen, a light turn their
 * entire input into heat in the room, and so does a fridge - in steady state its
 * condenser rejects exactly the electricity it drew, since the food inside is
 * already cold. The exceptions are things that are outdoors, things that vent
 * their heat outdoors, and the heating and cooling plant itself.
 */
const HEAT_TO_SPACE: Record<string, number> = {
  // Outdoors, or outside anything that is conditioned.
  exterior_light: 0,
  ev_charger: 0,
  pool_pump: 0,
  // Exhausts its own heat, by definition.
  exhaust_fan: 0,
  // Hooded or vented: most of the heat leaves with the air.
  kiln: 0.3,
  commercial_oven: 0.5,
  dishwasher_commercial: 0.5,
  steam_table: 0.6,
  // Tank standby losses land in the room; the heat in the water leaves in the pipe.
  water_heater: 0.3,
  // Machine room and shaft, only loosely part of the conditioned volume.
  elevator: 0.5,
  sump_pump: 0.4,
};

export function heatToSpace(cat: DeviceCategory): number {
  // The heating and cooling plant is the system this correction is about. Its own
  // consumption is already the conditioning, so it takes no interaction term.
  if (cat.group === "hvac") return 0;
  const named = HEAT_TO_SPACE[cat.id];
  return named !== undefined ? named : 1;
}

export interface Interaction {
  /** Multiply the device's electricity cost by this. 1 means no correction applied. */
  factor: number;
  /** The cooling-season part, as a fraction of the device's own draw. */
  coolingPenalty: number;
  /** The heating-season part, as a fraction of the device's own draw. */
  heatingCredit: number;
  heatToSpace: number;
  /** True when the building said enough for the correction to be made at all. */
  known: boolean;
  /** One line for the card and the report. */
  basis: string;
}

export const NO_INTERACTION: Interaction = {
  factor: 1,
  coolingPenalty: 0,
  heatingCredit: 0,
  heatToSpace: 0,
  known: false,
  basis: "No interaction with heating or cooling applied: the building has not said how it is conditioned.",
};

/** The climate this context implies, or null when it implies none. */
export function climateFor(ctx: ThermalContext): Climate | null {
  if (Number.isFinite(ctx.hdd65) && Number.isFinite(ctx.cdd65)) {
    return { hdd65: Math.max(0, ctx.hdd65!), cdd65: Math.max(0, ctx.cdd65!) };
  }
  const byState = climateOf(ctx.regionCode);
  if (byState) return byState;
  // "US" is the app's own stand-in for "somewhere in the country".
  return ctx.regionCode === "US" ? US_CLIMATE : null;
}

/**
 * What one device's draw really costs, once the building's reaction to its heat
 * is counted.
 *
 * Returns the identity unless there is both a climate and a stated way of
 * conditioning the building, because without those the correction would be a
 * guess dressed as a number.
 */
export function hvacInteraction(cat: DeviceCategory, ctx: ThermalContext): Interaction {
  const climate = climateFor(ctx);
  const heating = ctx.heating;
  const cooling = ctx.cooling;
  if (!climate || (heating === undefined && cooling === undefined)) return NO_INTERACTION;

  const share = heatToSpace(cat);
  if (share <= 0) {
    return {
      ...NO_INTERACTION,
      known: true,
      basis:
        cat.group === "hvac"
          ? "No interaction term: this is the heating and cooling plant, so its own consumption is already the conditioning."
          : "No interaction term: its heat does not end up in the conditioned space.",
    };
  }

  const s = seasons(climate);
  const coolCop = ctx.coolingCop && ctx.coolingCop > 0 ? ctx.coolingCop : DEFAULT_COOLING_COP;
  const heatCop =
    ctx.heatingCop && ctx.heatingCop > 0
      ? ctx.heatingCop
      : heating === "heat-pump"
        ? DEFAULT_HEAT_PUMP_COP
        : 1;

  // Every watt of heat removed costs 1/COP watts at the compressor.
  const coolingPenalty = cooling === "electric" ? (s.cooling * share) / coolCop : 0;
  // Only electric heat gives an electricity credit. Gas heat gives back therms,
  // which this app does not price, so claiming a kWh saving there would be wrong.
  const electricHeat = heating === "electric-resistance" || heating === "heat-pump";
  const heatingCredit = electricHeat ? ((s.heating * share) / heatCop) * HEATING_CREDIT_DERATE : 0;

  const factor = Math.max(MIN_FACTOR, 1 + coolingPenalty - heatingCredit);

  const pct = (f: number) => `${Math.round(f * 100)}%`;
  const parts: string[] = [];
  if (coolingPenalty > 0) parts.push(`+${pct(coolingPenalty)} for the cooling that removes its heat`);
  if (heatingCredit > 0) parts.push(`-${pct(heatingCredit)} for the electric heating its heat replaces`);
  // The climate is named, because it is doing most of the work and a reader who
  // disagrees with the factor should be able to see which input to argue with.
  const where = describeClimate(climate);
  const basis = parts.length
    ? `Its heat is part of the building's load: ${parts.join(", ")}, net ${factor >= 1 ? "+" : ""}${pct(factor - 1)}. ${where}.`
    : electricHeat
      ? `No net interaction: nothing cools this space, and its heat only displaces heating in winter. ${where}.`
      : `No net interaction: nothing cools this space, and the heating is not electric, so its heat saves gas rather than kilowatt-hours. ${where}.`;

  return { factor, coolingPenalty, heatingCredit, heatToSpace: share, known: true, basis };
}

/**
 * The same correction for a whole audit, as one number.
 *
 * Useful for the report's summary line, where quoting a factor per device would
 * drown the point. Weighted by each line's own cost, since that is what the
 * factor is being applied to.
 */
export function blendedInteraction(
  lines: readonly { cat: DeviceCategory; costPerYear: number }[],
  ctx: ThermalContext,
): number {
  let weighted = 0;
  let total = 0;
  for (const l of lines) {
    const w = Math.max(0, l.costPerYear);
    weighted += hvacInteraction(l.cat, ctx).factor * w;
    total += w;
  }
  return total > 0 ? weighted / total : 1;
}
