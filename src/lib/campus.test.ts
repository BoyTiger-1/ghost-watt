// The 3D school stands on a few pieces of geometry and one join (plan rooms to
// scanned rooms). If these drift, rooms land in the wrong place or the wrong colour.

import { describe, expect, it } from "vitest";
import { DEFAULT_FIT, gridRooms, heatColor, mainAxis, orientedBox, planToWorld, pointInPolygon, polygonArea, projectOutline, roomKey, roomWaste } from "./campus";
import type { SavedAudit } from "./storage";
import type { Offender } from "./types";

describe("geometry", () => {
  it("projects a lon/lat outline to metres of the right size", () => {
    // ~100 m x 50 m box at the equator.
    const { points } = projectOutline([[0, 0], [0.000898, 0], [0.000898, 0.000452], [0, 0.000452], [0, 0]]);
    expect(points).toHaveLength(4);
    expect(polygonArea(points)).toBeGreaterThan(4800);
    expect(polygonArea(points)).toBeLessThan(5200);
  });

  it("finds the main axis and the oriented box of a rotated building", () => {
    const a = (30 * Math.PI) / 180;
    const rect = [[0, 0], [100, 0], [100, 40], [0, 40]].map(([x, y]) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)] as [number, number]);
    expect(mainAxis(rect)).toBeCloseTo(a, 5);
    const box = orientedBox(rect);
    expect(box.w).toBeCloseTo(100, 3);
    expect(box.h).toBeCloseTo(40, 3);
  });

  it("puts a plan's corners on the outline's corners when the aspects match", () => {
    const rect: [number, number][] = [[-45, -35], [45, -35], [45, 35], [-45, 35]];
    const box = orientedBox(rect);
    const [x, y] = planToWorld(0, 0, 90 / 70, box, DEFAULT_FIT);
    expect(x).toBeCloseTo(-45, 3);
    expect(y).toBeCloseTo(35, 3); // plan top = north
    const centre = planToWorld(0.5, 0.5, 90 / 70, box, { ...DEFAULT_FIT, dx: 5 });
    expect(centre[0]).toBeCloseTo(5, 3);
    expect(pointInPolygon([0, 0], rect)).toBe(true);
    expect(pointInPolygon([60, 0], rect)).toBe(false);
  });

  it("lays rooms out in a grid inside the plan", () => {
    const g = gridRooms(["a", "b", "c", "d", "e"]);
    expect(g).toHaveLength(5);
    for (const r of g) {
      expect(r.x + r.w).toBeLessThanOrEqual(1);
      expect(r.y + r.h).toBeLessThanOrEqual(1);
    }
  });
});

describe("waste per room", () => {
  const off = (cost: number, group: Offender["group"]): Offender => ({ costPerYear: cost, group, label: "X", count: 1, unverified: false }) as Offender;
  const audit = (id: string, room: string, at: string, offenders: Offender[]): SavedAudit => ({ id, buildingId: "b", at, areas: [room], offenders, settings: { ratePerKwh: 0.13, co2PerKwh: 0.35, unoccupiedHoursPerYear: 6800 }, mode: "on-device", engine: "t" }) as SavedAudit;

  it("matches room names the way people write them", () => {
    expect(roomKey("Room 214")).toBe(roomKey("214"));
    expect(roomKey("rm. 214")).toBe("214");
    expect(roomKey("Lab 108")).not.toBe(roomKey("108"));
  });

  it("uses each room's latest scan and splits it by device group", () => {
    const m = roomWaste([audit("1", "Room 214", "2026-10-01", [off(500, "display")]), audit("2", "214", "2026-10-10", [off(100, "lighting"), off(50, "display")])], "b");
    const r = m.get(roomKey("214"))!;
    expect(r.waste).toBe(150);
    expect(r.byGroup).toEqual({ lighting: 100, display: 50 });
  });

  it("runs cool to red", () => {
    expect(heatColor(0)).toBe("rgb(59, 91, 170)");
    expect(heatColor(1)).toBe("rgb(217, 52, 31)");
    expect(heatColor(2)).toBe("rgb(217, 52, 31)");
  });
});
