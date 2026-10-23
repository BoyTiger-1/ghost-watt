import { describe, expect, it } from "vitest";
import { CATALOG_BY_ID } from "./devices";
import { SYSTEMATIC_VARIANCE_SHARE, catalogWatts, costRange, estimateUnitWatts } from "./estimate";
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

  // The single biggest correction in this rewrite. The catalog band for overhead
  // lighting runs 40 W to 250 W, and that is not imprecision - it is two
  // different objects. The model was already reading which one it was; nothing
  // downstream of it was listening.
  it("reads the technology the model named, which the cost engine used to discard", () => {
    const light = CATALOG_BY_ID["ceiling_light"];
    const plain = estimateUnitWatts(light, "on");
    const t12 = estimateUnitWatts(light, "on", { words: "old t12 fluorescent troffers" });
    const led = estimateUnitWatts(light, "on", { words: "led troffer panels" });
    expect(plain.basis).toBe("catalog");
    expect(t12.basis).toBe("tech");
    expect(t12.techLabel).toBe("T12 fluorescent");
    expect(led.techLabel).toBe("LED");
    // The fixtures a photo cannot confuse must not be priced the same.
    expect(t12.mid / led.mid).toBeGreaterThan(3);
    expect(t12.mid).toBeGreaterThan(plain.mid);
    expect(led.mid).toBeLessThan(plain.mid);
  });

  it("trusts a named technology more than a guessed wattage", () => {
    // Naming a backlight is a perceptual call a vision model makes well; guessing
    // a wattage is arithmetic it cannot do. Asked both at once, the technology
    // should win - which is the opposite of what weighting them equally gives.
    const tech = estimateUnitWatts(monitor, "on", { words: "crt monitor" });
    const ai = estimateUnitWatts(monitor, "on", { aiWatts: 75 });
    const prior = catalogWatts(monitor, "on").mid;
    expect(tech.mid - prior).toBeGreaterThan(ai.mid - prior);
  });

  it("reads a screen diagonal through the area law, and ignores a stray number", () => {
    const sized = estimateUnitWatts(monitor, "on", { words: "32 inch monitor" });
    const small = estimateUnitWatts(monitor, "on", { words: "22-inch monitor" });
    expect(sized.mid).toBeGreaterThan(small.mid);
    expect(sized.techLabel).toBe("32-inch panel");
    // Power goes with area, so doubling the diagonal is nearer four times the draw.
    expect(estimateUnitWatts(monitor, "standby", { words: "24 in the corner" }).basis).toBe("catalog");
    expect(estimateUnitWatts(monitor, "on", { words: "24 in the corner" }).basis).toBe("catalog");
  });

  it("still takes a measurement over any reading of the photo", () => {
    const est = estimateUnitWatts(monitor, "on", { words: "crt monitor", aiWatts: 90, userWatts: 22 });
    expect(est.basis).toBe("measured");
    expect(est.mid).toBeCloseTo(22, 6);
  });

  it("does not read a technology into a standby figure, which no photo shows", () => {
    expect(estimateUnitWatts(monitor, "standby", { words: "crt monitor" }).basis).toBe("catalog");
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
    // "lamp glowing" is not just a phrase for the card: a projector with a lamp
    // in it is a lamp-based projector, not a laser one, and that is worth nearly
    // twice as much. The evidence line is now read as well as displayed, so the
    // basis is the technology rather than the model's watt guess.
    expect(o.basis).toBe("tech");
    expect(o.techLabel).toBe("lamp-based");
    expect(o.evidence).toBe("lamp glowing");
    expect(o.confidence).toBe("high");
  });

  it("reads the evidence phrase, not only the technology field", () => {
    const laser = scoreObservation(
      { device: "projector", count: 1, state: "on", categoryId: "projector", evidence: "laser projector, no lamp door" },
      DEFAULT_SETTINGS,
      "a",
      0,
    )!;
    const lamp = scoreObservation(
      { device: "projector", count: 1, state: "on", categoryId: "projector", evidence: "lamp hours warning on screen" },
      DEFAULT_SETTINGS,
      "a",
      0,
    )!;
    expect(laser.perUnitWatts).toBeLessThan(lamp.perUnitWatts);
    expect(laser.techLabel).toBe("laser");
  });
});

describe("costRange", () => {
  const line = (cost: number, lowF = 0.6, highF = 1.6) => ({
    costPerYear: cost,
    costLowPerYear: cost * lowF,
    costHighPerYear: cost * highF,
  });

  it("is zero for nothing", () => {
    expect(costRange([])).toEqual({ p10: 0, p50: 0, p90: 0, spread: 0, mean: 0, systematicShare: 0 });
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

  // The part that was wrong before, and wrong in the dangerous direction.
  //
  // A catalog wattage error is not an accident of one unit, it is an error in the
  // published figure - so it applies to every monitor in the building at once and
  // cannot average itself away. Sampling the lines independently let it do exactly
  // that, and reported a band several times narrower than the evidence supports.
  it("does not let one catalog error average itself away across a class", () => {
    const many = Array.from({ length: 28 }, () => ({ ...line(100), categoryId: "monitor" }));
    const correlated = costRange(many);
    // The same twenty-eight lines, but each its own class: errors now independent.
    const independent = costRange(many.map((l, i) => ({ ...l, categoryId: `monitor-${i}` })));
    expect(correlated.spread).toBeGreaterThan(independent.spread * 1.4);
    // The medians still agree within sampling noise: this widens the band, it
    // does not move the headline.
    expect(correlated.p50 / independent.p50).toBeCloseTo(1, 1);
  });

  it("reports how much of the spread is systematic, and exempts a measurement", () => {
    const catalogLines = Array.from({ length: 6 }, () => ({ ...line(100), categoryId: "monitor" }));
    expect(costRange(catalogLines).systematicShare).toBeCloseTo(SYSTEMATIC_VARIANCE_SHARE, 6);
    const measured = catalogLines.map((l) => ({ ...l, basis: "measured" as const }));
    expect(costRange(measured).systematicShare).toBe(0);
  });

  it("shares one schedule error across every line that leans on the schedule", () => {
    // Lines whose hours the user gave escape the schedule error; lines that take
    // the building's empty hours on faith all move together when it is wrong, so
    // a room full of them is no better known than one of them.
    const guessed = Array.from({ length: 10 }, (_, i) => ({ ...line(100), categoryId: `k${i}` }));
    const told = guessed.map((l) => ({ ...l, hoursKnown: true }));
    expect(costRange(guessed).spread).toBeGreaterThan(costRange(told).spread);
  });

  it("puts the mean above the median, because cost is multiplicative", () => {
    const r = costRange([{ ...line(1000), categoryId: "monitor" }]);
    expect(r.mean).toBeGreaterThan(r.p50);
  });
});
