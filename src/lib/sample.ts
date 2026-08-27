// A worked example, for the person who has thirty seconds and no photographs.
//
// The honest problem this solves: almost everything good in this app only becomes
// visible after somebody has walked a building, scanned several rooms, saved the
// audit, installed a fix, and come back weeks later to re-scan. That is the right
// workflow and it is completely invisible to a teacher evaluating the app during a
// free period, or a judge opening it cold. An empty portfolio is not a fair
// representation of what was built.
//
// So this constructs a small, plausible school with two audits eight weeks apart and
// three fixes installed in between, which lights up the parts of the app that need
// history to mean anything: the verification loop, before-and-after per device,
// building progress, and a brief with real findings in it.
//
// The one rule that makes this defensible rather than a mockup: NOTHING HERE IS A
// HAND-WRITTEN NUMBER. Room observations go through rankObservations, the same
// function a real scan uses, so every dollar, kWh and payback in the sample is a
// figure this app genuinely computes from stated assumptions. If the energy math
// changes, the sample changes with it, and it can never drift into advertising a
// result the real pipeline would not produce. The data is fictional; the arithmetic
// performed on it is not.

import { rankObservations } from "./energy";
import { matchCategory } from "./parse";
import { SCHEDULE_BY_ID } from "./schedule";
import type { Building, FixRecord, SavedAudit, Store } from "./storage";
import { SCHEMA_VERSION } from "./storage";
import type { AuditSettings, DeviceObservation } from "./types";

export const SAMPLE_BUILDING_NAME = "Riverside High (sample)";

/**
 * Marks every record this module creates.
 *
 * Sample data that cannot be told apart from real data is a trap: a user who loads
 * the example and then does a real audit must never end up with the two averaged
 * together in a report they hand to somebody. The id prefix makes the distinction
 * mechanical rather than a matter of remembering.
 */
const SAMPLE_PREFIX = "sample-";

const sampleId = (suffix: string) => SAMPLE_PREFIX + suffix;

export function isSampleId(id: string): boolean {
  return id.startsWith(SAMPLE_PREFIX);
}

export function storeHasSample(store: Store): boolean {
  return store.buildings.some((b) => isSampleId(b.id));
}

const SETTINGS: AuditSettings = {
  // A real Midwest commercial rate rather than the national average, so the sample
  // does not quietly show a number no actual school would see on a bill.
  ratePerKwh: 0.142,
  co2PerKwh: 0.401,
  unoccupiedHoursPerYear: 6740,
  regionCode: "OH",
  buildingTypeId: "k12",
  floorAreaSqFt: 92000,
};

type Room = { area: string; observations: DeviceObservation[] };

/** The first walk: a Tuesday evening sweep of five areas, nothing fixed yet. */
const BEFORE: Room[] = [
  {
    area: "Computer lab 118",
    observations: [
      { device: "computer monitor", count: 24, state: "on" },
      { device: "desktop computer", count: 24, state: "standby" },
      { device: "projector", count: 1, state: "standby" },
      { device: "printer", count: 1, state: "standby" },
    ],
  },
  {
    area: "Library annex",
    observations: [
      { device: "computer monitor", count: 8, state: "on" },
      { device: "overhead lights", count: 12, state: "on" },
      { device: "water cooler", count: 1, state: "on" },
    ],
  },
  {
    area: "Staff room",
    observations: [
      { device: "coffee maker", count: 2, state: "on" },
      { device: "microwave", count: 1, state: "standby" },
      { device: "refrigerator", count: 2, state: "on" },
      { device: "vending machine", count: 1, state: "on" },
    ],
  },
  {
    area: "Main corridor",
    observations: [
      { device: "vending machine", count: 3, state: "on" },
      { device: "overhead lights", count: 22, state: "on" },
    ],
  },
  {
    area: "Room 214",
    observations: [
      { device: "smartboard", count: 1, state: "standby" },
      { device: "computer monitor", count: 2, state: "on" },
      { device: "space heater", count: 1, state: "on" },
    ],
  },
];

/**
 * The second walk, eight weeks later.
 *
 * Three things changed and the rest deliberately did not, because a follow-up audit
 * where everything improved at once is not what a real one looks like: the lab now
 * powers down, the corridor lights are on a timer, and the staff-room space heater
 * is gone. The vending machines are untouched - they belong to a contracted vendor,
 * which is exactly the kind of finding that stays open for months in a real school
 * and is worth showing rather than tidying away.
 */
const AFTER: Room[] = [
  {
    area: "Computer lab 118",
    observations: [
      { device: "computer monitor", count: 24, state: "off" },
      { device: "desktop computer", count: 24, state: "off" },
      { device: "projector", count: 1, state: "standby" },
      { device: "printer", count: 1, state: "standby" },
    ],
  },
  {
    area: "Library annex",
    observations: [
      { device: "computer monitor", count: 8, state: "standby" },
      { device: "overhead lights", count: 12, state: "off" },
      { device: "water cooler", count: 1, state: "on" },
    ],
  },
  {
    area: "Staff room",
    observations: [
      { device: "coffee maker", count: 2, state: "off" },
      { device: "microwave", count: 1, state: "standby" },
      { device: "refrigerator", count: 2, state: "on" },
      { device: "vending machine", count: 1, state: "on" },
    ],
  },
  {
    area: "Main corridor",
    observations: [
      { device: "vending machine", count: 3, state: "on" },
      { device: "overhead lights", count: 22, state: "off" },
    ],
  },
  {
    area: "Room 214",
    observations: [
      { device: "smartboard", count: 1, state: "standby" },
      { device: "computer monitor", count: 2, state: "standby" },
    ],
  },
];

/** Days before now, as an ISO timestamp. */
function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

/**
 * Run rooms through the real scoring pipeline.
 *
 * The device strings above are matched by the same parser a model's output goes
 * through, which means a device this app does not have a catalogue entry for simply
 * does not appear - the sample cannot invent a category.
 */
function auditFrom(
  rooms: Room[],
  buildingId: string,
  id: string,
  at: string,
  note: string,
): SavedAudit {
  const offenders = rooms.flatMap((r) =>
    rankObservations(
      r.observations.map((o) => ({ ...o, categoryId: matchCategory(o.device) })).filter(
        (o): o is DeviceObservation & { categoryId: string } => o.categoryId !== null,
      ) as (DeviceObservation & { categoryId: string })[],
      SETTINGS,
      r.area,
    ),
  );

  return {
    id,
    buildingId,
    at,
    areas: rooms.map((r) => r.area),
    offenders,
    settings: SETTINGS,
    mode: "fallback",
    engine: "worked example · not a model reading",
    note,
  };
}

/**
 * Build the sample store fragment.
 *
 * Returns records to merge rather than a whole Store, so loading the example never
 * destroys work a user has already done. That matters more than it looks: the button
 * that calls this is one an evaluator clicks out of curiosity, and a "load example"
 * that silently wiped a real audit would be the worst bug in the app.
 */
export function sampleRecords(): {
  building: Building;
  audits: SavedAudit[];
  fixes: FixRecord[];
} {
  const buildingId = sampleId("building");

  const building: Building = {
    id: buildingId,
    name: SAMPLE_BUILDING_NAME,
    typeId: "k12",
    regionCode: "OH",
    floorAreaSqFt: 92000,
    schedule: SCHEDULE_BY_ID["school"]?.schedule ??
      SCHEDULE_BY_ID["school_extended"].schedule,
    createdAt: daysAgo(64),
    lat: 39.96,
    lon: -82.99,
  };

  const before = auditFrom(
    BEFORE,
    buildingId,
    sampleId("audit-before"),
    daysAgo(63),
    "First evening sweep. Five areas, walked after the building closed at 4pm.",
  );

  const after = auditFrom(
    AFTER,
    buildingId,
    sampleId("audit-after"),
    daysAgo(7),
    "Re-scan eight weeks on, to check whether the three fixes actually held.",
  );

  // Fixes are recorded against what the first audit actually found, so the expected
  // savings on each one is a figure taken from the pipeline rather than asserted.
  const savingsFor = (categoryId: string, area: string) =>
    before.offenders
      .filter((o) => o.categoryId === categoryId && o.source === area)
      .reduce((s, o) => s + o.annualSavings, 0);

  const costIn = (audit: SavedAudit, categoryId: string, area: string) =>
    audit.offenders
      .filter((o) => o.categoryId === categoryId && o.source === area)
      .reduce((s, o) => s + o.costPerYear, 0);

  /**
   * What the re-scan actually proved, as opposed to what was predicted.
   *
   * This is the one number on the portfolio page the app claims no other energy
   * tool will show, so it must be measured rather than declared: it is simply what
   * that device cost in that room before, minus what it costs there now. Leaving it
   * unset - which an earlier version of this file did - marks every fix verified and
   * worth nothing, turning the demo into three apparent failures.
   *
   * It routinely comes out ABOVE the expectation, and that is not an error. An
   * expectation applies a conservative savings fraction because a timer or a policy
   * is assumed to leak; the follow-up walk caught these rooms genuinely dark. The
   * gap runs both ways in real buildings, and the caveat about extrapolating from a
   * single observation applies to this figure exactly as it does to every other.
   */
  const verifiedFor = (categoryId: string, area: string) =>
    Math.max(0, costIn(before, categoryId, area) - costIn(after, categoryId, area));

  const fixes: FixRecord[] = [
    {
      id: sampleId("fix-lab"),
      buildingId,
      categoryId: "desktop",
      area: "Computer lab 118",
      label: "Desktop computer",
      actionLabel: "Overnight power-down policy",
      costPaid: 0,
      expectedAnnualSavings: savingsFor("desktop", "Computer lab 118"),
      verifiedAnnualSavings: verifiedFor("desktop", "Computer lab 118"),
      installedAt: daysAgo(48),
      verifiedAt: daysAgo(7),
    },
    {
      id: sampleId("fix-corridor"),
      buildingId,
      categoryId: "ceiling_light",
      area: "Main corridor",
      label: "Overhead lights",
      actionLabel: "Time clock on the corridor circuit",
      costPaid: 180,
      expectedAnnualSavings: savingsFor("ceiling_light", "Main corridor"),
      verifiedAnnualSavings: verifiedFor("ceiling_light", "Main corridor"),
      installedAt: daysAgo(40),
      verifiedAt: daysAgo(7),
    },
    {
      id: sampleId("fix-heater"),
      buildingId,
      categoryId: "space_heater",
      area: "Room 214",
      label: "Space heater",
      actionLabel: "Removed; thermostat complaint logged instead",
      costPaid: 0,
      expectedAnnualSavings: savingsFor("space_heater", "Room 214"),
      verifiedAnnualSavings: verifiedFor("space_heater", "Room 214"),
      installedAt: daysAgo(30),
      verifiedAt: daysAgo(7),
    },
  ].filter((f) => f.expectedAnnualSavings > 0);

  return { building, audits: [before, after], fixes };
}

/** Merge the sample into a store without disturbing anything already there. */
export function withSample(store: Store): Store {
  if (storeHasSample(store)) return store;
  const { building, audits, fixes } = sampleRecords();
  return {
    ...store,
    version: SCHEMA_VERSION,
    buildings: [...store.buildings, building],
    audits: [...store.audits, ...audits],
    fixes: [...store.fixes, ...fixes],
    activeBuildingId: building.id,
  };
}

/** Remove every sample record, leaving real work untouched. */
export function withoutSample(store: Store): Store {
  const remaining = store.buildings.filter((b) => !isSampleId(b.id));
  return {
    ...store,
    buildings: remaining,
    audits: store.audits.filter((a) => !isSampleId(a.buildingId)),
    fixes: store.fixes.filter((f) => !isSampleId(f.buildingId)),
    activeBuildingId: isSampleId(store.activeBuildingId ?? "")
      ? (remaining[0]?.id ?? null)
      : store.activeBuildingId,
  };
}
