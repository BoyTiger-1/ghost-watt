import { describe, expect, it } from "vitest";
import { billOf, listActions, rankActions, simulate } from "./actions";
import type { AuditSettings, Offender } from "./types";

const s: AuditSettings = { ratePerKwh: 0.1, co2PerKwh: 0.1, unoccupiedHoursPerYear: 6800 };

const line = (patch: Partial<Offender>): Offender => ({
  id: "c1::monitor",
  categoryId: "monitor",
  label: "Monitor",
  icon: "monitor",
  count: 2,
  state: "on",
  perUnitWatts: 30,
  totalWatts: 60,
  kwhPerYear: 400,
  costPerYear: 40,
  co2KgPerYear: 40,
  costLowPerYear: 30,
  costHighPerYear: 50,
  group: "display",
  action: { label: "Smart strip", type: "powerstrip", cost: 20, savingsFraction: 0.9, note: "n" },
  fixCost: 20,
  annualSavings: 36,
  paybackMonths: 6.7,
  confidence: "high",
  source: "Lab",
  afterHoursState: "on",
  activeWattsPerUnit: 30,
  typicalHoursPerDay: 8,
  typicalCostPerYear: 20,
  ...patch,
});

describe("listActions / rankActions", () => {
  it("offers the after-hours fix, priced from the audit, and ranks free moves first", () => {
    const free = line({ id: "c1::light", categoryId: "ceiling_light", label: "Lights", fixCost: 0, annualSavings: 10, costPerYear: 12, action: { label: "Switch off", type: "policy", cost: 0, savingsFraction: 0.8, note: "" } });
    const items = rankActions(listActions([line({}), free], s));
    expect(items[0].id).toBe("c1::light:fix");
    expect(items[0].savingsPerDollar).toBeNull();
    const fix = items.find((i) => i.id === "c1::monitor:fix")!;
    expect(fix.cost).toBe(20);
    expect(fix.annualSavings).toBe(36);
    expect(fix.savingsPerDollar).toBeCloseTo(1.8);
  });

  it("ranks paid moves by dollars saved per dollar spent, not by savings alone", () => {
    const big = line({ id: "a", fixCost: 300, annualSavings: 300 });
    const small = line({ id: "b", fixCost: 20, annualSavings: 36 });
    const ranked = rankActions(listActions([big, small], s)).filter((i) => i.kind === "fix");
    expect(ranked.map((i) => i.offenderId)).toEqual(["b", "a"]);
  });

  it("leaves unverified lines out", () => {
    expect(listActions([line({ unverified: true })], s)).toHaveLength(0);
  });

  it("offers a replacement only for a device that is clearly inefficient", () => {
    // 80 W CRT monitors against a 16 W efficient unit.
    const crt = line({ perUnitWatts: 80, activeWattsPerUnit: 80, tech: "CRT", basis: "ai", costPerYear: 100, annualSavings: 90 });
    const rep = listActions([crt], s).find((i) => i.kind === "replace");
    expect(rep).toBeDefined();
    expect(rep!.cost).toBe(300);
    expect(rep!.annualSavings).toBeGreaterThan(0);
    // An efficient monitor gets no replacement move.
    const led = line({ perUnitWatts: 16, activeWattsPerUnit: 16, tech: "LED", basis: "ai" });
    expect(listActions([led], s).find((i) => i.kind === "replace")).toBeUndefined();
  });
});

describe("simulate", () => {
  it("does nothing with nothing chosen", () => {
    const sim = simulate([line({})], s, new Set());
    expect(sim.before).toEqual(billOf([line({})]));
    expect(sim.annualSavings).toBe(0);
    expect(sim.paybackMonths).toBeNull();
  });

  it("removes the fix's share of after-hours waste and charges its cost", () => {
    const sim = simulate([line({})], s, new Set(["c1::monitor:fix"]));
    expect(sim.after.afterHours).toBeCloseTo(4);
    expect(sim.after.typical).toBe(20);
    expect(sim.upfront).toBe(20);
    expect(sim.annualSavings).toBeCloseTo(36);
    expect(sim.paybackMonths).toBeCloseTo((20 / 36) * 12);
    expect(sim.co2SavedKg).toBeCloseTo(36 / 0.1 * 0.1);
  });

  it("never credits the same watts twice when both moves are ticked", () => {
    const crt = line({ perUnitWatts: 80, activeWattsPerUnit: 80, tech: "CRT", basis: "ai", costPerYear: 100, annualSavings: 90, typicalCostPerYear: 50 });
    const both = simulate([crt], s, new Set(["c1::monitor:fix", "c1::monitor:replace"]));
    const items = listActions([crt], s);
    const sum = items.reduce((t, i) => t + i.annualSavings, 0);
    expect(both.annualSavings).toBeLessThan(sum);
    expect(both.annualSavings).toBeGreaterThan(Math.max(...items.map((i) => i.annualSavings)));
    expect(both.after.afterHours).toBeGreaterThanOrEqual(0);
  });
});
