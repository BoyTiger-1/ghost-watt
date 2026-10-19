// How long things actually run.
//
// The audit's headline number prices a device left on through every empty hour,
// which is the right question for phantom load - "what does leaving it on cost?" -
// but it is not what the device costs in normal use, and a light priced as if it
// burned 7,000 hours a year invites the obvious objection. So every device also
// gets a typical-use figure: hours of active use a day where it is (home, school
// or office), standby for the rest, and 24/7 cycling for the thermostatic ones.
//
// Hours are representative published figures, rounded:
//   - lighting: DOE "U.S. Lighting Market Characterization" - home lamps average
//     ~2 h/day, more in living spaces; commercial lighting tracks occupied hours
//   - TV: Nielsen, ~4-5 h/day of household viewing
//   - computing and office equipment: ENERGY STAR duty-cycle assumptions
//   - exterior lighting: dusk to dawn, ~4,000 h/year
// School and office hours scale with the building's occupied hours, so a school
// that runs evening classes gets a longer lighting day than one that does not.

import type { DeviceCategory } from "./types";
import { roomHours, roomType as roomTypeOf } from "./rooms";
import { SOURCE_BY_ID } from "./sources";

export type UsageContext = "home" | "school" | "office";

/** Hours a day in use: a number, or a share of the building's occupied hours. */
type Hours = number | { occupied: number };

interface Profile {
  home: Hours;
  school: Hours;
  office: Hours;
  /** One line for the UI on where the hours come from. */
  basis: string;
}

const LIGHT: Profile = { home: 3, school: { occupied: 0.9 }, office: { occupied: 0.9 }, basis: "DOE lighting study: ~2-3 h/day at home; on through occupied hours at work" };
const ALWAYS: Profile = { home: 24, school: 24, office: 24, basis: "Runs around the clock" };

const PROFILES: Record<string, Profile> = {
  ceiling_light: LIGHT,
  downlight: LIGHT,
  exterior_light: { home: 11, school: 11, office: 11, basis: "Dusk to dawn, ~4,000 h a year" },
  exit_sign: ALWAYS,
  stage_light: { home: 0.5, school: 1, office: 0.5, basis: "Performances and rehearsals" },
  grow_light: { home: 14, school: 14, office: 14, basis: "A typical 14-hour photoperiod" },

  monitor: { home: 4, school: { occupied: 0.6 }, office: { occupied: 0.8 }, basis: "ENERGY STAR duty: on while the computer is in use" },
  desktop: { home: 4, school: { occupied: 0.6 }, office: { occupied: 0.85 }, basis: "ENERGY STAR duty: active in use, asleep otherwise" },
  laptop: { home: 3, school: { occupied: 0.4 }, office: 4, basis: "Charging a few hours a day" },
  tv: { home: 5, school: 1, office: 1, basis: "Nielsen: ~4-5 h/day of household viewing" },
  projector: { home: 2, school: { occupied: 0.5 }, office: 1.5, basis: "On for lessons and meetings" },
  smartboard: { home: 1, school: { occupied: 0.6 }, office: 1, basis: "On for lessons" },
  digital_signage: { home: 0, school: { occupied: 1 }, office: { occupied: 1 }, basis: "On while the building is open" },
  scoreboard: { home: 0, school: 1, office: 0, basis: "Games and practice" },
  pa_amplifier: { home: 0.5, school: { occupied: 0.3 }, office: 0.5, basis: "Announcements; idles the rest of the time" },

  copier: { home: 0.1, school: 0.5, office: 0.7, basis: "Printing time; in ready or sleep mode the rest" },
  printer: { home: 0.1, school: 0.3, office: 0.4, basis: "Printing time; asleep the rest" },
  printer_3d: { home: 1, school: 2, office: 1, basis: "Print jobs" },
  coffee: { home: 0.3, school: 1.5, office: 2, basis: "Brewing, plus the warming plate at work" },
  coffee_urn: { home: 0, school: 3, office: 3, basis: "Kept hot through service" },
  microwave: { home: 0.17, school: 0.5, office: 0.5, basis: "About 10 minutes a day at home; the clock runs always" },
  space_heater: { home: 2.5, school: 2, office: 2, basis: "Averaged across the year, heating season only" },
  ac_window: { home: 3.5, school: { occupied: 0.3 }, office: { occupied: 0.4 }, basis: "Averaged across the year, cooling season only" },
  dehumidifier: { home: 8, school: 8, office: 8, basis: "Cycles through the humid months" },
  air_purifier: { home: 10, school: { occupied: 1 }, office: { occupied: 1 }, basis: "Runs while the space is used" },
  exhaust_fan: { home: 1, school: { occupied: 1 }, office: { occupied: 1 }, basis: "Bathroom fans at home; on with the building at work" },
  hand_dryer: { home: 0, school: 0.4, office: 0.3, basis: "A few seconds per use" },
  ev_charger: { home: 2, school: 3, office: 3, basis: "One daily charge" },
  kiln: { home: 0.3, school: 0.8, office: 0, basis: "Firing days, averaged" },
  aquarium: ALWAYS,
  pool_pump: { home: 8, school: 10, office: 0, basis: "Filtration hours" },
  cardio_machine: { home: 0.5, school: 3, office: 2, basis: "Workouts" },
  washer_dryer: { home: 0.8, school: 1, office: 0, basis: "Loads per week, averaged" },
  sump_pump: { home: 0.5, school: 0.5, office: 0.5, basis: "Runs when water rises" },
  lab_equipment: { home: 0, school: { occupied: 0.5 }, office: { occupied: 0.5 }, basis: "Experiments in session" },
  air_compressor: { home: 0.5, school: 1, office: 1, basis: "Tool use" },
  steam_table: { home: 0, school: 3, office: 3, basis: "Lunch service" },
  commercial_oven: { home: 1, school: 3, office: 2, basis: "Meal prep" },
  dishwasher_commercial: { home: 1, school: 3, office: 2, basis: "After service" },

  server: ALWAYS,
  ups: ALWAYS,
  access_point: ALWAYS,
  security_recorder: ALWAYS,
  water_heater: ALWAYS,
  elevator: ALWAYS,
};

const DEFAULT: Profile = { home: 2, school: { occupied: 0.5 }, office: { occupied: 0.5 }, basis: "A generic estimate for this kind of device" };

export function usageProfile(categoryId: string): Profile {
  return PROFILES[categoryId] ?? DEFAULT;
}

/** Typical hours of active use a day, for this device where it is. The room type, when given, wins. */
export function typicalHoursPerDay(cat: DeviceCategory, context: UsageContext, occupiedHoursPerYear: number, roomTypeId?: string): number {
  if (cat.thermostatic) return 24;
  const room = roomTypeId ? roomHours(roomTypeOf(roomTypeId), cat.id, cat.group) : null;
  if (room) return Math.max(0, Math.min(24, room.hours));
  const h = usageProfile(cat.id)[context];
  const perDay = typeof h === "number" ? h : (h.occupied * occupiedHoursPerYear) / 365;
  return Math.max(0, Math.min(24, perDay));
}

/** Where the hours came from, for the card and the Method page. */
export function usageBasis(cat: DeviceCategory, context: UsageContext, roomTypeId?: string): { basis: string; source: string } {
  if (cat.thermostatic) return { basis: "Runs around the clock, cycling", source: "catalog" };
  const room = roomTypeId ? roomTypeOf(roomTypeId) : null;
  const rh = room ? roomHours(room, cat.id, cat.group) : null;
  if (room && rh) {
    const src = SOURCE_BY_ID[rh.source];
    return {
      basis: src ? `${room.label}: ${rh.hours} h/day (${src.label})` : `${room.label}: ${rh.hours} h/day, this app's estimate`,
      source: rh.source,
    };
  }
  return { basis: usageProfile(cat.id).basis, source: "estimate" };
}

export interface TypicalUse {
  hoursPerDay: number;
  kwhPerYear: number;
  basis: string;
  source: string;
}

/**
 * One unit's energy in a typical year: `activeWatts` while in use, standby the
 * rest. Thermostatic devices pass their duty-cycled average as `activeWatts` and
 * run all year.
 */
export function typicalUse(
  cat: DeviceCategory,
  activeWatts: number,
  context: UsageContext,
  occupiedHoursPerYear: number,
  roomTypeId?: string,
): TypicalUse {
  const hoursPerDay = typicalHoursPerDay(cat, context, occupiedHoursPerYear, roomTypeId);
  const activeH = hoursPerDay * 365;
  const standbyH = cat.thermostatic ? 0 : 8760 - activeH;
  const kwhPerYear = (activeH * activeWatts + standbyH * cat.wattsStandby) / 1000;
  const b = usageBasis(cat, context, roomTypeId);
  return { hoursPerDay, kwhPerYear, basis: b.basis, source: b.source };
}

/** The setting a building type implies, for the default. */
export function contextForBuildingType(typeId: string | undefined): UsageContext {
  if (!typeId) return "school";
  if (/home|house|resid|apartment|dorm/i.test(typeId)) return "home";
  if (/k12|school|univ|college|campus|education/i.test(typeId)) return "school";
  return "office";
}
