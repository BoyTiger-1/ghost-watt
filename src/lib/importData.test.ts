import { describe, expect, it } from "vitest";
import { scoreObservation } from "./energy";
import { offendersToCsv } from "./export";
import { readImport, reportData } from "./importData";
import type { SavedAudit } from "./storage";

const SETTINGS = { ratePerKwh: 0.2, co2PerKwh: 0.4, unoccupiedHoursPerYear: 5000 };

describe("importing what was exported", () => {
  const monitors = scoreObservation({ device: "monitor", count: 4, state: "on", categoryId: "monitor" }, SETTINGS, "Room 214", 0)!;

  it("reads the facilities CSV back into a room with the same numbers", () => {
    const csv = offendersToCsv([monitors], SETTINGS, "Lincoln");
    const r = readImport("ghostwatt-lincoln.csv", csv, "b1");
    expect(r.kind).toBe("rooms");
    if (r.kind !== "rooms") return;
    expect(r.audits).toHaveLength(1);
    const [a] = r.audits;
    expect(a.buildingId).toBe("b1");
    expect(a.areas).toEqual(["Room 214"]);
    expect(a.settings.ratePerKwh).toBe(0.2);
    expect(a.offenders[0].categoryId).toBe("monitor");
    expect(a.offenders[0].count).toBe(4);
    expect(a.offenders[0].costPerYear).toBe(Math.round(monitors.costPerYear));
  });

  it("splits whole-place report data back into one room per area", () => {
    const audit: SavedAudit = {
      id: "building",
      buildingId: "old",
      at: new Date().toISOString(),
      areas: ["A", "B"],
      offenders: [
        { ...monitors, id: "x", source: "A" },
        { ...monitors, id: "y", source: "B" },
      ],
      settings: SETTINGS,
      mode: "on-device",
      engine: "test",
    };
    const r = readImport("report.json", reportData(audit), "b2");
    expect(r.kind).toBe("rooms");
    if (r.kind !== "rooms") return;
    expect(r.audits.map((a) => a.areas[0])).toEqual(["A", "B"]);
    expect(r.audits.every((a) => a.buildingId === "b2")).toBe(true);
  });

  it("refuses files it didn't make", () => {
    expect(readImport("x.csv", "a,b,c\n1,2,3", "b").kind).toBe("error");
    expect(readImport("x.json", "{}", "b").kind).toBe("error");
  });
});
