import { describe, expect, it } from "vitest";
import { applyInputs, captureSettings, costCapture, parseOffenderKey, readTime, type Capture } from "./capture";
import { SCHEDULE_PRESETS } from "./schedule";
import { DEFAULT_SETTINGS } from "./types";
import type { CategorizedObservation } from "./parse";

const obs: CategorizedObservation[] = [
  { device: "monitor", count: 10, state: "on", categoryId: "monitor" },
  { device: "projector", count: 1, state: "on", categoryId: "projector" },
];

function capture(over: Partial<Capture> = {}): Capture {
  return {
    id: "c1",
    name: "Lab",
    kind: "photo",
    origin: "camera",
    dataUrl: null,
    meta: {},
    details: {},
    adjust: {},
    roomType: "unknown",
    status: "done",
    result: { mode: "enhanced", engine: "test", source: "Lab", offenders: [], observations: obs },
    ...over,
  };
}

describe("applyInputs", () => {
  it("applies hours a day to every device", () => {
    const out = applyInputs(obs, { hoursPerDay: 10 }, {}, DEFAULT_SETTINGS);
    expect(out.every((o) => o.hoursPerYear === 3650)).toBe(true);
  });

  it("gives the capture wattage to the device costing most", () => {
    const out = applyInputs(obs, { watts: 18 }, {}, DEFAULT_SETTINGS);
    // Ten monitors outcost one projector.
    expect(out.find((o) => o.categoryId === "monitor")?.userWatts).toBe(18);
    expect(out.find((o) => o.categoryId === "projector")?.userWatts).toBeUndefined();
  });

  it("lets per-device corrections win, and drops a device counted to zero", () => {
    const out = applyInputs(obs, { hoursPerDay: 10 }, { monitor: { count: 0 }, projector: { watts: 160, hoursPerDay: 4 } }, DEFAULT_SETTINGS);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ categoryId: "projector", userWatts: 160, hoursPerYear: 1460 });
  });

  it("does not mutate the stored observations", () => {
    applyInputs(obs, { hoursPerDay: 2, watts: 5 }, {}, DEFAULT_SETTINGS);
    expect(obs[0].hoursPerYear).toBeUndefined();
    expect(obs[0].userWatts).toBeUndefined();
  });
});

describe("costCapture", () => {
  it("re-prices instantly when the user adds a measured wattage", () => {
    const before = costCapture(capture(), DEFAULT_SETTINGS);
    const after = costCapture(capture({ adjust: { monitor: { watts: 60 } } }), DEFAULT_SETTINGS);
    const m0 = before.find((o) => o.categoryId === "monitor")!;
    const m1 = after.find((o) => o.categoryId === "monitor")!;
    expect(m1.costPerYear).toBeGreaterThan(m0.costPerYear);
    expect(m1.basis).toBe("measured");
    expect(parseOffenderKey(m1.id)).toEqual({ captureId: "c1", categoryId: "monitor" });
  });

});

describe("captureSettings", () => {
  const geo = { place: "Austin, TX", state: "TX", country: "US", ratePerKwh: 0.118, rateSource: "Austin Energy", rateQuality: "utility" as const, co2PerKwh: 0.38 };
  it("prices with the capture's own utility", () => {
    const r = captureSettings(DEFAULT_SETTINGS, { geo }, false);
    expect(r.settings.ratePerKwh).toBe(0.118);
    expect(r.rateQuality).toBe("utility");
  });
  it("lets a typed-in rate win over everything", () => {
    const r = captureSettings({ ...DEFAULT_SETTINGS, ratePerKwh: 0.2 }, { geo }, true);
    expect(r.settings.ratePerKwh).toBe(0.2);
    expect(r.rateQuality).toBe("bill");
  });
});

describe("readTime", () => {
  const school = SCHEDULE_PRESETS[0].schedule;
  it("labels the time and says whether the building was open", () => {
    expect(readTime("2026-10-14T21:42:00", school)).toEqual({ label: "9:42 PM, Wednesday", afterHours: true });
    expect(readTime("2026-10-14T10:05:00", school)?.afterHours).toBe(false);
    expect(readTime(undefined, school)).toBeNull();
  });
});
