// Peak-demand charges.
//
// The version this replaces summed every running watt in the audit and billed
// the building for all of it, twelve times a year. These tests exist to stop
// that coming back: the two things they insist on are that loads which do not
// peak together are not added as though they do, and that overnight waste - the
// thing the whole app is about - carries no demand charge, because it raises no
// peak.

import { describe, expect, it } from "vitest";
import { coincidenceFactor, demandCost, demandLines, describeDemand } from "./demand";
import { DEVICE_CATALOG } from "./devices";
import { rankObservations } from "./energy";
import { DEFAULT_SETTINGS, type AuditSettings } from "./types";

const withCharge: AuditSettings = { ...DEFAULT_SETTINGS, ratePerKwh: 0.12, unoccupiedHoursPerYear: 6000, demandChargePerKw: 15 };
const noCharge: AuditSettings = { ...withCharge, demandChargePerKw: undefined };

const audit = (settings: AuditSettings) =>
  rankObservations(
    [
      { device: "monitor", count: 20, state: "on", categoryId: "monitor" },
      { device: "projector", count: 4, state: "on", categoryId: "projector" },
      { device: "exterior light", count: 6, state: "on", categoryId: "exterior_light" },
      { device: "tv", count: 3, state: "standby", categoryId: "tv" },
    ],
    settings,
    "Block A",
  );

describe("coincidenceFactor", () => {
  it("gives every catalog entry a factor between nothing and everything", () => {
    for (const cat of DEVICE_CATALOG) {
      const f = coincidenceFactor(cat);
      expect(f, cat.id).toBeGreaterThan(0);
      expect(f, cat.id).toBeLessThanOrEqual(1);
    }
  });

  it("puts always-on gear at the peak and photocell lighting nowhere near it", () => {
    expect(coincidenceFactor({ id: "server", group: "network" })).toBe(1);
    expect(coincidenceFactor({ id: "ceiling_light", group: "lighting" })).toBeGreaterThan(0.9);
    // The textbook non-coincident load: lit at night, dark at the afternoon peak.
    expect(coincidenceFactor({ id: "exterior_light", group: "lighting" })).toBeLessThan(0.1);
    expect(coincidenceFactor({ id: "printer", group: "office" })).toBeLessThan(0.3);
  });

  it("falls back to the group, then to a default", () => {
    expect(coincidenceFactor({ id: "no_such_device", group: "network" })).toBe(1);
    expect(coincidenceFactor({ id: "no_such_device", group: undefined })).toBeGreaterThan(0);
  });
});

describe("demandLines", () => {
  it("is nothing at all without a demand charge, which is a home's answer", () => {
    expect(demandLines(audit(noCharge), noCharge)).toEqual([]);
    expect(demandCost(audit(noCharge), noCharge)).toBe(0);
    expect(describeDemand(audit(noCharge), noCharge)).toBeNull();
  });

  it("does not add up loads that do not peak together", () => {
    const lines = demandLines(audit(withCharge), withCharge);
    const coincident = lines.reduce((s, l) => s + l.kwAtPeak, 0);
    const naive = lines.reduce((s, l) => s + l.kwAtPeak / l.coincidence, 0);
    expect(coincident).toBeLessThan(naive);
    // The old calculation was this naive figure, and on this audit it is three
    // times the coincident one.
    expect(naive / coincident).toBeGreaterThan(2);
  });

  it("leaves out anything that was not seen running", () => {
    const lines = demandLines(audit(withCharge), withCharge);
    expect(lines.every((l) => l.offender.state === "on")).toBe(true);
    // The sleeping televisions are in the audit and not in the demand charge:
    // standby draw is a kilowatt-hour problem, not a peak one.
    expect(audit(withCharge).some((o) => o.categoryId === "tv")).toBe(true);
    expect(lines.some((l) => l.offender.categoryId === "tv")).toBe(false);
  });

  it("charges twelve months of the coincident kilowatts", () => {
    const lines = demandLines(audit(withCharge), withCharge);
    for (const l of lines) expect(l.costPerYear).toBeCloseTo(l.kwAtPeak * 15 * 12, 9);
    expect(demandCost(audit(withCharge), withCharge)).toBeCloseTo(
      lines.reduce((s, l) => s + l.costPerYear, 0),
      9,
    );
  });

  it("all but ignores the car-park lights it used to bill in full", () => {
    const lines = demandLines(audit(withCharge), withCharge);
    const outside = lines.find((l) => l.offender.categoryId === "exterior_light")!;
    const screens = lines.find((l) => l.offender.categoryId === "monitor")!;
    // 6 x 250 W outside against 20 x 30 W of screens: more watts, almost no peak.
    expect(outside.offender.totalWatts).toBeGreaterThan(screens.offender.totalWatts);
    expect(outside.kwAtPeak).toBeLessThan(screens.kwAtPeak);
  });

  it("ranks by what it costs and says so in words", () => {
    const lines = demandLines(audit(withCharge), withCharge);
    for (let i = 1; i < lines.length; i++) {
      expect(lines[i - 1].costPerYear).toBeGreaterThanOrEqual(lines[i].costPerYear);
    }
    const words = describeDemand(audit(withCharge), withCharge)!;
    expect(words).toMatch(/do not all peak together/);
    expect(words).toMatch(/Overnight waste is excluded/);
  });
});
