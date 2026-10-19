import { describe, expect, it } from "vitest";
import { meanAbsoluteError } from "@/components/CalibrationTable";
import type { CalibrationRecord } from "./storage";

const rec = (estimatedWatts: number, measuredWatts: number): CalibrationRecord => ({
  id: `${estimatedWatts}-${measuredWatts}`,
  buildingId: "b",
  categoryId: "monitor",
  label: "Monitor",
  estimatedWatts,
  estimateBasis: "catalog",
  measuredWatts,
  at: "2026-01-01T00:00:00Z",
});

describe("meanAbsoluteError", () => {
  it("is null with nothing measured, instead of a made-up figure", () => {
    expect(meanAbsoluteError([])).toBeNull();
    expect(meanAbsoluteError([rec(30, 0)])).toBeNull();
  });
  it("averages the absolute relative error", () => {
    // +50% and -25% average to 37.5%.
    expect(meanAbsoluteError([rec(30, 20), rec(30, 40)])).toBeCloseTo(0.375);
  });
});
