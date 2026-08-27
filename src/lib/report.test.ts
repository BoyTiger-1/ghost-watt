// The brief is the document that leaves the building, so its arithmetic gets the
// same treatment as the money math it summarises. Two things here are easy to get
// subtly wrong and expensive to get wrong in front of a school board: payback on
// merged rows, and how confidence in a total relates to confidence in its parts.

import { describe, expect, it } from "vitest";
import { buildBrief, headline } from "./report";
import type { SavedAudit, Building } from "./storage";
import type { Offender } from "./types";

function offender(patch: Partial<Offender> = {}): Offender {
  return {
    id: "o1",
    categoryId: "monitor",
    label: "Computer monitor",
    icon: "monitor",
    count: 3,
    state: "on",
    perUnitWatts: 30,
    totalWatts: 90,
    kwhPerYear: 500,
    costPerYear: 100,
    co2KgPerYear: 200,
    costLowPerYear: 80,
    costHighPerYear: 120,
    group: "display",
    action: {
      label: "Smart strip",
      type: "powerstrip",
      cost: 60,
      savingsFraction: 0.95,
      note: "test fixture",
    },
    fixCost: 60,
    annualSavings: 95,
    paybackMonths: 7.6,
    confidence: "high",
    source: "Room 214",
    ...patch,
  };
}

function audit(patch: Partial<SavedAudit> = {}): SavedAudit {
  return {
    id: "a1",
    buildingId: "b1",
    at: new Date().toISOString(),
    areas: ["Room 214"],
    offenders: [offender()],
    settings: { ratePerKwh: 0.16, co2PerKwh: 0.4, unoccupiedHoursPerYear: 6000 },
    mode: "live",
    engine: "test",
    ...patch,
  };
}

const building = (patch: Partial<Building> = {}): Building => ({
  id: "b1",
  name: "Lincoln High",
  typeId: "school",
  regionCode: "US",
  floorAreaSqFt: 80000,
  schedule: { days: [], startHour: 7, endHour: 15 } as unknown as Building["schedule"],
  createdAt: new Date().toISOString(),
  ...patch,
});

describe("merging across areas", () => {
  it("adds counts and dollars, and lists each area once", () => {
    const b = buildBrief(
      audit({
        offenders: [
          offender({ source: "Room 214" }),
          offender({ id: "o2", source: "Room 220" }),
          offender({ id: "o3", source: "Room 214" }),
        ],
      }),
    );
    const monitor = b.capital.items[0];
    expect(monitor.count).toBe(9);
    expect(monitor.annualWaste).toBe(300);
    expect(monitor.areas).toEqual(["Room 214", "Room 220"]);
  });

  it("recomputes payback on the merged totals instead of summing per-room paybacks", () => {
    // Three rooms at 7.6 months each is still 7.6 months, not 22.8. Summing the
    // ratio is the classic version of this bug and it would put a three-room fix
    // on the wrong side of a budget cycle.
    const b = buildBrief(
      audit({
        offenders: [
          offender({ source: "A" }),
          offender({ id: "o2", source: "B" }),
          offender({ id: "o3", source: "C" }),
        ],
      }),
    );
    expect(b.capital.items[0].paybackMonths).toBeCloseTo(7.58, 1);
  });

  it("keeps the least confident reading when merging a category", () => {
    const b = buildBrief(
      audit({
        offenders: [
          offender({ confidence: "high" }),
          offender({ id: "o2", source: "B", confidence: "low" }),
        ],
      }),
    );
    expect(b.capital.items[0].confidence).toBe("low");
  });
});

describe("free and capital are separated", () => {
  const mixed = audit({
    offenders: [
      offender({
        categoryId: "lights",
        label: "Overhead lights",
        costPerYear: 400,
        annualSavings: 380,
        fixCost: 0,
        action: { label: "Switch off at close", type: "policy", cost: 0, savingsFraction: 0.95, note: "n" },
      }),
      offender({ categoryId: "monitor", costPerYear: 100, annualSavings: 95, fixCost: 60 }),
    ],
  });

  it("puts zero-cost fixes in their own group", () => {
    const b = buildBrief(mixed);
    expect(b.free.items.map((i) => i.categoryId)).toEqual(["lights"]);
    expect(b.capital.items.map((i) => i.categoryId)).toEqual(["monitor"]);
    expect(b.free.upfront).toBe(0);
  });

  it("computes payback from the capital half only", () => {
    // Free savings must not be allowed to flatter the payback on money actually
    // spent - that would understate every quoted payback in the document.
    const b = buildBrief(mixed);
    expect(b.paybackMonths).toBeCloseTo((60 / 95) * 12, 5);
  });

  it("nets the first year against what has to be spent to get it", () => {
    const b = buildBrief(mixed);
    expect(b.totalRecoverable).toBe(475);
    expect(b.totalUpfront).toBe(60);
    expect(b.firstYearNet).toBe(415);
  });

  it("reports no payback at all when nothing costs money", () => {
    const b = buildBrief(
      audit({
        offenders: [
          offender({
            fixCost: 0,
            action: { label: "Policy", type: "policy", cost: 0, savingsFraction: 1, note: "n" },
          }),
        ],
      }),
    );
    expect(b.paybackMonths).toBeNull();
    expect(b.capital.items).toHaveLength(0);
  });
});

describe("confidence is weighted by money, not by row count", () => {
  it("is not dragged down by a trivial low-confidence row", () => {
    const b = buildBrief(
      audit({
        offenders: [
          offender({ costPerYear: 2000, confidence: "high" }),
          offender({ id: "o2", categoryId: "x", costPerYear: 8, confidence: "low" }),
        ],
      }),
    );
    expect(b.confidence).toBe("high");
  });

  it("is dragged down when the low-confidence row is where the money is", () => {
    const b = buildBrief(
      audit({
        offenders: [
          offender({ costPerYear: 20, confidence: "high" }),
          offender({ id: "o2", categoryId: "x", costPerYear: 3000, confidence: "low" }),
        ],
      }),
    );
    expect(b.confidence).toBe("low");
  });
});

describe("caveats fire only when they are true", () => {
  it("says nothing about model readings when the audit was fully live", () => {
    const b = buildBrief(audit({ mode: "live" }), building({ bill: {} as Building["bill"] }));
    expect(b.caveats.join(" ")).not.toContain("room profile");
    expect(b.caveats.join(" ")).not.toMatch(/No photograph/);
  });

  it("leads with the profile warning when nothing was actually read", () => {
    const b = buildBrief(audit({ mode: "fallback" }));
    expect(b.caveats[0]).toMatch(/No photograph/);
  });

  it("flags a missing utility bill, and stops once one exists", () => {
    const without = buildBrief(audit(), building());
    expect(without.caveats.join(" ")).toMatch(/published average/);

    const withBill = buildBrief(audit(), building({ bill: {} as Building["bill"] }));
    expect(withBill.caveats.join(" ")).not.toMatch(/published average/);
  });

  it("warns that equipment cost is double-counted only when a category spans areas", () => {
    const single = buildBrief(audit());
    expect(single.caveats.join(" ")).not.toMatch(/upper bound/);

    const spanning = buildBrief(
      audit({ offenders: [offender({ source: "A" }), offender({ id: "o2", source: "B" })] }),
    );
    expect(spanning.caveats.join(" ")).toMatch(/upper bound/);
  });

  it("always states the assumption the annual figures rest on", () => {
    // This one is unconditional on purpose: it is true of every audit, and a reader
    // who takes an annual number at face value has misunderstood what it is.
    expect(buildBrief(audit()).caveats.join(" ")).toMatch(/unoccupied hours/);
  });
});

describe("headline", () => {
  it("leads with free money when there is a meaningful amount of it", () => {
    const b = buildBrief(
      audit({
        offenders: [
          offender({
            categoryId: "lights",
            costPerYear: 900,
            annualSavings: 850,
            fixCost: 0,
            action: { label: "Policy", type: "policy", cost: 0, savingsFraction: 1, note: "n" },
          }),
          offender({ categoryId: "monitor", annualSavings: 95, fixCost: 60 }),
        ],
      }),
    );
    expect(headline(b)).toMatch(/^\$850 a year can be recovered at no cost/);
  });

  it("leads with payback when the win requires spending", () => {
    const b = buildBrief(audit());
    expect(headline(b)).toMatch(/paying for itself in 8 months/);
  });
});
