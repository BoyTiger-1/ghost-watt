// Making the estimate answer to the meter.
//
// The property that matters here is not that the total comes out right - any
// scalar can do that. It is *where* the correction lands: a line somebody
// measured with a plug-in meter must come through untouched, and a wide catalog
// guess must absorb the reduction. A reconciliation that squeezed both equally
// would take the one honest number in the audit and make it wrong.

import { describe, expect, it } from "vitest";
import { applyReconciliation, lineSigma, reconcile, reconcileLines, type ReconcileLine } from "./reconcile";
import { BUILDING_TYPE_BY_ID } from "./benchmark";
import { rankObservations } from "./energy";
import { DEFAULT_SETTINGS, type AuditSettings, type Offender } from "./types";

const lines: ReconcileLine[] = [
  { id: "monitors", kwhPerYear: 3000, sigma: 0.3 },
  { id: "lights", kwhPerYear: 5000, sigma: 0.5 },
  { id: "server", kwhPerYear: 2000, sigma: 0.04 },
  { id: "fridge", kwhPerYear: 1500, sigma: 0.45 },
];
const bottomUp = lines.reduce((s, l) => s + l.kwhPerYear, 0);

describe("reconcile", () => {
  it("has nothing to say without a bill or without lines", () => {
    expect(reconcile(lines, 0, "k12")).toBeNull();
    expect(reconcile([], 60000, "k12")).toBeNull();
    expect(reconcile(lines, -5, "k12")).toBeNull();
  });

  it("leaves an audit that fits inside the meter completely alone", () => {
    const r = reconcile(lines, 200000, "k12")!;
    expect(r.verdict).toBe("within");
    expect(r.factor).toBe(1);
    for (const l of lines) expect(r.scale[l.id]).toBe(1);
    expect(r.coverage).toBeLessThan(1);
    expect(r.message).toMatch(/fits inside the meter/);
  });

  it("brings an over-claiming audit down to what the bill leaves room for", () => {
    // A 20,000 kWh/yr meter cannot be carrying 11,500 kWh of plug and lighting
    // load in a school: the envelope is the type's plug share with headroom.
    const r = reconcile(lines, 20000, "k12")!;
    expect(r.verdict).toBe("corrected");
    expect(r.bottomUpKwh).toBe(bottomUp);
    expect(r.coverage).toBeGreaterThan(1);
    expect(r.factor).toBeLessThan(1);
    const reconciled = lines.reduce((s, l) => s + l.kwhPerYear * r.scale[l.id], 0);
    expect(reconciled).toBeCloseTo(r.envelopeKwh, 6);
    expect(r.message).toMatch(/brought down to fit it/);
  });

  it("takes the correction out of the guesses and not out of the measurement", () => {
    const r = reconcile(lines, 20000, "k12")!;
    // The measured server barely moves; the wide-band lighting line carries it.
    expect(r.scale.server).toBeGreaterThan(0.99);
    expect(r.scale.lights).toBeLessThan(r.scale.monitors);
    expect(r.scale.monitors).toBeLessThan(r.scale.server);
    // Nothing is ever reversed or scaled up by a reduction.
    for (const l of lines) {
      expect(r.scale[l.id]).toBeGreaterThan(0);
      expect(r.scale[l.id]).toBeLessThanOrEqual(1);
    }
  });

  it("refuses to overrule a meter with a set of meters", () => {
    // Every line measured: there is nothing the model is entitled to bend, so the
    // honest answer is that the bill probably covers only part of the site.
    const allMeasured = lines.map((l) => ({ ...l, sigma: 0 }));
    const r = reconcile(allMeasured, 20000, "k12")!;
    expect(r.verdict).toBe("within");
    expect(r.factor).toBe(1);
    expect(r.message).toMatch(/only part of the site/);
  });

  it("uses the building type's plug-load share, so a warehouse is judged differently", () => {
    const school = reconcile(lines, 20000, "k12")!;
    const warehouse = reconcile(lines, 20000, "warehouse")!;
    expect(BUILDING_TYPE_BY_ID.warehouse.plugLoadShare).toBeLessThan(BUILDING_TYPE_BY_ID.k12.plugLoadShare);
    expect(warehouse.envelopeKwh).toBeLessThan(school.envelopeKwh);
    expect(warehouse.factor).toBeLessThan(school.factor);
  });
});

describe("lineSigma", () => {
  it("reads the spread off the line's own cost band", () => {
    const wide = lineSigma({ costPerYear: 100, costLowPerYear: 40, costHighPerYear: 250, basis: "catalog" });
    const narrow = lineSigma({ costPerYear: 100, costLowPerYear: 95, costHighPerYear: 105, basis: "catalog" });
    expect(wide).toBeGreaterThan(narrow);
  });

  it("gives a measured line a meter's spread whatever its band says", () => {
    expect(lineSigma({ costPerYear: 100, costLowPerYear: 40, costHighPerYear: 250, basis: "measured" })).toBe(0.04);
  });

  it("survives a degenerate band", () => {
    const s = lineSigma({ costPerYear: 0, costLowPerYear: 0, costHighPerYear: 0, basis: "catalog" });
    expect(Number.isFinite(s)).toBe(true);
    expect(s).toBeGreaterThan(0);
  });
});

describe("applyReconciliation", () => {
  const settings: AuditSettings = { ...DEFAULT_SETTINGS, ratePerKwh: 0.2, unoccupiedHoursPerYear: 6000 };
  const offenders = rankObservations(
    [
      { device: "monitor", count: 20, state: "on", categoryId: "monitor" },
      { device: "ceiling light", count: 10, state: "on", categoryId: "ceiling_light" },
    ],
    settings,
    "Lab",
  );

  it("passes an audit through untouched when there is nothing to reconcile", () => {
    expect(applyReconciliation(offenders, null)).toEqual(offenders);
    const within = reconcile(reconcileLines(offenders), 5_000_000, "k12");
    expect(applyReconciliation(offenders, within)).toEqual(offenders);
  });

  it("scales every costed figure on a line by the same factor, and recomputes payback", () => {
    const r = reconcile(reconcileLines(offenders), 12000, "k12")!;
    expect(r.verdict).toBe("corrected");
    const out = applyReconciliation(offenders, r);
    for (const [i, o] of out.entries()) {
      const before = offenders[i];
      const k = r.scale[before.id];
      expect(o.reconciledBy).toBeCloseTo(k, 9);
      expect(o.kwhPerYear).toBeCloseTo(before.kwhPerYear * k, 6);
      expect(o.costPerYear).toBeCloseTo(before.costPerYear * k, 6);
      expect(o.co2KgPerYear).toBeCloseTo(before.co2KgPerYear * k, 6);
      expect(o.annualSavings).toBeCloseTo(before.annualSavings * k, 6);
      // Payback is a ratio, so it has to be recomputed rather than scaled.
      expect(o.paybackMonths!).toBeCloseTo((o.fixCost / o.annualSavings) * 12, 6);
      expect(o.paybackMonths!).toBeGreaterThan(before.paybackMonths!);
    }
  });

  it("never scales a line it was not given a factor for", () => {
    const r = reconcile(reconcileLines(offenders), 12000, "k12")!;
    const stranger: Offender = { ...offenders[0], id: "not-in-the-reconciliation" };
    const [out] = applyReconciliation([stranger], r);
    expect(out).toEqual(stranger);
  });
});

describe("reconcileLines", () => {
  const settings: AuditSettings = { ...DEFAULT_SETTINGS, ratePerKwh: 0.2, unoccupiedHoursPerYear: 6000 };

  it("reconciles against the whole year's energy, not just the after-hours part", () => {
    // The bill measures everything the building used, so the thing compared with
    // it has to be everything the audit says these devices use.
    const [o] = rankObservations(
      [{ device: "monitor", count: 4, state: "on", categoryId: "monitor" }],
      settings,
      "Lab",
    );
    const [line] = reconcileLines([o]);
    expect(line.id).toBe(o.id);
    expect(line.kwhPerYear).toBeGreaterThan(o.kwhPerYear);
    expect(line.kwhPerYear).toBeCloseTo((o.kwhPerYear * o.annualCostPerYear!) / o.costPerYear, 6);
    expect(line.sigma).toBeGreaterThan(0);
  });
});
