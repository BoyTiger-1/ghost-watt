import { describe, expect, it } from "vitest";
import { CATALOG_BY_ID } from "./devices";
import { catalogWatts, costRange, estimateUnitWatts } from "./estimate";
import { effectiveWatts, effectiveWattsRange, scoreObservation } from "./energy";
import { DEFAULT_SETTINGS } from "./types";

const monitor = CATALOG_BY_ID["monitor"];
const projector = CATALOG_BY_ID["projector"];
const fridge = CATALOG_BY_ID["fridge"];

describe("estimateUnitWatts", () => {
  it("with no evidence, is exactly the catalog figure and band", () => {
    for (const cat of [monitor, projector, fridge]) {
      for (const state of ["on", "standby"] as const) {
        const est = estimateUnitWatts(cat, state);
        expect(est.mid).toBeCloseTo(effectiveWatts(cat, state), 9);
        const band = effectiveWattsRange(cat, state);
        expect(est.low).toBeCloseTo(band.low, 9);
        expect(est.high).toBeCloseTo(band.high, 9);
        expect(est.basis).toBe("catalog");
      }
    }
  });

  it("moves toward the AI's read and narrows the band", () => {
    const prior = catalogWatts(projector, "on");
    const laser = estimateUnitWatts(projector, "on", { aiWatts: 160 });
    expect(laser.basis).toBe("ai");
    expect(laser.mid).toBeLessThan(prior.mid);
    expect(laser.mid).toBeGreaterThan(160);
    expect(laser.high - laser.low).toBeLessThan(prior.high - prior.low);
  });

  it("drops an AI figure that is impossible for the class", () => {
    expect(estimateUnitWatts(monitor, "on", { aiWatts: 5000 }).basis).toBe("catalog");
    expect(estimateUnitWatts(monitor, "on", { aiWatts: 0.5 }).basis).toBe("catalog");
  });

  it("uses the AI figure for running draw only, not standby", () => {
    expect(estimateUnitWatts(monitor, "standby", { aiWatts: 30 }).basis).toBe("catalog");
  });

  it("applies duty cycle to an AI read of a thermostatic device", () => {
    const est = estimateUnitWatts(fridge, "on", { aiWatts: fridge.wattsOn });
    expect(est.mid).toBeCloseTo(fridge.wattsOn * fridge.dutyCycle, 3);
  });

  it("takes a measurement over everything, with a tight band", () => {
    const est = estimateUnitWatts(monitor, "on", { aiWatts: 30, userWatts: 22 });
    expect(est.basis).toBe("measured");
    expect(est.mid).toBeCloseTo(22, 6);
    expect(est.high / est.low).toBeLessThan(1.2);
  });

  it("reports off as zero", () => {
    expect(estimateUnitWatts(monitor, "off", { userWatts: 20 }).mid).toBe(0);
  });
});

describe("scoreObservation with evidence", () => {
  it("costs user hours instead of the schedule's", () => {
    const base = scoreObservation({ device: "monitor", count: 2, state: "on", categoryId: "monitor" }, DEFAULT_SETTINGS, "a", 0)!;
    const told = scoreObservation(
      { device: "monitor", count: 2, state: "on", categoryId: "monitor", hoursPerYear: 3400 },
      DEFAULT_SETTINGS,
      "a",
      0,
    )!;
    expect(base.hoursKnown).toBe(false);
    expect(told.hoursKnown).toBe(true);
    expect(told.costPerYear / base.costPerYear).toBeCloseTo(3400 / DEFAULT_SETTINGS.unoccupiedHoursPerYear, 6);
  });

  it("carries the basis and evidence through", () => {
    const o = scoreObservation(
      { device: "projector", count: 1, state: "on", categoryId: "projector", wattsHint: 300, evidence: "lamp glowing" },
      DEFAULT_SETTINGS,
      "a",
      0,
    )!;
    expect(o.basis).toBe("ai");
    expect(o.evidence).toBe("lamp glowing");
    expect(o.confidence).toBe("high");
  });
});

describe("costRange", () => {
  const line = (cost: number, lowF = 0.6, highF = 1.6) => ({
    costPerYear: cost,
    costLowPerYear: cost * lowF,
    costHighPerYear: cost * highF,
  });

  it("is zero for nothing", () => {
    expect(costRange([])).toEqual({ p10: 0, p50: 0, p90: 0, spread: 0 });
  });

  it("brackets the headline and is narrower than summing every extreme", () => {
    const lines = Array.from({ length: 10 }, (_, i) => line(100 + i * 20));
    const total = lines.reduce((s, l) => s + l.costPerYear, 0);
    const r = costRange(lines);
    expect(r.p10).toBeLessThan(total);
    expect(r.p90).toBeGreaterThan(total * 0.95);
    const naiveLow = lines.reduce((s, l) => s + l.costLowPerYear, 0);
    const naiveHigh = lines.reduce((s, l) => s + l.costHighPerYear, 0);
    expect(r.p90 - r.p10).toBeLessThan(naiveHigh - naiveLow);
  });

  it("tightens with better inputs", () => {
    const loose = costRange([line(500)], "national");
    const tight = costRange([{ ...line(500, 0.95, 1.05), hoursKnown: true }], "bill");
    expect(tight.spread).toBeLessThan(loose.spread);
  });

  it("is deterministic for a given seed", () => {
    expect(costRange([line(300), line(80)])).toEqual(costRange([line(300), line(80)]));
  });
});
