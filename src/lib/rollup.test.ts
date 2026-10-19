import { describe, expect, it } from "vitest";
import { rollupBuilding, rollupRooms } from "./rollup";
import type { SavedAudit } from "./storage";
import type { Offender } from "./types";

function offender(patch: Partial<Offender> = {}): Offender {
  return {
    id: "o", categoryId: "monitor", label: "Monitor", icon: "monitor", count: 2, state: "on",
    perUnitWatts: 30, totalWatts: 60, kwhPerYear: 400, costPerYear: 60, co2KgPerYear: 40,
    costLowPerYear: 40, costHighPerYear: 80, group: "display",
    action: { label: "Strip", type: "powerstrip", cost: 60, savingsFraction: 0.9, note: "" },
    fixCost: 60, annualSavings: 54, paybackMonths: 13, confidence: "high", source: "x",
    typicalCostPerYear: 12,
    ...patch,
  };
}
const audit = (id: string, room: string, at: string, cost: number, mode: SavedAudit["mode"] = "enhanced"): SavedAudit => ({
  id, buildingId: "b", at, areas: [room], offenders: [offender({ costPerYear: cost })],
  settings: { ratePerKwh: 0.15, co2PerKwh: 0.1, unoccupiedHoursPerYear: 6000 }, mode, engine: "t",
});

describe("rollupRooms", () => {
  it("keeps only the latest scan of each room and ranks rooms by after-hours waste", () => {
    const rooms = rollupRooms([
      audit("a", "Lab", "2026-01-01T00:00:00Z", 100),
      audit("b", "Lab", "2026-02-01T00:00:00Z", 40),
      audit("c", "Office", "2026-01-15T00:00:00Z", 70),
    ]);
    expect(rooms.map((r) => [r.room, r.afterHoursCost])).toEqual([["Office", 70], ["Lab", 40]]);
    expect(rooms[1].history.map((h) => h.id)).toEqual(["a"]);
  });
});

describe("rollupBuilding", () => {
  it("adds the rooms together, re-sources offenders to their room, and reports a mixed mode", () => {
    const b = rollupBuilding([
      audit("a", "Lab", "2026-01-01T00:00:00Z", 100, "enhanced"),
      audit("c", "Office", "2026-01-15T00:00:00Z", 70, "on-device"),
    ]);
    expect(b.afterHoursCost).toBe(170);
    expect(b.typicalCost).toBe(24);
    expect(b.offenders.map((o) => o.source).sort()).toEqual(["Lab", "Office"]);
    expect(b.mode).toBe("mixed");
    expect(b.latestAt).toBe("2026-01-15T00:00:00Z");
  });
  it("is empty, not broken, with no scans", () => {
    const b = rollupBuilding([]);
    expect(b.rooms).toEqual([]);
    expect(b.afterHoursCost).toBe(0);
    expect(b.latestAt).toBeNull();
  });
});
