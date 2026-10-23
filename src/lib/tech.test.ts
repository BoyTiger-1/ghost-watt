// Technology and screen-size evidence.
//
// These two readers are the reason a scan can tell a T12 troffer from an LED
// panel and charge for the difference. They are also the easiest place in the
// app to introduce a confident wrong number, so the tests below care as much
// about what they refuse to read as about what they read.

import { describe, expect, it } from "vitest";
import { AREA_16_9, TECH_BY_CATEGORY, evidenceWords, readScreenSize, readTech } from "./tech";
import { CATALOG_BY_ID } from "./devices";
import { assessEfficiency } from "./efficiency";
import { scoreObservation } from "./energy";
import { DEFAULT_SETTINGS, type AuditSettings } from "./types";

describe("readTech", () => {
  it("names the lamp technology in an overhead fixture", () => {
    expect(readTech("ceiling_light", "two t12 tubes, one flickering")?.label).toBe("T12 fluorescent");
    expect(readTech("ceiling_light", "t-8 fluorescent troffer")?.label).toBe("T8 fluorescent");
    expect(readTech("ceiling_light", "recessed led panel")?.label).toBe("LED");
    expect(readTech("ceiling_light", "metal halide high bay")?.label).toBe("HID (metal halide or sodium)");
  });

  it("prefers the more specific pattern when two could match", () => {
    // "LED high bay" is both an LED and a high bay, and they are 150 W apart.
    expect(readTech("ceiling_light", "led high bay fixture")?.label).toBe("LED high bay");
    expect(readTech("ceiling_light", "high bay fixture")?.label).toBe("HID high bay");
  });

  it("reads a backlight on a screen and a lamp on a projector", () => {
    expect(readTech("monitor", "crt monitor")?.label).toBe("CRT");
    expect(readTech("monitor", "ccfl backlit lcd")?.label).toBe("CCFL-backlit LCD");
    expect(readTech("tv", "plasma television")?.label).toBe("plasma");
    expect(readTech("projector", "laser projector, no lamp")?.label).toBe("laser");
    expect(readTech("projector", "lamp hours warning on screen")?.label).toBe("lamp-based");
  });

  it("says nothing about a class it has no table for, or words with no technology in them", () => {
    expect(readTech("laptop", "silver laptop")).toBeNull();
    expect(readTech("monitor", "a screen on a desk")).toBeNull();
    expect(readTech("monitor", "")).toBeNull();
  });

  it("keeps every figure inside something a photo could plausibly be of", () => {
    for (const [id, rules] of Object.entries(TECH_BY_CATEGORY)) {
      const cat = CATALOG_BY_ID[id];
      expect(cat, id).toBeDefined();
      for (const r of rules) {
        expect(r.watts, `${id} ${r.label}`).toBeGreaterThan(0);
        expect(r.sigma ?? 0.22, `${id} ${r.label}`).toBeGreaterThan(0);
        // A technology reading an order of magnitude outside the class band is a
        // typo in this table, not a device.
        const low = cat.wattsLow ?? cat.wattsOn * 0.75;
        const high = cat.wattsHigh ?? cat.wattsOn * 1.25;
        expect(r.watts, `${id} ${r.label}`).toBeGreaterThan(low / 10);
        expect(r.watts, `${id} ${r.label}`).toBeLessThan(high * 10);
      }
    }
  });
});

describe("readScreenSize", () => {
  it("turns a diagonal into watts through the panel area", () => {
    const r = readScreenSize("monitor", "27 inch monitor")!;
    expect(r.inches).toBe(27);
    expect(r.watts).toBeCloseTo(0.098 * AREA_16_9 * 27 * 27, 6);
  });

  it("follows area, not diagonal", () => {
    // Doubling the diagonal is four times the panel, which is the whole reason
    // this is a square law and not a linear one.
    const small = readScreenSize("tv", '32" tv')!;
    const big = readScreenSize("tv", '64" tv')!;
    expect(big.watts / small.watts).toBeCloseTo(4, 6);
  });

  it("reproduces the catalog's own sized rows", () => {
    // The coefficients were fitted to these, so this is a regression guard on the
    // fit rather than an independent check.
    for (const [inches, catalogWatts, tolerance] of [
      [22, 20, 0.2],
      [24, 22, 0.2],
      [27, 30, 0.15],
      [32, 40, 0.15],
    ] as const) {
      const r = readScreenSize("monitor", `${inches} inch monitor`)!;
      expect(Math.abs(r.watts - catalogWatts) / catalogWatts, `${inches}"`).toBeLessThan(tolerance);
    }
    // The catalog's 75-inch interactive panel is 200 W, which is what the panel
    // coefficient was fitted to.
    expect(readScreenSize("smartboard", "75 inch interactive panel")!.watts).toBeCloseTo(200, -1);
  });

  it("refuses a number that is not a screen size", () => {
    // The dangerous case: a bare "in" turns any count into a diagonal.
    expect(readScreenSize("monitor", "24 in the corner")).toBeNull();
    expect(readScreenSize("monitor", "monitor 4")).toBeNull();
    // Out of range for a single panel either way.
    expect(readScreenSize("monitor", "8 inch monitor")).toBeNull();
    expect(readScreenSize("tv", "200 inch display")).toBeNull();
  });

  it("leaves the long tail's already-sized rows alone", () => {
    // "computer monitor 24 inch" has its own catalog row with its own wattage;
    // re-deriving the size would be arguing with a figure that came from the size.
    expect(readScreenSize("x_computer_monitor_24_inch", "24 inch monitor")).toBeNull();
    expect(readScreenSize("laptop", "15 inch laptop")).toBeNull();
  });
});

describe("evidenceWords", () => {
  it("joins everything the engine said, lowercased, skipping the blanks", () => {
    expect(evidenceWords(["T8", undefined, "Overhead lighting", ""])).toBe("t8 overhead lighting");
    expect(evidenceWords([])).toBe("");
  });
});

describe("the grade and the dollars agree", () => {
  const home: AuditSettings = { ...DEFAULT_SETTINGS, usageContext: "home", occupiedHoursPerYear: 5300, unoccupiedHoursPerYear: 3460 };

  it("grades the same wattage the cost was computed from", () => {
    // These lived in two tables that could drift apart: lib/efficiency.ts had a
    // technology table for grading and lib/energy.ts had none for costing, so a
    // card could say "this is a T12 drawing 150 W" above a price worked out at
    // the catalog's 120 W. Both now read lib/tech.ts.
    const o = scoreObservation(
      { device: "ceiling light", count: 1, state: "on", categoryId: "ceiling_light", tech: "T12 fluorescent" },
      home,
      "Hall",
      0,
    )!;
    const a = assessEfficiency(o, home);
    expect(o.basis).toBe("tech");
    expect(o.techLabel).toBe("T12 fluorescent");
    expect(a.tech).toBe("T12 fluorescent");
    expect(a.activeWatts).toBeCloseTo(o.activeWattsPerUnit!, 9);
    expect(a.assumed).toBe(false);
  });

  // The subtle one. A category's label names the class, so it cannot be evidence
  // about which member of the class a unit is - and two labels read as a
  // technology if you let them. A device the user re-identified carries the
  // catalog label as its description (lib/capture.ts), so without the guard every
  // full-size refrigerator in the app would quietly be priced as the little one
  // under the desk, a 30% under-estimate nobody would ever notice.
  it("does not read a technology out of the category's own name", () => {
    for (const [categoryId, inLabel] of [
      ["fridge", "mini-fridge"],
      ["copier", "MFP"],
    ] as const) {
      const cat = CATALOG_BY_ID[categoryId];
      // The collision is real: the label does match a rule in the table.
      expect(readTech(categoryId, cat.label.toLowerCase()), categoryId).not.toBeNull();
      // And the costing refuses to act on it.
      const relabelled = scoreObservation(
        { device: cat.label, count: 1, state: "on", categoryId },
        home,
        "Kitchen",
        0,
      )!;
      const bare = scoreObservation(
        { device: categoryId, count: 1, state: "on", categoryId },
        home,
        "Kitchen",
        0,
      )!;
      expect(cat.label.toLowerCase(), `${categoryId} label contains ${inLabel}`).toContain(inLabel.toLowerCase());
      expect(relabelled.basis, categoryId).toBe("catalog");
      expect(relabelled.perUnitWatts, categoryId).toBeCloseTo(bare.perUnitWatts, 9);
    }
  });

  it("still reads a technology the model actually described", () => {
    // The guard must not cost us the case it exists to protect: when the model
    // really did see a bar fridge, that is evidence and it should count.
    const o = scoreObservation(
      { device: "mini fridge under the desk", count: 1, state: "on", categoryId: "fridge" },
      home,
      "Office",
      0,
    )!;
    expect(o.basis).toBe("tech");
    expect(o.techLabel).toBe("compact fridge");
    expect(o.perUnitWatts).toBeLessThan(CATALOG_BY_ID.fridge.wattsOn * CATALOG_BY_ID.fridge.dutyCycle);
  });

  it("prices a fluorescent fixture well above the LED that replaced it", () => {
    const of = (tech: string) =>
      scoreObservation(
        { device: "ceiling light", count: 1, state: "on", categoryId: "ceiling_light", tech },
        home,
        "Hall",
        0,
      )!;
    const t12 = of("T12 fluorescent");
    const led = of("LED troffer");
    expect(t12.costPerYear / led.costPerYear).toBeGreaterThan(3);
    // And the one with no technology named sits between them, as a class average should.
    const plain = scoreObservation(
      { device: "ceiling light", count: 1, state: "on", categoryId: "ceiling_light" },
      home,
      "Hall",
      0,
    )!;
    expect(plain.costPerYear).toBeGreaterThan(led.costPerYear);
    expect(plain.costPerYear).toBeLessThan(t12.costPerYear);
    expect(plain.basis).toBe("catalog");
  });
});
