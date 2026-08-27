// The sample is the first thing an evaluator sees, and it is generated rather than
// written down, which means it can break silently in ways a hand-written fixture
// cannot: a renamed catalogue id produces no error, just a fix worth $0 that gets
// filtered out and a demo that quietly stops demonstrating anything.
//
// These tests exist because that already happened once during development.

import { describe, expect, it } from "vitest";
import {
  isSampleId,
  sampleRecords,
  storeHasSample,
  withSample,
  withoutSample,
} from "./sample";
import { EMPTY_STORE, type Store } from "./storage";
import { CATALOG_BY_ID } from "./devices";

const records = sampleRecords();

describe("the sample is real pipeline output", () => {
  it("produces findings in both audits", () => {
    for (const audit of records.audits) {
      expect(audit.offenders.length, `${audit.id} produced nothing`).toBeGreaterThan(0);
    }
  });

  it("only contains devices that exist in the catalogue", () => {
    for (const audit of records.audits) {
      for (const o of audit.offenders) {
        expect(CATALOG_BY_ID[o.categoryId], `unknown category ${o.categoryId}`).toBeDefined();
      }
    }
  });

  it("computes money rather than asserting it", () => {
    const before = records.audits[0];
    const total = before.offenders.reduce((s, o) => s + o.costPerYear, 0);
    // A 92,000 sq ft school with five badly-behaved areas. If this ever falls
    // outside a plausible band, either the sample or the energy math has drifted.
    expect(total).toBeGreaterThan(200);
    expect(total).toBeLessThan(20000);
  });

  it("gives every offender a positive cost and a real action", () => {
    for (const o of records.audits[0].offenders) {
      expect(o.costPerYear).toBeGreaterThan(0);
      expect(o.action.label.length).toBeGreaterThan(0);
    }
  });
});

describe("the sample actually demonstrates improvement", () => {
  it("wastes less in the follow-up audit than in the first", () => {
    // The entire point of shipping two audits is the before-and-after. If the
    // second one is not cheaper, the verification loop has nothing to show.
    const [before, after] = records.audits;
    const cost = (a: typeof before) => a.offenders.reduce((s, o) => s + o.costPerYear, 0);
    expect(cost(after)).toBeLessThan(cost(before));
  });

  it("leaves something unfixed, because a real building always does", () => {
    const after = records.audits[1];
    expect(after.offenders.length).toBeGreaterThan(0);
    // The vending machines belong to a vendor and stay on; that is the honest
    // shape of a follow-up audit and it should survive edits to the sample.
    expect(after.offenders.some((o) => o.categoryId === "vending_cold")).toBe(true);
  });

  it("records fixes that are worth a non-zero amount", () => {
    // The bug this catches: a renamed catalogue id makes savingsFor() return 0,
    // the fix is filtered out, and the portfolio silently shows fewer fixes.
    expect(records.fixes.length).toBe(3);
    for (const f of records.fixes) {
      expect(f.expectedAnnualSavings, `${f.id} is worth nothing`).toBeGreaterThan(0);
      expect(CATALOG_BY_ID[f.categoryId]).toBeDefined();
    }
  });

  it("proves a non-zero saving for every fix, measured from the re-scan", () => {
    // The bug this catches: verifiedAt set without verifiedAnnualSavings. The
    // portfolio then reports "3 / 3 fixes verified" beside "$0/yr proven", which
    // reads as three fixes that were installed and achieved nothing - the exact
    // opposite of what the sample exists to demonstrate.
    for (const f of records.fixes) {
      expect(f.verifiedAt, `${f.id} is not marked verified`).toBeDefined();
      expect(f.verifiedAnnualSavings, `${f.id} proved nothing`).toBeGreaterThan(0);
    }
  });

  it("measures verified savings from the audits rather than restating the estimate", () => {
    // If these were ever hand-copied from expectedAnnualSavings, the page would
    // show a perfect zero gap on every row and the comparison would be theatre.
    const identical = records.fixes.every(
      (f) => f.verifiedAnnualSavings === f.expectedAnnualSavings,
    );
    expect(identical).toBe(false);
  });

  it("dates the fixes between the two audits, so they can be verified", () => {
    const [before, after] = records.audits;
    for (const f of records.fixes) {
      expect(Date.parse(f.installedAt)).toBeGreaterThan(Date.parse(before.at));
      expect(Date.parse(f.installedAt)).toBeLessThan(Date.parse(after.at));
    }
  });
});

describe("loading and unloading never touches real work", () => {
  const realStore: Store = {
    ...EMPTY_STORE,
    buildings: [{ id: "real-1", name: "Actual school" } as Store["buildings"][number]],
    audits: [{ id: "a", buildingId: "real-1" } as Store["audits"][number]],
    activeBuildingId: "real-1",
  };

  it("adds the sample alongside existing buildings", () => {
    const merged = withSample(realStore);
    expect(merged.buildings).toHaveLength(2);
    expect(merged.buildings.some((b) => b.id === "real-1")).toBe(true);
    expect(storeHasSample(merged)).toBe(true);
  });

  it("is idempotent, so double-clicking the button cannot duplicate it", () => {
    const once = withSample(EMPTY_STORE);
    const twice = withSample(once);
    expect(twice.buildings).toHaveLength(1);
    expect(twice.audits).toHaveLength(once.audits.length);
  });

  it("removes every sample record and leaves real ones", () => {
    const cleaned = withoutSample(withSample(realStore));
    expect(cleaned.buildings).toHaveLength(1);
    expect(cleaned.buildings[0].id).toBe("real-1");
    expect(cleaned.audits.every((a) => a.buildingId === "real-1")).toBe(true);
    expect(storeHasSample(cleaned)).toBe(false);
  });

  it("restores a real building as active after the sample is removed", () => {
    // Loading the sample makes it active. Removing it must not leave the app
    // pointing at a building that no longer exists.
    const cleaned = withoutSample(withSample(realStore));
    expect(cleaned.activeBuildingId).toBe("real-1");
  });

  it("leaves activeBuildingId null when there was nothing else", () => {
    const cleaned = withoutSample(withSample(EMPTY_STORE));
    expect(cleaned.activeBuildingId).toBeNull();
    expect(cleaned.buildings).toHaveLength(0);
  });

  it("marks every sample record so it can never be mistaken for real data", () => {
    expect(isSampleId(records.building.id)).toBe(true);
    for (const a of records.audits) expect(isSampleId(a.id)).toBe(true);
    for (const f of records.fixes) expect(isSampleId(f.id)).toBe(true);
  });
});
