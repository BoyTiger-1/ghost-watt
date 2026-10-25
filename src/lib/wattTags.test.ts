import { describe, expect, it } from "vitest";
import { applyFixes, easeAll, hitTest, meterReading, placeTag, relabel, steadyStates, unstack, wattBand, wattsInView } from "./wattTags";
import { CATALOG_BY_ID } from "./devices";
import type { LiveItem } from "./ondevice";
import type { AuditSettings } from "./types";

const settings: AuditSettings = { ratePerKwh: 0.15, co2PerKwh: 0.4, unoccupiedHoursPerYear: 6800 };

const item = (over: Partial<LiveItem> = {}): LiveItem => ({
  key: "t1",
  kind: "device",
  label: "phone",
  categoryId: "x_smartphone",
  box: [0.1, 0.1, 0.3, 0.3],
  score: 0.6,
  state: "on",
  watts: 5,
  costPerYear: 5,
  typicalCostPerYear: 1,
  ...over,
});

describe("relabel", () => {
  it("re-prices an item as the device it really is", () => {
    const fixed = relabel(item(), { categoryId: "monitor", state: "on" }, settings);
    expect(fixed.categoryId).toBe("monitor");
    expect(fixed.watts).toBeGreaterThan(5);
    expect(fixed.costPerYear).toBeCloseTo((fixed.watts / 1000) * 6800 * 0.15, 6);
    expect(fixed.key).toBe("t1");
    expect(fixed.box).toEqual([0.1, 0.1, 0.3, 0.3]);
  });

  it("an item set to off draws nothing and costs nothing", () => {
    const off = relabel(item(), { categoryId: "monitor", state: "off" }, settings);
    expect(off.watts).toBe(0);
    expect(off.costPerYear).toBe(0);
    expect(off.typicalCostPerYear).toBe(0);
  });

  it("only the corrected key changes", () => {
    const out = applyFixes([item(), item({ key: "t2" })], new Map([["t2", { categoryId: "monitor", state: "standby" as const }]]), settings);
    expect(out[0].categoryId).toBe("x_smartphone");
    expect(out[1].state).toBe("standby");
    expect(out[1].watts).toBeLessThan(CATALOG_BY_ID.monitor.wattsOn);
  });
});

describe("the meter", () => {
  it("adds up what is drawing, not people, off things or furniture", () => {
    const items = [item({ watts: 30 }), item({ key: "l0", kind: "light", watts: 15 }), item({ key: "p", kind: "person", watts: 0 }), item({ key: "o", state: "off", watts: 40 }), item({ key: "k", kind: "other", watts: 9 })];
    expect(wattsInView(items)).toBe(45);
  });

  it("gives a range for an item it knows", () => {
    const b = wattBand({ categoryId: "monitor", state: "on" })!;
    expect(b.low).toBeLessThanOrEqual(b.mid);
    expect(b.high).toBeGreaterThanOrEqual(b.mid);
    expect(wattBand({ categoryId: null, state: "on" })).toBeNull();
  });
});

describe("easeAll", () => {
  it("counts a new tag up from zero and settles on the reading", () => {
    const shown = new Map<string, number>();
    const target = new Map([["a", 100]]);
    easeAll(shown, target, 16);
    expect(shown.get("a")!).toBeGreaterThan(0);
    expect(shown.get("a")!).toBeLessThan(100);
    for (let i = 0; i < 100; i++) easeAll(shown, target, 16);
    expect(shown.get("a")).toBe(100);
  });

  it("forgets tags that left the view", () => {
    const shown = new Map([["gone", 50]]);
    easeAll(shown, new Map(), 16);
    expect(shown.has("gone")).toBe(false);
  });
});

describe("tapping", () => {
  it("prefers a tag, then the smallest box under the finger", () => {
    const tags = [{ key: "tag", x: 0, y: 0, w: 40, h: 20 }];
    const boxes = [
      { key: "big", x: 0, y: 0, w: 200, h: 200 },
      { key: "small", x: 50, y: 50, w: 30, h: 30 },
    ];
    expect(hitTest(tags, boxes, 10, 10)).toBe("tag");
    expect(hitTest(tags, boxes, 60, 60)).toBe("small");
    expect(hitTest(tags, boxes, 150, 150)).toBe("big");
    expect(hitTest(tags, boxes, 300, 300)).toBeNull();
  });
});

describe("tag layout", () => {
  it("keeps tags on screen and clear of the top bar", () => {
    const p = placeTag({ x: 380, y: 20, w: 50, h: 50 }, 80, 34, 400, 300);
    expect(p.x + 80).toBeLessThanOrEqual(396);
    expect(p.y).toBeGreaterThanOrEqual(56);
  });

  it("nudges overlapping tags apart", () => {
    const rects = [
      { x: 10, y: 100, w: 80, h: 30 },
      { x: 20, y: 110, w: 80, h: 30 },
    ];
    unstack(rects, 400);
    expect(rects[1].y).toBeGreaterThanOrEqual(133);
  });
});

describe("steadiness", () => {
  it("does not believe a screen's new state until it has held", () => {
    const mem = new Map();
    const lit = item({ categoryId: "monitor", state: "on", watts: 30 });
    const dark = item({ categoryId: "monitor", state: "standby", watts: 1 });
    expect(steadyStates([lit], mem, 0, settings)[0].state).toBe("on");
    // A one-frame flip to standby is ignored, and the price stays the on price.
    const flip = steadyStates([dark], mem, 50, settings)[0];
    expect(flip.state).toBe("on");
    expect(flip.watts).toBeGreaterThan(5);
    // Back to on: the pending flip is forgotten.
    expect(steadyStates([lit], mem, 100, settings)[0].state).toBe("on");
    // Standby that holds is believed.
    steadyStates([dark], mem, 200, settings);
    expect(steadyStates([dark], mem, 950, settings)[0].state).toBe("standby");
  });

  it("the meter ignores a few dropped frames", () => {
    const h: { t: number; w: number }[] = [];
    for (let t = 0; t < 1000; t += 33) meterReading(h, t, 120, 1200);
    // Three frames where a 90 W screen blinked out.
    let r = 0;
    for (let t = 1000; t < 1100; t += 33) r = meterReading(h, t, 30, 1200);
    expect(r).toBe(120);
  });
});

describe("needed devices on the live camera", () => {
  it("a tag corrected to a fridge runs all night on purpose, so it costs nothing as waste", () => {
    const f = relabel(item(), { categoryId: "fridge", state: "on" }, settings);
    expect(f.needed).toBeTruthy();
    expect(f.costPerYear).toBe(0);
    expect(f.watts).toBeGreaterThan(0);
    const m = relabel(item(), { categoryId: "monitor", state: "on" }, settings);
    expect(m.needed).toBeUndefined();
    expect(m.costPerYear).toBeGreaterThan(0);
  });
});
