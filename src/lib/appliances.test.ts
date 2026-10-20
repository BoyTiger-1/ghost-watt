// The long tail exists so a real reading is priced rather than dropped. These pin
// down that it does that without stealing names the curated catalog owns.

import { describe, expect, it } from "vitest";
import { CATALOG_BY_ID, DEVICE_CATALOG } from "./devices";
import { matchCategory, parseModelOutput } from "./parse";
import { scoreObservation } from "./energy";
import { DEFAULT_SETTINGS } from "./types";

describe("long-tail catalog", () => {
  it("knows over a thousand devices", () => {
    expect(DEVICE_CATALOG.length).toBeGreaterThan(1000);
    expect(DEVICE_CATALOG.reduce((n, c) => n + c.keywords.length, 0)).toBeGreaterThan(2000);
  });

  it("every entry can be priced: a positive band, a fix, a group", () => {
    for (const c of DEVICE_CATALOG) {
      expect(c.wattsOn + c.wattsStandby, c.id).toBeGreaterThan(0);
      expect(c.action.label, c.id).toBeTruthy();
      expect(c.group, c.id).toBeTruthy();
      expect(c.action.savingsFraction, c.id).toBeGreaterThanOrEqual(0);
      expect(c.action.savingsFraction, c.id).toBeLessThanOrEqual(1);
    }
    expect(new Set(DEVICE_CATALOG.map((c) => c.id)).size).toBe(DEVICE_CATALOG.length);
  });

  it("finds specific devices the curated list never had", () => {
    expect(matchCategory("air fryer")).toBe("x_air_fryer");
    expect(matchCategory("a label maker on the desk")).toBe("x_label_maker");
    expect(matchCategory("iPhone charging")).toBe("x_smartphone");
    expect(matchCategory("desk lamp")).toBe("x_desk_lamp");
    expect(matchCategory("incandescent bulb")).toBe("x_incandescent_bulb");
  });

  it("leaves curated devices with their curated entry", () => {
    expect(matchCategory("computer monitor")).toBe("monitor");
    expect(matchCategory("server rack")).toBe("server");
    expect(matchCategory("vending machine")).toBe("vending_cold");
    expect(matchCategory("projector")).toBe("projector");
  });

  it("prices an unknown powered device from the model's own watt reading, and skips furniture", () => {
    const rows = parseModelOutput(
      JSON.stringify({ items: [
        { device: "plasma globe", count: 1, state: "on", confidence: 0.8, visible: true, watts: 10 },
        { device: "potted plant", count: 2, state: "on", confidence: 0.9, visible: true },
      ] }),
    );
    expect(rows.map((r) => r.categoryId)).toEqual(["other_device"]);
    const o = scoreObservation(rows[0], DEFAULT_SETTINGS, "Room", 0)!;
    expect(o.label).toBe("Plasma globe");
    expect(o.confidence).toBe("low");
    expect(o.perUnitWatts).toBeGreaterThan(5);
    expect(o.perUnitWatts).toBeLessThan(20);
    expect(CATALOG_BY_ID.other_device).toBeDefined();
  });
});
