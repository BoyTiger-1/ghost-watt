// Golden tests for the money math.
//
// Everything a facilities director will argue with comes out of energy.ts. If the
// wattage table is wrong we can defend that with a citation; if the arithmetic on
// top of it is wrong, nothing else in the app is worth reading. These tests pin the
// arithmetic to hand-computed numbers, so a refactor that quietly changes what a
// building is told it is wasting fails here instead of in a meeting.
//
// The figures below are worked out longhand in the comments rather than derived
// from the code, which is the only way a test like this is worth anything.

import { describe, expect, it } from "vitest";
import {
  aggregate,
  concentration,
  effectiveWatts,
  effectiveWattsRange,
  loadMix,
  rankObservations,
  scoreObservation,
} from "./energy";
import { CATALOG_BY_ID } from "./devices";
import type { AuditSettings, DeviceCategory } from "./types";

/** Round numbers, so any drift shows up as an obvious arithmetic difference. */
const SETTINGS: AuditSettings = {
  ratePerKwh: 0.2,
  co2PerKwh: 0.4,
  unoccupiedHoursPerYear: 5000,
};

const monitor = CATALOG_BY_ID.monitor as DeviceCategory;
const fridge = CATALOG_BY_ID.fridge as DeviceCategory;

describe("effectiveWatts", () => {
  it("applies the duty cycle to a running device", () => {
    // monitor: 30 W on, duty cycle 1
    expect(effectiveWatts(monitor, "on")).toBe(30);
  });

  it("uses the standby figure, not a fraction of the running figure", () => {
    expect(effectiveWatts(monitor, "standby")).toBe(monitor.wattsStandby);
    expect(effectiveWatts(monitor, "standby")).toBe(0.5);
  });

  it("returns zero for a device that is off", () => {
    expect(effectiveWatts(monitor, "off")).toBe(0);
  });

  it("ignores the observed state for a thermostatic device", () => {
    // A fridge that "looks off" is a fridge between compressor cycles. This is the
    // single most important special case in the file: without it, a walk-in cooler
    // photographed mid-cycle vanishes from the audit entirely.
    const expected = fridge.wattsOn * fridge.dutyCycle;
    expect(effectiveWatts(fridge, "off")).toBe(expected);
    expect(effectiveWatts(fridge, "standby")).toBe(expected);
    expect(effectiveWatts(fridge, "on")).toBe(expected);
    expect(expected).toBeGreaterThan(0);
  });
});

describe("effectiveWattsRange", () => {
  it("carries the published band through the duty cycle", () => {
    // monitor: 15-60 W published, duty cycle 1
    expect(effectiveWattsRange(monitor, "on")).toEqual({ low: 15, high: 60 });
  });

  it("collapses to zero when the device is off", () => {
    expect(effectiveWattsRange(monitor, "off")).toEqual({ low: 0, high: 0 });
  });

  it("brackets the point estimate", () => {
    const band = effectiveWattsRange(fridge, "on");
    const mid = effectiveWatts(fridge, "on");
    expect(band.low).toBeLessThanOrEqual(mid);
    expect(band.high).toBeGreaterThanOrEqual(mid);
  });
});

describe("scoreObservation", () => {
  it("computes kWh, dollars and CO2 from watts x hours", () => {
    // 4 monitors x 30 W = 120 W = 0.12 kW
    // 0.12 kW x 5000 h = 600 kWh
    // 600 kWh x $0.20 = $120
    // 600 kWh x 0.4 kg = 240 kg
    const o = scoreObservation(
      { device: "monitor", count: 4, state: "on", categoryId: "monitor" },
      SETTINGS,
      "test",
      0,
    );
    expect(o).not.toBeNull();
    expect(o!.totalWatts).toBe(120);
    expect(o!.kwhPerYear).toBeCloseTo(600, 6);
    expect(o!.costPerYear).toBeCloseTo(120, 6);
    expect(o!.co2KgPerYear).toBeCloseTo(240, 6);
  });

  it("returns the cost band around that figure", () => {
    // low: 4 x 15 W = 60 W -> 300 kWh -> $60
    // high: 4 x 60 W = 240 W -> 1200 kWh -> $240
    const o = scoreObservation(
      { device: "monitor", count: 4, state: "on", categoryId: "monitor" },
      SETTINGS,
      "test",
      0,
    )!;
    expect(o.costLowPerYear).toBeCloseTo(60, 6);
    expect(o.costHighPerYear).toBeCloseTo(240, 6);
  });

  it("derives savings and payback from the fix, not from a guess", () => {
    // monitor fix: $60, saves 95% -> $120 x 0.95 = $114/yr -> 60/114 x 12 = 6.32 months
    const o = scoreObservation(
      { device: "monitor", count: 4, state: "on", categoryId: "monitor" },
      SETTINGS,
      "test",
      0,
    )!;
    expect(o.annualSavings).toBeCloseTo(114, 6);
    expect(o.paybackMonths).toBeCloseTo((60 / 114) * 12, 6);
  });

  it("drops an observation that draws nothing", () => {
    // A monitor that is genuinely off costs nothing, so it is not an offender.
    // Reporting it at $0 would pad the list and make the audit look padded.
    expect(
      scoreObservation(
        { device: "monitor", count: 4, state: "off", categoryId: "monitor" },
        SETTINGS,
        "test",
        0,
      ),
    ).toBeNull();
  });

  it("drops an observation whose category is not in the catalog", () => {
    expect(
      scoreObservation(
        { device: "flux capacitor", count: 1, state: "on", categoryId: "flux" },
        SETTINGS,
        "test",
        0,
      ),
    ).toBeNull();
  });

  it("floors the count at one and rounds fractions", () => {
    const zero = scoreObservation(
      { device: "monitor", count: 0, state: "on", categoryId: "monitor" },
      SETTINGS,
      "test",
      0,
    )!;
    expect(zero.count).toBe(1);
    const frac = scoreObservation(
      { device: "monitor", count: 2.6, state: "on", categoryId: "monitor" },
      SETTINGS,
      "test",
      0,
    )!;
    expect(frac.count).toBe(3);
  });

  it("scales linearly with the number of units", () => {
    const one = scoreObservation(
      { device: "monitor", count: 1, state: "on", categoryId: "monitor" },
      SETTINGS,
      "test",
      0,
    )!;
    const ten = scoreObservation(
      { device: "monitor", count: 10, state: "on", categoryId: "monitor" },
      SETTINGS,
      "test",
      1,
    )!;
    expect(ten.costPerYear).toBeCloseTo(one.costPerYear * 10, 6);
  });
});

describe("rankObservations", () => {
  it("merges duplicate categories rather than listing them twice", () => {
    // The model often emits "2 monitors" and "3 monitors" for one room. Facilities
    // wants one line saying five, not two lines to reconcile.
    const rows = rankObservations(
      [
        { device: "monitor", count: 2, state: "on", categoryId: "monitor" },
        { device: "display", count: 3, state: "on", categoryId: "monitor" },
      ],
      SETTINGS,
      "test",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].count).toBe(5);
    // 5 x 30 W x 5000 h = 750 kWh -> $150
    expect(rows[0].costPerYear).toBeCloseTo(150, 6);
  });

  it("recomputes payback after merging instead of keeping the first row's", () => {
    // One fix covers the merged line, so payback must fall as the savings rise.
    const single = rankObservations(
      [{ device: "monitor", count: 2, state: "on", categoryId: "monitor" }],
      SETTINGS,
      "test",
    )[0];
    const merged = rankObservations(
      [
        { device: "monitor", count: 2, state: "on", categoryId: "monitor" },
        { device: "monitor", count: 8, state: "on", categoryId: "monitor" },
      ],
      SETTINGS,
      "test",
    )[0];
    expect(merged.fixCost).toBe(single.fixCost);
    expect(merged.paybackMonths!).toBeLessThan(single.paybackMonths!);
    expect(merged.paybackMonths!).toBeCloseTo(
      (merged.fixCost / merged.annualSavings) * 12,
      6,
    );
  });

  it("sorts by dollars, not by count", () => {
    // Ten monitors ($300) must rank below one fridge if the fridge costs more, which
    // is the entire point of the ranking: the eye-catching row is rarely the
    // expensive one.
    const rows = rankObservations(
      [
        { device: "monitor", count: 10, state: "on", categoryId: "monitor" },
        { device: "fridge", count: 1, state: "on", categoryId: "fridge" },
      ],
      SETTINGS,
      "test",
    );
    expect(rows).toHaveLength(2);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].costPerYear).toBeGreaterThanOrEqual(rows[i].costPerYear);
    }
  });

  it("does not mutate an already-merged offender across calls", () => {
    const obs = [{ device: "monitor", count: 2, state: "on" as const, categoryId: "monitor" }];
    const first = rankObservations(obs, SETTINGS, "test")[0];
    const second = rankObservations(obs, SETTINGS, "test")[0];
    expect(second.count).toBe(first.count);
    expect(second.costPerYear).toBeCloseTo(first.costPerYear, 6);
  });
});

describe("aggregate", () => {
  const rows = rankObservations(
    [
      { device: "monitor", count: 4, state: "on", categoryId: "monitor" },
      { device: "fridge", count: 1, state: "on", categoryId: "fridge" },
    ],
    SETTINGS,
    "test",
  );

  it("sums the parts", () => {
    const t = aggregate(rows);
    expect(t.costPerYear).toBeCloseTo(
      rows.reduce((s, r) => s + r.costPerYear, 0),
      6,
    );
    expect(t.kwhPerYear).toBeCloseTo(
      rows.reduce((s, r) => s + r.kwhPerYear, 0),
      6,
    );
    expect(t.averageWatts).toBeCloseTo(
      rows.reduce((s, r) => s + r.totalWatts, 0),
      6,
    );
  });

  it("keeps the band the right way round", () => {
    const t = aggregate(rows);
    expect(t.costLowPerYear).toBeLessThanOrEqual(t.costPerYear);
    expect(t.costHighPerYear).toBeGreaterThanOrEqual(t.costPerYear);
  });

  it("never claims to recover more than is being spent", () => {
    const t = aggregate(rows);
    expect(t.recoverableCost).toBeLessThanOrEqual(t.costPerYear + 1e-9);
  });

  it("names the most expensive row as the top offender", () => {
    const t = aggregate(rows);
    expect(t.topOffender!.costPerYear).toBe(
      Math.max(...rows.map((r) => r.costPerYear)),
    );
  });

  it("returns zeroes and no top offender for an empty audit", () => {
    const t = aggregate([]);
    expect(t.costPerYear).toBe(0);
    expect(t.recoverableCost).toBe(0);
    expect(t.topOffender).toBeNull();
  });

  it("sums fix cost across rows, which double-counts a shared fix", () => {
    // Documented rather than asserted-away: two rooms of monitors bill two smart
    // strips. That is right when the rooms are genuinely separate and wrong when one
    // strip would cover both, so the number is an upper bound on capital cost. The
    // methodology page says so; this test exists so the behaviour cannot change
    // silently underneath that claim.
    const twoRooms = [
      ...rankObservations(
        [{ device: "monitor", count: 4, state: "on", categoryId: "monitor" }],
        SETTINGS,
        "room-a",
      ),
      ...rankObservations(
        [{ device: "monitor", count: 4, state: "on", categoryId: "monitor" }],
        SETTINGS,
        "room-b",
      ),
    ];
    expect(aggregate(twoRooms).totalFixCost).toBe(monitor.action.cost * 2);
  });
});

describe("breakdowns", () => {
  const rows = rankObservations(
    [
      { device: "monitor", count: 4, state: "on", categoryId: "monitor" },
      { device: "fridge", count: 1, state: "on", categoryId: "fridge" },
    ],
    SETTINGS,
    "test",
  );

  it("gives shares that add up to one", () => {
    const slices = loadMix(rows);
    expect(slices.reduce((s, g) => s + g.share, 0)).toBeCloseTo(1, 6);
  });

  it("reports concentration as a fraction between zero and one", () => {
    const c = concentration(rows, 1);
    expect(c).toBeGreaterThan(0);
    expect(c).toBeLessThanOrEqual(1);
  });

  it("survives an empty audit without dividing by zero", () => {
    expect(loadMix([])).toEqual([]);
    expect(Number.isFinite(concentration([], 3))).toBe(true);
  });
});
